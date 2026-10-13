import type { StoryFact } from "./story-update";

/** A conservative lexical gate, not semantic proof of a condition or its owner.
 * Unrecognized endings stay reviewable; no state ends merely through time. */
export function circumstanceReview(fact: StoryFact, old?: StoryFact) {
  const claim = fact.claim, previous = old?.claim;
  if (!claim) return false;
  if (previous?.status === "ended" && claim.status !== "ended") {
    return claim.status !== "active" || claim.transition !== "progress" || claim.key !== previous.key;
  }
  if (claim.status !== "ended") return false;
  if (!previous || previous.lifetime !== "scene" || previous.key !== claim.key) return true;
  const prose = fact.quote;
  if (/(?:\b(?:will|would|might|may|if|wants?|plans?|promises?|claims?|claimed|says?|said|reports?|reported|remembers?|remembered|dreams?|dreamed)\b|если|возможно|наверн|хочет|планиру|обеща|утвержда|сказа|говорит|сообщил|вспомина|приснил)/iu.test(prose)) return true;
  // Preserve negation: "didn't stop" is not an ending. Only the explicit
  // cessation forms below are admitted automatically among negative clauses.
  if (/(?:^|[^\p{L}\p{N}])(?:not|never|no|didn't|isn't|нет|не|никогда)(?=$|[^\p{L}\p{N}])/iu.test(prose)
    && !/(?:\bno longer\b|(?:больше|уже) не)/iu.test(prose)) return true;
  return !/(?:\b(?:left|departed|stopped|finished|ended|removed|took off|put down|no longer)\b|(?:уш[её]л|ушла|ушли|покинул|перестал|закончил|завершил|снял|положил)|(?:больше|уже) не)/iu.test(prose);
}

export const CIRCUMSTANCE_INSTRUCTION = 'Temporary circumstances ONLY: optional claim.status:"active"|"ended", scope:state, lifetime:scene, kind:event. To end one, reuse the EXACT known temporary claim.key, transition:progress, value=text=literal played ending clause, exact quote. Ending replaces only that property, retains history, NEVER tasks/persistent facts. Explicit departure/stopping/removal may end a linked circumstance; silence, time, scene change without its explicit ending, future/conditional/reported/remembered events do not. Unknown linkage or unrecognized ending uncertain. Resume only with an explicitly played active state, status:active and progress. Never infer fulfillment/cancellation or rewrite prior facts.';
export const CIRCUMSTANCE_COMPACT = 'scene claim.status active|ended; ended: exact known key, progress, value=text=played ending. Unknown link/future/report/negation review; time/silence NEVER end. Resume explicit active+progress. No tasks/persistent.';
export const CIRCUMSTANCE_GUIDE = 'claim.status ended=explicitly ended property, NOT current activity; active=last-known, NOT current proof. History retained; tasks unchanged.';
