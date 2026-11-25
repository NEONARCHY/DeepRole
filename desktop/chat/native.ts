export interface Turn {
  id: number;
  parent: number | null;
  role: "user" | "assistant";
  text: string;
  visible: string;
  reasoning?: string;
}
export interface ChatInfo { id: string; title: string; updatedAt: number }
export interface RequestContext {
  window: number;
  windowSource: "provider" | "manual" | "fallback";
  replyTokens: number;
  estimatedInput: number;
  omittedMessages: number;
  input?: number;
  output?: number;
}
export interface Chat extends ChatInfo {
  head: number | null;
  messages: Turn[];
  lastContext?: RequestContext;
  contextCheckpoint?: { at: number };
}

export type Frame = {
  request_message_id?: number;
  response_message_id?: number;
  text?: string;
  reasoning?: string;
  error?: string;
};

export async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const value = await response.json();
  if (!response.ok) throw Error(value.error ?? "chat-unavailable");
  return value as T;
}

export const chatEndpoint = (endpoint: string, id: string) => `/__desktop/${endpoint}?chat_session_id=${encodeURIComponent(id)}`;
export const chatUrl = (id: string) => `/a/chat/s/${encodeURIComponent(id)}`;
export const activeChat = () => location.pathname.match(/^\/(?:a\/)?chat\/(?:s\/)?([\w-]+)\/?$/u)?.[1];
export const emptyChat = (id = ""): Chat => ({ id, title: "", updatedAt: 0, head: null, messages: [] });

export function selectedLine(chat: Chat) {
  const byId = new Map(chat.messages.map(message => [message.id, message]));
  const line: Turn[] = [];
  const seen = new Set<number>();
  for (let cursor = chat.head; cursor !== null;) {
    const message = byId.get(cursor);
    if (!message || seen.has(cursor)) break;
    seen.add(cursor);
    line.push(message);
    cursor = message.parent;
  }
  return line.reverse();
}

export function sendNative(
  id: string, draft: string, parent: number | null, edit: number | undefined,
  frame: (name: string, data: Frame) => void,
) {
  const xhr = new XMLHttpRequest();
  const preparation = new AbortController();
  xhr.open("POST", edit === undefined ? "/api/v0/chat/completion" : "/api/v0/chat/edit_message");
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.timeout = 5 * 60_000 + 5000;
  let cursor = 0, done = false, failure: string | undefined;
  function read() {
    const text = xhr.responseText;
    for (let end = text.indexOf("\n\n", cursor); end >= 0; end = text.indexOf("\n\n", cursor)) {
      const record = text.slice(cursor, end);
      cursor = end + 2;
      const match = /^event: (\w+)\ndata: ([\s\S]+)$/u.exec(record);
      if (!match) continue;
      const name = match[1]!;
      const packet: Frame = JSON.parse(match[2]!);
      if (name === "close") done = true;
      if (name === "hint") failure = packet.error ?? "model-interrupted";
      frame(name, packet);
    }
  }
  const promise = new Promise<void>((resolve, reject) => {
    const fail = (message: string) => reject(Error(message));
    preparation.signal.addEventListener("abort", () => fail("model-stopped"), { once: true });
    xhr.addEventListener("progress", () => {
      if (xhr.status !== 200) return;
      try { read(); } catch { fail("model-interrupted"); xhr.abort(); }
    });
    xhr.addEventListener("load", () => {
      try {
        if (xhr.status !== 200) { fail(JSON.parse(xhr.responseText)?.error ?? "model-request-failed"); return; }
        read();
        if (done && !failure) resolve();
        else fail(failure ?? "model-interrupted");
      } catch { fail("model-interrupted"); }
    });
    xhr.addEventListener("error", () => fail("model-request-failed"));
    xhr.addEventListener("timeout", () => fail("model-unavailable"));
    xhr.addEventListener("abort", () => fail("model-stopped"));
    xhr.addEventListener("deeprole-blocked", () => fail("memory-blocked"));
    const body = JSON.stringify({
      chat_session_id: id, prompt: draft, visible: draft,
      ...(edit !== undefined ? { message_id: edit } : { parent_message_id: parent }),
    });
    const bytes = new TextEncoder().encode(draft).byteLength;
    if (bytes > 8192) {
      void request<{ bytes: number | null }>(`/__desktop/memory-budget?bytes=${bytes}`, {
        signal: AbortSignal.any([preparation.signal, AbortSignal.timeout(3000)]),
      }).catch(() => undefined).then(budget => {
        if (preparation.signal.aborted) return;
        if (budget?.bytes === null) fail("model-context-limit");
        else xhr.send(body);
      }).catch(() => fail("model-request-failed"));
    } else xhr.send(body);
  });
  return { promise, stop: () => { preparation.abort(); xhr.abort(); } };
}
