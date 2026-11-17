import { describe, expect, it } from "vitest";
import { TabSessionStore } from "../src/storage/tab-session";
import { continuationKey, continuationDraftKey, type ContinuationFlow } from "../src/core/continuation-flow";

function store() {
  const values: Record<string, any> = {};
  const area = {
    get: async (key: string) => { const result = structuredClone({ [key]: values[key] }); await new Promise((r) => setTimeout(r, 5)); return result; },
    set: async (patch: Record<string, unknown>) => { Object.assign(values, structuredClone(patch)); },
    remove: async (keys: string[]) => { for (const key of keys) delete values[key]; },
  };
  const state = new TabSessionStore(area);
  return { state, values, area };
}

describe("per-tab session patches", () => {
  it.each(["accepted", "recovered"])("keeps pending memory choices across reload and failed %s commits, isolated from other transfers", async mode => {
    const { state, area } = store(), overrides = { includedIds: [], excludedIds: ["large-record"] };
    const target = { snapshotId: "s", snapshotToken: "t", targetChatId: "new" }, draft = { ...target, draft: "short" };
    await state.patch(1, { ...target, retryContinuationTarget: target, continuationDraft: draft });
    await state.patch(1, { continuationOverrides: overrides }, { snapshotId: "s", snapshotToken: "t" });
    const reloaded = new TabSessionStore(area);
    expect((await reloaded.get(1)).continuationOverrides).toEqual(overrides);
    expect((await reloaded.get(2)).continuationOverrides).toBeUndefined();
    const commit = (fail: boolean) => {
      const apply = async (choice: import("../src/core/types").MemoryOverrides | undefined) => { expect(choice).toEqual(overrides); if (fail) throw Error("write-failed"); };
      return mode === "recovered" ? reloaded.completeRecoveredSnapshot(1, "s", "t", "new", continuationDraftKey(draft)!, async (_, choice) => apply(choice))
        : reloaded.completeSnapshot(1, "s", "t", apply, "new");
    };
    await expect(commit(true)).rejects.toThrow("write-failed");
    expect((await reloaded.get(1)).continuationOverrides).toEqual(overrides);
    expect(await commit(false)).toBe(true);
    expect((await reloaded.get(1)).continuationOverrides).toBeNull();
    await reloaded.patch(1, { snapshotId: "s", snapshotToken: "t" });
    await reloaded.patch(1, { continuationOverrides: overrides });
    await reloaded.patch(1, { snapshotToken: "new-attempt" });
    expect((await reloaded.get(1)).continuationOverrides).toBeNull();
    expect(await reloaded.patch(1, { continuationOverrides: overrides }, { snapshotToken: "t" })).toEqual({ ok: false });
  });
  it("compares retry destinations by fields after browser storage reorders their keys", async () => {
    const { state, values } = store();
    const target = { snapshotId: "s", snapshotToken: "t", targetChatId: "new", returnHomeAfterLengthBlock: true as const };
    await state.patch(1, { snapshotId: "s", snapshotToken: "t", retryContinuationTarget: target });
    values.deeprole_tab_state_1.retryContinuationTarget = Object.fromEntries(Object.entries(target).reverse());
    for (const wrong of [{ ...target, targetChatId: "other" }, { ...target, snapshotToken: "other" }, { ...target, returnHomeAfterLengthBlock: undefined }, null]) {
      expect(await state.patch(1, { retryContinuationTarget: null }, { retryContinuationTarget: wrong })).toEqual({ ok: false });
    }
    expect(await state.patch(1, { retryContinuationTarget: { ...target, returnHomeAfterLengthBlock: undefined } }, { retryContinuationTarget: target })).toEqual({ ok: true });
  });
  it("keeps a blocked original after releasing an unused chat ID, until dismissal or successful retry", async () => {
    const { state, area } = store();
    const target = { snapshotId: "s", snapshotToken: "t", targetChatId: "new", returnHomeAfterLengthBlock: true as const };
    const draft = { ...target, draft: "  Exact blocked original\n", blockedLength: 40001 };
    expect(await state.patch(1, { snapshotId: "s", snapshotToken: "t", retryContinuationTarget: target, continuationDraft: draft })).toEqual({ ok: true });
    expect(await state.patch(1, { retryContinuationTarget: null }, { retryContinuationTarget: target })).toEqual({ ok: true });
    const reloaded = new TabSessionStore(area);
    expect((await reloaded.get(1)).continuationDraft).toEqual(draft);
    expect((await reloaded.get(2)).continuationDraft).toBeUndefined();
    const newTarget = { ...target, targetChatId: "different-empty-chat", returnHomeAfterLengthBlock: undefined };
    const retry = { ...newTarget, draft: "shortened", requestId: "r", promptDigest: "a".repeat(64) };
    expect(await reloaded.patch(1, { retryContinuationTarget: newTarget, continuationDraft: retry }, { retryContinuationTarget: null, continuationReceipt: null })).toEqual({ ok: true });
    expect(await reloaded.patch(1, { continuationDraft: null }, { continuationDraftKey: continuationDraftKey(draft) })).toEqual({ ok: false });
    expect((await reloaded.get(1)).continuationDraft).toEqual(retry);
    await reloaded.patch(1, { snapshotToken: "replaced" });
    expect((await reloaded.get(1)).continuationDraft).toBeNull();
  });
  it.each(["success", "failure", "cancelled", "new-token", "new-attempt", "foreign-tab"])("holds the recovered first-turn guard through %s", async kind => {
    const { state } = store();
    const target = { snapshotId: "s", snapshotToken: "t", targetChatId: "target" };
    const draft = { ...target, draft: "original", requestId: "r", promptDigest: "a".repeat(64) };
    await state.patch(1, { ...target, retryContinuationTarget: target, continuationDraft: draft });
    if (kind === "cancelled") await state.patch(1, { continuationDraft: null });
    if (kind === "new-token") await state.patch(1, { snapshotToken: "new" });
    if (kind === "new-attempt") await state.patch(1, { continuationDraft: { ...draft, requestId: "new" } });
    let calls = 0;
    const result = state.completeRecoveredSnapshot(kind === "foreign-tab" ? 2 : 1, "s", "t", "target", continuationDraftKey(draft)!, async value => {
      calls++; expect(value).toEqual(draft); if (kind === "failure") throw Error("write-failed");
    });
    if (kind === "failure") { await expect(result).rejects.toThrow("write-failed"); expect((await state.get(1)).continuationDraft).toEqual(draft); }
    else { expect(await result).toBe(kind === "success"); if (kind === "success") expect((await state.get(1)).snapshotId).toBeNull(); }
    expect(calls).toBe(["success", "failure"].includes(kind) ? 1 : 0);
  });
  it("serializes a newer transfer after recovered scene commit", async () => {
    const { state } = store();
    const target = { snapshotId: "s", snapshotToken: "t", targetChatId: "target" }, draft = { ...target, draft: "original" };
    await state.patch(1, { ...target, retryContinuationTarget: target, continuationDraft: draft });
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { entered = resolve; });
    const commit = state.completeRecoveredSnapshot(1, "s", "t", "target", continuationDraftKey(draft)!, async () => { entered(); await gate; });
    await ready;
    const next = state.patch(1, { snapshotId: "next", snapshotToken: "next-token" });
    release(); expect(await commit).toBe(true); await next;
    expect(await state.get(1)).toMatchObject({ snapshotId: "next", snapshotToken: "next-token", continuationDraft: null });
  });
  it("rejects a draft with no queued transfer instead of reading missing target fields", async () => {
    const { state } = store();
    expect(await state.patch(1, { continuationDraft: { draft: "orphan", snapshotToken: null } as any })).toEqual({ ok: false });
    expect(await state.get(1)).toEqual({});
  });
  it("keeps recovery text only for its queued attempt, clears it on dismissal and a newer token", async () => {
    const { state, area } = store();
    const target = { snapshotId: "s", snapshotToken: "t", targetChatId: "target" };
    const draft = { ...target, draft: "  Exact original\nreply.  " };
    await state.patch(1, { ...target, retryContinuationTarget: target });
    expect(await state.patch(1, { continuationDraft: draft }, { snapshotId: "s", snapshotToken: "t", continuationReceipt: null })).toEqual({ ok: true });
    const reloaded = new TabSessionStore(area);
    expect((await reloaded.get(1)).continuationDraft).toEqual(draft);
    expect((await reloaded.get(2)).continuationDraft).toBeUndefined();
    expect(await reloaded.patch(1, { continuationDraft: { ...draft, draft: "x".repeat(40_001) } })).toEqual({ ok: false });
    const newer = { ...draft, draft: "Newer manual retry" };
    await reloaded.patch(1, { continuationDraft: newer });
    expect(await reloaded.patch(1, { continuationDraft: null }, { continuationDraftKey: continuationDraftKey(draft) })).toEqual({ ok: false });
    expect((await reloaded.get(1)).continuationDraft).toEqual(newer);
    await reloaded.patch(1, { continuationDraft: Object.fromEntries(Object.entries(draft).reverse()) as typeof draft });
    await reloaded.patch(1, { continuationDraft: null }, { continuationDraftKey: continuationDraftKey(draft) });
    expect((await new TabSessionStore(area).get(1)).continuationDraft).toBeNull();
    await state.patch(1, { continuationDraft: draft });
    await state.patch(1, { snapshotToken: "new" });
    expect((await state.get(1)).continuationDraft).toBeNull();
    expect(await state.patch(1, { continuationDraft: draft })).toEqual({ ok: false });
    expect(await state.patch(1, { continuationDraft: { ...draft, snapshotToken: "new" } })).toEqual({ ok: false });
    await state.remove(1);
    expect(await state.get(1)).toEqual({});
  });
  it("forgets the draft as soon as acceptance is recorded, even if the library write fails", async () => {
    const { state, area } = store();
    const target = { snapshotId: "s", snapshotToken: "t", targetChatId: "target" };
    const draft = { ...target, draft: "No replay after acceptance" };
    await state.patch(1, { ...target, retryContinuationTarget: target, continuationDraft: draft });
    await expect(state.completeSnapshot(1, "s", "t", async () => { throw Error("write failed"); }, "target")).rejects.toThrow("write failed");
    expect((await new TabSessionStore(area).get(1)).continuationDraft).toBeNull();
    expect(await state.patch(1, { continuationDraft: draft })).toEqual({ ok: false });
  });
  it("keeps a refused attempt scoped to its tab and clears its target only after acceptance", async () => {
    const { state, area } = store();
    const target = { snapshotId: "s", snapshotToken: "token", targetChatId: "target" };
    await state.patch(1, { snapshotId: target.snapshotId, snapshotToken: target.snapshotToken });
    expect(await state.patch(1, { retryContinuationTarget: target }, { snapshotId: "s", snapshotToken: "token", continuationReceipt: null })).toEqual({ ok: true });
    const reloaded = new TabSessionStore(area);
    expect((await reloaded.get(1)).retryContinuationTarget).toEqual(target);
    expect((await reloaded.get(2)).retryContinuationTarget).toBeUndefined();
    let commits = 0;
    const commit = async () => { commits++; };
    await expect(reloaded.completeSnapshot(1, "s", "token", commit, "other")).rejects.toThrow("handoff-conflict");
    expect(commits).toBe(0);
    expect(await reloaded.completeSnapshot(1, "s", "token", commit, "target")).toBe(true);
    expect(commits).toBe(1);
    expect((await reloaded.get(1)).retryContinuationTarget).toBeNull();
  });
  it("keeps the accepted destination through failed local writes and reload, without repeating delivery", async () => {
    const {state,area}=store(); await state.patch(1,{snapshotId:"s",snapshotToken:"token"});
    await expect(state.completeSnapshot(1,"s","token",async()=>{throw Error("write failed");},"target")).rejects.toThrow("write failed");
    const reloaded=new TabSessionStore(area); expect((await reloaded.get(1)).continuationReceipt).toEqual({snapshotId:"s",snapshotToken:"token",targetChatId:"target"});
    let commits=0;expect(await reloaded.completeSnapshot(1,"s","token",async()=>{commits++;},"target",true)).toBe(true);
    expect(commits).toBe(1);expect(await reloaded.get(1)).toMatchObject({snapshotId:null,snapshotToken:null,continuationReceipt:null});
    expect(await reloaded.completeSnapshot(1,"s","token",async()=>{commits++;},"target")).toBe(false);expect(commits).toBe(1);
  });
  it("does not retry from a queued transfer or a receipt for a different destination", async () => {
    const { state } = store();
    const commit = async () => { throw Error("unexpected commit"); };
    await state.patch(1, { snapshotId: "s", snapshotToken: "t" });
    expect(await state.completeSnapshot(1, "s", "t", commit, "target", true)).toBe(false);
    await expect(state.completeSnapshot(1, "s", "t", commit, "target")).rejects.toThrow("unexpected commit");
    expect(await state.completeSnapshot(1, "s", "t", commit, "other", true)).toBe(false);
    expect((await state.get(1)).continuationReceipt).toEqual({ snapshotId: "s", snapshotToken: "t", targetChatId: "target" });
  });
  it("never redirects an accepted receipt or retries it over a newer snapshot/token",async()=>{
    const {state}=store();await state.patch(1,{snapshotId:"s",snapshotToken:"token"});
    await expect(state.completeSnapshot(1,"s","token",async()=>{throw Error("write failed");},"target")).rejects.toThrow();
    let commits=0;await expect(state.completeSnapshot(1,"s","token",async()=>{commits++;},"other")).rejects.toThrow("handoff-conflict");
    await state.patch(1,{snapshotToken:"new-token"});expect(await state.completeSnapshot(1,"s","token",async()=>{commits++;},"target")).toBe(false);
    await state.patch(1,{snapshotId:"new",snapshotToken:"token"});expect(await state.completeSnapshot(1,"s","token",async()=>{commits++;},"target")).toBe(false);expect(commits).toBe(0);
  });
  it("retains the receipt if clearing session storage fails after the library commit",async()=>{
    const {state,area}=store();await state.patch(1,{snapshotId:"s",snapshotToken:"t"});
    const original=area.set;let writes=0,committed=false;
    area.set=async patch=>{if(++writes===2)throw Error("session failed");await original(patch);};
    await expect(state.completeSnapshot(1,"s","t",async()=>{committed=true;},"target")).rejects.toThrow("session failed");expect(committed).toBe(true);
    expect((await state.get(1)).continuationReceipt?.targetChatId).toBe("target");area.set=original;
    expect(await new TabSessionStore(area).completeSnapshot(1,"s","t",async()=>{expect(committed).toBe(true);},"target")).toBe(true);
  });
  it("guards continuation phases across reordered browser metadata and newer transfers", async () => {
    const { state, values } = store();
    const flow: ContinuationFlow = { id: "f", chatId: "a", chatUrl: "url", scene: { worldId: "w", bookId: null, focusIds: [] }, phase: "review", requestId: "r", proposalId: "p", createdAt: 1 };
    await state.patch(1, { continuation: flow });
    values.deeprole_tab_state_1.continuation = Object.fromEntries(Object.entries(flow).reverse());
    const approved = { ...flow, phase: "approved" as const };
    expect(await state.patch(1, { continuation: approved }, { continuationKey: continuationKey(flow) })).toEqual({ ok: true });
    expect(await state.patch(1, { continuation: null }, { continuationKey: continuationKey(flow) })).toEqual({ ok: false });
    await state.patch(1, { continuation: { ...approved, id: "newer" } });
    expect(await state.patch(1, { continuation: null }, { continuationKey: continuationKey(approved) })).toEqual({ ok: false });
    expect((await state.get(2)).continuation).toBeUndefined();
  });
  it("holds the snapshot guard while the destination commit is in flight", async () => {
    const { state } = store();
    await state.patch(1, { snapshotId: "A", snapshotToken: "one" });
    let release!: () => void, started!: () => void, applied = false;
    const ready = new Promise<void>(resolve => { started = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    const commit = state.completeSnapshot(1, "A", "one", async () => { started(); await gate; applied = true; });
    await ready;
    const newer = state.patch(1, { snapshotId: "B", snapshotToken: "two" });
    release(); expect(await commit).toBe(true); await newer;
    expect(applied).toBe(true); expect(await state.get(1)).toMatchObject({ snapshotId: "B", snapshotToken: "two" });
  });
  it("never runs an older checkpoint commit and retains a failed commit for retry", async () => {
    const { state } = store(); let applied = false;
    await state.patch(1, { snapshotId: "B", snapshotToken: "two" });
    expect(await state.completeSnapshot(1, "A", "one", async () => { applied = true; })).toBe(false); expect(applied).toBe(false);
    await expect(state.completeSnapshot(1, "B", "two", async () => { throw new Error("write failed"); })).rejects.toThrow("write failed");
    expect(await state.get(1)).toMatchObject({ snapshotId: "B", snapshotToken: "two" });
  });
  it("does not resurrect session state if the tab closes during a destination commit", async () => {
    const { state, values } = store();
    await state.patch(1, { snapshotId: "A", snapshotToken: "one" });
    let release!: () => void, started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    const commit = state.completeSnapshot(1, "A", "one", async () => { started(); await gate; });
    await ready; const closed = state.remove(1); release(); await commit; await closed;
    expect(values).toEqual({});
  });
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
