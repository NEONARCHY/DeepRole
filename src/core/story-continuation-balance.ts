import type {StoryFact} from "./story-update";
import type {StoryRoleReader} from "./story-source-roles";
import type {EpisodeReader} from "./story-episodes";
import type {StoryTimeReader} from "./story-time";
import {normalizeText} from "./text";

// Deliberately finite continuation syntax, not action/intent interpretation.
// Masked known names are references, NEVER new physical-presence evidence.
const phrases=new Set(["continue","go on","carry on","proceed","next","what next","what happens next","what happens now","what happens","and then","then","дальше","далее","продолжай","продолжим","давай дальше","что дальше","что происходит дальше","что происходит","что будет дальше","и дальше"]);
export function isPlainStoryContinuation(query:string,names:Iterable<string>=[]) {
  // Quoted speech is not a continuation command, even after a named address.
  // Internal apostrophes in a proper name (O'Connor) are not quotation marks.
  if(/[«»“”"]|(?<![\p{L}\p{N}])'|'(?![\p{L}\p{N}])/u.test(query))return false;
  const normalized=normalizeText(query),known=[...new Set([...names].map(normalizeText).filter(Boolean))].sort((a,b)=>b.length-a.length||a.localeCompare(b));
  const masked=known.length?(" "+normalized+" ").replace(new RegExp(`(^| )(?:${known.join("|")})(?= |$)`,"gu"),"$1#"):normalized;
  const text=normalizeText(masked).replace(/^(?:please |пожалуйста )/u,"").replace(/ (?:please|пожалуйста)$/u,"");
  return phrases.has(text);
}
/** Current accepted facts only. Frozen ownership, selected source order and
 * accepted lifetime are required; names/quotes/opaque keys cannot invent them.
 * Prefer the latest verified source; ties keep the previous candidate order.
 * This is recorded source order, NEVER a deadline or guessed urgency. */
export function storyContinuationCandidates(facts:StoryFact[],activeIds:Iterable<string>,roles?:StoryRoleReader,episodes?:EpisodeReader,time?:StoryTimeReader) {
  const active=new Set(activeIds),tasks:StoryFact[]=[],persistent:StoryFact[]=[];
  for(const fact of facts){
    if(roles?.status?.(fact)!=="bound"||!episodes?.position(fact))continue;
    const source=roles.read(fact),related=(person:{id:string;unavailable?:true}|undefined)=>!!person&&!person.unavailable&&active.has(person.id);
    if(fact.task?.status==="open"){
      const owner=fact.kind==="promise"?source?.promisor:fact.kind==="plan"?source?.planner:source?.promisor??source?.planner;
      if(related(owner))tasks.push(fact);
    }
    if(time?.read(fact)==="persistent"&&(related(source?.speaker)||related(source?.believer)))persistent.push(fact);
  }
  const latest=(a:StoryFact,b:StoryFact)=>episodes!.position(b)-episodes!.position(a);
  tasks.sort(latest);persistent.sort(latest);return {tasks,persistent};
}
