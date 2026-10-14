import type {StoryFact} from './story-update';
import type {StoryRoleReader} from './story-source-roles';
import type {EpisodeReader} from './story-episodes';
import {storyActionBalance} from './story-action-balance';
import {storyRecallLexicon} from './story-natural-recall';

// Finite additional surface forms for lexical search only. They never establish
// that an action happened, who owns an object, or that permission was obtained.
const past=new Map([['открыл','открываю'],['открыла','открываю'],['закрыл','закрываю'],['закрыла','закрываю'],['взял','беру'],['взяла','беру'],['осмотрел','осматриваю'],['осмотрела','осматриваю'],['проверил','проверяю'],['проверила','проверяю'],['opened','open'],['closed','close'],['took','take'],['inspected','inspect'],['checked','check']]);
export function storyLastingRecall(query:string,persistent:StoryFact[],facts:StoryFact[],activeIds:Iterable<string>,names:Iterable<string>,roles?:StoryRoleReader,episodes?:EpisodeReader){
 const lex=storyRecallLexicon(names);if(!lex.permits(query))return [];
 const active=new Set(activeIds);
 // A terminal task is historical context, not an open obligation or a lasting
 // claim. Require a current, bound reporting speaker and selected source too.
 const closed=facts.filter(f=>f.task&&f.task.status!=='open'&&roles?.status?.(f)==='bound'&&!!episodes?.position(f)&&(()=>{const p=roles.read(f)?.speaker;return !!p&&!p.unavailable&&active.has(p.id);})()).sort((a,b)=>episodes!.position(b)-episodes!.position(a));
 const groups:{persistent:StoryFact[];closed:StoryFact[]}[]=[],seen=new Set<string>();
 for(const raw of query.split(/[.!?;,\r\n:]+/u).flatMap(part=>part.split(/\s+(?:и|затем|and|then)\s+/iu))){
  const words=lex.mask(raw).split(' ');if(words[0]==='я'||words[0]==='i')words.shift();
  if(words[0])words[0]=past.get(words[0])??words[0]!;
  const phrase=words.join(' '),parsed=storyActionBalance('Я '+phrase,lex.known)??storyActionBalance('I '+phrase,lex.known);
  if(parsed?.kind!=='object')continue;
  const terms=lex.clauses(parsed.object)[0]!;if(terms.some(word=>word.startsWith('__deeprole_')))continue;
  const key=terms.join(' ');if(seen.has(key))continue;seen.add(key);
  const matches=(fact:StoryFact)=>[...lex.clauses(fact.text),...lex.clauses(fact.task?.title??'')].some(words=>words.some((_,at)=>terms.every((word,i)=>words[at+i]===word)));
  const group={persistent:persistent.filter(matches),closed:closed.filter(matches)};
  if(group.persistent.length||group.closed.length)groups.push(group);
 }
 return groups;
}
