import type { StoryFact } from "./story-update";
import { normalizeText,uniqueTokens } from "./text";
import { storyConceptSearch } from "./story-retrieval-concepts";
import { storyFactSearchEntry } from "./story-fact-search-index";
import type { MemoryEntry } from "./types";

// Query framing, not facts or language understanding. Filtering changes only
// this supplemental candidate score; none of these words are removed from data.
const framing=uniqueTokens("what where when why how which do did does has have had can could would should me my we you our your now about remind reminder tell show list know known remember say said ask asked please give gave back continue continuation proceed go on next further happened happening occurred что чем где когда как кто кому какой какие какая какое каких почему зачем ли я мы ты вы мне нас наш мой твой сейчас напомни напомнить расскажи покажи перечисли пожалуйста известно знаем узнать спроси отдать отдал отдала отдали обратно дальше далее продолжай продолжить продолжим случилось произошло происходит");
// Only a bounded, explicit information-request prefix. Ordinary narration,
// name-led continuation and arbitrary language are not proof for tail pruning.
const topicRequest=/^(?:please |пожалуйста )?(?:what|where|when|why|how|which|remind|tell|show|list|что|где|когда|почему|зачем|как|какой|какая|какие|напомни|расскажи|покажи|перечисли)(?= |$)/u;
const noMatch={score:(_:StoryFact)=>0,admission:undefined};
const prepared=new WeakMap<MemoryEntry,{text:string;title:string;names:string;tokens:Set<string>}>();

/** Whole text and task title, not the 90-character title/8-keyword projection.
 * Quotes, opaque keys, current state values and IDs are NOT lexical topic data.
 * Frequency is rebuilt from the supplied compact accepted set every request;
 * the cache contains only query-independent tokens, never selections/owners. */
export function storyContentRelevance(facts:StoryFact[],query:string,excludedNames:Iterable<string>) {
  const names=[...new Set([...excludedNames].map(normalizeText).filter(Boolean))].sort((a,b)=>b.length-a.length||a.localeCompare(b)),signature=names.join("\n");
  const pattern=names.length?new RegExp(`(^| )(?:${names.join("|")})(?= |$)`,"gu"):undefined;
  const mask=(text:string)=>{const value=normalizeText(text);return pattern?(" "+value+" ").replace(pattern,"$1#"):value;};
  // Recognize action forms BEFORE stemming (починить must not become an
  // unrecognized noun-like token). The existing action bonus owns that signal.
  const requested=[...new Set(normalizeText(mask(query)).split(" ").filter(t=>!storyConceptSearch(t).concepts.length).flatMap(t=>[...uniqueTokens(t)]))].filter(t=>!framing.has(t));
  if(!requested.length)return noMatch;
  const tokens=(fact:StoryFact)=>{
    const text=fact.text,title=fact.task?.title??"",key=storyFactSearchEntry(fact),old=prepared.get(key);
    if(old&&old.text===text&&old.title===title&&old.names===signature)return old.tokens;
    const value=new Set([...uniqueTokens(mask(text)),...uniqueTokens(mask(title))]);
    prepared.set(key,{text,title,names:signature,tokens:value});return value;
  };
  const frequency=new Map(requested.map(t=>[t,0]));
  for(const fact of facts)for(const term of requested)if(tokens(fact).has(term))frequency.set(term,frequency.get(term)!+1);
  const weights=requested.flatMap(term=>{const count=frequency.get(term)!;return count>0&&count<facts.length?[[term,1-count/facts.length] as const]:[];});
  const total=weights.reduce((n,[,weight])=>n+weight,0);
  // All meaningful terms must exist, at least one must distinguish candidates,
  // and action-only/compound action requests keep the previous admission.
  // Coverage is checked AGAIN against whole facts actually admitted by budget.
  const specific=topicRequest.test(normalizeText(query))&&total>0&&requested.every(term=>frequency.get(term)!>0)&&!storyConceptSearch(query,names).concepts.length;
  const admission=specific?{
    // An open obligation sharing even a common requested topic is not noise.
    matches:(fact:StoryFact)=>weights.some(([term])=>tokens(fact).has(term))||fact.task?.status==="open"&&requested.some(term=>tokens(fact).has(term)),
    covers:(selected:StoryFact[])=>requested.every(term=>selected.some(fact=>tokens(fact).has(term))),
  }:undefined;
  return {admission,score(fact:StoryFact){
    if(!total)return 0;
    const terms=tokens(fact),matched=weights.reduce((n,[term,weight])=>n+(terms.has(term)?weight:0),0);
    // A bounded content bonus: all matching distinctive query terms =32.
    // Common terms cannot drown a rare object; unsupported words add no match.
    return Math.round(32*matched/total);
  }};
}
