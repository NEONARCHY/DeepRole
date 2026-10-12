import { describe, expect, it, vi } from "vitest";
import { StoryDispatchCaptureClient } from "../src/adapters/story-dispatch-capture-client";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";
import type { StoryDispatchCaptureInput } from "../src/core/story-dispatch-capture";
function fixture() {
  const current = { chatId: "chat-a", worldId: "world-a", url: "https://chat.deepseek.com/a/chat/s/chat-a", locked: false };
  const win = { location: { origin: "https://chat.deepseek.com" }, postMessage: vi.fn() } as unknown as Window;
  const store = { prepareDispatchCapture: vi.fn(async () => {}), confirmDispatchCapture: vi.fn(async (_packet: unknown, _url: string) => {}), advanceDispatchCapture: vi.fn(async (_packet: unknown, _url: string) => {}) };
  const input: StoryDispatchCaptureInput = { id: "request-a", identity: { chatId: "chat-a", nativeParentKey: key("41") }, transport: "xhr", worldId: "world-a", bindingId: "binding-a", sceneRevision: "rev-a", originalDraft: "PRIVATE_DRAFT", proposedContext: "PRIVATE_MEMORY" };
  const route = { requestId: input.id, identity: input.identity, transport: input.transport };
  const source = { ...route, outgoingText: input.originalDraft }, started = { ...route, phase: "started" };
  const ready = { ...route, phase: "ready", link: { requestId: input.id, chatId: "chat-a", nativeParentKey: key("41"), userMessageKey: key("42"), assistantMessageKey: key("43") }, sawFinish: false, issue: null };
  const client = new StoryDispatchCaptureClient(win, () => current, store);
  const receive = (type: string, packet: unknown, origin = win.location.origin, sourceWindow = win) => client.receive({ source: sourceWindow, origin, data: { source: "deeprole-page-bridge", type, ...packet as object } } as unknown as MessageEvent);
  return { client, current, win, store, input, route, source, started, ready, receive };
}
describe("content-owned outgoing capture registration and queues", () => {
  it("saves preparation then confirms only its exact registered request", async () => {
    const f = fixture(); expect(await f.client.prepare(f.input)).toBe(true); f.receive("STORY_CAPTURE_SOURCE", f.source);
    await vi.waitFor(() => expect(f.win.postMessage).toHaveBeenCalledWith({ source: "deeprole-extension", type: "STORY_CAPTURE_CONFIRMED", id: "request-a", ok: true }, "https://chat.deepseek.com"));
    expect(f.store.prepareDispatchCapture).toHaveBeenCalledWith(f.input, f.current.url); expect(f.store.confirmDispatchCapture).toHaveBeenCalledWith(f.source, f.current.url);
    expect(JSON.stringify(vi.mocked(f.win.postMessage).mock.calls)).not.toMatch(/PRIVATE/);
  });
  it("keeps source, HTTP and wire packets in a single request-specific queue", async () => {
    const f = fixture(); let release!: () => void; f.store.confirmDispatchCapture.mockImplementationOnce(() => new Promise(resolve => { release = resolve; })); await f.client.prepare(f.input);
    f.receive("STORY_CAPTURE_SOURCE", f.source); f.receive("NATIVE_STORY_DISPATCH", f.started); f.receive("NATIVE_STORY_DISPATCH", { ...f.started, phase: "settled", delivery: { status: "accepted", httpStatus: 200 } }); f.receive("NATIVE_STORY_STREAM", f.ready);
    await vi.waitFor(() => expect(release).toBeDefined()); expect(f.store.advanceDispatchCapture).not.toHaveBeenCalled(); release();
    await vi.waitFor(() => expect(f.store.advanceDispatchCapture).toHaveBeenCalledTimes(3)); expect(f.store.advanceDispatchCapture.mock.calls.map(call => (call[0] as any).phase)).toEqual(["started", "settled", "ready"]);
  });
  it.each(["request", "parent", "transport", "origin", "window", "extra"] as const)("rejects unregistered or forged %s", async problem => {
    const f = fixture(); await f.client.prepare(f.input); const source: any = structuredClone(f.source);
    if (problem === "request") source.requestId = "model-echo"; if (problem === "parent") source.identity.nativeParentKey = key("99"); if (problem === "transport") source.transport = "fetch"; if (problem === "extra") source.token = "SECRET";
    f.receive("STORY_CAPTURE_SOURCE", source, problem === "origin" ? "https://foreign.example" : f.win.location.origin, problem === "window" ? {} as Window : f.win);
    await Promise.resolve(); await Promise.resolve(); expect(f.store.confirmDispatchCapture).not.toHaveBeenCalled(); expect(f.win.postMessage).not.toHaveBeenCalled();
  });
  it.each(["world", "chat", "url", "lock", "reset"] as const)("does not write or acknowledge queued source after %s changed", async problem => {
    const f = fixture(); await f.client.prepare(f.input); f.receive("STORY_CAPTURE_SOURCE", f.source);
    if (problem === "world") f.current.worldId = "other-world"; if (problem === "chat") f.current.chatId = "other-chat"; if (problem === "url") f.current.url += "?other"; if (problem === "lock") f.current.locked = true; if (problem === "reset") f.client.reset();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); expect(f.store.confirmDispatchCapture).not.toHaveBeenCalled(); expect(f.win.postMessage).not.toHaveBeenCalled();
  });
  it("keeps preparation failure nonblocking and never accepts packets for it", async () => {
    const f = fixture(); f.store.prepareDispatchCapture.mockRejectedValueOnce(Error("synthetic-storage-error")); expect(await f.client.prepare(f.input)).toBe(false); f.receive("STORY_CAPTURE_SOURCE", f.source); await Promise.resolve(); expect(f.store.confirmDispatchCapture).not.toHaveBeenCalled();
  });
  it("waits for preparation and rejects a reset during storage", async () => {
    const f = fixture(); let release!: () => void; f.store.prepareDispatchCapture.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const task = f.client.prepare(f.input); f.client.reset(); release(); expect(await task).toBe(false); expect(await f.client.prepare(f.input)).toBe(true);
  });
  it("reports failed confirmation without changing the actual native request", async () => {
    const f = fixture(); await f.client.prepare(f.input); f.store.confirmDispatchCapture.mockRejectedValueOnce(Error("synthetic-storage-error")); f.receive("STORY_CAPTURE_SOURCE", f.source);
    await vi.waitFor(() => expect(f.win.postMessage).toHaveBeenCalledWith(expect.objectContaining({ ok: false }), f.win.location.origin));
  });
  it("releases finished registrations, bounds concurrent preparations, and does not evict active requests", async () => {
    const f = fixture(); for (let i = 0; i < 64; i++) expect(await f.client.prepare({ ...f.input, id: "request-" + i })).toBe(true);
    expect(await f.client.prepare({ ...f.input, id: "request-64" })).toBe(false);
    f.receive("NATIVE_STORY_STREAM", { ...f.ready, requestId: "request-0", phase: "closed", link: { ...f.ready.link, requestId: "request-0" } }); await vi.waitFor(() => expect(f.store.advanceDispatchCapture).toHaveBeenCalledTimes(1));
    await vi.waitFor(async () => expect(await f.client.prepare({ ...f.input, id: "request-64" })).toBe(true));
  });
  it("does not send a confirmation ACK when storage finishes after scope has changed", async () => {
    const f = fixture(); let release!: () => void; f.store.confirmDispatchCapture.mockImplementationOnce(() => new Promise(resolve => { release = resolve; })); await f.client.prepare(f.input); f.receive("STORY_CAPTURE_SOURCE", f.source);
    await vi.waitFor(() => expect(release).toBeDefined()); f.current.worldId = "other-world"; release(); await Promise.resolve(); await Promise.resolve(); expect(f.win.postMessage).not.toHaveBeenCalled();
  });
});
