import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nativeReplyPayload, replyQuery } from "./fixtures/story-native-reply";

describe("bounded page-only exact response history read", () => {
  let posted: ReturnType<typeof vi.spyOn>, listeners: ReturnType<typeof vi.spyOn>, fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    vi.resetModules(); history.replaceState({}, "", "/a/chat/s/synthetic-a"); localStorage.setItem("userToken", JSON.stringify({ value: "PRIVATE_TOKEN" }));
    let install!: () => void; vi.stubGlobal("defineUnlistedScript", (callback: () => void) => { install = callback; return {}; });
    fetchMock = vi.fn(async () => new Response(JSON.stringify(nativeReplyPayload()), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock); posted = vi.spyOn(window, "postMessage").mockImplementation(() => undefined); listeners = vi.spyOn(window, "addEventListener");
    await import("../src/entrypoints/injected"); install();
  });
  afterEach(() => {
    for (const [type, callback, options] of listeners.mock.calls) window.removeEventListener(type, callback, options);
    localStorage.removeItem("userToken"); history.replaceState({}, "", "/"); vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  const results = () => posted.mock.calls.map((a: unknown[]) => a[0] as any).filter((p: any) => p.type === "NATIVE_STORY_REPLY_RESULT");
  function request(query = replyQuery, origin = location.origin, source: Window = window) { window.dispatchEvent(new MessageEvent("message", { source, origin, data: { source: "deeprole-extension", type: "NATIVE_STORY_REPLY_REQUEST", query } })); }
  it("performs one bounded GET, forwards only the exact final source, and never calls completion", async () => {
    request(); await vi.waitFor(() => expect(results()).toHaveLength(1)); expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]).toMatchObject(["/api/v0/chat/history_messages?chat_session_id=synthetic-a", { method: "GET", headers: { Authorization: "Bearer PRIVATE_TOKEN" } }]);
    expect(results()[0]).toMatchObject({ requestId: replyQuery.requestId, result: { wireUserText: "PRIVATE_DRAFT", assistant: { content: "Мира передала ключ. Mira delivered the key." } } });
    expect(JSON.stringify(results())).not.toMatch(/TOKEN|THOUGHTS|EARLIER|FOREIGN_BRANCH/);
  });
  it("ignores foreign window/origin and duplicate requests while its native GET is running", async () => {
    let release!: (r: Response) => void; fetchMock.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    request(replyQuery, "https://foreign.example"); request(replyQuery, location.origin, {} as Window); expect(fetchMock).not.toHaveBeenCalled();
    request(); request(); expect(fetchMock).toHaveBeenCalledTimes(1); release(new Response(JSON.stringify(nativeReplyPayload()), { headers: { "content-type": "application/json" } })); await vi.waitFor(() => expect(results()).toHaveLength(1));
  });
  it("returns no sample for a refused, unfinished, oversized or non-JSON response", async () => {
    fetchMock.mockResolvedValueOnce(new Response("PRIVATE_ERROR", { status: 403 })); request(); await vi.waitFor(() => expect(results()).toHaveLength(1)); expect(results()[0].result).toBeNull();
    fetchMock.mockResolvedValueOnce(new Response("PRIVATE_NONJSON", { headers: { "content-type": "text/event-stream" } })); request(); await vi.waitFor(() => expect(results()).toHaveLength(2)); expect(results()[1].result).toBeNull();
    fetchMock.mockResolvedValueOnce(new Response("PRIVATE_OVERSIZE", { headers: { "content-type": "application/json", "content-length": "30000001" } })); request(); await vi.waitFor(() => expect(results()).toHaveLength(3)); expect(results()[2].result).toBeNull();
    const unfinished = nativeReplyPayload(); unfinished.data.biz_data.chat_messages[3]!.status = "WIP";
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(unfinished), { headers: { "content-type": "application/json" } })); request(); await vi.waitFor(() => expect(results()).toHaveLength(4)); expect(results()[3].result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it("does not forward text after navigation to another URL/chat", async () => {
    let release!: (r: Response) => void; fetchMock.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    request(); history.replaceState({}, "", "/a/chat/s/other"); release(new Response(JSON.stringify(nativeReplyPayload()), { headers: { "content-type": "application/json" } }));
    await new Promise(resolve => setTimeout(resolve, 10)); expect(results()).toEqual([]); request(); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
