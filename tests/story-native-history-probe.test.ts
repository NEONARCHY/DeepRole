import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { probeNativeStoryHistory } from "../src/adapters/story-native-history-probe";

const payload = { code: 0, data: { biz_data: { chat_session_id: "probe-chat", messages: [{ message_id: 1, parent_message_id: null, role: "USER", status: "PRIVATE_STATUS", content: "PRIVATE_LORE", token: "PRIVATE_TOKEN" }] } } };
const json = (value: unknown = payload, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
describe("explicit history capability probe (not a model reply observer)", () => {
  it("returns safe v3 counts while keeping identity, unrecognized status values and text in the page", async () => {
    const result = await probeNativeStoryHistory(json(), "probe-chat");
    expect(result).toMatchObject({ status: "read", diagnostics: { diagnosticVersion: 3, ancestry: "complete", completion: "unknown", messageCount: 1, identityCount: 1, replyProbe: { anchor: "not-supplied", selection: "unknown" }, statusCounts: [{ field: "status", role: "user", state: "unrecognized-string", count: 1 }] } });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|probe-chat|nativeMessageKey/);
  });
  it.each([403, 500])("does not read an unsuccessful HTTP %s body", async status => {
    const response = json(payload, status);
    expect(await probeNativeStoryHistory(response, "probe-chat")).toEqual({ status: "unavailable", code: "http" });
    expect(response.bodyUsed).toBe(false);
  });
  it("rejects redirects even when their final response is JSON", async () => {
    const response = json(); Object.defineProperty(response, "redirected", { value: true });
    expect(await probeNativeStoryHistory(response, "probe-chat")).toEqual({ status: "unavailable", code: "http" }); expect(response.bodyUsed).toBe(false);
  });
  it.each(["text/html", "text/event-stream", "application/jsonp", ""])("does not consume an unsupported %s response", async type => {
    const response = json(payload, 200, { "content-type": type });
    expect(await probeNativeStoryHistory(response, "probe-chat")).toEqual({ status: "unavailable", code: "format" }); expect(response.bodyUsed).toBe(false);
  });
  it("accepts a JSON media type suffix and splits UTF-8 across chunks without changing it", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ messages: [{ message_id: 1, parent_id: null, role: "user", content: "Ключ" }] }));
    const start = bytes.indexOf(0xd0) + 1;
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes.slice(0, start)); controller.enqueue(bytes.slice(start)); controller.close(); } }), { headers: { "content-type": "Application/History+JSON" } });
    expect(await probeNativeStoryHistory(response, "probe-chat")).toMatchObject({ status: "read", diagnostics: { ancestry: "complete" } });
  });
  it.each(["30000001", "Infinity", "-1", "not-a-number"])("rejects the oversized/invalid length %s before consuming", async length => {
    const response = json(payload, 200, { "content-length": length });
    expect(await probeNativeStoryHistory(response, "probe-chat")).toEqual({ status: "unavailable", code: "too-large" }); expect(response.bodyUsed).toBe(false);
  });
  it("cancels an oversized body even when there is no Content-Length", async () => {
    const cancel = vi.fn();
    let pulls = 0;
    const response = new Response(new ReadableStream({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(10_000_001).fill(32)); }, cancel }), { headers: { "content-type": "application/json" } });
    expect(await probeNativeStoryHistory(response, "probe-chat")).toEqual({ status: "unavailable", code: "too-large" });
    expect(cancel).toHaveBeenCalledTimes(1); expect(pulls).toBeLessThanOrEqual(4); expect(response.body?.locked).toBe(false);
  });
  it.each(["broken-json", "invalid-utf8", "stream-error", "empty"])("keeps %s failures free of transcript and raw exceptions", async failure => {
    let response: Response;
    if (failure === "empty") response = new Response(null, { headers: { "content-type": "application/json" } });
    else if (failure === "invalid-utf8") response = new Response(new Uint8Array([0xff]), { headers: { "content-type": "application/json" } });
    else if (failure === "stream-error") response = new Response(new ReadableStream({ start(controller) { controller.error(new Error("PRIVATE_ERROR")); } }), { headers: { "content-type": "application/json" } });
    else response = new Response("PRIVATE_LORE", { headers: { "content-type": "application/json" } });
    expect(await probeNativeStoryHistory(response, "probe-chat")).toEqual({ status: "unavailable", code: "unreadable" });
    expect(response.body?.locked ?? false).toBe(false);
  });
  it("reports schema errors distinctly from a network/read failure", async () => {
    expect(await probeNativeStoryHistory(json({ messages: [{ message_id: 1, role: "user" }] }), "probe-chat")).toMatchObject({ status: "read", diagnostics: { ancestry: "invalid", issues: [{ code: "missing-parent" }] } });
  });
});

describe("page-only metadata probe bridge", () => {
  let posted: ReturnType<typeof vi.spyOn>, listeners: ReturnType<typeof vi.spyOn>, fetchMock: ReturnType<typeof vi.fn>;
  let savedUrl: string;
  beforeEach(async () => {
    vi.resetModules(); savedUrl = location.href; history.replaceState(null, "", "/a/chat/s/probe-chat"); localStorage.setItem("userToken", JSON.stringify({ value: "PRIVATE_AUTH_TOKEN" }));
    let install!: () => void;
    vi.stubGlobal("defineUnlistedScript", (callback: () => void) => { install = callback; return {}; });
    fetchMock = vi.fn(async () => json()); vi.stubGlobal("fetch", fetchMock);
    posted = vi.spyOn(window, "postMessage").mockImplementation(() => undefined);
    listeners = vi.spyOn(window, "addEventListener");
    await import("../src/entrypoints/injected"); install();
  });
  afterEach(() => {
    for (const [type, callback, options] of listeners.mock.calls) window.removeEventListener(type, callback, options);
    vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.removeItem("userToken"); history.replaceState(null, "", savedUrl);
  });
  function request(chatId = "probe-chat", requestId: unknown = "probe-1", source: unknown = window) {
    window.dispatchEvent(new MessageEvent("message", { source: source as Window, origin: location.origin, data: { source: "deeprole-extension", type: "NATIVE_STORY_METADATA_REQUEST", requestId, chatId } }));
  }
  const results = () => posted.mock.calls.map((args: unknown[]) => args[0]).filter((value: any) => value?.type === "NATIVE_STORY_METADATA_RESULT") as any[];
  it("fetches only on an explicit current-chat request and posts no identity, unrecognized status, text or credentials", async () => {
    expect(fetchMock).not.toHaveBeenCalled(); request();
    await vi.waitFor(() => expect(results()).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/v0/chat/history_messages?chat_session_id=probe-chat");
    expect(init).toMatchObject({ method: "GET", credentials: "same-origin", cache: "no-store", headers: { Authorization: "Bearer PRIVATE_AUTH_TOKEN" } });
    expect(results()[0]).toMatchObject({ requestId: "probe-1", chatId: "probe-chat", probe: { status: "read", diagnostics: { completion: "unknown" } } });
    expect(JSON.stringify(posted.mock.calls)).not.toMatch(/PRIVATE|nativeMessageKey|REQUEST_CONTEXT|INJECTION_STATUS/);
  });
  it("echoes only the requested native anchor, and keeps observations ID-free",async()=>{
    window.dispatchEvent(new MessageEvent("message",{source:window,origin:location.origin,data:{source:"deeprole-extension",type:"NATIVE_STORY_METADATA_REQUEST",requestId:"probe-anchor",chatId:"probe-chat",anchorId:"1"}}));
    await vi.waitFor(()=>expect(results()).toHaveLength(1));expect(results()[0]).toMatchObject({anchorId:"1",probe:{diagnostics:{diagnosticVersion:3,replyProbe:{anchor:"matched",role:"user",parent:"root",completion:"unknown",selection:"unknown"}}}});
    expect(JSON.stringify(results()[0].probe)).not.toMatch(/PRIVATE|probe-chat|anchorId/);
  });
  it("does not fetch for a foreign origin or invalid anchor",async()=>{
    for(const [origin,anchorId] of [["https://evil.example","1"],[location.origin,"invalid key"],[location.origin,null]])window.dispatchEvent(new MessageEvent("message",{source:window,origin:origin!,data:{source:"deeprole-extension",type:"NATIVE_STORY_METADATA_REQUEST",requestId:"probe-anchor",chatId:"probe-chat",anchorId}}));
    await Promise.resolve();expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["another-chat", "__proto__", " invalid "])("does not read a foreign/invalid chat %s", async chatId => {
    request(chatId); await Promise.resolve(); expect(fetchMock).not.toHaveBeenCalled(); expect(results()).toEqual([]);
  });
  it("does not accept an invalid request ID or a message from another surface", async () => {
    request("probe-chat", "__proto__"); request("probe-chat", "probe-1", null); await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("bounds concurrent probes and permits a later probe after completion", async () => {
    let finish!: (value: Response) => void; fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    request(); request("probe-chat", "probe-2"); expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(json()); await vi.waitFor(() => expect(results()).toHaveLength(1));
    request("probe-chat", "probe-3"); await vi.waitFor(() => expect(results()).toHaveLength(2)); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("discards a result after navigation, even within the same chat URL", async () => {
    vi.useFakeTimers();
    let finish!: (value: Response) => void; fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    request(); history.replaceState(null, "", "/a/chat/s/probe-chat?different=1"); finish(json());
    await vi.advanceTimersByTimeAsync(0); expect(vi.getTimerCount()).toBe(0); expect(results()).toEqual([]);
  });
  it("reports HTTP/read failures without forwarding response bodies or raw errors", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "PRIVATE_ERROR" }, 403)); request();
    await vi.waitFor(() => expect(results()).toHaveLength(1)); expect(results()[0].probe).toEqual({ status: "unavailable", code: "http" });
    fetchMock.mockRejectedValueOnce(new Error("PRIVATE_AUTH_TOKEN")); request("probe-chat", "probe-2");
    await vi.waitFor(() => expect(results()).toHaveLength(2)); expect(results()[1].probe).toEqual({ status: "unavailable", code: "unreadable" });
    expect(JSON.stringify(posted.mock.calls)).not.toContain("PRIVATE");
  });
  it("aborts a stalled probe after five seconds without retrying or keeping the in-flight guard", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("PRIVATE_ABORT")), { once: true })));
    request(); await vi.advanceTimersByTimeAsync(5000);
    expect(results()).toHaveLength(1); expect(results()[0].probe.status).toBe("unavailable"); expect(fetchMock).toHaveBeenCalledTimes(1);
    request("probe-chat", "probe-2"); await vi.advanceTimersByTimeAsync(0);
    expect(results()).toHaveLength(2); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
