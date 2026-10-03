import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetModules(); });

for (const order of ["before", "after"] as const) describe(`another fetch wrapper installed ${order} DeepRole`, () => {
  async function setup() {
    vi.resetModules(); let install!: () => void;
    vi.stubGlobal("defineUnlistedScript", (callback: () => void) => { install = callback; });
    const response = new Response("data: partial\n\ndata: finished\n\n", { headers: { "Content-Type": "text/event-stream" } });
    const network = vi.fn(async (_input: unknown, _init?: RequestInit) => response);
    vi.stubGlobal("fetch", network);
    class NetworkXHR extends window.EventTarget {
      readyState = 0; status = 0; sent: unknown[] = []; headers: Record<string, string> = {};
      open(..._args: unknown[]) { this.readyState = 1; }
      setRequestHeader(name: string, value: string) { this.headers[name] = value; }
      send(value: unknown) { this.sent.push(value); this.readyState = 2; this.status = 200; this.dispatchEvent(new Event("readystatechange")); }
      abort() { this.readyState = 0; this.dispatchEvent(new Event("abort")); this.dispatchEvent(new Event("loadend")); }
    }
    vi.stubGlobal("XMLHttpRequest", NetworkXHR); let neighborXHRCalls = 0;
    const wrapXHR = () => {
      const Previous = window.XMLHttpRequest;
      window.XMLHttpRequest = class extends Previous {
        override send(body?: Document | XMLHttpRequestBodyInit | null) {
          neighborXHRCalls++;
          if (typeof body === "string") { const payload = JSON.parse(body); payload.neighbor_metadata = true; if (typeof payload.prompt === "string") payload.prompt += "\nFACT_B"; body = JSON.stringify(payload); }
          super.send(body);
        }
      };
    };
    const wrap = () => {
      const previous = window.fetch.bind(window);
      const wrapper = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (typeof init?.body !== "string") return previous(input, init);
        const payload = JSON.parse(init.body);
        payload.neighbor_metadata = { enabled: true };
        if (typeof payload.prompt === "string") payload.prompt += "\n[Neighbor memory]\nFACT_B";
        return previous(input, { ...init, body: JSON.stringify(payload) });
      });
      window.fetch = wrapper; return wrapper;
    };
    let neighbor: ReturnType<typeof wrap>;
    if (order === "before") { neighbor = wrap(); wrapXHR(); }
    const posted = vi.spyOn(window, "postMessage").mockImplementation((value: any) => {
      if (value.type === "REQUEST_CONTEXT") queueMicrotask(() => window.dispatchEvent(new MessageEvent("message", { source: window, data: { source: "deeprole-extension", type: "CONTEXT_READY", id: value.id, ok: true, context: "<deeprole_context>FACT_A</deeprole_context>" } })));
    });
    const listeners = vi.spyOn(window, "addEventListener");
    await import("../src/entrypoints/injected"); install();
    if (order === "after") { neighbor = wrap(); wrapXHR(); }
    return { network, response, posted, neighbor: neighbor!, xhrCalls: () => neighborXHRCalls, cleanup: () => { for (const [type, callback, options] of listeners.mock.calls) window.removeEventListener(type, callback, options); } };
  }

  it("preserves both memories, headers, metadata and the site's untouched streaming response exactly once", async () => {
    const state = await setup();
    try {
      const headers = { "Content-Type": "application/json", "X-Neighbor": "kept" };
      const controller = new AbortController();
      const result = await fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ chat_session_id: "test-chat", prompt: "Mira opens the case", parent_message_id: 9 }), headers, credentials: "include", signal: controller.signal });
      expect(state.network).toHaveBeenCalledTimes(1); expect(state.neighbor).toHaveBeenCalledTimes(1);
      const init = state.network.mock.calls[0]![1]!; const payload = JSON.parse(init.body as string);
      expect(payload).toMatchObject({ chat_session_id: "test-chat", parent_message_id: 9, neighbor_metadata: { enabled: true } });
      expect(payload.prompt).toContain("Mira opens the case"); expect(payload.prompt.match(/FACT_A/g)).toHaveLength(1); expect(payload.prompt.match(/FACT_B/g)).toHaveLength(1);
      expect(init.headers).toEqual(headers); expect(init.signal).toBe(controller.signal); expect(init.credentials).toBe("include");
      expect(result).toBe(state.response); expect(result.bodyUsed).toBe(false);
      expect(await result.text()).toBe("data: partial\n\ndata: finished\n\n");
      expect(state.posted.mock.calls.map(call => call[0])).toContainEqual(expect.objectContaining({ type: "INJECTION_STATUS", ok: true }));
    } finally { state.cleanup(); }
  });

  it("passes service messages once without adding ordinary lore", async () => {
    const state = await setup();
    try {
      await fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "[DeepRole Service]\n[Request ID: coexistence]\nAnalyze the scene." }) });
      expect(state.network).toHaveBeenCalledTimes(1);
      expect(state.network.mock.calls[0]![1]!.body).not.toContain("FACT_A");
      expect(state.posted.mock.calls.map(call => call[0]).filter((value: any) => value.type === "REQUEST_CONTEXT")).toEqual([]);
    } finally { state.cleanup(); }
  });

  it("preserves the XHR wrapper chain and its headers without double sending", async () => {
    const state = await setup();
    try {
      const xhr = new XMLHttpRequest() as XMLHttpRequest & { sent: string[]; headers: Record<string, string> };
      xhr.open("POST", "/api/v0/chat/completion", true); xhr.setRequestHeader("X-Neighbor", "kept");
      xhr.send(JSON.stringify({ prompt: "Mira", chat_session_id: "test-chat" }));
      await vi.waitFor(() => expect(xhr.sent).toHaveLength(1));
      const payload = JSON.parse(xhr.sent[0]!);
      expect(payload).toMatchObject({ neighbor_metadata: true, chat_session_id: "test-chat" });
      expect(payload.prompt.match(/FACT_A/g)).toHaveLength(1); expect(payload.prompt.match(/FACT_B/g)).toHaveLength(1);
      expect(state.xhrCalls()).toBe(1); expect(xhr.headers).toEqual({ "X-Neighbor": "kept" });
      expect(state.posted.mock.calls.map(call => call[0])).toContainEqual(expect.objectContaining({ type: "INJECTION_STATUS", ok: true }));
      xhr.abort();
    } finally { state.cleanup(); }
  });
});
