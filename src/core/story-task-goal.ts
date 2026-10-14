import type {StoryFact} from './story-update';
import type {EpisodeReader} from './story-episodes';
import {normalizeText,tokenize} from './text';
import {isUnsafeStoryActionWord} from './story-action-balance';

// Finite retrieval syntax. A declared goal selects evidence; it neither proves
// that an action happened nor assigns the user's "I" to a historical owner.
const verbs={
 repair:/^(?:починить|чиню|ремонт|ремонтировать|ремонтирую|восстановить|восстанавливаю|repair(?:ing)?|fix(?:ing)?|mend(?:ing)?|restore|restoring|restoration(?: of)?) (.+)$/u,
 return:/^(?:вернуть|возвратить|возвращаю|возврат|return(?:ing)?|give back|giving back) (.+)$/u,
 delivery:/^(?:доставить|доставляю|доставка|принести|приношу|deliver(?:ing)?|delivery(?: of)?|bring(?:ing)?) (.+)$/u,
} as const;
type Goal=keyof typeof verbs;
const articles=new Set(['a','an','the']);
export function storyTaskGoal(query:string,names:Iterable<string>=[]) {
 let raw=query.trim();if(!raw||raw.length>240||/[«»“”"]|(?<![\p{L}\p{N}])'|'(?![\p{L}\p{N}])/u.test(raw))return;
 const wrapper=/^(\*{1,2})([^*]+)\1$/u.exec(raw);if(wrapper)raw=wrapper[2]!.trim();
 // A colon/dash is allowed only as the declared goal/continue separator.
 const rest=raw.replace(/^(?:моя цель|my goal is to|continue|продолжай)\s*[-—–:]?\s+/iu,'');
 if(/[\r\n?,;:()[\]{}<>`*\/\\=+@]/u.test(rest)||/[.!]./u.test(rest))return;
 const known=[...new Set([...names].map(normalizeText).filter(Boolean))].sort((a,b)=>b.length-a.length||a.localeCompare(b));
 const pattern=known.length?new RegExp(`(^| )(?:${known.join('|')})(?= |$)`,'gu'):undefined;
 const mask=(text:string)=>{const normalized=normalizeText(text);return pattern?(' '+normalized+' ').replace(pattern,'$1__deeprole_name__').trim():normalized;};
 const body=/^(?:моя цель|my goal is to|continue(?: to)?|продолжай|я|i(?: (?:am|m))?) (.+)$/u.exec(mask(raw))?.[1];
 if(!body||body.split(' ').some(isUnsafeStoryActionWord))return;
 const match=(Object.entries(verbs) as [Goal,RegExp][]).map(([goal,pattern])=>({goal,object:pattern.exec(body)?.[1]})).find(v=>v.object);
 if(!match?.object||match.object.includes('__deeprole_name__'))return;
 const words=match.object.split(' ').filter(word=>!articles.has(word));
 if(!words.length||words.length>6||words.some(word=>!/^\p{L}[\p{L}\p{N}_]*$/u.test(word)))return;
 const terms=tokenize(words.join(' '));if(!terms.length)return;
 const tokens=(text:string)=>tokenize(mask(text));
 const clauses=(text:string)=>text.split(/[.!?;,\r\n:]+/u);
 const prefix=(text:string)=>{const words=tokens(text);return terms.every((term,index)=>words[index]===term);};
 const covers=(text:string)=>clauses(text).some(part=>{const words=tokens(part);return words.some((_,at)=>terms.every((term,index)=>words[at+index]===term));});
 return {goal:match.goal,object:match.object,terms,
  matchesTask(fact:StoryFact){const object=verbs[match.goal].exec(mask(clauses(fact.task?.title??'')[0]??''))?.[1];return fact.task?.status==='open'&&!!object&&prefix(object);},
  matchesObject(fact:StoryFact){return covers(fact.text)||covers(fact.task?.title??'');},
 };
}
/** Caller supplies frozen-role, active-owner and selected-source candidates.
 * Oldest/newest are two bounded retrieval samples, never urgency or deadlines. */
export function storyTaskGoalCandidates(facts:StoryFact[],goal:NonNullable<ReturnType<typeof storyTaskGoal>>,episodes?:EpisodeReader) {
 const matched=facts.filter(f=>goal.matchesTask(f)&&!!episodes?.position(f));
 if(matched.length<2)return [];
 const ordered=[...matched].sort((a,b)=>episodes!.position(a)-episodes!.position(b));
 return [ordered[0]!,ordered.at(-1)!,...ordered.slice(1,-1)];
}
