import type {StoryFact} from './story-update';
import {normalizeText,tokenize} from './text';
import {storyActionBalance} from './story-action-balance';
import {storyTaskGoal} from './story-task-goal';

// Finite two/three-clause retrieval syntax. A query is never performed-event,
// ownership, permission, consent or task-completion evidence.
export function storyCompoundAction(query:string,names:Iterable<string>=[]) {
 let raw=query.trim();if(!raw||raw.length>480||/[«»“”"]|(?<![\p{L}\p{N}])'|'(?![\p{L}\p{N}])/u.test(raw))return;
 const wrapper=/^(\*{1,2})([^*]+)\1$/u.exec(raw);if(wrapper)raw=wrapper[2]!.trim();
 if(/[\r\n]/u.test(raw))return;
 const known=[...new Set([...names].map(normalizeText).filter(Boolean))].sort((a,b)=>b.length-a.length||a.localeCompare(b));
 const pattern=known.length?new RegExp(`(^| )(?:${known.join('|')})(?= |$)`,'gu'):undefined;
 const mask=(text:string)=>{const normalized=normalizeText(text);return pattern?(' '+normalized+' ').replace(pattern,'$1__deeprole_name__').trim():normalized;};
 // Mask before splitting: a character named "And Then" cannot become syntax.
 if(mask(raw).includes('__deeprole_name__'))return;
 const goal=/^(моя цель\s*[-—–:]?\s+|my goal is to\s+|продолжай\s*[-—–:]?\s+|continue\s*[-—–:]?\s+)/iu.exec(raw)?.[1];
 const subject=/^(я\s+|i(?:['’]m| am)?\s+)/iu.exec(raw)?.[1];
 if(!goal&&!subject)return;
 const rest=raw.slice((goal??subject)!.length).replace(/[.!]$/u,'');
 if(/[\r\n.?!,;:()[\]{}<>`*\/\\=+@]/u.test(rest))return;
 const parts=rest.split(/\s+(?:и(?: затем)?|затем|and(?: then)?|then)\s+/iu);if(parts.length<2||parts.length>3)return;
 const clauses=parts.map((part,index)=>{
  const text=index===0?(goal??subject)+part:goal?goal+part:/^(?:я\s|i(?:['’]m| am)?\s)/iu.test(part)?part:(/^я/iu.test(subject!)?'Я ':'I ')+part;
  const task=goal?storyTaskGoal(text,known):undefined,action=goal?undefined:storyActionBalance(text,known);
  const terms=task?.terms??(action?.kind==='object'?action.orderedTerms:undefined);if(!terms?.length)return;
  const covers=(text:string)=>text.split(/[.!?;,\r\n:]+/u).some(part=>{const words=tokenize(mask(part));return words.some((_,at)=>terms.every((term,index)=>words[at+index]===term));});
  return {terms,goal:!!task,matchesTask:(fact:StoryFact)=>task?task.matchesTask(fact):covers(fact.task?.title??''),matchesObject:(fact:StoryFact)=>covers(fact.text)||covers(fact.task?.title??'')};
 });
 if(clauses.some(c=>!c)||new Set(clauses.map(c=>c!.terms.join(' '))).size!==clauses.length)return;
 return clauses as NonNullable<typeof clauses[number]>[];
}
