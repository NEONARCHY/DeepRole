import type { EpisodeReader } from './story-episodes';
import { closedPromiseEvidence, promiseParticipants } from './story-promise-pair';
import type { StoryRetrievalScope } from './story-retrieval-query';
import type { StoryRoleReader } from './story-source-roles';
import type { StoryFact } from './story-update';
import { normalizeText, storyObjectTokens } from './text';

export const COMPARE_PROMISES = '<deeprole_reference_guard>Compare the two recorded commitments separately. Preserve the giver, recipient, item and condition from each quote. Use the distinguishing scene for the requested difference. A prerequisite is not delivery. Keep a later closing status. Report only what the selected sources establish.</deeprole_reference_guard>';
export const INCOMPLETE_COMPARISON = '<deeprole_reference_guard>Only part of the requested comparison is established. State which agreement, distinguishing detail or outcome is unknown. Do not substitute another promise or infer that an unrecorded event never happened.</deeprole_reference_guard>';

const comparison = /(?:^| )(?:сравни\p{L}*|сопостав\p{L}*|свер(?:им|ить|ь)|различ\p{L}*|отлича\p{L}*|compare|contrast|reconcile|differ(?:s|ent|ences?)?|tell .{1,24} apart)(?= |$)/u;
const commitment = /(?:^| )(?:обеща\p{L}*|обязательств\p{L}*|заказ\p{L}*|promises?|commitments?|orders?)(?= |$)/u;
const conditionQuestion = /(?:^| )(?:услови\p{L}*|ждал\p{L}*|conditions?|prerequisites?|waited)(?= |$)/u;
const deliveryQuestion = /(?:^| )(?:получил\p{L}*|передали|вручили|received|collected|handed over|delivered)(?= |$)/u;
const colourQuestion = /(?:^| )(?:цвет\p{L}*|colou?rs?)(?= |$)/u;
const markings = /(?:^| )(?:красн\p{L}*|син(?:яя|ее|ий|ей|юю|его|ем|ими|ие|их)|бел\p{L}*|черн\p{L}*|желт\p{L}*|зелен\p{L}*|лилов\p{L}*|сер(?:ый|ая|ое|ые|ую|ого|ой|ом)|розов\p{L}*|фиолетов\p{L}*|red|blue|white|black|yellow|green|lilac|grey|gray|pink|purple)(?= |$)/u;
const itemQuestion = /(?:^| )(?:предмет\p{L}*|вещи|упаков\p{L}*|маркиров\p{L}*|как (?:отличить|различить)|items?|packaging|markings?|tell .{1,24} apart)(?= |$)/u;
const reported = /(?:^| )(?:предполож\p{L}*|счита\p{L}*|якобы|говорят|кажется|слух\p{L}*|возможно|guessed|thinks?|believes?|supposedly|perhaps|rumou?rs?|might)(?= |$)/u;
const stop = new Set(storyObjectTokens('после пока только когда нужно можно один оба того такой тот обещал обещала отдать вернуть после проверки кто какой варианты after once until wait waits promised give same both version versions received only'));
function words(masked:string) {
  // Keep common noun inflections comparable without changing the index or stored wording.
  const folded=masked.replace(/(ени|ани)[еяиюй](?= |$)/gu,'$1е').replace(/\bpasses\b/gu,'pass').replace(/\bcopies\b/gu,'copy');
  return new Set(storyObjectTokens(folded).filter(w=>!stop.has(w)));
}
const common=(a:Set<string>,b:Set<string>)=>[...a].filter(w=>b.has(w));
const difference=(a:Set<string>,b:Set<string>)=>new Set([...a].filter(w=>!b.has(w)));
type Participants = ReturnType<typeof promiseParticipants>;
type Mask = Participants['mask'];
type Party = {giver:string; recipient?:string};

function comparisonParties(query:string):Party[] {
  const pairs=[...query.matchAll(/(@\d+@)(?: s promise to| promised| обещала?)? (@\d+@)/gu)];
  if (pairs.length===2) return pairs.map(m=>({giver:m[1]!,recipient:m[2]!}));
  const shared=/обещани\p{L}* (@\d+@) (@\d+@) и (@\d+@)|(@\d+@) s promises to (@\d+@) and (@\d+@)/u.exec(query);
  if (shared) {
    const [giver,first,second]=shared.slice(1).filter(Boolean) as [string,string,string];
    return [{giver,recipient:first},{giver,recipient:second}];
  }
  const coordinated=/(?:обещани\p{L}*|обязательств\p{L}*|promises? of) (@\d+@) (?:и|and) (@\d+@)|(@\d+@) (?:s )?and (@\d+@) s (?:promises?|commitments?)|(@\d+@) s promise differs? from (@\d+@) s/u.exec(query);
  return coordinated?.slice(1).filter((s):s is string=>!!s).map(giver=>({giver}))??[];
}

function questionScope(draft:string,mask:Mask) {
  const clauses=draft.split(/[.!?;:,\n]/u).map(s=>mask(s)).filter(Boolean);
  const query=clauses.join(' ');
  // Only names used as the authors of promises constrain the two owners.
  // The person asking about both orders may instead be their common recipient.
  const topic=clauses.map(c=>/(?: (?:насчет|по поводу|about|об?) |(?:оба|два) заказа на )(.+?)(?: (?:и чем|and how) |$)/u.exec(c)?.[1]
    ?? /(?:both|two) (.+?) orders(?: |$)/u.exec(c)?.[1]).find(Boolean);
  return {query,parties:comparisonParties(query),topic:words(topic??'')};
}

function agreedWords(fact:StoryFact,mask:Mask,part:(s:string)=>string) {
  const original=words(mask(part(fact.quote)));
  return fact.text===fact.quote?original:new Set(common(original,words(mask(part(fact.text)))));
}
const conditionStart=/(?:[.!?;]|\bafter\b|\bonce\b|\buntil\b|\bprovided\b|\bwhen\b|\sпосле\s|\sкогда\s|\sпока\s)/iu;
const subjectPart=(s:string)=>s.split(conditionStart,1)[0]!;
const conditionPart=(s:string)=>{const match=conditionStart.exec(s);return match?s.slice(match.index+match[0].length):'';};
const clausesOf=(s:string)=>s.split(/[.!?;\n]+|,?\s+(?:while|whereas|but|а|зато)\s+/iu);
type Side = {fact:StoryFact; item:Set<string>; condition:Set<string>; giver:string};

function distinguishes(value:string, mask:Mask, unique:Set<string>[], colour:boolean) {
  const clauses=clausesOf(value).filter(s=>!colour||markings.test(normalizeText(s))).map(s=>words(mask(s)));
  return clauses.some((left,i)=>clauses.some((right,j)=>i!==j &&
    common(left,unique[0]!).some(word=>!right.has(word)) &&
    common(right,unique[1]!).some(word=>!left.has(word))));
}

function addressedTo(fact:StoryFact,recipient:string,draft:string,people:Participants,roles:StoryRoleReader) {
  const frozen=roles.read(fact)?.recipient;
  if (frozen) return frozen.id===people.personId(recipient);
  const labels=people.literalLabels(recipient,draft);
  const namesRecipient=(s:string)=>{
    const tail=normalizeText(s.split(/[.!?;:\n]/u)[0]!).match(/(?:^| )(?:promised|пообещал[аи]?|обещал[аи]?) (?:to )?(.+)$/u)?.[1];
    return tail!==undefined&&labels.some(l=>(l===tail||tail.startsWith(l+' '))&&!tail.startsWith(l+' s '));
  };
  return namesRecipient(fact.quote)&&namesRecipient(fact.text);
}

/** A condition on a similar object elsewhere is insufficient. A shared scene may
 * establish both conditions in separate clauses, each identifying its own item. */
function conditionScores(value:string, mask:Mask, sides:Side[], unique:Set<string>[]) {
  const parts=clausesOf(value);
  const groups=[value,...(parts.length>1?parts:[])].map(s=>words(mask(s)));
  return sides.map((side,i)=>{
    const other=1-i;
    let best=0;
    for (const group of groups) {
      const identity=common(group,unique[i]!).length,condition=common(group,side.condition).length;
      if (!condition) continue;
      if (identity>common(group,unique[other]!).length ||
          !unique[i]!.size&&common(group,side.item).length&&condition>common(group,sides[other]!.condition).length) {
        best=Math.max(best,identity+condition);
      }
    }
    return best;
  });
}

export function promiseComparisonEvidence(facts:StoryFact[],draft:string,scope:StoryRetrievalScope,roles?:StoryRoleReader,episodes?:EpisodeReader,archive:StoryFact[]=[]) {
  if (draft.length>800) return;
  const plain=normalizeText(draft);
  if (!comparison.test(plain)||!commitment.test(plain)||/(?:^| )(?:если|представь|suppose|pretend|if|do not compare|не сравнивай)(?: |$)/u.test(plain)) return;
  if (/(?:^| )(?:три|троих|three)(?: |$)/u.test(plain)) return;
  const people=promiseParticipants(scope),{mask,personId}=people;
  const q=questionScope(draft,mask);
  const partial=(kept:StoryFact[]=[])=>({facts:kept,certain:false});
  if (!roles||!episodes||q.query.includes('@ambiguous@')) return partial();
  const ownerIds=q.parties.map(p=>personId(p.giver));
  // Unsupported name/role syntax must never select two arbitrary world promises.
  if (!ownerIds.length&&!/(?:^| )(?:оба|обе|дв[ае]|both|two)(?= |$)/u.test(q.query)) return;
  if (!ownerIds.length&&!q.topic.size&&q.query.includes('@')) return partial();
  const supported=(f:StoryFact)=>!!episodes.read(f)&&roles.status?.(f)!==undefined&&!Object.values(roles.read(f)??{}).some(p=>p.unavailable);
  const closed=closedPromiseEvidence(facts,archive,episodes,supported);
  const candidates:Side[]=[];
  for (const fact of new Set([...facts,...closed.keys()])) {
    if (fact.kind!=='promise'||fact.claim?.status==='ended'||!supported(fact)) continue;
    const giver=roles.read(fact)?.promisor?.id;
    if (!giver||ownerIds.length&&!ownerIds.includes(giver)) continue;
    const item=agreedWords(fact,mask,subjectPart);
    if (q.topic.size&&!common(q.topic,item).length) continue;
    candidates.push({fact,item,giver,condition:agreedWords(fact,mask,conditionPart)});
  }
  const sides=q.parties.length?q.parties.flatMap(p=>{
    const matches=candidates.filter(c=>c.giver===personId(p.giver)&&(!p.recipient||addressedTo(c.fact,p.recipient,draft,people,roles)));
    return matches.length===1?matches:[];
  }):candidates;
  const base=[...new Set(sides.flatMap(s=>[s.fact,...(closed.has(s.fact)?[closed.get(s.fact)!]:[])]))];
  if (sides.length!==2||sides[0]===sides[1]) return partial(sides.length<=2?base:[]);

  const unique=sides.map((side,i)=>difference(side.item,sides[1-i]!.item));
  const asksConditions=conditionQuestion.test(q.query);
  const asksDelivery=deliveryQuestion.test(q.query);
  const colour=colourQuestion.test(q.query);
  const asksItems=!asksConditions||colour||itemQuestion.test(q.query);
  const bridges:StoryFact[]=[],progress=sides.map(()=>({score:0,rows:[] as StoryFact[]}));
  for (const fact of facts) {
    if (fact.kind!=='event'||fact.claim?.status==='ended'||fact.task&&sides.every(s=>s.fact.task?.key!==fact.task!.key)) continue;
    if (reported.test(normalizeText(fact.text))||reported.test(normalizeText(fact.quote))) continue;
    // Mere presence of the same nouns in a paraphrase cannot prove that its
    // two attributes were assigned to the same objects as in the source.
    if (asksItems&&distinguishes(fact.text,mask,unique,colour)&&
        (fact.text===fact.quote||normalizeText(fact.quote).includes(normalizeText(fact.text)))&&supported(fact)) bridges.push(fact);
    if (!asksConditions) continue;
    const scores=conditionScores(fact.text,mask,sides,unique);
    const sourceScores=fact.quote===fact.text?scores:conditionScores(fact.quote,mask,sides,unique);
    for (const [i,side] of sides.entries()) {
      if (fact.task&&fact.task.key!==side.fact.task?.key) continue;
      const score=Math.min(scores[i]!,sourceScores[i]!);
      if (!score||!supported(fact)) continue;
      const group=progress[i]!;
      if (score>group.score) {group.score=score;group.rows=[];}
      if (score===group.score) group.rows.push(fact);
    }
  }
  const conditionScenes=progress.flatMap(p=>p.rows);
  const physicalScenes=bridges.filter(f=>!conditionScenes.includes(f));
  const extra=[...new Set([...bridges,...conditionScenes])];
  if (extra.length>5) return partial(base);
  const hasScene=(!asksConditions||progress.every(p=>p.rows.length>0))&&
    (!asksItems||bridges.length===1||physicalScenes.length===1&&asksConditions);
  const received=!asksDelivery||sides.some(s=>closed.get(s.fact)?.task?.status==='completed');
  return {facts:[...new Set([...base,...extra])],certain:hasScene&&received};
}
