import type {StoryFact} from './story-update';
import type {EpisodeReader} from './story-episodes';
import {normalizeText,tokenize} from './text';
import {storyActionBalance,isUnsafeStoryActionWord} from './story-action-balance';
import {storyTaskGoal} from './story-task-goal';
import {storyCompoundAction} from './story-compound-action';
import {isPersonalStoryReference} from './story-retrieval-query';

// Supplemental lexical recall, NOT an action/intent/ownership parser. This small
// noun-form table is request-local; global stemming and canonical data stay put.
const forms=[['ключ','ключа','ключу','ключом','ключе','ключи','ключей','ключам','ключами','ключах'],['двер','дверь','двери','дверью','дверей','дверям','дверями','дверях'],['код','кода','коду','кодом','коде','коды','кодов','кодам','кодами','кодах']];
const nouns=new Map(forms.flatMap(group=>group.map(form=>[form,group[0]!] as const)));
const objectAction=/^(?:inspect|check|open|close|read|take|use|pick up|осмотреть|осматривать|проверить|проверять|открыть|открывать|закрыть|закрывать|взять|брать|прочитать|читать|использовать) (.+)$/u;
/** Shared request-local lexical rules; names and stop words stay barriers. */
export function storyRecallLexicon(names:Iterable<string>){
 const known=[...new Set([...names].map(normalizeText).filter(name=>!!name&&!isPersonalStoryReference(name)))].sort((a,b)=>b.length-a.length||a.localeCompare(b)),pattern=known.length?new RegExp(`(^| )(?:${known.join('|')})(?= |$)`,'gu'):undefined;
 const mask=(text:string)=>{const normalized=normalizeText(text);return pattern?(' '+normalized+' ').replace(pattern,'$1__deeprole_name__').trim():normalized;};
 const fold=(word:string)=>nouns.get(word)??word;
 const tokens=(text:string)=>mask(text).split(' ').flatMap(word=>{const plain=tokenize(word);return nouns.has(word)?[nouns.get(word)!]:plain.length?plain.map(fold):['__deeprole_gap__'];});
 const clauses=(text:string)=>text.split(/[.!?;,\r\n:]+/u).map(tokens);
 const permits=(query:string)=>!!query.trim()&&!/[«»“”"]|(?<![\p{L}\p{N}])'|'(?![\p{L}\p{N}])/u.test(query)&&!/[?？]$/u.test(query.trim())&&!mask(query).split(' ').some(isPersonalStoryReference);
 return {known,mask,fold,clauses,permits};
}
/** A literal title label, never an object ID or proof of possession. */
export function storyTaskObject(title:string,names:Iterable<string>){
 const {known,mask,fold}=storyRecallLexicon(names),first=(title.split(/[.!?;,\r\n:]+/u)[0]??'').trim(),goal=storyTaskGoal('Continue '+first,known),object=objectAction.exec(mask(first))?.[1];
 const phrase=(goal?.object??object)?.replace(/^(?:a|an|the) /u,''),words=phrase?.split(' ');
 const raw=phrase&&!phrase.includes('__deeprole_name__')&&words!.length<=6&&!words!.some(word=>isUnsafeStoryActionWord(word)||!tokenize(word).length)?tokenize(phrase):undefined;
 return raw?.length?{raw,terms:raw.map(fold)}:undefined;
}
/** Caller supplies ONLY current, frozen-owner/source-bound eligible records. */
export function storyNaturalRecall(query:string,tasks:StoryFact[],persistent:StoryFact[],names:Iterable<string>,episodes?:EpisodeReader){
 const {known,clauses,permits}=storyRecallLexicon(names);if(!permits(query))return [];
 // Keep existing supported single-goal/compound paths and their ablations. A
 // failed legacy source/budget guard must not be repaired by this supplement.
 if(storyTaskGoal(query,known)||storyCompoundAction(query,known))return [];
 const single=storyActionBalance(query,known);if(single?.kind==='context')return [];
 const requested=clauses(query),groups=new Map<string,{terms:string[];tasks:StoryFact[];persistent:StoryFact[];hits:{clause:number;at:number;end:number}[]}>();
 for(const fact of tasks){
  if(fact.task?.status!=='open'||!episodes?.position(fact))continue;
  const label=storyTaskObject(fact.task.title,known);if(!label)continue;const {raw,terms}=label;
  // Exact existing single-object syntax keeps its existing path. A compound
  // prepositional object or newly supported case form may use this supplement.
  if(single?.kind==='object'&&raw.length===single.orderedTerms.length&&raw.every((word,i)=>word===single.orderedTerms[i]))return [];
  const key=terms.join(' '),hits=requested.flatMap((words,clause)=>words.flatMap((_,at)=>terms.every((word,i)=>words[at+i]===word)?[{clause,at,end:at+terms.length}]:[]));
  if(!hits.length)continue;
  const group=groups.get(key)??{terms,tasks:[],persistent:[],hits};group.tasks.push(fact);groups.set(key,group);
 }
 const all=[...groups.values()];
 // Prefer a qualified literal phrase at that occurrence: a blue key does not
 // reserve a separate unrelated bare-key duty merely because it shares "key".
 return all.map(group=>({...group,hits:group.hits.filter(hit=>!all.some(other=>other!==group&&other.terms.length>group.terms.length&&other.hits.some(long=>long.clause===hit.clause&&long.at<=hit.at&&long.end>=hit.end)))})).filter(group=>group.hits.length)
  .sort((a,b)=>a.hits[0]!.clause-b.hits[0]!.clause||a.hits[0]!.at-b.hits[0]!.at)
  .map(group=>({...group,tasks:group.tasks.sort((a,b)=>episodes!.position(a)-episodes!.position(b)),persistent:persistent.filter(fact=>[...clauses(fact.text),...clauses(fact.task?.title??'')].some(words=>words.some((_,at)=>group.terms.every((word,i)=>words[at+i]===word))))}));
}
