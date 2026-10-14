import type {StoryFact} from './story-update';
import type {StoryRoleReader} from './story-source-roles';
import type {EpisodeReader} from './story-episodes';
import {isPersonalStoryReference} from './story-retrieval-query';
import {storyActionBalance} from './story-action-balance';
import {storyTaskGoal} from './story-task-goal';
import {storyCompoundAction} from './story-compound-action';
import {storyRecallLexicon,storyTaskObject} from './story-natural-recall';

const demonstratives=new Set(['this','that','these','those','этот','эта','это','эти','эту','этого','этой','этому','этим','этими','этих','тот','та','то','те','ту','того','той','тому','тем','теми','тех']);
type Reference={kind:'personal'}|{kind:'deictic'|'literal';terms:string[]};
/** Signals a locally unresolved reference, not a linguistic binding. */
export function storyObjectReference(query:string,names:Iterable<string>):Reference|undefined{
 if(/[«»“”"]|(?<![\p{L}\p{N}])'|'(?![\p{L}\p{N}])/u.test(query))return;
 const lex=storyRecallLexicon(names);if(lex.mask(query).split(' ').some(isPersonalStoryReference))return {kind:'personal'};
 if(!lex.permits(query))return;
 const parsed=storyActionBalance(query,lex.known)??storyActionBalance('Я '+query,lex.known);if(parsed?.kind!=='object')return;
 const words=parsed.object.split(' ');if(!demonstratives.has(words[0]!))return;
 const terms=lex.clauses(words.slice(1).join(' '))[0]!;if(!terms.length||terms.some(t=>t.startsWith('__deeprole_')))return;
 return {kind:'deictic',terms};
}
/** Repeated CURRENT task slots sharing the exact requested label are candidates,
 * not evidence that their objects coincide. Never counts superseded versions. */
export function storyLiteralReference(query:string,facts:StoryFact[],names:Iterable<string>):Reference|undefined{
 const lex=storyRecallLexicon(names);if(!lex.permits(query))return;
 if(storyTaskGoal(query,lex.known)||storyCompoundAction(query,lex.known))return;
 const action=storyActionBalance(query,lex.known)??storyActionBalance('Я '+query,lex.known);if(action?.kind!=='object')return;
 const terms=lex.clauses(action.object)[0]!;if(!terms.length||terms.some(t=>t.startsWith('__deeprole_')))return;
 const key=terms.join(' '),slots=new Set(facts.filter(f=>f.task&&storyTaskObject(f.task.title,lex.known)?.terms.join(' ')===key).map(f=>f.task!.key));
 if(slots.size>1)return {kind:'literal',terms};
}
/** The full latest scene AND its verified accepted anchor must identify the
 * same single qualified literal label. This reserves candidates, not identity. */
export function storyReferenceCandidates(reference:Reference,tasks:StoryFact[],persistent:StoryFact[],anchor:StoryFact,recent:string[],names:Iterable<string>,roles?:StoryRoleReader,episodes?:EpisodeReader,allFacts?:StoryFact[]){
 if(reference.kind==='personal'||roles?.status?.(anchor)!=='bound'||!episodes?.position(anchor))return;
 const latest=recent.at(-1)??'';if(!latest.includes(anchor.quote))return;
 const lex=storyRecallLexicon(names),contains=(text:string,terms:string[])=>lex.clauses(text).some(words=>words.some((_,at)=>terms.every((word,i)=>words[at+i]===word)));
 const groups=new Map<string,{terms:string[];tasks:StoryFact[]}>();
 for(const fact of tasks){const label=storyTaskObject(fact.task?.title??'',lex.known);if(!label||(reference.kind==='deictic'?label.terms.length<=reference.terms.length:label.terms.length!==reference.terms.length)||!reference.terms.every((word,i)=>label.terms[label.terms.length-reference.terms.length+i]===word)||!contains(latest,label.terms))continue;
  const key=label.terms.join(' '),group=groups.get(key)??{terms:label.terms,tasks:[]};group.tasks.push(fact);groups.set(key,group);
 }
 if(groups.size!==1)return;const group=[...groups.values()][0]!;if(!contains(anchor.text,group.terms))return;
 // Unknown/unbound objects must also block narrowing. Every occurrence of the
 // bare object in the FULL latest scene must belong to this qualified phrase.
 for(const words of lex.clauses(latest))for(let at=0;at<words.length;at++)if(reference.terms.every((word,i)=>words[at+i]===word)&&!words.some((_,start)=>start<=at&&start+group.terms.length>=at+reference.terms.length&&group.terms.every((word,i)=>words[start+i]===word)))return;
 const details=persistent.filter(fact=>contains(fact.text,group.terms)||contains(fact.task?.title??'',group.terms));
 // An unavailable/unproved record is a barrier, never positive evidence. Do not
 // prioritize only the verified half of independent same-label alternatives.
 if(allFacts?.some(fact=>{
  const label=fact.task&&storyTaskObject(fact.task.title,lex.known);
  if(label&&label.terms.join(' ')===group.terms.join(' ')&&!tasks.includes(fact))return true;
  return fact.claim?.scope==='state'&&fact.claim.lifetime==='persistent'&&contains(fact.text,group.terms)&&!persistent.includes(fact);
 }))return;
 return {tasks:group.tasks.sort((a,b)=>episodes!.position(a)-episodes!.position(b)),persistent:details};
}
export const UNRESOLVED_STORY_OBJECT='<deeprole_reference_guard>The current object reference (this/that) is NOT resolved by DeepRole. Selected records are literal candidates from explicit played evidence, not proof of which object is meant. A shared literal label is NOT an object ID: keep independent records, owners, locations, codes and conditions separate; do not merge them into one object. Use the full scene and source quotes; if they do not uniquely identify it, preserve uncertainty. Do not infer possession, permission or completion.</deeprole_reference_guard>';
export const AMBIGUOUS_STORY_OBJECT='<deeprole_reference_guard>Independent current tasks share the exact object label in this request. A shared literal label is NOT an object ID: DeepRole has NOT linked their objects. Keep records, owners, locations, codes and conditions separate. Selected facts are candidates, not proof that they describe one object. Use explicit played evidence; preserve uncertainty rather than merging them or inferring possession, permission or completion.</deeprole_reference_guard>';
