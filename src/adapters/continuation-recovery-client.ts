import type { ContinuationDraft } from "../core/continuation-flow";
import { acceptedContinuationHistory } from "../core/continuation-recovery";
import type { StoryGameSnapshot } from "../core/story-game";

/** One bounded history GET; no POST, editor write or automatic resend. */
export async function checkContinuationHistory(win: Window, draft: ContinuationDraft, inScope: () => boolean): Promise<StoryGameSnapshot | null> {
  if (!inScope() || !draft.requestId || !draft.promptDigest) return null;
  const url = win.location.href, requestId = "continuation_" + crypto.randomUUID();
  return new Promise(resolve => {
    const cleanup = () => { win.clearTimeout(timer); win.removeEventListener("message", receive); };
    const receive = (event: MessageEvent) => {
      if (event.source !== win || event.origin !== win.location.origin || event.data?.source !== "deeprole-page-bridge"
        || event.data.type !== "STORY_GAME_SNAPSHOT_RESULT" || event.data.requestId !== requestId) return;
      cleanup();
      if (win.location.href !== url || !inScope()) { resolve(null); return; }
      const snapshot = structuredClone(event.data.snapshot);
      void acceptedContinuationHistory(snapshot, draft).then(accepted => resolve(accepted && win.location.href === url && inScope() ? snapshot : null), () => resolve(null));
    };
    const timer = win.setTimeout(() => { cleanup(); resolve(null); }, 9000);
    win.addEventListener("message", receive);
    win.postMessage({ source: "deeprole-extension", type: "STORY_GAME_SNAPSHOT_REQUEST", requestId, chatId: draft.targetChatId }, win.location.origin);
  });
}
