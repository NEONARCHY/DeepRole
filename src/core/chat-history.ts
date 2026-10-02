import { estimateTokens } from "./text";
import type { ConversationEstimate } from "./types";

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
