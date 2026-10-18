import type {StoryFact} from './story-update';
import type {StoryRoleReader} from './story-source-roles';
import type {EpisodeReader} from './story-episodes';
import {normalizeText,tokenize} from './text';

/** Supplemental candidates, NOT a task resolver. Literal title + explicit
 * status language can recall an older progress source despite a discussion
 * tail. Keep ALL prior choices, each exact source/owner and every condition.
 * Unclassified discussion is never deleted or declared meaningless here. */
export function taskProgressRecall(facts:StoryFact[],selected:StoryFact[],query:string,roles?:StoryRoleReader,episodes?:EpisodeReader){
  if(!roles||!episodes||query.length>600||!/[?？]$/u.test(query.trim())||/[«»“”"`<>\n]/u.test(query))return;
  const q=normalizeText(query);
  if(!/^(?:what|where|how|is|has|have|can|что|где|как|выполнено|можно)(?: |$)/u.test(q)
    ||/(?:^| )(?:if|unless|pretend|ignore|delete|execute|если|притворись|игнорируй|удали|выполни)(?: |$)/u.test(q)
    ||!/(?:^| )(?:promise|promised|fulfilled|missing|done|обещал|обещала|обещание|выполнено|хватает)(?: |$)/u.test(q))return;
  const safe=(f:StoryFact)=>roles.status?.(f)==='bound'&&!!episodes.read(f)&&Object.values(roles.read(f)??{}).every(p=>!p.unavailable);
  const words=tokenize(query),contains=(text:string,terms:string[])=>{const tokens=tokenize(text);return tokens.some((_,at)=>terms.every((t,i)=>tokens[at+i]===t));};
  const tasks=selected.filter(f=>f.task?.status==='open'&&safe(f)
    &&(!roles.question||roles.read(f)?.[roles.question.role]?.id===roles.question.personId));
  const group=new Set<StoryFact>(),qualifiedOwners=new Set<string>();
  for(const task of tasks){
    // Only affirmative, short action titles; conditional prose/opaque keys and
    // bare nouns supply no bridge. The query must name the WHOLE title.
    const title=normalizeText(task.task!.title);
    if(!/^(?:open|raise|send|deliver|repair|return|открыть|поднять|отправить|доставить|починить|вернуть)(?: |$)/u.test(title))continue;
    const terms=tokenize(title),object=terms.slice(1);
    if(object.length<2||object.length>6||!words.some((_,at)=>terms.every((t,i)=>words[at+i]===t)))continue;
    const owner=roles.read(task)?.promisor??roles.read(task)?.speaker;
    if(!owner)continue;
    const candidates=facts.filter(f=>safe(f)&&f.kind==='event'
      &&(roles.read(f)?.speaker?.id===owner.id||roles.read(f)?.promisor?.id===owner.id)
      &&contains(f.text,object)&&contains(f.quote,object)
      &&/(?:\b(?:has not|have not|still|already|passed|completed|returned)\b|(?:^| )(?:еще не|все еще|уже|завершен|завершена|вернулся|не откры\p{L}*|не подня\p{L}*|не отправ\p{L}*)(?: |$))/u.test(normalizeText(f.text)));
    if(!candidates.length||candidates.length>8)continue;
    qualifiedOwners.add(owner.id);
    group.add(task);candidates.forEach(f=>group.add(f));
  }
  // A separate explicit delivery question may need a completed neighbour too.
  // All selected names stay bound to their own source, never to query order.
  if(group.size&&/(?:\balready deliver\b|уже передал)/u.test(q)){
    for(const f of facts)if(f.task?.status==='completed'&&safe(f)
      &&qualifiedOwners.has(roles.read(f)?.speaker?.id??'')&&/(?:\bdelivery\b|передач\p{L}*)/u.test(normalizeText(f.text)))group.add(f);
  }
  return group.size&&group.size<=12?[...group]:undefined;
}
