import { oldChatNotice, validOldChatNoticeEdit, type OldChatNoticeEdit } from "../core/old-chat-notice";
import type { ChatBinding, HandoffSnapshot, MemoryBook } from "../core/types";
import { repository, type DeepRoleRepository } from "./repository";
import { isSameDeepSeekChat } from "../core/chat-scope";
export async function acknowledgeOldChatNotice(input: OldChatNoticeEdit, repo: DeepRoleRepository = repository, current?: () => Promise<void>): Promise<void> {
 input = structuredClone(input);
 if (!validOldChatNoticeEdit(input) || !isSameDeepSeekChat(input.chatUrl, input.chatUrl, input.chatId)) throw Error("handoff-scope");
 await repo.updateRecords(all => {
  const bindings = all.filter(r => r.kind === "binding" && (r.data as ChatBinding).chatId === input.chatId).map(r => r.data as ChatBinding);
  const binding = bindings[0];
  if (bindings.length !== 1 || !binding || (binding.worldId ?? null) !== input.worldId) throw Error("handoff-scope");
  const notice = oldChatNotice(binding, all.filter(r => r.kind === "snapshot").map(r => r.data as HandoffSnapshot), all.filter(r => r.kind === "book").map(r => r.data as MemoryBook), all.filter(r => r.kind === "world").map(r => r.data as import("../core/types").WorldProfile));
  if (!notice || notice.snapshotId !== input.snapshotId || notice.targetChatId !== input.targetChatId) throw Error("handoff-conflict");
  const previous = binding.oldChatNotice?.snapshotId === notice.snapshotId ? binding.oldChatNotice : { snapshotId: notice.snapshotId };
  if (input.mode === "sent" && previous.sentAt !== undefined || input.mode === "dismissed" && previous.dismissedAt !== undefined) return { records: [], removed: [], result: undefined };
  const now = Date.now(), next = { ...binding, oldChatNotice: { ...previous, ...(input.mode === "sent" ? { sentAt: now } : { dismissedAt: now }) }, updatedAt: Math.max(now, binding.updatedAt) };
  return { records: [{ kind: "binding" as const, id: binding.id, data: next }], removed: [], result: undefined };
 }, current, ["binding", "snapshot", "book"]);
}
