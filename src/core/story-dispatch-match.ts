import { confirmedDispatchText, validStoryDispatchCapture, type StoryDispatchCapture } from "./story-dispatch-capture";
import type { NativeStorySample } from "./story-transport";

export interface StoryDispatchMatchScope { bindingId: string; worldId: string; chatId: string }
/** Whole wire-body equality restores only a scoped user draft. It does not
 * identify an assistant, select a branch or grant event/image authority. */
export function matchingStoryUserCaptures(captures: StoryDispatchCapture[], scope: StoryDispatchMatchScope, user: NativeStorySample): StoryDispatchCapture[] {
  if (user.identity.role !== "user" || user.completion !== "complete") return [];
  return captures.filter(c => c?.bindingId === scope.bindingId && c.worldId === scope.worldId && c.identity?.chatId === scope.chatId
    && c.identity.nativeParentKey === user.identity.nativeParentKey && c.delivery?.status === "accepted" && validStoryDispatchCapture(c)
    && confirmedDispatchText(c) === user.content
    && (c.wire.link ? c.wire.link.userMessageKey === user.identity.nativeMessageKey
      : c.injection === "context" && (c.transport === "fetch" || c.origin === "local" && c.purpose === "out-of-character")));
}
/** An exact user/assistant pair wins over other observed retries. Multiple
 * exact claims abstain, even with identical rosters; never use array order.
 * A sole fetch capture retains legacy parsing, without source-role proof. */
export function matchingStoryAssistantCapture(candidates: StoryDispatchCapture[], assistant: NativeStorySample, user?: NativeStorySample): StoryDispatchCapture | undefined {
  if (assistant.identity.role !== "assistant" || assistant.completion !== "complete") return;
  const exact = candidates.filter(c => c.wire.link?.assistantMessageKey === assistant.identity.nativeMessageKey
    && c.wire.link.userMessageKey === assistant.identity.nativeParentKey);
  if (exact.length) return exact.length === 1 ? exact[0] : undefined;
  // A uniquely matched local OOC source may only exclude game effects, never
  // restore roster/image/write authority when its SSE markers are unavailable.
  if(candidates.length!==1||candidates[0]!.wire.link)return;
  const c=candidates[0]!;
  return c.transport==='fetch' || c.origin==='local' && c.purpose==='out-of-character' && user?.identity.role==='user' && user.completion==='complete'
    && assistant.identity.nativeParentKey===user.identity.nativeMessageKey && c.identity.nativeParentKey===user.identity.nativeParentKey && confirmedDispatchText(c)===user.content ? c : undefined;
}
