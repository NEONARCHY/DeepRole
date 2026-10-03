import { describe, expect, it } from "vitest";
import { TabSessionStore } from "../src/storage/tab-session";

function store() {
  const values: Record<string, any> = {};
  const state = new TabSessionStore({
    get: async (key) => { const result = structuredClone({ [key]: values[key] }); await new Promise((r) => setTimeout(r, 5)); return result; },
    set: async (patch) => { Object.assign(values, structuredClone(patch)); },
    remove: async (keys) => { for (const key of keys) delete values[key]; },
  });
  return { state, values };
}

describe("per-tab session patches", () => {
  it("acknowledges character sends despite browser key reordering, never an older send", async () => {
    const { state, values } = store();
    const receipt = { id: "request-123456", worldId: "w", chatId: "a", base: "version", accepted: false, createdAt: 1 };
    await state.patch(1, { characterRequest: receipt });
    values.deeprole_tab_state_1.characterRequest = Object.fromEntries(Object.entries(receipt).reverse());
    expect(await state.patch(1, { characterRequest: { ...receipt, accepted: true } }, { characterRequestId: receipt.id })).toEqual({ ok: true });
    await state.patch(1, { characterRequest: { ...receipt, id: "newer-request" } });
    expect(await state.patch(1, { characterRequest: { ...receipt, accepted: true } }, { characterRequestId: receipt.id })).toEqual({ ok: false });
    expect((await state.get(1)).characterRequest?.id).toBe("newer-request");
    expect((await state.get(2)).characterRequest).toBeUndefined();
  });
  it("keeps concurrent service, handoff and memory override updates", async () => {
    const { state } = store();
    await Promise.all([
      state.patch(1, { service: { id: "s", type: "handoff", bookId: null, createdAt: 1 } }),
      state.patch(1, { snapshotId: "h", snapshotToken: "first" }),
      state.patch(1, { overrides: { includedIds: ["manual"], excludedIds: [] } }),
    ]);
    expect(await state.get(1)).toMatchObject({ service: { id: "s" }, snapshotId: "h", overrides: { includedIds: ["manual"] } });
    expect(await state.get(2)).toEqual({});
  });
  it("does not acknowledge an old handoff or a re-queued copy of the same snapshot", async () => {
    const { state } = store();
    await state.patch(1, { snapshotId: "h", snapshotToken: "first" });
    await state.patch(1, { snapshotId: "h", snapshotToken: "second" });
    expect(await state.patch(1, { snapshotId: null }, { snapshotId: "h", snapshotToken: "first" })).toEqual({ ok: false });
    expect((await state.get(1)).snapshotId).toBe("h");
    expect(await state.patch(1, { snapshotId: null, snapshotToken: null }, { snapshotId: "h", snapshotToken: "second" })).toEqual({ ok: true });
  });
  it("tab cleanup cannot be undone by an in-flight patch", async () => {
    const { state, values } = store();
    const write = state.patch(1, { snapshotId: "h" });
    const close = state.remove(1);
    await Promise.all([write, close]);
    expect(values).toEqual({});
  });
  it("service failure cleanup survives new-chat promotion but never clears the next request", async () => {
    const { state } = store();
    const request = { id: "old", type: "handoff" as const, bookId: null, createdAt: 1 };
    await state.patch(1, { service: request });
    await state.patch(1, { service: { ...request, chatId: "promoted" } });
    expect(await state.patch(1, { service: null }, { serviceId: "old" })).toEqual({ ok: true });
    await state.patch(1, { service: { ...request, id: "next" } });
    expect(await state.patch(1, { service: null }, { serviceId: "old" })).toEqual({ ok: false });
    expect((await state.get(1)).service?.id).toBe("next");
  });
});
