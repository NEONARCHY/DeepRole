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
  timings?: { preparationMs?: number; firstTextMs: number; totalMs: number };
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
  reply_retry_id?: string;
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

export function chatTranscript(chat: Chat) {
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
  const groups = new Map<number | null, Map<string, Turn[]>>();
  const variants = new Map<number, Turn[]>();
  for (const reply of chat.messages) {
    if (reply.role !== "assistant" || reply.parent === null) continue;
    const user = byId.get(reply.parent);
    if (user?.role !== "user") continue;
    let branch = groups.get(user.parent);
    if (!branch) groups.set(user.parent, branch = new Map());
    let siblings = branch.get(user.visible);
    if (!siblings) branch.set(user.visible, siblings = []);
    siblings.push(reply);
    variants.set(reply.id, siblings);
  }
  return { line: line.reverse(), byId, variants };
}

export function sendNative(
  id: string, draft: string, parent: number | null, edit: number | undefined,
  frame: (name: string, data: Frame) => void,
  retryId?: string,
) {
  const startedAt = Date.now();
  const xhr = new XMLHttpRequest();
  let stop = () => xhr.abort();
  const requestId = crypto.randomUUID();
  const endpoint = edit === undefined ? "/api/v0/chat/completion" : "/api/v0/chat/edit_message";
  xhr.open("POST", endpoint + "?request_id=" + requestId);
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.timeout = 5 * 60_000 + 5000;
  let cursor = 0, done = false, stopping = false, failure: string | undefined;
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
    const fail = (message: string) => { if (!stopping) reject(Error(message)); };
    stop = () => {
      if (stopping) return;
      stopping = true;
      xhr.abort();
      // Electron does not always cancel the upstream request when XHR aborts before headers.
      void request(chatEndpoint("stop-reply", id) + "&request_id=" + requestId, { method: "POST" })
        .catch(() => undefined).finally(() => reject(Error("model-stopped")));
    };
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
    xhr.send(JSON.stringify({
      chat_session_id: id, prompt: draft, visible: draft, client_started_at: startedAt,
      ...(retryId ? { reply_retry_id: retryId } : {}),
      ...(edit !== undefined ? { message_id: edit } : { parent_message_id: parent }),
    }));
  });
  return { promise, stop };
}
