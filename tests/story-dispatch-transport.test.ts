import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validStoryDispatchPacket } from "../src/core/story-dispatch";
import { validNativeStoryStreamPacket } from "../src/core/story-native-stream";

class MockXHR extends window.EventTarget {
  readyState = 0; status = 0; sent: unknown[] = []; synchronous = false;
  responseType = ""; responseText = ""; contentType = "application/json";
  getResponseHeader(name: string) { return name.toLowerCase() === "content-type" ? this.contentType : null; }
  progress(text: string) { this.readyState = 3; this.responseText += text; this.dispatchEvent(new Event("progress")); }
  open(_method: unknown, _url: unknown, asynchronous = true) { this.readyState = 1; this.status = 0; this.synchronous = !asynchronous; }
  send(value: unknown) { this.sent.push(value); if (this.synchronous) this.status = 200; }
  abort() { this.readyState = 0; this.dispatchEvent(new Event("abort")); this.dispatchEvent(new Event("loadend")); }
  headers(status = 200) { this.readyState = 2; this.status = status; this.dispatchEvent(new Event("readystatechange")); }
  finish(type = "load") { this.readyState = 4; this.dispatchEvent(new Event(type)); this.dispatchEvent(new Event("loadend")); }
}
const endpoint = "/api/v0/chat/completion";
const nativeBody = (parent: unknown = 42, prompt: string | undefined = "PRIVATE_DRAFT") => JSON.stringify({ chat_session_id: "synthetic-chat", parent_message_id: parent, ...(prompt !== undefined ? { prompt } : {}) });
const deferred = <T,>() => { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; };

describe("ordinary Fetch/XHR outgoing dispatch bridge (not reply completion)", () => {
  let posted: ReturnType<typeof vi.spyOn>, listeners: ReturnType<typeof vi.spyOn>, fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    vi.resetModules(); let install!: () => void;
    vi.stubGlobal("defineUnlistedScript", (callback: () => void) => { install = callback; return {}; });
    fetchMock = vi.fn(async () => new Response("PRIVATE_STREAM", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock); vi.stubGlobal("XMLHttpRequest", MockXHR);
    posted = vi.spyOn(window, "postMessage").mockImplementation(() => undefined);
    listeners = vi.spyOn(window, "addEventListener");
    await import("../src/entrypoints/injected"); install();
  });
  afterEach(() => {
    vi.clearAllTimers(); vi.useRealTimers();
    for (const [type, callback, options] of listeners.mock.calls) window.removeEventListener(type, callback, options);
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  const messages = (type: string): any[] => posted.mock.calls.map((args: unknown[]) => args[0] as any).filter((value: any) => value?.type === type);
  const packets = () => messages("NATIVE_STORY_DISPATCH");
  function answerContext(context = "", index = 0, capture = false) {
    const message = messages("REQUEST_CONTEXT")[index]; expect(message).toBeDefined();
    window.dispatchEvent(new MessageEvent("message", { source: window, data: { source: "deeprole-extension", type: "CONTEXT_READY", id: message.id, ok: true, context, capture } }));
    return message;
  }
  function confirmSource(id: string, ok = true, origin = location.origin) {
    window.dispatchEvent(new MessageEvent("message", { source: window, origin, data: { source: "deeprole-extension", type: "STORY_CAPTURE_CONFIRMED", id, ok } }));
  }
  const xhr = () => { const request = new XMLHttpRequest() as unknown as MockXHR; request.open("POST", endpoint); return request; };
  function assertSafePackets() {
    for (const { source, type, ...packet } of packets()) {
      expect(source).toBe("deeprole-page-bridge"); expect(type).toBe("NATIVE_STORY_DISPATCH");
      expect(validStoryDispatchPacket(packet)).toBe(true);
    }
    expect(JSON.stringify(packets())).not.toMatch(/PRIVATE_|completion|Authorization|Bearer/);
    for (const [message, origin] of posted.mock.calls) if (message.type === "NATIVE_STORY_DISPATCH") expect(origin).toBe(location.origin);
  }
  it.each(["fetch", "xhr"] as const)("%s waits for exact outgoing source confirmation before its only native send", async transport => {
    const body = JSON.stringify({ chat_session_id: "synthetic-chat", parent_message_id: 42, prompt: "PRIVATE_DRAFT", token: "PRIVATE_TOKEN" });
    const request = transport === "xhr" ? xhr() : null;
    const result = request ? (request.send(body), Promise.resolve()) : fetch(endpoint, { method: "POST", body });
    const context = answerContext("PRIVATE_MEMORY", 0, true);
    await vi.waitFor(() => expect(messages("STORY_CAPTURE_SOURCE")).toHaveLength(1));
    expect(context.captureTransport).toBe(transport); expect(fetchMock).not.toHaveBeenCalled(); expect(request?.sent ?? []).toEqual([]);
    const source = messages("STORY_CAPTURE_SOURCE")[0];
    expect(source).toEqual({ source: "deeprole-page-bridge", type: "STORY_CAPTURE_SOURCE", requestId: context.id, identity: context.storyIdentity, transport, outgoingText: "PRIVATE_MEMORY\n\n[User message]\nPRIVATE_DRAFT" });
    expect(JSON.stringify(source)).not.toContain("PRIVATE_TOKEN");
    confirmSource("other-request"); confirmSource(context.id, true, "https://foreign.example"); await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled(); expect(request?.sent ?? []).toEqual([]);
    confirmSource(context.id); await result;
    await vi.waitFor(() => expect(request ? request.sent : fetchMock.mock.calls).toHaveLength(1));
    const actual = request ? request.sent[0] : fetchMock.mock.calls[0]![1].body;
    expect(JSON.parse(actual).prompt).toBe(source.outgoingText); expect(JSON.parse(actual).token).toBe("PRIVATE_TOKEN");
    if (request) { request.headers(); request.finish(); }
    expect(packets()).toHaveLength(2); assertSafePackets();
  });
  it.each([true, false])("a confirmation ok=%s cannot cause retransmission or replace the site's response", async ok => {
    const promise = fetch(endpoint, { method: "POST", body: nativeBody() }); const context = answerContext("", 0, true);
    await vi.waitFor(() => expect(messages("STORY_CAPTURE_SOURCE")).toHaveLength(1));
    expect(messages("STORY_CAPTURE_SOURCE")[0].outgoingText).toBe("PRIVATE_DRAFT"); confirmSource(context.id, ok); const response = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(response.bodyUsed).toBe(false); expect(response).toBe(await fetchMock.mock.results[0]!.value); expect(messages("INJECTION_STATUS")).toEqual([]);
  });
  it("a missing storage confirmation times out without blocking the user forever or retrying", async () => {
    vi.useFakeTimers(); const promise = fetch(endpoint, { method: "POST", body: nativeBody() }); answerContext("PRIVATE_MEMORY", 0, true);
    await vi.advanceTimersByTimeAsync(0); expect(messages("STORY_CAPTURE_SOURCE")).toHaveLength(1); expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1999); expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await promise; expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("keeps user-written context-like markers literal when injection is skipped", async () => {
    const draft = "<deeprole_context>USER_LITERAL</deeprole_context>\n[User message]\nPRIVATE_DRAFT";
    const promise = fetch(endpoint, { method: "POST", body: nativeBody(42, draft) }); const context = answerContext("PRIVATE_MEMORY", 0, true);
    await vi.waitFor(() => expect(messages("STORY_CAPTURE_SOURCE")).toHaveLength(1));
    expect(messages("STORY_CAPTURE_SOURCE")[0].outgoingText).toBe(draft); confirmSource(context.id); await promise;
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).prompt).toBe(draft);
  });
  it("canceling an XHR while source storage is pending never sends the queued request", async () => {
    const request = xhr(); request.send(nativeBody()); const context = answerContext("PRIVATE_MEMORY", 0, true);
    await vi.waitFor(() => expect(messages("STORY_CAPTURE_SOURCE")).toHaveLength(1)); request.abort(); confirmSource(context.id);
    await Promise.resolve(); await Promise.resolve(); expect(request.sent).toEqual([]); expect(packets()).toEqual([]);
  });
  it("does not attach the previous chat's context after navigation during confirmation", async () => {
    const original = location.href; const promise = fetch(endpoint, { method: "POST", body: nativeBody() }); const context = answerContext("PRIVATE_MEMORY", 0, true);
    await vi.waitFor(() => expect(messages("STORY_CAPTURE_SOURCE")).toHaveLength(1));
    try { history.pushState({}, "", "/other-chat"); confirmSource(context.id); await promise; expect(fetchMock.mock.calls[0]![1].body).toBe(nativeBody()); }
    finally { history.replaceState({}, "", original); }
  });
  it("reads only new XHR SSE metadata without changing response text or resending the request", async () => {
    const request = xhr(); request.contentType = "text/event-stream; charset=utf-8"; request.send(nativeBody()); const context = answerContext();
    await vi.waitFor(() => expect(request.sent).toHaveLength(1)); request.headers();
    const a = 'event: ready\ndata: {"request_message_id":43,"response_message_id":44}\n\n';
    const b = 'data: {"v":"PRIVATE_REPLY_PRIVATE_REASONING"}\n\nevent: finish\ndata: {}\n\nevent: close\ndata: {}\n\n';
    request.progress(a.slice(0, 10)); request.progress(a.slice(10)); request.progress(b); request.finish();
    const stream = messages("NATIVE_STORY_STREAM"); expect(stream.map(p => p.phase)).toEqual(["ready", "finish", "closed"]);
    for (const { source, type, ...packet } of stream) { expect(validNativeStoryStreamPacket(packet)).toBe(true); expect(packet.requestId).toBe(context.id); }
    expect(JSON.stringify(stream)).not.toContain("PRIVATE"); expect(request.responseText).toBe(a + b); expect(request.sent).toEqual([nativeBody()]);
  });
  it("cannot synthesize native finish from HTTP or EOF, and keeps abort after headers separate", async () => {
    const request = xhr(); request.contentType = "text/event-stream"; request.send(nativeBody()); answerContext();
    await vi.waitFor(() => expect(request.sent).toHaveLength(1)); request.headers(); request.progress('event: ready\ndata: {"request_message_id":43,"response_message_id":44}\n\n'); request.abort();
    expect(packets().at(-1).delivery.status).toBe("accepted"); expect(messages("NATIVE_STORY_STREAM").map(p => p.phase)).toEqual(["ready", "failed"]);
    expect(messages("NATIVE_STORY_STREAM").at(-1)).toMatchObject({ issue: "aborted", sawFinish: false });
  });
  it.each([null, 0, "null", "native-42"])("captures parent %s without memory injection, leaves body/response untouched", parent => {
    return (async () => {
      const original = nativeBody(parent); const promise = fetch(endpoint, { method: "POST", body: original });
      const context = answerContext(); const response = await promise;
      expect(fetchMock).toHaveBeenCalledTimes(1); expect(fetchMock.mock.calls[0]![1].body).toBe(original);
      expect(response).toBe(await fetchMock.mock.results[0]!.value); expect(response.bodyUsed).toBe(false);
      expect(messages("INJECTION_STATUS")).toEqual([]);
      expect(packets()).toMatchObject([
        { requestId: context.id, identity: context.storyIdentity, phase: "started", transport: "fetch" },
        { requestId: context.id, identity: context.storyIdentity, phase: "settled", delivery: { status: "accepted", httpStatus: 200 } },
      ]); assertSafePackets();
    })();
  });
  it("captures native-only calls without inventing a user prompt or purpose", async () => {
    const body = JSON.stringify({ chat_session_id: "synthetic-chat", parent_message_id: 42 });
    await fetch(endpoint, { method: "POST", body });
    expect(messages("REQUEST_CONTEXT")).toEqual([]); expect(fetchMock.mock.calls[0]![1].body).toBe(body);
    expect(packets()).toHaveLength(2); assertSafePackets();
  });
  it("keeps the captured identity when memory is appended to the outgoing text", async () => {
    const promise = fetch(endpoint, { method: "POST", body: nativeBody(0) }); const context = answerContext("FRESH_RECORD"); await promise;
    expect(fetchMock.mock.calls[0]![1].body).toContain("FRESH_RECORD");
    expect(packets()[1].requestId).toBe(context.id); expect(packets()[1].identity.nativeParentKey).toBe('["message","0"]'); assertSafePackets();
  });
  it("does not guess an absent parent", async () => {
    const promise = fetch(endpoint, { method: "POST", body: JSON.stringify({ chat_session_id: "synthetic-chat", prompt: "PRIVATE_DRAFT" }) }); answerContext(); await promise;
    expect(packets()).toEqual([]);
  });
  it.each(["/api/v0/chat/history", "https://foreign.example/api/v0/chat/completion"])("does not track endpoint %s", async url => {
    await fetch(url, { method: "POST", body: nativeBody() }); expect(packets()).toEqual([]); expect(messages("REQUEST_CONTEXT")).toEqual([]);
  });
  it.each(["GET", "PUT"])("does not present %s as an ordinary native POST", async method => {
    const promise = fetch(endpoint, { method, body: nativeBody() }); answerContext(); await promise; expect(packets()).toEqual([]);
  });
  it("does not track service requests even when they contain native IDs", async () => {
    const body = nativeBody(42, "[DeepRole Service]\n[Request ID: service-call]\nPRIVATE_DRAFT");
    await fetch(endpoint, { method: "POST", body }); const request = xhr(); request.send(body);
    await vi.waitFor(() => expect(request.sent).toHaveLength(1)); request.headers(); request.finish();
    expect(packets()).toEqual([]); expect(messages("REQUEST_CONTEXT")).toEqual([]);
  });
  it.each([401, 429, 503])("reports HTTP %s without retry or false completion", async status => {
    fetchMock.mockResolvedValueOnce(new Response("PRIVATE_STREAM", { status }));
    const promise = fetch(endpoint, { method: "POST", body: nativeBody() }); answerContext(); const response = await promise;
    expect(response.status).toBe(status); expect(response.bodyUsed).toBe(false); expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(packets()[1].delivery).toEqual({ status: "failed", code: "http", httpStatus: status }); assertSafePackets();
  });
  it("reports redirects without reading or replacing the actual Response", async () => {
    const response = new Response("PRIVATE_STREAM"); Object.defineProperty(response, "redirected", { value: true }); fetchMock.mockResolvedValueOnce(response);
    const promise = fetch(endpoint, { method: "POST", body: nativeBody() }); answerContext(); expect(await promise).toBe(response);
    expect(packets()[1].delivery).toEqual({ status: "failed", code: "redirected", httpStatus: 200 }); expect(response.bodyUsed).toBe(false);
  });
  it("preserves a network rejection and never retries", async () => {
    const error = new Error("PRIVATE_ERROR"); fetchMock.mockRejectedValueOnce(error);
    const promise = fetch(endpoint, { method: "POST", body: nativeBody() }); answerContext(); await expect(promise).rejects.toBe(error);
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(packets()[1].delivery).toEqual({ status: "failed", code: "network" }); assertSafePackets();
  });
  it("isolates two concurrent requests whose headers arrive out of order", async () => {
    const first = deferred<Response>(), second = deferred<Response>(); fetchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = fetch(endpoint, { method: "POST", body: nativeBody(41) }); const b = fetch(endpoint, { method: "POST", body: nativeBody(42) });
    const ca = answerContext("", 0), cb = answerContext("", 1); await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    second.resolve(new Response("b")); await b; first.resolve(new Response("a", { status: 503 })); await a;
    expect(packets().map(p => [p.requestId, p.phase, p.identity.nativeParentKey])).toEqual([
      [ca.id, "started", '["message","41"]'], [cb.id, "started", '["message","42"]'],
      [cb.id, "settled", '["message","42"]'], [ca.id, "settled", '["message","41"]'],
    ]); assertSafePackets();
  });
  it.each(["before-send", "before-headers"])("settles cancellation %s once, ignores late mock headers", async timing => {
    const waiting = deferred<Response>(), controller = new AbortController(); fetchMock.mockReturnValueOnce(waiting.promise);
    const promise = fetch(endpoint, { method: "POST", body: nativeBody(), signal: controller.signal }); answerContext();
    if (timing === "before-headers") await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    controller.abort(); await vi.waitFor(() => expect(packets()).toHaveLength(2)); waiting.resolve(new Response("PRIVATE_STREAM")); await promise;
    expect(packets()).toHaveLength(2); expect(packets()[1].delivery).toEqual({ status: "failed", code: "aborted" }); assertSafePackets();
  });
  it("removes ordinary fetch abort tracking after headers, without claiming completion", async () => {
    const controller = new AbortController(), removed = vi.spyOn(controller.signal, "removeEventListener");
    const promise = fetch(endpoint, { method: "POST", body: nativeBody(), signal: controller.signal }); answerContext(); const response = await promise;
    expect(removed.mock.calls.some(([type]) => type === "abort")).toBe(true);
    controller.abort(); expect(packets()).toHaveLength(2); expect(packets()[1].delivery.status).toBe("accepted"); expect(response.bodyUsed).toBe(false);
  });
  it.each([undefined, { signal: null }])("uses a Request's method/body and respects the effective signal %#", async init => {
    const controller = new AbortController(); const request = new Request("http://localhost:3000" + endpoint, { method: "POST", body: nativeBody(), signal: controller.signal });
    const promise = fetch(request, init); await vi.waitFor(() => expect(messages("REQUEST_CONTEXT")).toHaveLength(1)); answerContext(); await promise; controller.abort();
    expect(await (fetchMock.mock.calls[0]![0] as Request).clone().text()).toBe(nativeBody());
    expect(packets()).toHaveLength(2); expect(packets()[1].delivery.status).toBe("accepted");
  });
  it("does not emit native POST packets if init overrides a Request method", async () => {
    const request = new Request("http://localhost:3000" + endpoint, { method: "POST", body: nativeBody() });
    const promise = fetch(request, { method: "PUT" }); await vi.waitFor(() => expect(messages("REQUEST_CONTEXT")).toHaveLength(1)); answerContext(); await promise; expect(packets()).toEqual([]);
  });
  it("never lets a dispatch reporter exception prevent the site's send", async () => {
    posted.mockImplementation((message: any) => { if (message.type === "NATIVE_STORY_DISPATCH") throw new Error("reporter broken"); });
    const promise = fetch(endpoint, { method: "POST", body: nativeBody() }); answerContext(); const response = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(response.status).toBe(200); expect(response.bodyUsed).toBe(false);
  });
  it("does not add a method-coercion failure before the original fetch", async () => {
    const promise = fetch(endpoint, { method: 7 as unknown as string, body: nativeBody() }); answerContext(); await promise;
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(packets()).toEqual([]);
  });
  it.each([200, 503])("captures XHR HTTP %s without reading response text", async status => {
    const request = xhr(); request.send(nativeBody()); const context = answerContext(); await vi.waitFor(() => expect(request.sent).toHaveLength(1));
    request.headers(status); request.finish();
    expect(request.sent).toEqual([nativeBody()]); expect(packets()).toHaveLength(2); expect(packets()[1].requestId).toBe(context.id);
    expect(packets()[1].delivery).toEqual(status === 200 ? { status: "accepted", httpStatus: status } : { status: "failed", code: "http", httpStatus: status }); assertSafePackets();
  });
  it.each(["error", "timeout"])("records XHR %s before headers once", async event => {
    const request = xhr(); request.send(nativeBody()); answerContext(); await vi.waitFor(() => expect(request.sent).toHaveLength(1)); request.finish(event);
    expect(packets()).toHaveLength(2); expect(packets()[1].delivery).toEqual({ status: "failed", code: "network" });
  });
  it("records an aborted XHR before headers but does not rewrite acceptance after headers", async () => {
    const a = xhr(); a.send(nativeBody(41)); answerContext(); await vi.waitFor(() => expect(a.sent).toHaveLength(1)); a.abort();
    const b = xhr(); b.send(nativeBody(42)); answerContext("", 1); await vi.waitFor(() => expect(b.sent).toHaveLength(1)); b.headers(); b.abort();
    expect(packets().filter(p => p.phase === "settled").map(p => p.delivery)).toEqual([{ status: "failed", code: "aborted" }, { status: "accepted", httpStatus: 200 }]); assertSafePackets();
  });
  it("does not claim a queued XHR was sent if it was canceled before preparation", async () => {
    const request = xhr(); request.send(nativeBody()); const context = answerContext(); request.abort();
    await Promise.resolve(); await Promise.resolve(); expect(request.sent).toEqual([]); expect(packets()).toEqual([]); expect(context).toBeDefined();
  });
  it("reusing an in-flight XHR settles only the old call and never mixes parents", async () => {
    const request = xhr(); request.send(nativeBody(41)); const ca = answerContext(); await vi.waitFor(() => expect(request.sent).toHaveLength(1));
    request.open("POST", endpoint); request.send(nativeBody(42)); const cb = answerContext("", 1); await vi.waitFor(() => expect(request.sent).toHaveLength(2)); request.headers(); request.finish();
    expect(packets().filter(p => p.phase === "settled")).toMatchObject([
      { requestId: ca.id, identity: { nativeParentKey: '["message","41"]' }, delivery: { status: "failed", code: "superseded" } },
      { requestId: cb.id, identity: { nativeParentKey: '["message","42"]' }, delivery: { status: "accepted", httpStatus: 200 } },
    ]); assertSafePackets();
  });
  it("supports sync XHR unchanged without waiting for storage or reading its reply", () => {
    const request = new XMLHttpRequest() as unknown as MockXHR; request.open("POST", endpoint, false); request.send(nativeBody());
    expect(request.sent).toEqual([nativeBody()]); expect(messages("REQUEST_CONTEXT")).toEqual([]); expect(packets()).toHaveLength(2);
    expect(packets()[1].delivery).toEqual({ status: "accepted", httpStatus: 200 }); assertSafePackets();
  });
});
