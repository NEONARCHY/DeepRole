import type { StoryFact } from './story-update';
import type { StoryRoleReader } from './story-source-roles';
import type { EpisodeReader } from './story-episodes';
import { normalizeText } from './text';
import { storyRecallLexicon, storyTaskObject } from './story-natural-recall';

// Query-local lexical families, not semantic embeddings or pronoun bindings.
// Do not extend the frozen V1 source-role grammar or global token stemmer.
const topics = {
 gift: /^(?:подарок|подарк[аиуе]|подарком|подарки|gift[s]?|present[s]?)$/u,
 promise: /^(?:обещани[еяюйи]|обещанием|обещаниях|пообещал[аи]?|обещал[аи]?|обещает|promise[s]?|promised|commitment[s]?)$/u,
} as const;
type Topic = keyof typeof topics;
const reference = '(?:ее|его|их|это|этот|эта|то|тот|та|том|тому|этом|этому|her|his|their|this|that|the)';
/** Only a complete supported information request. Extra clauses/actions,
 * hypotheticals, quoted speech and unknown words keep the exact old fallback. */
export function contextualReferenceTopic(query:string):Topic|undefined {
 if(!query.trim()||query.length>240||/[«»“”"`\r\n;:()[\]{}<>]|(?<![\p{L}\p{N}])'|'(?![\p{L}\p{N}])/u.test(query)||/[.!?].*\p{L}/u.test(query))return;
 const text=normalizeText(query).replace(/^(?:пожалуйста |please )/u,'').replace(/ (?:пожалуйста|please)$/u,'');
 const verb=/^(?:напомни (?:мне )?что (?:она|он|они) (?:пообещал[аи]?|обещал[аи]?|обещает)|remind me what (?:she|he|they) promised)$/u;
 if(verb.test(text))return 'promise';
 const body=text.replace(/^(?:а )?(?:что (?:насчет|с|про)|напомни (?:мне )?(?:о|про)|вернемся к|давай вспомним|расскажи (?:мне )?о|what about|remind me about|tell me about|back to) /u,'');
 const matched=new RegExp(`^${reference} (\\p{L}+)$`,'u').exec(body);
 return matched?(Object.keys(topics) as Topic[]).find(topic=>topics[topic].test(matched[1]!)):undefined;
}
/** Bridge a short reference through an explicit literal label in the latest
 * accepted source. It returns ALL current literal candidates, never an owner,
 * object ID, resolved pronoun, permission, completion or new canonical fact. */
export function contextualReferenceFacts(facts:StoryFact[],query:string,recent:string[],names:string[],roles?:StoryRoleReader,episodes?:EpisodeReader){
 const topic=contextualReferenceTopic(query),latest=recent.at(-1);
 if(!topic||!latest||!roles||!episodes)return;
 const lex=storyRecallLexicon(names),hasTopic=(text:string)=>lex.mask(text).split(' ').some(word=>topics[topic].test(word));
 const contains=(text:string,terms:string[])=>lex.clauses(text).some(words=>words.some((_,at)=>terms.every((word,i)=>words[at+i]===word)));
 const proved=(fact:StoryFact)=>roles.status?.(fact)==='bound'&&!!episodes.read(fact)&&Object.values(roles.read(fact)??{}).every(p=>!p.unavailable);
 const anchors=facts.filter(f=>episodes.read(f)?.period==='latest-turn'&&proved(f)&&latest.includes(f.quote)&&hasTopic(f.text)&&hasTopic(f.quote));
 const labels=new Map<string,{terms:string[];anchors:StoryFact[]}>();
 // A gift need not have a task. A literal copula in BOTH the accepted text and
 // exact quote can supply its label; no arbitrary noun-phrase extraction.
 const giftLabels=(text:string)=>text.split(/[.!?;\r\n:]+/u).flatMap(clause=>{
  const match=/^(?:[«“"]\s*)?(?:(?:мой|моя|ее|его|их|my|her|his|their|the)\s+)?(?:подарок\s*(?:—|–|-|это)\s*|(?:gift|present)\s+is\s+)(.+)$/iu.exec(clause.trim());
  const label=match&&storyTaskObject('Check '+normalizeText(match[1]!),names);
  return label&&label.terms.length?[label]:[];
 });
 if(topic==='gift')for(const anchor of anchors)for(const label of giftLabels(anchor.text)){
  const key=label.terms.join(' ');if(giftLabels(anchor.quote).some(other=>other.terms.join(' ')===key)){
   const group=labels.get(key)??{terms:label.terms,anchors:[]};group.anchors.push(anchor);labels.set(key,group);
  }
 }
 for(const fact of facts){
  const label=fact.task&&storyTaskObject(fact.task.title,names);if(!label)continue;
  const matching=anchors.filter(anchor=>contains(anchor.text,label.terms)&&contains(anchor.quote,label.terms));
  if(matching.length){const key=label.terms.join(' '),group=labels.get(key)??{terms:label.terms,anchors:[]};group.anchors.push(...matching);labels.set(key,group);}
 }
 if(labels.size!==1)return;
 const group=[...labels.values()][0]!;
 // Consider the FULL latest scene, not only a convenient extracted anchor.
 // A second known/unknown gift or promise blocks narrowing. Raw recent text
 // alone never creates positive evidence; it can only veto this source bridge.
 for(const clause of latest.split(/[.!?;\r\n:]+/u))if(hasTopic(clause)&&!contains(clause,group.terms))return;
 const related=facts.filter(f=>contains(f.text,group.terms)||contains(f.task?.title??'',group.terms));
 if(!related.length||related.some(f=>!proved(f)))return;
 return [...new Set([...group.anchors,...related])].sort((a,b)=>episodes.position(a)-episodes.position(b));
}
