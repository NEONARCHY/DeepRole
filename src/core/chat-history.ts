import { estimateTokens } from "./text";
import type { ConversationEstimate } from "./types";
import type { StoryContinuation, StoryTurn } from "./types";
import { boundStory } from "./story-continuation";

/** Explicit transfer only. Credentials and model reasoning never leave the page. */
export function readStoryHistory(value: unknown, latestId?: string): StoryContinuation | null {
  if (!isRecord(value) || typeof value.code === "number" && value.code !== 0) return null;
  const data = isRecord(value.data) ? value.data : value;
  if (typeof data.biz_code === "number" && data.biz_code !== 0) return null;
  const body = isRecord(data.biz_data) ? data.biz_data : data;
  const input = [body.chat_messages, body.messages, body.chat_message_list, body.history, body.message_list].find(Array.isArray);
  if (!Array.isArray(input) || input.length > 100_000) return null;
  let messages = input.filter(isRecord);
  const messageId = (m: Record<string, unknown>) => String(m.message_id ?? m.id ?? "");
  const parentId = (m: Record<string, unknown>) => m.parent_id ?? m.parent_message_id;
  let missingParent = false;
  if (messages.some(m => parentId(m) !== undefined)) {
    const map = new Map(messages.map(m => [messageId(m), m]));
    const parents = new Set(messages.map(m => String(parentId(m) ?? "")));
    const leaves = messages.filter(m => !parents.has(messageId(m)));
    const last = latestId && map.get(latestId) || (leaves.length === 1 ? leaves[0] : undefined);
    if (!last) return null;
    const path: Record<string, unknown>[] = [], seen = new Set<string>();
    let node: Record<string, unknown> | undefined = last;
    while (node) {
      const id = messageId(node);
      if (!id || seen.has(id)) return null;
      seen.add(id); path.unshift(node);
      const parent = parentId(node);
      node = map.get(String(parent ?? ""));
      if (!node && parent !== undefined && parent !== null && parent !== 0 && parent !== "0" && parent !== "") missingParent = true;
    }
    messages = path;
  } else if (messages.length && messages.every(m => /^\d+$/u.test(messageId(m))) && new Set(messages.map(messageId)).size === messages.length) {
    // Some history pages return newest first; native numeric turn IDs are ordered.
    messages.sort((a, b) => Number(messageId(a)) - Number(messageId(b)));
  }
  const turns: StoryTurn[] = [];
  for (const m of messages) {
    const role = String(m.role ?? "").toLowerCase();
    if (role !== "user" && role !== "assistant") continue;
    const fragments = Array.isArray(m.fragments) ? m.fragments.filter(f => !isRecord(f) || !/think|reason/iu.test(String(f.type ?? f.fragment_type ?? "")))
      .map(f => isRecord(f) ? readText(f.content) || readText(f.text) || readText(f.fragment_content) : readText(f)).filter(Boolean) : [];
    const text = Array.isArray(m.fragments) ? fragments.join("\n") : readText(m.content);
    if (text) turns.push({ role, text });
  }
  if (!turns.length) return null;
  return boundStory(turns, "history", missingParent || body.has_more === true || data.has_more === true);
}

/** Read only text from DeepSeek's history response; never retain or forward messages. */
export function estimateChatHistory(value: unknown): ConversationEstimate | null {
  if (!isRecord(value) || (typeof value.code === "number" && value.code !== 0)) return null;
  const data = isRecord(value.data) ? value.data : value;
  if (typeof data.biz_code === "number" && data.biz_code !== 0) return null;
  const body = isRecord(data.biz_data) ? data.biz_data : data;
  const messages = [body.chat_messages, body.messages, body.chat_message_list, body.history, body.message_list]
    .find(Array.isArray);
  if (!Array.isArray(messages)) return null;

  let estimatedTokens = 0;
  let messageCount = 0;
  let foundText = false;
  for (const message of messages) {
    if (!isRecord(message)) continue;
    const role = String(message.role ?? "").toLowerCase();
    if (role && role !== "user" && role !== "assistant") continue;
    const fragments = Array.isArray(message.fragments)
      ? message.fragments.map((fragment) => {
        if (!isRecord(fragment)) return readText(fragment);
        return readText(fragment.content) || readText(fragment.text) || readText(fragment.fragment_content);
      }).filter(Boolean)
      : [];
    const text = fragments.length ? fragments.join("\n") : readText(message.content);
    if (text) { foundText = true; estimatedTokens += estimateTokens(text); }
    messageCount += 1;
  }
  if (messages.length > 0 && !foundText) return null;
  return {
    estimatedTokens,
    messageCount,
    atLeast: body.has_more === true || data.has_more === true,
    source: "history",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readText(value: unknown, depth = 0): string {
  if (typeof value === "string") return value;
  if (depth > 2) return "";
  if (Array.isArray(value)) return value.map((part) => readText(part, depth + 1)).filter(Boolean).join("\n");
  if (!isRecord(value)) return "";
  return readText(value.text ?? value.content ?? value.value, depth + 1);
}
