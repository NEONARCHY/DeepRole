import { isSameDeepSeekChat } from "../core/chat-scope";
import { validRecoveredReply, validRecoveredReplies } from "../core/reply-recovery";
import type { ChatBinding, RecoveredReply } from "../core/types";
import { repository, type DeepRoleRepository } from "./repository";

export interface RecoveredReplyEdit { chatId: string; chatUrl: string; reply: RecoveredReply }

/** Patch the archive under the common lock without overwriting a concurrent world/scene edit. */
export async function saveRecoveredReply(edit: RecoveredReplyEdit, repo: DeepRoleRepository = repository): Promise<void> {
  if (!validRecoveredReply(edit.reply) || !isSameDeepSeekChat(edit.chatUrl, edit.chatUrl, edit.chatId)) throw new Error("reply-invalid");
  await repo.updateRecords(all => {
    const existing = all.find(r => r.kind === "binding" && (r.data as ChatBinding).chatId === edit.chatId)?.data as ChatBinding | undefined;
    if (existing && !isSameDeepSeekChat(edit.chatUrl, existing.chatUrl, edit.chatId)) throw new Error("reply-scope");
    const previous = existing?.recoveredReplies ?? [];
    const old = previous.find(r => r.messageKey === edit.reply.messageKey);
    if (old && (old.capturedAt > edit.reply.capturedAt || old.capturedAt === edit.reply.capturedAt && old.html === edit.reply.html)) return { records: [], removed: [], result: undefined };
    const replies = [...previous.filter(r => r.messageKey !== edit.reply.messageKey), edit.reply];
    if (!validRecoveredReplies(replies)) throw new Error("reply-capacity");
    const now = Date.now();
    const binding: ChatBinding = { ...existing, id: existing?.id ?? `binding:${edit.chatId}`, chatId: edit.chatId,
      chatUrl: existing?.chatUrl ?? edit.chatUrl, bookId: existing?.bookId ?? null,
      messageCountAtAnalysis: existing?.messageCountAtAnalysis ?? 0, createdAt: existing?.createdAt ?? now,
      recoveredReplies: replies, updatedAt: now };
    return { records: [{ kind: "binding", id: binding.id, data: binding }], removed: [], result: undefined };
  });
}

/** Receipt is matched against the exact capture; late acknowledgements cannot consume a newer regeneration. */
export async function acknowledgeRecoveredReply(edit: RecoveredReplyEdit, repo: DeepRoleRepository = repository): Promise<void> {
  if (!validRecoveredReply(edit.reply) || !isSameDeepSeekChat(edit.chatUrl, edit.chatUrl, edit.chatId)) throw new Error("reply-invalid");
  await repo.updateRecords(all => {
    const binding = all.find(r => r.kind === "binding" && (r.data as ChatBinding).chatId === edit.chatId)?.data as ChatBinding | undefined;
    if (!binding || !isSameDeepSeekChat(edit.chatUrl, binding.chatUrl, edit.chatId)) throw new Error("reply-scope");
    const replies = binding.recoveredReplies ?? [];
    const matched = replies.find(r => r.messageKey === edit.reply.messageKey && r.html === edit.reply.html && r.capturedAt === edit.reply.capturedAt && r.recoveredAt === edit.reply.recoveredAt);
    if (!matched || matched.contextSentAt !== undefined) return { records: [], removed: [], result: undefined };
    const now = Date.now();
    return { records: [{ kind: "binding", id: binding.id, data: { ...binding, recoveredReplies: replies.map(r => r === matched ? { ...r, contextSentAt: now } : r), updatedAt: now } }], removed: [], result: undefined };
  });
}
