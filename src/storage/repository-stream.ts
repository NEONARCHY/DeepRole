/** Chunk size is a transport unit, never a quota on the stored collection. */
export const REPOSITORY_PORT = "deeprole-repository-stream";
export const REPOSITORY_CHUNK = 1_000_000;
type Listener = (message: any) => void;
export interface JsonPort {
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: { addListener(listener: Listener): void; removeListener(listener: Listener): void };
  onDisconnect: { addListener(listener: () => void): void; removeListener(listener: () => void): void };
}
export function requestJsonPort<T>(port: JsonPort, request: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = JSON.stringify(request), offset = 0, sent = -1, receiving = false, closed = false;
    let parts: string[] = [], received = 0;
    const cleanup = () => { closed = true; body = ""; parts = []; port.onMessage.removeListener(message); port.onDisconnect.removeListener(disconnect); port.disconnect(); };
    const fail = () => { if (!closed) { cleanup(); reject(new Error("storage-unavailable")); } };
    const disconnect = () => fail();
    const send = () => {
      if (offset < body.length) {
        const part = body.slice(offset, offset + REPOSITORY_CHUNK); offset += part.length; sent++;
        port.postMessage({ type: "request", index: sent, part });
      } else { body = ""; receiving = true; port.postMessage({ type: "execute" }); }
    };
    const message = (value: any) => {
      if (closed) return;
      try {
        if (!receiving && value?.type === "ack" && value.index === sent) { send(); return; }
        if (receiving && value?.type === "response" && value.index === received && typeof value.part === "string" && value.part.length <= REPOSITORY_CHUNK) {
          parts.push(value.part); port.postMessage({ type: "ack", index: received++ }); return;
        }
        if (receiving && value?.type === "done") { const result = JSON.parse(parts.join("")).value as T; cleanup(); resolve(result); return; }
        fail();
      } catch { fail(); }
    };
    port.onMessage.addListener(message); port.onDisconnect.addListener(disconnect);
    try { send(); } catch { fail(); }
  });
}
/** One ordered request per port; disconnect drops partial input without committing it. */
export function serveJsonPort(port: JsonPort, handle: (request: unknown) => unknown | Promise<unknown>): void {
  let phase: "request" | "working" | "response" | "closed" = "request";
  let parts: string[] = [], received = 0, body = "", offset = 0, sent = -1;
  const disconnect = () => { phase = "closed"; parts = []; body = ""; port.onMessage.removeListener(message); port.onDisconnect.removeListener(disconnect); };
  const fail = () => { disconnect(); port.disconnect(); };
  const send = () => {
    if (offset < body.length) {
      const part = body.slice(offset, offset + REPOSITORY_CHUNK); offset += part.length; sent++;
      port.postMessage({ type: "response", index: sent, part });
    } else { body = ""; port.postMessage({ type: "done" }); }
  };
  const message = (value: any) => {
    if (phase === "closed") return;
    try {
      if (phase === "request" && value?.type === "request" && value.index === received && typeof value.part === "string" && value.part.length <= REPOSITORY_CHUNK && value.part.length > 0) {
        parts.push(value.part); port.postMessage({ type: "ack", index: received++ }); return;
      }
      if (phase === "request" && value?.type === "execute" && received > 0) {
        const request = JSON.parse(parts.join("")); parts = []; phase = "working";
        void Promise.resolve().then(() => handle(request)).then(result => {
          if (phase === "closed") return;
          body = JSON.stringify({ value: result }); phase = "response"; send();
        }).catch(fail); return;
      }
      if (phase === "response" && value?.type === "ack" && value.index === sent) { send(); return; }
      fail();
    } catch { fail(); }
  };
  port.onMessage.addListener(message); port.onDisconnect.addListener(disconnect);
}
