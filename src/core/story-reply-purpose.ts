import { confirmedDispatchText, validStoryDispatchCapture } from './story-dispatch-capture';
import type { StoryDispatchMatchScope } from './story-dispatch-match';
import { nativeStoryMessageKey, validNativeStoryId } from './story-transport';
import { validStoryGameSnapshot, type StoryGameSnapshot } from './story-game';

/** Readiness notifications only: schedule a fresh read, never grant authority.
 * A finished ordinary stream may arrive after the visible reply was scanned. */
export function storyReplyProofChanged(prior:unknown,next:unknown):boolean {
  if(!validStoryDispatchCapture(next)||next.origin!=='local'||next.delivery?.status!=='accepted')return false;
  if(!validStoryDispatchCapture(prior)||prior.id!==next.id||prior.delivery?.status!=='accepted')return true;
  if (next.opening && next.wire.link && next.wire.phase !== "failed" && !prior.wire.link) return true;
  return next.wire.phase==='closed'&&next.wire.sawFinish
    &&!(prior.wire.phase==='closed'&&prior.wire.sawFinish);
}

/** Read-only presentation proof. Never classifies prose, chooses a branch or
 * grants write authority. Unknown/ambiguous/restored receipts remain unknown. */
export function storyReplyPurpose(captures: readonly unknown[], scope: StoryDispatchMatchScope | null, replyIdentity: string | undefined, snapshot?: StoryGameSnapshot): 'user-turn' | 'out-of-character' | undefined {
  if (!scope || !replyIdentity) return;
  let reply: string;
  try {
    const key: unknown = JSON.parse(replyIdentity);
    if (!Array.isArray(key) || key.length !== 2 || !['message','virtual'].includes(key[0]) || !validNativeStoryId(key[1])) return;
    reply = nativeStoryMessageKey(key[1]);
  } catch { return; }
  const local = captures.filter(validStoryDispatchCapture).filter(value => value.origin === 'local'
    && value.worldId === scope.worldId && value.bindingId === scope.bindingId && value.identity.chatId === scope.chatId
    && value.injection !== 'unconfirmed' && value.delivery?.status === 'accepted');
  // A page-selected, completed server pair can prove presentation without any
  // SSE decoder (notably fetch). Whole outgoing body + native parent equality,
  // not an OOC marker or similar prose. Conflicting native links never win.
  if (snapshot && validStoryGameSnapshot(snapshot) && snapshot.chatId === scope.chatId && snapshot.selectedNativeKey === reply) {
    const assistant = snapshot.messages.find(m=>m.identity.nativeMessageKey===reply && m.identity.role==='assistant' && m.completion==='complete');
    const user = assistant && snapshot.messages.find(m=>m.identity.nativeMessageKey===assistant.identity.nativeParentKey && m.identity.role==='user' && m.completion==='complete');
    if (assistant && user) {
      const exact = local.filter(c=>c.identity.nativeParentKey===user.identity.nativeParentKey && confirmedDispatchText(c)===user.content
        && (!c.wire.link || c.wire.link.userMessageKey===user.identity.nativeMessageKey && c.wire.link.assistantMessageKey===reply));
      return exact.length===1 ? exact[0]!.purpose : undefined;
    }
    return;
  }
  const matches = local.filter(value=>value.wire.phase==='closed' && value.wire.sawFinish && value.wire.link?.assistantMessageKey===reply);
  return matches.length === 1 ? matches[0]!.purpose : undefined;
}
