import type { EpisodeReader } from './story-episodes';
import { storyRecallLexicon } from './story-natural-recall';
import type { StoryRoleReader } from './story-source-roles';
import type { StoryFact } from './story-update';
import { normalizeText, storyObjectTokens } from './text';

const reported = /(?:^| )(?:считает|думает|уверен[аы]?|говорят|по словам|по слухам|наверное|слух\p{L}*|якобы|believes?|thinks?|is sure|according to|probably|rumou?rs?|heard)(?: |$)/u;
const check = /(?:^| )(?:проверя\p{L}*|проверю|свер\p{L}*|сравни\p{L}*|сопостав\p{L}*|check\p{L}*|verify|compare|cross check)(?: |$)/u;
const record = /(?:^| )(?:журнал\p{L}*|ведомост\p{L}*|реестр\p{L}*|отчет\p{L}*|накладн\p{L}*|расписк\p{L}*|акт[аеуы]?|log[s]?|ledger|register|manifest|records?|receipt|docket|report)(?: |$)/u;
const permission = /(?:^| )(?:разрешени\p{L}*|согласи\p{L}*|permission|permit|consent)(?: |$)/u;
const decision = /(?:^| )(?:отказ\p{L}*|запрет\p{L}*|разрешил[аи]?|отложил[аи]?|не разреш\p{L}*|refused|denied|forbade|permitted|allowed|put off|postponed)(?: |$)/u;
const tentative = /(?:^| )(?:планиру\p{L}*|предстои\p{L}*|предстоящ\p{L}*|предполож\p{L}*|готовит\p{L}*|слух\p{L}*|обещал[аи]?|ожида\p{L}*|считает|якобы|по словам|planned|plans|planning|preparing|upcoming|future|expects?|expected|scheduled|supposedly|allegedly|believes?|thinks?|rumou?rs?|promised)(?: |$)/u;
const noEntry=/(?:нет (?:сведений|записей|записи|подтверждения)|(?:строк\p{L}*|граф\p{L}*) .{0,40}пуст|запис\p{L}* .{0,25}не найден|со слов|no (?:entry|record|evidence|mention)|(?:line|entry) .{0,32}blank|according to|unconfirmed)/u;
const attests=/(?:^| )(?:подтверд\p{L}*|зафикс\p{L}*|отмечено|отметил[аи]?|указан\p{L}*|записан\p{L}*|зарегистрир\p{L}*|подпис\p{L}*|расписк\p{L}*|confirm\p{L}*|states?|recorded|records that|certif\p{L}*|signed|documented|shows?)(?: |$)/u;
const delay=/(?:^| )(?:отлож\p{L}*|задерж\p{L}*|postponed|put off|delayed)(?: |$)/u;
const retelling=/(?:^| )(?:говорит|сказал[аи]?|утвержда\p{L}*|пересказ\p{L}*|будто|said|says|claimed|claims|heard|told)(?: |$)/u;
const designator=/^(?:red|blue|green|black|white|yellow|grey|gray|upper|lower|eastern|western|northern|southern|красн|син|голуб|зелен|бел|черн|желт|сер|верхн|нижн|восточн|западн|северн|южн)$/u;
const filler=new Set(storyObjectTokens(normalizeText('уже ещё пока только также там этом всё после что она его была были говорится думаю думает уверен уверена считает словам probably already still only since thinks believes heard sure claim story account according got has had her him was were this that now they there all for any against about whole after until')));
export const HEARSAY_GUIDE='<deeprole_reference_guard>Compare the character’s attributed belief with the independent scene records below. Say what each source actually establishes. A missing entry, permission, refusal or preparation alone cannot prove that the reported event did or did not occur. Keep different objects, people and uses separate.</deeprole_reference_guard>';
export const UNCERTAIN_HEARSAY='<deeprole_reference_guard>The record is inconclusive for this reported event. Attribute the belief to its source, preserve the uncertainty, and continue the scene without turning a rumour or a plan into a confirmed event.</deeprole_reference_guard>';

export function hearsayEvidence(facts:StoryFact[],draft:string,names:string[],roles?:StoryRoleReader,episodes?:EpisodeReader){
  if(draft.length>2500)return;
  const query=normalizeText(draft);
  if(!reported.test(query)||!check.test(query)||!record.test(query))return;
  const unresolved=()=>({facts:[] as StoryFact[],certain:false});
  if(!roles||!episodes)return unresolved();
  const lex=storyRecallLexicon(names);
  const terms=(text:string)=>new Set(storyObjectTokens(lex.mask(text)).filter(w=>!filler.has(w)&&!check.test(w)&&!record.test(w)&&!reported.test(w)));
  const request=terms(draft);
  const rows=facts.map(fact=>{
    const words=terms(fact.text);
    if(fact.quote!==fact.text){
      const source=terms(fact.quote);
      for(const w of words)if(!source.has(w))words.delete(w);
    }
    return {fact,words};
  });
  type Row=typeof rows[number];
  const supported=({fact}:Row)=>!!episodes.read(fact)&&roles.status?.(fact)!==undefined&&
    !Object.values(roles.read(fact)??{}).some(p=>p.unavailable);
  const frequency=new Map<string,number>();
  for(const row of rows)for(const w of row.words)frequency.set(w,(frequency.get(w)??0)+1);
  const intersect=(a:Set<string>,b:Set<string>)=>[...a].filter(w=>b.has(w));
  const beliefs=rows.filter(r=>r.fact.kind==='belief');
  const attributed=beliefs.filter(({fact})=>{
    const owner=roles.read(fact)?.believer;
    return owner&&(' '+query+' ').includes(' '+normalizeText(owner.name)+' ');
  });
  const ranked=(attributed.length?attributed:beliefs).map(row=>{
    const hits=intersect(row.words,request);
    const conflictingLabel=[...request].some(w=>designator.test(w)&&!row.words.has(w))&&[...row.words].some(w=>designator.test(w)&&!request.has(w));
    const score=conflictingLabel?0:hits.reduce((s,w)=>s+Math.log1p(rows.length/(frequency.get(w)??1)),0);
    return {row,score};
  }).filter(h=>h.score>0).sort((a,b)=>b.score-a.score);
  const anchors=ranked.filter(h=>h.score===ranked[0]?.score).map(h=>h.row);
  if(anchors.length>4)return unresolved();
  const competing=beliefs.filter(r=>!anchors.includes(r));
  const picked=new Set(anchors);
  const documents=new Set<Row>();
  const asksPermission=permission.test(query);
  // A newly heard claim need not already be in memory. Its words can locate a
  // first-hand record, but cannot create a historical speaker binding.
  for(const topic of anchors.length?anchors.map(r=>r.words):[request]){
    for(const row of rows){
      if(row.fact.kind==='belief')continue;
      const hits=intersect(topic,row.words);
      const specific=hits.some(w=>!competing.some(other=>other.words.has(w)));
      if(!specific)continue;
      // A record for the red ferry cannot corroborate a claim about the blue
      // ferry merely because both vessels made the same journey.
      if([...topic].some(w=>request.has(w)&&designator.test(w)&&!row.words.has(w)))continue;
      const text=normalizeText(row.fact.text),quote=normalizeText(row.fact.quote);
      const ruling=decision.test(text)&&decision.test(quote);
      if(hits.length<2&&!(hits.length===1&&anchors.length===1&&asksPermission&&ruling))continue;
      picked.add(row);
      if(row.fact.kind!=='event'||!supported(row)||anchors.some(a=>a.fact.quote===row.fact.quote)||
        [text,quote].some(s=>tentative.test(s)||noEntry.test(s)||retelling.test(s)))continue;
      const directRecord=[text,quote].every(s=>record.test(s)&&attests.test(s));
      if(asksPermission?ruling:(directRecord||delay.test(text)&&delay.test(quote)))documents.add(row);
    }
  }
  const verified=[...picked].filter(supported).sort((a,b)=>episodes.position(b.fact)-episodes.position(a.fact));
  const limit=16;
  const chosen=[...new Set([...anchors.filter(supported),...verified.filter(r=>documents.has(r)),...verified])].slice(0,limit);
  return {facts:chosen.sort((a,b)=>episodes.position(a.fact)-episodes.position(b.fact)).map(r=>r.fact),
    certain:documents.size>0&&anchors.length<=1&&chosen.length===picked.size};
}
