import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const body = (id: string) => JSON.stringify({ prompt: `[DeepRole Service]\n[Request ID: ${id}]\nAnalyze the conversation.` });

class MockXHR extends window.EventTarget {
  readyState = 0;
  status = 0;
  sent: unknown[] = [];
  open(..._args: unknown[]) { this.readyState = 1; }
  send(value: unknown) { this.sent.push(value); }
  abort() { this.readyState = 0; this.dispatchEvent(new Event("abort")); this.dispatchEvent(new Event("loadend")); }
  headers() { this.readyState = 2; this.status = 200; this.dispatchEvent(new Event("readystatechange")); }
  finish(type = "load") { this.readyState = 4; this.dispatchEvent(new Event(type)); this.dispatchEvent(new Event("loadend")); }
}

describe("service transport lifecycle", () => {
  let posted: ReturnType<typeof vi.spyOn>;
  let listeners: ReturnType<typeof vi.spyOn>;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    vi.resetModules();
    fetchMock = vi.fn(async () => new Response("stream", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("XMLHttpRequest", MockXHR);
    posted = vi.spyOn(window, "postMessage").mockImplementation(() => undefined);
    listeners = vi.spyOn(window, "addEventListener");
    const { default: script } = await import("../src/entrypoints/injected");
    script.main();
  });
  afterEach(() => {
    vi.clearAllTimers(); vi.useRealTimers();
    for (const [type, callback, options] of listeners.mock.calls) window.removeEventListener(type, callback, options);
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  const failures = () => posted.mock.calls.map((args: unknown[]) => args[0]).filter((value: any) => value?.type === "SERVICE_REQUEST_FAILED");
  function answerContext(continuation = false) {
    const message = posted.mock.calls.map((args: any[]) => args[0]).find((value: any) => value.type === "REQUEST_CONTEXT");
    window.dispatchEvent(new MessageEvent("message", { source: window, origin: location.origin, data: { source: "deeprole-extension", type: "CONTEXT_READY", id: message.id, ok: true, context: "FRESH_RECORD", continuation } }));
    return message;
  }
  it.each([null, 0, 42])("forwards explicit parent %s and HTTP status without reading the response stream", async parent => {
    const original = JSON.stringify({ prompt: "Mira", chat_session_id: "synthetic-chat", parent_message_id: parent });
    const pending = fetch("/api/v0/chat/completion", { method: "POST", body: original }), message = answerContext();
    expect(message.storyIdentity).toEqual({ chatId: "synthetic-chat", nativeParentKey: parent === null ? null : JSON.stringify(["message", String(parent)]) });
    const response = await pending; expect(response.bodyUsed).toBe(false); expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(posted.mock.calls.map((args: unknown[]) => args[0])).toContainEqual(expect.objectContaining({ type: "INJECTION_STATUS", id: message.id, ok: true, httpStatus: 200 }));
  });
  const nativeReady = 'event: ready\ndata: {"request_message_id":43,"response_message_id":44}\n\n';
  const nativeFinish = 'event: finish\ndata: {}\n\nevent: close\ndata: {}\n\n';
  const sendFirst = () => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Continue here.", chat_session_id: "target", parent_message_id: null }) });
  const injectionStatus = () => posted.mock.calls.map(([message]: [{ type: string }]) => message).filter((message: { type: string }) => message.type === "INJECTION_STATUS");

  it("waits for a native finish and close without consuming the site's response", async () => {
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start(controller) { stream = controller; } });
    fetchMock.mockResolvedValue(new Response(body, { headers: { "Content-Type": "text/event-stream; charset=utf-8" } }));
    const pending = sendFirst(), { id } = answerContext(true);
    const response = await pending;
    expect(response.bodyUsed).toBe(false);
    const nativeBody = response.text();
    const encoder = new TextEncoder();
    stream.enqueue(encoder.encode(nativeReady));
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(injectionStatus()).toEqual([]);
    stream.enqueue(encoder.encode(nativeFinish)); stream.close();
    expect(await nativeBody).toBe(nativeReady + nativeFinish);
    await vi.waitFor(() => expect(injectionStatus()).toMatchObject([{ id, ok: true, link: { requestId: id, chatId: "target", nativeParentKey: null } }]));
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each([
    ["JSON refusal", "application/json", '{"code":0,"data":{"biz_code":1}}'],
    ["truncated stream", "text/event-stream", nativeReady],
    ["service hint", "text/event-stream", nativeReady + 'event: hint\ndata: {"content":"quota"}\n\n' + nativeFinish],
    ["retry close", "text/event-stream", nativeReady + nativeFinish.replace("event: close\ndata: {}", 'event: close\ndata: {"click_behavior":"retry"}')],
  ])("does not confirm transfer on %s", async (_name, type, body) => {
    fetchMock.mockResolvedValue(new Response(body, { headers: { "Content-Type": type } }));
    const pending = sendFirst(), { id } = answerContext(true);
    expect(await (await pending).text()).toBe(body);
    await vi.waitFor(() => expect(injectionStatus()).toMatchObject([{ id, ok: false, reason: "continuation-unconfirmed" }]));
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("does not present a missing native parent as an explicit root", async () => {
    const pending = fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Mira", chat_session_id: "synthetic-chat" }) }), message = answerContext();
    expect(message.storyIdentity).toBeNull(); await pending;
  });

  it.each([39999, 40000, 40001])("checks a %s-character assembled prompt before sending", async length => {
    const draft = "Я".repeat(length - 100) + " [КОНЕЦ РЕПЛИКИ]";
    let wire = "";
    fetchMock.mockImplementation(async (_url, options) => {
      wire = JSON.parse(options.body).prompt;
      return new Response(null, { status: wire.length > 40_000 ? 413 : 200 });
    });
    const pending = fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: draft, chat_session_id: "synthetic-chat" }) });
    const message = posted.mock.calls.map((args: any[]) => args[0]).find((value: any) => value.type === "REQUEST_CONTEXT");
    const separator = "\n\n[User message]\n";
    const context = "A".repeat(length - draft.length - separator.length);
    window.dispatchEvent(new MessageEvent("message", { source: window, origin: location.origin, data: { source: "deeprole-extension", type: "CONTEXT_READY", id: message.id, ok: true, context } }));
    if (length > 40_000) {
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(posted.mock.calls.map((args: any[]) => args[0])).toContainEqual(expect.objectContaining({ type: "PROMPT_LENGTH_BLOCKED", id: message.id, length, draft }));
      return;
    }
    const result = await pending;
    expect(wire.length).toBe(length);
    expect(wire.startsWith(context + separator)).toBe(true);
    expect(wire.endsWith(draft)).toBe(true);
    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("checks decoded multipart text while preserving JSON escapes and excluding attachment bytes", async () => {
    const draft = '"💡"\n' + "Я".repeat(100);
    const request = new Request(location.origin + "/api/v0/chat/completion", {
      method: "POST", body: JSON.stringify({ prompt: [{ type: "image_url", image_url: "X".repeat(50_000) }, { type: "text", text: draft }] }),
    });
    const pending = fetch(request);
    await vi.waitFor(() => expect(posted.mock.calls.map((args: any[]) => args[0])).toContainEqual(expect.objectContaining({ type: "REQUEST_CONTEXT", draft })));
    answerContext();
    await expect(pending).resolves.toBeInstanceOf(Response);
    expect(fetchMock).toHaveBeenCalledOnce();
    const json = await fetchMock.mock.calls[0]![0].json();
    expect(json.prompt[0].image_url).toHaveLength(50_000);
    expect(json.prompt[1].text).toBe("FRESH_RECORD\n\n[User message]\n" + draft);
  });

  it("blocks an oversized service prompt without restoring technical text into the composer", async () => {
    const prompt = JSON.parse(body("long-service")).prompt + "a".repeat(40_000);
    await expect(fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt }) })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(failures()).toMatchObject([{ id: "long-service" }]);
    expect(posted.mock.calls.map((args: any[]) => args[0])).toContainEqual(expect.objectContaining({ type: "PROMPT_LENGTH_BLOCKED", length: prompt.length, draft: null }));
  });

  it("blocks an oversized raw synchronous XHR before network or memory preparation", () => {
    const draft = "я".repeat(40_001), xhr = new XMLHttpRequest() as unknown as MockXHR;
    xhr.open("POST", "/api/v0/chat/completion", false);
    expect(() => xhr.send(JSON.stringify({ prompt: draft }))).toThrow(/prompt too long/);
    expect(xhr.sent).toHaveLength(0);
    expect(posted.mock.calls.map((args: any[]) => args[0])).toEqual([expect.objectContaining({ type: "PROMPT_LENGTH_BLOCKED", length: draft.length, draft })]);
  });

  it.each([403, 413, 429])("reports HTTP %s once for a rejected service request", async code => {
    fetchMock.mockResolvedValue(new Response(null, { status: code }));
    const result = await fetch("/api/v0/chat/completion", { method: "POST", body: body("provider-refusal") });
    expect(result.status).toBe(code);
    expect(failures()).toMatchObject([{ id: "provider-refusal" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("forwards the same metadata through XHR while waiting only for fresh context", async () => {
    const xhr = new XMLHttpRequest() as unknown as MockXHR; xhr.open("POST", "/api/v0/chat/completion");
    xhr.send(JSON.stringify({ prompt: "Mira", chat_session_id: "synthetic-chat", parent_message_id: "native-parent" }));
    const message = answerContext(); expect(message.storyIdentity.nativeParentKey).toBe('["message","native-parent"]');
    await vi.waitFor(() => expect(xhr.sent).toHaveLength(1)); xhr.headers();
    expect(posted.mock.calls.map((args: unknown[]) => args[0])).toContainEqual(expect.objectContaining({ type: "INJECTION_STATUS", id: message.id, ok: true, httpStatus: 200 })); xhr.finish();
  });

  it("waits for a fresh context arriving after a slow storage read without sending twice", async () => {
    vi.useFakeTimers();
    const request = fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Mira" }) });
    const message = posted.mock.calls.map((args: any[]) => args[0]).find((value: any) => value.type === "REQUEST_CONTEXT");
    await vi.advanceTimersByTimeAsync(1800);
    expect(fetchMock).not.toHaveBeenCalled();
    window.dispatchEvent(new MessageEvent("message", { source: window, origin: location.origin, data: { source: "deeprole-extension", type: "CONTEXT_READY", id: message.id, ok: true, context: "FRESH_RECORD" } }));
    await request;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![1].body).toContain("FRESH_RECORD");
  });

  it("falls back once after bounded context waiting and ignores a late reply", async () => {
    vi.useFakeTimers();
    const original = JSON.stringify({ prompt: "Mira" });
    const request = fetch("/api/v0/chat/completion", { method: "POST", body: original });
    const message = posted.mock.calls.map((args: any[]) => args[0]).find((value: any) => value.type === "REQUEST_CONTEXT");
    await vi.advanceTimersByTimeAsync(5000); await request;
    window.dispatchEvent(new MessageEvent("message", { source: window, origin: location.origin, data: { source: "deeprole-extension", type: "CONTEXT_READY", id: message.id, ok: true, context: "LATE_RECORD" } }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![1].body).toBe(original);
    expect(posted.mock.calls.map((args: any[]) => args[0])).toContainEqual(expect.objectContaining({ type: "INJECTION_STATUS", ok: false, id: message.id, reason: "context-timeout" }));
  });

  it("releases a fetch service aborted after successful headers without consuming its response", async () => {
    const controller = new AbortController();
    const response = await fetch("/api/v0/chat/completion", { method: "POST", body: body("fetch-abort"), signal: controller.signal });
    expect(response.bodyUsed).toBe(false);
    expect(response).toBe(await fetchMock.mock.results[0]!.value);
    controller.abort();
    expect(failures()).toMatchObject([{ id: "fetch-abort" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("releases an XHR service aborted after successful headers", async () => {
    const xhr = new XMLHttpRequest() as unknown as MockXHR;
    xhr.open("POST", "/api/v0/chat/completion"); xhr.send(body("xhr-abort"));
    await vi.waitFor(() => expect(xhr.sent).toHaveLength(1));
    xhr.headers(); xhr.abort();
    expect(failures()).toMatchObject([{ id: "xhr-abort" }]);
  });

  it.each(["error", "timeout"])("releases an XHR service on %s after headers", async (event) => {
    const xhr = new XMLHttpRequest() as unknown as MockXHR;
    xhr.open("POST", "/api/v0/chat/completion"); xhr.send(body("xhr-failed"));
    await vi.waitFor(() => expect(xhr.sent).toHaveLength(1));
    xhr.headers(); xhr.finish(event);
    expect(failures()).toMatchObject([{ id: "xhr-failed" }]);
  });

  it("tracks the signal of a Request object and preserves the original body", async () => {
    const controller = new AbortController();
    await fetch(new Request("http://localhost:3000/api/v0/chat/completion", { method: "POST", body: body("request-signal"), signal: controller.signal }));
    const forwarded = fetchMock.mock.calls[0]![0] as Request;
    expect(await forwarded.clone().text()).toBe(body("request-signal"));
    controller.abort();
    expect(failures()).toMatchObject([{ id: "request-signal" }]);
  });

  it("respects an explicit null signal override", async () => {
    const controller = new AbortController();
    await fetch(new Request("http://localhost:3000/api/v0/chat/completion", { method: "POST", body: body("ignored-signal"), signal: controller.signal }), { signal: null });
    controller.abort(); expect(failures()).toEqual([]);
  });

  it("preserves fetch rejection without retrying or duplicate failure", async () => {
    const error = new DOMException("Stopped", "AbortError");
    const controller = new AbortController(); controller.abort();
    fetchMock.mockRejectedValueOnce(error);
    await expect(fetch("/api/v0/chat/completion", { method: "POST", body: body("early-abort"), signal: controller.signal })).rejects.toBe(error);
    expect(failures()).toMatchObject([{ id: "early-abort" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not track unrelated fetch requests", async () => {
    const controller = new AbortController();
    await fetch("/api/v0/chat/history", { signal: controller.signal }); controller.abort();
    expect(failures()).toEqual([]);
  });

  it("releases an XHR service aborted before preparation without sending it", async () => {
    const xhr = new XMLHttpRequest() as unknown as MockXHR;
    xhr.open("POST", "/api/v0/chat/completion"); xhr.send(body("before-prepare")); xhr.abort();
    await Promise.resolve(); await Promise.resolve();
    expect(xhr.sent).toEqual([]);
    expect(failures()).toMatchObject([{ id: "before-prepare" }]);
  });

  it("reusing XHR cancels only its previous service and cannot send its queued body", async () => {
    const xhr = new XMLHttpRequest() as unknown as MockXHR;
    xhr.open("POST", "/api/v0/chat/completion"); xhr.send(body("old"));
    xhr.open("POST", "/api/v0/chat/completion"); xhr.send(body("new"));
    await vi.waitFor(() => expect(xhr.sent).toEqual([body("new")]));
    expect(failures()).toMatchObject([{ id: "old" }]);
    xhr.headers(); xhr.abort();
    expect(failures()).toMatchObject([{ id: "old" }, { id: "new" }]);
  });

  it("does not report failure for XHR aborted after a completed response", async () => {
    const xhr = new XMLHttpRequest() as unknown as MockXHR;
    xhr.open("POST", "/api/v0/chat/completion"); xhr.send(body("completed"));
    await vi.waitFor(() => expect(xhr.sent).toHaveLength(1));
    xhr.headers(); xhr.finish(); xhr.abort();
    expect(failures()).toEqual([]);
  });
});
