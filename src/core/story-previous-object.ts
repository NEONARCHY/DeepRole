import type { EpisodeReader } from './story-episodes';
import { storyRecallLexicon } from './story-natural-recall';
import type { StoryRoleReader } from './story-source-roles';
import type { StoryFact } from './story-update';
import { normalizeText, storyObjectTokens, tokenize } from './text';

// A request in the preceding turn is a search cue. Only accepted scene
// records can supply a location, a condition, or a change in game state.
const location = /(?:^| )(?:где|куда|where)(?: |$)/u;
const relative = /(?:^| )(?:(?:тот|ту|та|то|тех|те)(?: сам\p{L}*)? (?:за )?(?:котор\p{L}*|что) (?:он|она|они)|(?:the|that) (?:one|ones) (?:that )?(?:he|she|they))(?: |$)/u;
const sought = /(?:^| )(?:приш[еёл]\p{L}*|приходи\p{L}*|просил\p{L}*|попросил\p{L}*|хотел\p{L}*|искал\p{L}*|came|asked|wanted|requested|sought|looking)(?: |$)/u;
const request = /(?:^| )(?:приш(?:ел|ла|ли)(?: только)? за|(?:по)?просил[аи]?|хоч(?:ет|у) (?:забрать|получить)|забирает|ищет|came (?:only )?(?:for|to (?:collect|get|pick up))|asked (?:only )?for|requested|wants? to (?:collect|get|pick up)|(?:is|was) looking for) (.+)$/u;
const uncertain = /(?:^| )(?:не|ни|якобы|возможно|наверное|может быть|кажется|дума\p{L}*|если|слух\p{L}*|будто|not|never|(?:didn|doesn|don|hadn|hasn|wasn|isn|weren|wouldn|couldn|shouldn) t|maybe|perhaps|possibly|if|might|thinks?|believes?|supposedly|rumou?rs?)(?: |$)/u;
const undecided = /(?:не выбрал|не решил|не уточнил|не назвал|неизвестно|дв[ае] |either |both |two |not chosen|not decided|didn t choose|which one)/u;
const speculation = /(?:^| )(?:якобы|возможно|наверное|может быть|кажется|если|слух\p{L}*|будто|maybe|perhaps|possibly|if|supposedly|rumou?rs?|might)(?: |$)/u;
const framing = new Set(tokenize('для только именно сам этот эту тот only just very one please сегодня today после перед когда пока уже потом обещал обещала promised promises once until after before'));
const place = /(?:^| )(?:где|леж\p{L}*|хран\p{L}*|находится|остал\p{L}*|остав\p{L}*|перен[её]\p{L}*|перелож\p{L}*|полож\p{L}*|постав\p{L}*|запер\p{L}*|спрят\p{L}*|убра\p{L}*|moved|put|placed|kept|stored|lies|rests|sits|left|locked|hidden|stowed|inside|underneath)(?: |$)/u;
const unknownPlace = /(?:^| )(?:пропал\p{L}*|потерян\p{L}*|местонахождение неизвестно|потеряли|missing|lost|whereabouts unknown|location unknown)(?: |$)/u;
const maxSources = 16;
export const PREVIOUS_OBJECT_GUIDE = '<deeprole_reference_guard>The preceding turn is a search cue, not evidence of ownership or collection. Use the recorded scene order for location and conditions. Preserve who knows a secret and distinguish a request from an actual handover.</deeprole_reference_guard>';
export const UNCERTAIN_PREVIOUS_OBJECT = '<deeprole_reference_guard>The evidence for this reference is incomplete. Keep possible objects separate. State only what the supplied scenes establish about their location and conditions. Do not guess which one was meant, who owns it or whether a handover took place.</deeprole_reference_guard>';

function locationQuestion(draft:string) {
  if(draft.length>360 || !/[?？]$/u.test(draft.trim()) || /[«»“”"<>\n]|[.!?]\s*\p{L}/u.test(draft))return false;
  const words=normalizeText(draft);
  const followup=words.match(/ (?:and|и) (.+)$/u)?.[1];
  if(followup&&!/(?:ждал|требова|услови|ожида|waiting|wait for|required|condition)/u.test(followup))return false;
  if(location.test(words)&&relative.test(words)&&sought.test(words))return true;
  // Singular English "it" and a Russian verb of placing explicitly ask
  // about a thing. A bare "где она?" may instead refer to a character.
  return /^(?:(?:а|так|тогда|so|and) )?(?:where is it(?: now)?|where did (?:they|you|we) (?:put|leave|store) it|куда (?:ее|его) (?:убрали|положили|переложили)|где (?:его|ее) (?:оставили|хранят))$/u.test(words);
}

// Local adjectival cases keep the rest of the retrieval/index vocabulary stable.
function objectTerms(masked:string) {
  return storyObjectTokens(masked).filter(t=>!framing.has(t));
}
const splitClauses=(text:string)=>text.split(/[.!?？;,\n]+/u);
const hasAll=(words:string[],label:string[])=>label.every(term=>words.includes(term));
const adjacent=(words:string[],label:string[])=>words.some((_,i)=>label.every((v,j)=>words[i+j]===v));

export function previousObjectEvidence(facts:StoryFact[],draft:string,recent:string[],names:string[],roles?:StoryRoleReader,episodes?:EpisodeReader) {
  if(!locationQuestion(draft))return;
  const unresolved=(items:StoryFact[]=[])=>({facts:items,certain:false});
  const latest=recent.at(-1)?.trim();
  if(!latest || latest.length>3000 || !episodes || !roles || /[<>]/u.test(latest))return unresolved();
  const scene=normalizeText(latest);
  if(uncertain.test(normalizeText(draft)) || speculation.test(scene) ||
    /(?:^| )(?:передум\p{L}*|поправил\p{L}*|ошиб\p{L}*|показалось|на самом деле|changed (?:her|his|their) mind|corrected|actually meant|mistaken)(?: |$)/u.test(scene))return unresolved();
  const lex=storyRecallLexicon(names);
  const tokens=(s:string)=>objectTerms(lex.mask(s));
  const labels:string[][]=[];
  let doubtful=false;
  for(const clause of splitClauses(latest)){
    const normalized=normalizeText(clause);
    const focus=request.exec(normalized)?.[1];
    if(!focus)continue;
    const quoted=/[«»“”"]/u.test(clause);
    if(uncertain.test(normalized)||/[?？]/u.test(latest)||quoted&&!/[«“"]\s*(?:я|i)\s/iu.test(clause)){doubtful=true;continue;}
    for(const part of focus.split(/ (?:либо|или|и|or|and) /u)){
      const label=tokens(part);
      if(label.length<2||label.length>8){doubtful=true;continue;}
      if(labels.some(other=>other.join(' ')===label.join(' ')))doubtful=true;
      else labels.push(label);
    }
  }
  const chooseAlternatives=!labels.length && undecided.test(scene) && !doubtful;
  if(!labels.length&&!chooseAlternatives)return unresolved();

  const clauses=(s:string)=>splitClauses(s).flatMap(part=>normalizeText(part).split(/ (?:и|или|рядом с|вместе с|возле|and|or|beside|next to|alongside|with) /u)).map(tokens);
  const rows=facts.filter(f=>f.kind!=='belief').map(fact=>{
    const text=clauses(fact.text);
    return {fact,text,quote:fact.text===fact.quote?text:clauses(fact.quote)};
  });
  type Row=typeof rows[number];
  const supported=(r:Row)=>!!episodes.read(r.fact) && roles.status?.(r.fact)!==undefined &&
    !Object.values(roles.read(r.fact)??{}).some(person=>person.unavailable);
  const mentions=(r:Row,match:(words:string[])=>boolean)=>r.text.some(match)&&r.quote.some(match);
  const duties=rows.filter(r=>r.fact.kind==='promise'||r.fact.kind==='plan'||r.fact.kind==='task'||r.fact.task);
  if(chooseAlternatives){
    const recentClauses=clauses(latest);
    for(const duty of duties){
      const label=tokens(duty.fact.task?.title??'');
      if(label.length>=2&&label.length<=8&&recentClauses.some(words=>adjacent(words,label))&&mentions(duty,w=>adjacent(w,label)))labels.push(label);
    }
    if(labels.length<2)return unresolved();
  }
  if(labels.length>4)return unresolved();
  const picked=new Set<Row>();
  let certain=labels.length===1&&!doubtful&&!undecided.test(scene);
  for(const label of labels){
    const containing=rows.filter(row=>mentions(row,w=>hasAll(w,label)));
    const literal=containing.filter(row=>mentions(row,w=>adjacent(w,label)));
    // A qualified phrase must be attested literally or independently
    // corroborated. Words scattered across separate assertions cannot bind it.
    const corroborated=new Set(containing.filter(supported).map(r=>episodes.read(r.fact)!.revisionId)).size>=2;
    const anchors=containing.filter(r=>duties.includes(r)&&(literal.includes(r)||corroborated));
    if(!literal.length && (!anchors.some(supported)||!corroborated)){certain=false;continue;}
    if(anchors.length>1)certain=false;
    const distinct=label.filter(term=>!duties.some(r=>!anchors.includes(r)&&mentions(r,w=>w.includes(term))));
    for(const r of literal.length?[...literal,...anchors]:containing)picked.add(r);
    // A destination can be absent from the later location report. Require a
    // distinctive focus term plus another word from the accepted promise.
    for(const anchor of anchors){
      if(mentions(anchor,w=>adjacent(w,label)))continue;
      const words=new Set(anchor.text.flat().filter(t=>anchor.quote.some(q=>q.includes(t))));
      for(const r of rows){
        if(r.fact.task||r.fact.kind!=='event')continue;
        if(mentions(r,clause=>distinct.some(t=>clause.includes(t)) && new Set(clause.filter(t=>words.has(t))).size>=2))picked.add(r);
      }
    }
  }
  if(!picked.size)return unresolved();
  const verified=[...picked].filter(supported).sort((a,b)=>episodes.position(a.fact)-episodes.position(b.fact));
  if(verified.length>maxSources){
    const obligations=verified.filter(r=>r.fact.kind==='promise'||r.fact.kind==='plan'||r.fact.task?.status==='open');
    if(obligations.length>maxSources)return unresolved();
    const keep=new Set(obligations);
    for(const row of verified.slice().reverse()){
      if(keep.size===maxSources)break;
      keep.add(row);
    }
    return unresolved(verified.filter(r=>keep.has(r)).map(r=>r.fact));
  }
  const positivePlace=(text:string)=>splitClauses(text).map(normalizeText).some(s=>place.test(s)&&!uncertain.test(s)&&!/(?:^| )(?:раньше|прежде|used to|formerly)(?: |$)/u.test(s));
  let located=false;
  for(const {fact} of verified){
    if(fact.kind!=='event'&&fact.kind!=='secret')continue;
    if(unknownPlace.test(normalizeText(fact.text))||unknownPlace.test(normalizeText(fact.quote))||
      (fact.claim?.status==='ended'&&place.test(normalizeText(fact.text))))located=false;
    else if(positivePlace(fact.text)&&positivePlace(fact.quote))located=true;
  }
  certain &&= verified.length===picked.size && located;
  return {facts:verified.map(r=>r.fact),certain};
}
