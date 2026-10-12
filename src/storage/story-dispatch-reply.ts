import { confirmedDispatchText, validStoryDispatchCapture, type StoryDispatchCapture } from "../core/story-dispatch-capture";
import { validNativeStoryReplyResult, type NativeStoryReplyQuery, type NativeStoryReplyResult } from "../core/story-native-reply";
import { nativeStorySampleDigest, type NativeStoryExchange } from "../core/story-exchange";
import { sameStoryValue } from "../core/story-value";
import type { ChatBinding } from "../core/types";
import { repository, type DeepRoleRepository } from "./repository";
import { dispatchStoryRequest } from "./story-dispatch-ingestion";
import { planNativeStoryExchange } from "./story-exchange";

const eligible = (capture: StoryDispatchCapture, owner: number) => validStoryDispatchCapture(capture) && capture.origin === "local" && capture.ownerTabId === owner && capture.worldId !== null
  && capture.injection !== "unconfirmed" && capture.delivery?.status === "accepted" && capture.wire.phase === "closed" && capture.wire.sawFinish && !!capture.wire.link;
/** Recovery is read-only and scoped to the original browser tab. Returns identities,
 * not drafts, memory, all world records or restored work to resume. */
export async function pendingDispatchReplies(chatId: string, owner: number, repo: DeepRoleRepository = repository): Promise<NativeStoryReplyQuery[]> {
  return repo.updateRecords(all => {
    const queries = all.filter(row => row.kind === "dispatch").sort((a, b) => (a.data as StoryDispatchCapture).createdAt - (b.data as StoryDispatchCapture).createdAt || a.id.localeCompare(b.id)).flatMap(row => {
      const capture = row.data as StoryDispatchCapture;
      if (!eligible(capture, owner) || capture.reply || capture.identity.chatId !== chatId) return [];
      const binding = all.find(r => r.kind === "binding" && r.id === capture.bindingId)?.data as ChatBinding | undefined;
      if (!binding || binding.chatId !== chatId || binding.worldId !== capture.worldId || !all.some(r => r.kind === "world" && r.id === capture.worldId)) return [];
      return [{ requestId: capture.id, identity: structuredClone(capture.identity), link: structuredClone(capture.wire.link!) }];
    });
    // Bound background recovery work, not the world/library size. More unresolved
    // older captures remain stored; a later explicit repair UI can paginate them.
    return { records: [], removed: [], result: queries.slice(-8) };
  }, undefined, ["dispatch", "binding", "world"]);
}
/** Exact source and both observed revisions are atomic for a pre-prepared anchored route.
 * No selected head, scene, candidates or canon is changed. */
export async function recordDispatchReply(input: NativeStoryReplyResult, owner: number, repo: DeepRoleRepository = repository): Promise<void> {
  input = structuredClone(input);
  if (!validNativeStoryReplyResult(input)) throw Error("dispatch-reply-invalid");
  const digest = await nativeStorySampleDigest(input.assistant);
  await repo.updateRecords(all => {
    const capture = all.find(r => r.kind === "dispatch" && r.id === input.requestId)?.data as StoryDispatchCapture | undefined;
    if (!capture || !eligible(capture, owner)) throw Error("dispatch-owner-conflict");
    const binding = all.find(r => r.kind === "binding" && r.id === capture.bindingId)?.data as ChatBinding | undefined;
    if (!binding || binding.chatId !== input.identity.chatId || binding.worldId !== capture.worldId || !all.some(r => r.kind === "world" && r.id === capture.worldId)) throw Error("dispatch-scope-conflict");
    if (!sameStoryValue(input.identity, capture.identity) || !sameStoryValue(input.link, capture.wire.link) || input.wireUserText !== confirmedDispatchText(capture)) throw Error("dispatch-source-conflict");
    if (capture.reply) {
      if (!sameStoryValue(capture.reply.assistant, input.assistant)) throw Error("dispatch-reply-conflict");
    }
    // First observed server pointer is historical, never mutable selection.
    const now = Math.max(Date.now(), capture.updatedAt), next: StoryDispatchCapture = capture.reply ? capture : { ...capture, updatedAt: now, reply: { contract: "deepseek-web-history-2026-10", assistant: input.assistant, serverSelection: input.serverSelection, observedAt: now } };
    if (!validStoryDispatchCapture(next)) throw Error("dispatch-reply-invalid");
    const request = dispatchStoryRequest(all, capture), exchange = frozenDispatchExchange(next, digest);
    const story = request && exchange ? planNativeStoryExchange(all, request.branchId, exchange, digest).records : [];
    return { records: [...(capture.reply ? [] : [{ kind: "dispatch" as const, id: next.id, data: next }]), ...story], removed: [], result: undefined };
  }, undefined, ["dispatch", "binding", "world", "story", "entity"]);
}
/** Bridge to the existing atomic exchange gate. Still requires a separately prepared
 * anchored StoryRequest there. This conversion alone does NOT select or ingest it. */
export async function dispatchReplyExchange(capture: StoryDispatchCapture): Promise<NativeStoryExchange | null> {
  capture = structuredClone(capture);
  if (!validStoryDispatchCapture(capture) || !capture.reply || !capture.wire.link) return null;
  return frozenDispatchExchange(capture, await nativeStorySampleDigest(capture.reply.assistant));
}
function frozenDispatchExchange(capture: StoryDispatchCapture, sampleDigest: string | null): NativeStoryExchange | null {
  if (!capture.reply || !capture.wire.link || !sampleDigest) return null;
  const link = structuredClone(capture.wire.link), assistant = structuredClone(capture.reply.assistant);
  const user = { identity: { role: "user" as const, nativeMessageKey: link.userMessageKey, nativeParentKey: link.nativeParentKey }, completion: "complete" as const, content: capture.originalDraft };
  return { requestId: capture.id, chatId: capture.identity.chatId, metadata: [user.identity, assistant.identity], link,
    user, assistant, terminal: { requestId: capture.id, nativeMessageKey: link.assistantMessageKey, completion: "complete", sampleDigest } };
}
