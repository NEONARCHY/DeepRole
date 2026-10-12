import { afterEach, describe, expect, it, vi } from "vitest";
import { StoryDispatchReplyClient } from "../src/adapters/story-dispatch-reply-client";
import { readNativeStoryReply } from "../src/core/story-native-reply";
import { nativeReplyPayload, replyQuery } from "./fixtures/story-native-reply";
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
function fixture() {
  const current = { chatId: "synthetic-a", worldId: "world-a", locked: false, url: "https://chat.deepseek.com/a/chat/s/synthetic-a" };
  const win = { location: { origin: "https://chat.deepseek.com" }, postMessage: vi.fn(), setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window) } as unknown as Window;
  const store = { pendingDispatchReplies: vi.fn(async (_chat: string, _url: string) => [structuredClone(replyQuery)]), recordDispatchReply: vi.fn(async (_result: unknown, _url: string) => {}) };
  const client = new StoryDispatchReplyClient(win, () => current, store);
  const read = readNativeStoryReply(nativeReplyPayload(), replyQuery); if (read.status !== "read") throw Error();
  const packet = { source: "deeprole-page-bridge", type: "NATIVE_STORY_REPLY_RESULT", requestId: replyQuery.requestId, result: read.result };
  const receive = (data: unknown = packet, origin = win.location.origin, source = win) => client.receive({ source, origin, data } as MessageEvent);
  return { current, win, store, client, packet, receive };
}
describe("request-specific completed-source recovery", () => {
  it("registers then stores once, never posts drafts or private transcript in the query", async () => {
    const f = fixture(), task = f.client.read(replyQuery);
    expect(f.win.postMessage).toHaveBeenCalledWith({ source: "deeprole-extension", type: "NATIVE_STORY_REPLY_REQUEST", query: replyQuery }, f.win.location.origin);
    expect(JSON.stringify(vi.mocked(f.win.postMessage).mock.calls)).not.toMatch(/PRIVATE/);
    f.receive(); f.receive(); await task; expect(f.store.recordDispatchReply).toHaveBeenCalledTimes(1); expect(f.store.recordDispatchReply).toHaveBeenCalledWith(f.packet.result, f.current.url);
  });
  it.each(["origin", "window", "id", "pair"])("does not accept a forged %s", async problem => {
    const f = fixture(); f.client.read(replyQuery); const packet = structuredClone(f.packet);
    if (problem === "id") packet.requestId = "other-request"; if (problem === "pair") packet.result.link.assistantMessageKey = '["message","99"]';
    f.receive(packet, problem === "origin" ? "https://foreign.example" : f.win.location.origin, problem === "window" ? {} as Window : f.win);
    expect(f.store.recordDispatchReply).not.toHaveBeenCalled(); f.client.reset();
  });
  it.each(["world", "chat", "url", "lock", "reset"])("drops a late completed reply after %s", async problem => {
    const f = fixture(), task = f.client.read(replyQuery);
    if (problem === "world") f.current.worldId = "other-world"; if (problem === "chat") f.current.chatId = "other-chat"; if (problem === "url") f.current.url += "?different"; if (problem === "lock") f.current.locked = true; if (problem === "reset") f.client.reset();
    f.receive(); await task; expect(f.store.recordDispatchReply).not.toHaveBeenCalled();
  });
  it("times out without model work and clears on a null/unavailable read", async () => {
    vi.useFakeTimers(); const f = fixture(), task = f.client.read(replyQuery); await vi.advanceTimersByTimeAsync(10_000); await task;
    expect(f.store.recordDispatchReply).not.toHaveBeenCalled(); expect(f.win.postMessage).toHaveBeenCalledTimes(1);
    const next = f.client.read(replyQuery); f.receive({ ...f.packet, result: null }); await next; expect(f.store.recordDispatchReply).not.toHaveBeenCalled();
  });
  it("recovers once per loaded scope, not on every context reload; restored work is filtered by storage", async () => {
    const f = fixture(), task = f.client.recover(); await vi.waitFor(() => expect(f.win.postMessage).toHaveBeenCalledTimes(1)); f.receive(); await task;
    await f.client.recover(); expect(f.store.pendingDispatchReplies).toHaveBeenCalledTimes(1);
    f.client.reset(); const next = f.client.recover(); await vi.waitFor(() => expect(f.win.postMessage).toHaveBeenCalledTimes(2)); f.receive(); await next;
    expect(f.store.pendingDispatchReplies).toHaveBeenCalledWith("synthetic-a", f.current.url);
  });
  it("does not read after pending storage resolves in another scope or epoch", async () => {
    const f = fixture(); let release!: (queries: typeof replyQuery[]) => void; f.store.pendingDispatchReplies.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const task = f.client.recover(); f.client.reset(); release([replyQuery]); await task; expect(f.win.postMessage).not.toHaveBeenCalled();
  });
  it("does not create parallel duplicate reads and bounds outstanding native probes", async () => {
    const f = fixture(); const tasks = [f.client.read(replyQuery), f.client.read(replyQuery)];
    for (let i = 0; i < 4; i++) tasks.push(f.client.read({ ...replyQuery, requestId: `other-${i}`, link: { ...replyQuery.link, requestId: `other-${i}` } }));
    expect(f.win.postMessage).toHaveBeenCalledTimes(4); f.client.reset(); await Promise.all(tasks);
  });
});
