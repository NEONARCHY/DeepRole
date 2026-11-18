import type { EpisodeReader } from './story-episodes';
import { storyFactIdentity } from './story-memory-lifecycle';
import { isPersonalStoryReference, retrievalQueryNames, type StoryRetrievalScope } from './story-retrieval-query';
import type { StoryRoleReader } from './story-source-roles';
import type { StoryFact } from './story-update';
import { normalizeText, storyObjectTokens } from './text';

export const PROMISE_PAIR_GUIDE = '<deeprole_reference_guard>Answer for the stated giver and recipient only. Preserve the historical names in the quote and the roles actually recorded. Distinguish the promise, its prerequisite and the actual handover. A signed paper alone does not establish delivery. A later completed or cancelled task supersedes its earlier open status.</deeprole_reference_guard>';
export const UNCERTAIN_PROMISE_PAIR = '<deeprole_reference_guard>The requested agreement or part of its history is unverified. Use only the supplied evidence for this giver and recipient. Do not borrow another agreement, document or outcome.</deeprole_reference_guard>';
const commitment = /(?:^| )(?:(?:по)?обеща\p{L}*|долг|promise[ds]?|pledged|owes?)(?: |$)/u;
const verbs = '(?:promised|promises|promise|pledged|обещала?|обещает|пообещала?)';
const verbal = new RegExp('(?:^| )(?:что (?:именно )?(?:(@\\d+@) '+verbs+'|'+verbs+' (@\\d+@))|what (?:exactly )?(?:did |does |has )?(@\\d+@) '+verbs+') (.+)$','u');
const nominal = /(?:^| )(?:обещани(?:е|я|и|ю|ем) (@\d+@)|(@\d+@) s promise to|долг (@\d+@) перед|(@\d+@) owes) (.+)$/u;
const quotedRecipient = new RegExp('^@\\d+@ '+verbs+' (?:to )?','u');
const document = /(?:^| )(?:бумаг\p{L}*|документ\p{L}*|лист\p{L}*|подпис\p{L}*|распис\p{L}*|согласи\p{L}*|полис\p{L}*|удостоверени\p{L}*|справк\p{L}*|paperwork|papers?|documents?|sheets?|signed|signature|consent|receipt|policy|certificate)(?: |$)/u;
const insurance = /(?:^| )(?:страхов\p{L}*|полис\p{L}*|insurance)(?: |$)/u;
const receipt = /(?:^| )(?:расписк\p{L}*|receipt)(?: |$)/u;
const payment = /(?:^| )(?:оплат\p{L}*|платеж\p{L}*|paid|payment)(?: |$)/u;
const inspection = /(?:^| )(?:проверк\p{L}*|осмотр\p{L}*|inspect\p{L}*)(?: |$)/u;
const editing = /(?:^| )(?:монтаж|монтажа|вырез\p{L}*|редактир\p{L}*|edit(?:ed)?|cut)(?: |$)/u;
const asksEdit = /(?:^| )(?:монтаж\p{L}*|отредактир\p{L}*|edit(?:ing|ed)?)(?: |$)/u;
const handover = /(?:^| )(?:передач\p{L}*|вручил\p{L}*|получил\p{L}*|забрал\p{L}*|вернул\p{L}*|handover|handed|collected|returned|received)(?: |$)/u;
const completed = /(?:^| )(?:ли|уже|сделал\p{L}*|чем закончил\p{L}*|чем законч\p{L}*|кто расписал\p{L}*|has|had|was|did|who signed|how did|can (?:he|she)|what held)(?: |$)/u;
const speculation = /(?:^| )(?:якобы|наверное|возможно|подозрева\p{L}*|считает|думает|rumou?r|supposedly|maybe|perhaps|believes?|thinks?)(?: |$)/u;
const framing = new Set(storyObjectTokens(normalizeText('обещала обещал обещает отдать после когда только уже пока тот же хочет promised promises promise after once only same already still')));

/** Query-only tokens. Stored versioned actor bindings are never extended or rewritten. */
export function promiseParticipants(scope: StoryRetrievalScope) {
  const people = scope.entities.filter(p => p.kind === 'character' && p.worldId === scope.worldId);
  const forms = new Map<string, Set<number>>();
  const spellings = (i:number, label:string) => {
    const names=retrievalQueryNames({...people[i]!,name:label,aliases:[]});
    const base=normalizeText(label);
    if (/^[а-я]{3,}[бвгджзклмнпрстфхцчшщ]$/u.test(base)) names.push(base+'а',base+'у',base+'ом');
    return names;
  };
  for (const [i, person] of people.entries()) {
    const names=[person.name,...person.aliases].flatMap(label=>spellings(i,label));
    for (const name of names) {
      if (!name || isPersonalStoryReference(name)) continue;
      const ids = forms.get(name) ?? new Set<number>();
      ids.add(i);
      forms.set(name, ids);
    }
  }
  const choices = [...forms.keys()].sort((a,b)=>b.length-a.length);
  const pattern = choices.length ? new RegExp('(?<![\\p{L}\\p{N}_])(?:'+choices.join('|')+')(?![\\p{L}\\p{N}_])','gu') : undefined;
  const mask = (value: string, found?:Map<string,Set<string>>) => {
    const text = normalizeText(value);
    return pattern ? text.replace(pattern, name => {
      const ids = forms.get(name)!;
      const token=ids.size === 1 ? '@'+ids.values().next().value+'@' : '@ambiguous@';
      if (found) {
        const labels=found.get(token)??new Set<string>();
        labels.add(name); found.set(token,labels);
      }
      return token;
    }) : text;
  };
  const personId = (token: string) => people[Number(token.slice(1,-1))]?.id;
  const literalLabels=(token:string, draft:string)=>{
    const hit=new Map<string,Set<string>>();
    mask(draft,hit);
    const i=Number(token.slice(1,-1)), person=people[i]!;
    return [person.name,...person.aliases].flatMap(label=>{
      const forms=spellings(i,label);
      return forms.some(name=>hit.get(token)?.has(name))?forms:[];
    });
  };
  return {mask, personId, literalLabels};
}

function pairQuestion(draft: string, mask: (text:string)=>string) {
  const clauses = draft.split(/[.!?？;:,\n]/u).map(part=>mask(part)).filter(Boolean);
  const text = clauses.join(' ');
  if (text.includes('@ambiguous@') || /(?:^| )(?:pretend|suppose|if|сравни\p{L}*|сопостав\p{L}*|сравн\p{L}*|представ\p{L}*|если|compare|both|обоих)(?: |$)/u.test(text)) return;
  const requests = clauses.filter(s=>verbal.test(s)||nominal.test(s));
  if (requests.length!==1) return;
  const clause=requests[0]!;
  const match = verbal.exec(clause) ?? nominal.exec(clause)!;
  const giver = match.slice(1,-1).find(Boolean)!;
  const rest = match.at(-1)!.replace(/^to /u,'');
  const named = /^(@\d+@)(?= |$)/u.exec(rest)?.[1];
  // An unlisted job title is usable when the player explicitly scopes a debt
  // to that title. A thing named after "promise" may instead be its object.
  const title = !named && /(?:долг @\d+@ перед|@\d+@ owes) /u.test(clause) ? rest.replace(/^the /u,'') : undefined;
  if (!named && (!title || title.split(' ').length > 3)) return;
  if (named===giver || /@\d+@/.test(rest.slice(named?.length ?? rest.length)) || new Set(text.match(/@\d+@/gu)).size > (named?2:1)) return;
  if (named && /^(?: s | (?:и|или|or|and) @)/u.test(rest.slice(named.length)+' ')) return;
  const tail = [rest.slice(named?.length ?? rest.length), ...clauses.slice(clauses.indexOf(clause)+1)].join(' ').trim();
  return {giver,named,title,tail};
}

function terms(text:string) {
  return new Set(storyObjectTokens(text.replace(/@\d+@|@ambiguous@/gu,' ')).filter(word=>!framing.has(word)));
}
const overlap = (a:Set<string>,b:Set<string>) => [...a].filter(word=>b.has(word)).length;
function prerequisite(value:string, mask:(text:string)=>string) {
  const tail=mask(value).split(/(?:^| )(?:после|когда|пока|once|after|until|wait for) /u).at(1);
  return terms(tail??'');
}

// For two otherwise identical promises, a witnessed handover can identify
// the pair. A mention of both names somewhere in a paragraph is insufficient.
function transferPair(value:string, mask:(text:string)=>string) {
  const line=mask(value.split(/[.!?;,\n]/u)[0]!);
  const action=/^(@\d+@) (?:handed|gave|returned|delivered|вручил[аи]?|вернул[аи]?|передал[аи]?|отдал[аи]?) (.+)$/u.exec(line);
  if (!action) return;
  const recipients=action[2]!.match(/@\d+@/gu);
  if (recipients?.length!==1) return;
  const recipient=recipients[0]!;
  if (!action[2]!.startsWith(recipient+' ') && !action[2]!.endsWith(' to '+recipient) && action[2]!==recipient) return;
  return action[1]+' '+recipient;
}
function evidenceTerms(fact:StoryFact,mask:(text:string)=>string) {
  const words=terms(mask(fact.text));
  if (fact.quote!==fact.text) {
    const source=terms(mask(fact.quote));
    for (const word of words) if (!source.has(word)) words.delete(word);
  }
  return words;
}

/** An older promise may travel only alongside its current, sourced closing record. */
export function closedPromiseEvidence(facts:StoryFact[], archive:StoryFact[], episodes:EpisodeReader, supported:(f:StoryFact)=>boolean) {
  const closings=new Map<StoryFact,StoryFact>();
  if (!archive.length) return closings;
  const current=new Map(facts.filter(f=>f.task).map(f=>[f.task!.key,f]));
  const removed=new Set(facts.flatMap(f=>f.replaces??[]));
  for (const past of archive) {
    const latest=past.task && current.get(past.task.key);
    if (past.kind==='promise' && past.task?.status==='open' && latest?.task && latest.task.status!=='open' &&
      !removed.has(storyFactIdentity(past)) && supported(past) && supported(latest) &&
      episodes.position(past)<episodes.position(latest)) closings.set(past,latest);
  }
  return closings;
}

export function promisePairEvidence(facts:StoryFact[], draft:string, scope:StoryRetrievalScope, roles?:StoryRoleReader, episodes?:EpisodeReader, archive:StoryFact[]=[]) {
  if (draft.length>800 || !commitment.test(normalizeText(draft)) || /[«»“”"<>]/u.test(draft)) return;
  const {mask,personId,literalLabels}=promiseParticipants(scope), q=pairQuestion(draft,mask);
  if (!q) return;
  const unknown = (facts:StoryFact[]=[])=>({facts,certain:false});
  if (!roles) return unknown();
  if (!episodes) {
    // Older archives can have the exact quote and frozen giver ID without
    // an episode timeline. Retain that evidence, including renamed givers,
    // without asserting an unrecorded follow-up or a recipient role.
    const legacy=facts.filter(f=>{
      if (f.kind!=='promise' || f.claim?.status==='ended' || roles.status?.(f)!=='bound') return false;
      const source=roles.read(f);
      if (!source?.promisor || source.promisor.id!==personId(q.giver) || Object.values(source).some(p=>p.unavailable)) return false;
      if (!q.named) return false;
      if (source.recipient) return source.recipient.id===personId(q.named);
      const wording=mask(f.quote.split(/[.!?;,\n]/u)[0]!);
      const tail=wording.match(/(?:^| )(?:promised|обещал[аи]?) (.*)$/u)?.[1];
      return !!tail && [q.named,'to '+q.named,'to help '+q.named,'помочь '+q.named].some(s=>tail===s||tail.startsWith(s+' '));
    });
    return unknown(legacy.length<=6?legacy:[]);
  }
  const supported=(f:StoryFact)=>!!episodes.read(f) && roles.status?.(f)!==undefined &&
    !Object.values(roles.read(f)??{}).some(p=>p.unavailable);
  const labels=q.named?literalLabels(q.named,draft):[];
  const recipientIn = (value:string, originalName:string) => {
    const literal=normalizeText(value.split(/[.!?;:\n]/u)[0]!);
    const original=normalizeText(originalName);
    const line=literal.startsWith(original+' ')?q.giver+' '+literal.slice(original.length+1):mask(literal);
    const head=quotedRecipient.exec(line);
    if (!head || !line.startsWith(q.giver+' ')) return false;
    const rest=line.slice(head[0].length);
    if (q.named) {
      // With no frozen recipient ID, match only the name actually used in
      // the question. A newly assigned alias cannot rebind an older quote.
      const literalTail=new RegExp('(?:^| )'+verbs+' (?:to )?(.+)$','u').exec(literal)?.[1]??'';
      return labels.some(label=>(literalTail===label||literalTail.startsWith(label+' '))&&!literalTail.startsWith(label+' s '));
    }
    const title=storyObjectTokens(q.title!), actual=storyObjectTokens(rest);
    return title.length>=2 && title.every((word,i)=>actual[i]===word);
  };
  // An archived promise is eligible only with its later accepted closing row.
  // The pair always travels together, even if the player asks only for terms.
  const closings=closedPromiseEvidence(facts,archive,episodes,supported);
  const promises=[...facts,...closings.keys()].filter(f=>f.kind==='promise' && f.claim?.status!=='ended')
    .map(fact=>({fact,words:evidenceTerms(fact,mask)}));
  const matches=promises.filter(({fact})=>{
    const source=roles.read(fact);
    if (!source?.promisor || source.promisor.id!==personId(q.giver)) return false;
    if (source.recipient) return !!q.named && source.recipient.id===personId(q.named);
    const original=source.promisor.sourceName??source.promisor.name;
    return recipientIn(fact.quote,original) && recipientIn(fact.text,original);
  });
  if (!matches.length || matches.some(row=>!supported(row.fact))) return unknown();
  const topic = /^(?:насчет|по поводу|about|о) (.+?)(?: (?:и|and|какое|what) |$)/u.exec(q.tail)?.[1];
  const topicWords=topic?terms(topic):undefined;
  const candidates=topicWords?matches.filter(row=>topicWords.size>0 && overlap(row.words,topicWords)===topicWords.size):matches;
  const withClosing=(fact:StoryFact)=>closings.has(fact)?[fact,closings.get(fact)!]:[fact];
  if (candidates.length!==1) return unknown(candidates.length<=3?[...new Set(candidates.flatMap(r=>withClosing(r.fact)))]:[]);
  const anchor=candidates[0]!;
  const needed=[insurance,receipt,payment,inspection,handover].filter(facet=>facet.test(q.tail));
  if (asksEdit.test(q.tail)) needed.push(editing);
  if (!needed.includes(insurance) && !needed.includes(receipt) && document.test(q.tail)) needed.push(document);
  if (!needed.length && !completed.test(q.tail)) return {facts:withClosing(anchor.fact),certain:true};

  // Qualify each candidate against all competing promises. A participant or
  // a generic document alone is never evidence that this promise progressed.
  const byWord=new Map<string, number[]>();
  const samePair=new Set(matches);
  for (const [i,row] of promises.entries()) if (row!==anchor) {
    for (const word of row.words) {
      const indices=byWord.get(word);
      if (indices) indices.push(i); else byWord.set(word,[i]);
    }
  }
  const condition=prerequisite(anchor.fact.text,mask), evidenceCondition=prerequisite(anchor.fact.quote,mask);
  for (const word of condition) if (!evidenceCondition.has(word)) condition.delete(word);
  const wantsCondition=/(?:^| )(?:условие|условия|мешало|condition|held up)(?: |$)/u.test(q.tail);
  const wanted=needed.length?needed:[undefined];
  const groups=wanted.map(()=>[] as StoryFact[]);
  for (const fact of facts) {
    if (fact.kind!=='event'||fact.claim?.status==='ended') continue;
    const text=normalizeText(fact.text), quote=fact.text===fact.quote?text:normalizeText(fact.quote);
    const facets=wanted.map(facet=>!facet || facet.test(text)&&facet.test(quote));
    if (!facets.includes(true) || speculation.test(text) || speculation.test(quote)) continue;
    const words=evidenceTerms(fact,mask), score=overlap(words,anchor.words);
    if (score<2 || !supported(fact)) continue;
    const edge=transferPair(fact.quote,mask), target=q.giver+' '+q.named;
    if (edge && q.named && edge!==target) continue;
    const direct=!!q.named && edge===target && transferPair(fact.text,mask)===target;
    const totals=new Map<number,number>();
    for (const word of words) for (const other of byWord.get(word)??[]) totals.set(other,(totals.get(other)??0)+1);
    if ([...totals].some(([other,total])=>total>score || total===score && (!direct || samePair.has(promises[other]!)))) continue;
    for (const [i,hit] of facets.entries()) {
      if (!hit) continue;
      if (condition.size && (wanted[i]===document || !wanted[i] && wantsCondition) && !overlap(condition,words)) continue;
      groups[i]!.push(fact);
    }
  }
  const picked=[...new Set(groups.flat())].sort((a,b)=>episodes.position(a)-episodes.position(b));
  if (picked.length>7) return unknown(withClosing(anchor.fact));
  return {facts:[...new Set([...withClosing(anchor.fact),...picked])],certain:groups.every(group=>group.length>0)};
}
