import { deepRoleServiceRequestId, injectIntoJsonBody, isDeepRoleServiceBody, looksLikeChatUrl, outgoingUserText } from "../core/request-injection";

export default defineUnlistedScript(() => {
  const originalFetch = window.fetch.bind(window);
  const SOURCE = "deeprole-page-bridge";
  const pending = new Map<string, (value: string | null) => void>();
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "deeprole-extension" || event.data.type !== "CONTEXT_READY") return;
    pending.get(event.data.id)?.(event.data.ok && typeof event.data.context === "string" ? event.data.context : null);
  });
  function freshContext(id: string, draft: string): Promise<string | null> {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        pending.delete(id);
        resolve(null);
      // Cold background/storage reads can exceed 1.5s under load. Await the
      // request-specific snapshot, with a hard bound; never retry the message.
      }, 5000);
      pending.set(id, (context) => { window.clearTimeout(timer); pending.delete(id); resolve(context); });
      window.postMessage({ source: SOURCE, type: "REQUEST_CONTEXT", id, draft }, "*");
    });
  }
  function status(ok: boolean, id?: string, url = location.href) { window.postMessage({ source: SOURCE, type: "INJECTION_STATUS", ok, id, url }, "*"); }
  function serviceFailed(id?: string) { if (id) window.postMessage({ source: SOURCE, type: "SERVICE_REQUEST_FAILED", id }, "*"); }
  function supportedUrl(url: string) { try { return new URL(url, location.href).origin === location.origin && looksLikeChatUrl(url); } catch { return false; } }
  async function prepare(body: string): Promise<{ body: string; attached: boolean; id?: string; url?: string; serviceId?: string }> {
    const unchanged = { body, attached: false };
    if (isDeepRoleServiceBody(body)) return { ...unchanged, serviceId: deepRoleServiceRequestId(body) ?? undefined };
    const draft = outgoingUserText(body);
    if (draft === null) { if (document.documentElement.dataset.deeproleContext) status(false); return unchanged; }
    const id = crypto.randomUUID(); const url = location.href;
    const context = await freshContext(id, draft);
    if (context === null || location.href !== url) { status(false, id, url); return unchanged; }
    if (!context) return unchanged;
    try {
      const result = injectIntoJsonBody(body, context);
      if (!result.changed) status(false, id, url);
      return { body: result.body, attached: result.changed, id, url };
    } catch { status(false, id, url); return unchanged; }
  }
  window.fetch = async function deepRoleFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!supportedUrl(url)) return originalFetch(input, init);
    let nextInput = input; let nextInit = init; let attached = false;
    let requestId: string | undefined; let requestUrl: string | undefined;
    let serviceId: string | undefined;
    try {
      if (typeof init?.body === "string") {
        const prepared = await prepare(init.body);
        requestId = prepared.id; requestUrl = prepared.url;
        serviceId = prepared.serviceId;
        nextInit = { ...init, body: prepared.body }; attached = prepared.attached;
      } else if (input instanceof Request && !init?.body && input.method !== "GET") {
        const prepared = await prepare(await input.clone().text());
        requestId = prepared.id; requestUrl = prepared.url;
        serviceId = prepared.serviceId;
        nextInput = new Request(input, { body: prepared.body }); attached = prepared.attached;
      }
    } catch { status(false); }
    // Don't consume a queued handoff on an aborted or rejected network request.
    // The network call stays outside the preparation catch: a failure is not a retry.
    const signal = init?.signal === undefined && input instanceof Request ? input.signal : init?.signal;
    let failed = false;
    const failService = () => { if (!failed) { failed = true; serviceFailed(serviceId); } };
    // fetch resolves at headers, not at the end of a streaming reply. Keep the
    // cancellation hook without consuming or replacing the site's response.
    if (serviceId && signal) {
      signal.addEventListener("abort", failService, { once: true });
      if (signal.aborted) failService();
    }
    const stopTracking = () => signal?.removeEventListener("abort", failService);
    let response: Response;
    try { response = await originalFetch(nextInput, nextInit); }
    catch (error) { stopTracking(); failService(); throw error; }
    if (!response.ok) { stopTracking(); failService(); }
    if (attached && response.ok) status(true, requestId, requestUrl);
    return response;
  };
  const OriginalXHR = window.XMLHttpRequest;
  class DeepRoleXHR extends OriginalXHR {
    private deepRoleUrl = "";
    private asynchronous = true;
    private generation = 0;
    private serviceId?: string;
    private stopTracking?: () => void;
    private finishService(failed: boolean) {
      const id = this.serviceId;
      this.serviceId = undefined;
      this.stopTracking?.(); this.stopTracking = undefined;
      if (failed) serviceFailed(id);
    }
    override abort() { this.generation++; this.finishService(true); super.abort(); }
    override open(method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null) {
      this.generation++; this.finishService(true); this.deepRoleUrl = String(url); this.asynchronous = async ?? true;
      super.open(method, url, this.asynchronous, username ?? null, password ?? null);
    }
    override send(body?: Document | XMLHttpRequestBodyInit | null) {
      if (typeof body !== "string" || !supportedUrl(this.deepRoleUrl)) { super.send(body); return; }
      // Synchronous XHR cannot wait for storage. Never send stale memory instead.
      if (!this.asynchronous) { if (document.documentElement.dataset.deeproleContext) status(false); super.send(body); return; }
      const generation = this.generation;
      // Track synchronously: abort/open may happen before prepare's microtask.
      this.serviceId = deepRoleServiceRequestId(body) ?? undefined;
      void prepare(body).then((prepared) => {
        if (generation !== this.generation) return;
        this.serviceId = deepRoleServiceRequestId(prepared.body) ?? undefined;
        const accepted = () => {
          if (generation !== this.generation || this.readyState < 2) return;
          this.removeEventListener("readystatechange", accepted);
          if (prepared.attached && this.status >= 200 && this.status < 300) status(true, prepared.id, prepared.url);
          if (this.status < 200 || this.status >= 300) this.finishService(true);
        };
        const failed = () => { if (generation === this.generation) this.finishService(true); };
        const ended = () => { if (generation === this.generation) this.finishService(false); };
        this.stopTracking = () => {
          this.removeEventListener("readystatechange", accepted);
          for (const event of ["error", "timeout", "abort"]) this.removeEventListener(event, failed);
          this.removeEventListener("loadend", ended);
        };
        this.addEventListener("readystatechange", accepted);
        for (const event of ["error", "timeout", "abort"]) this.addEventListener(event, failed);
        this.addEventListener("loadend", ended);
        try { super.send(prepared.body); } catch { this.finishService(true); status(false, prepared.id, prepared.url); }
      });
    }
  }
  window.XMLHttpRequest = DeepRoleXHR;
});
