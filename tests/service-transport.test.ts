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
    let install!: () => void;
    vi.stubGlobal("defineUnlistedScript", (callback: () => void) => { install = callback; return {}; });
    fetchMock = vi.fn(async () => new Response("stream", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("XMLHttpRequest", MockXHR);
    posted = vi.spyOn(window, "postMessage").mockImplementation(() => undefined);
    listeners = vi.spyOn(window, "addEventListener");
    await import("../src/entrypoints/injected");
    install();
  });
  afterEach(() => {
    vi.clearAllTimers(); vi.useRealTimers();
    for (const [type, callback, options] of listeners.mock.calls) window.removeEventListener(type, callback, options);
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  const failures = () => posted.mock.calls.map((args: unknown[]) => args[0]).filter((value: any) => value?.type === "SERVICE_REQUEST_FAILED");

  it("waits for a fresh context arriving after a slow storage read without sending twice", async () => {
    vi.useFakeTimers();
    const request = fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Mira" }) });
    const message = posted.mock.calls.map((args: any[]) => args[0]).find((value: any) => value.type === "REQUEST_CONTEXT");
    await vi.advanceTimersByTimeAsync(1800);
    expect(fetchMock).not.toHaveBeenCalled();
    window.dispatchEvent(new MessageEvent("message", { source: window, data: { source: "deeprole-extension", type: "CONTEXT_READY", id: message.id, ok: true, context: "FRESH_RECORD" } }));
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
    window.dispatchEvent(new MessageEvent("message", { source: window, data: { source: "deeprole-extension", type: "CONTEXT_READY", id: message.id, ok: true, context: "LATE_RECORD" } }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![1].body).toBe(original);
    expect(posted.mock.calls.map((args: any[]) => args[0])).toContainEqual(expect.objectContaining({ type: "INJECTION_STATUS", ok: false, id: message.id }));
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
