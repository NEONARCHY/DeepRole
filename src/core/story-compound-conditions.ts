import { normalizeText, tokenize } from './text';
import { storyRecallLexicon } from './story-natural-recall';
import type { EpisodeReader } from './story-episodes';
import type { StoryRoleReader } from './story-source-roles';
import type { StoryFact } from './story-update';
import { storyFactIdentity } from './story-memory-lifecycle';

// Find evidence for a decision about several actions. A shared topic retrieves
// source rows. It cannot establish that two items, permissions or owners coincide.
const decision = /(?:^| )(?:can|allowed|permitted|wait|stop|conditions?|outstanding|можно|нельзя|услови\p{L}*|останов\p{L}*|подожд\p{L}*|придется)(?: |$)/u;
const question = /^(?:what|which|who|where|when|can|may|how|что|чего|кто|кому|где|когда|как|каки\p{L}*|на каких|можно)(?: |$)/u;
const separated = /[,;.!?\n]+|\s+(?:and then|then|afterwards|and i|затем|потом|после этого|и я)\s+/iu;
const rule = /(?:^| )(?:once|until|only|must|requires?|permission|consent|allowed|refus\p{L}*|denied|forbid\p{L}*|forbade|signed|complet\p{L}*|cancel\p{L}*|delayed|still|not|never|только|после|когда|пока|нельзя|согласи\p{L}*|разреш\p{L}*|отказ\p{L}*|запре[тщ]\p{L}*|подпис\p{L}*|задерж\p{L}*|отлож\p{L}*|заверш\p{L}*|отмен\p{L}*|не)(?: |$)/u;
const consequential = /(?:^| )(?:offer|give|release|hand|deliver|allow|publish|broadcast|lend|promise|help|предлага\p{L}*|выда\p{L}*|вруча\p{L}*|отда\p{L}*|переда\p{L}*|публику\p{L}*|помо(?:чь|га\p{L}*)|пуст\p{L}*)(?: |$)/u;
const framing = new Set(tokenize('each them their its his her about what where which while then only before after once now again behind into from that this can could should would has have was had did take open check look first next вместе теперь потом затем только каждый каждому своих своей пока после перед когда которые чтобы что можно беру открываю нахожу проверяю'));
const MAX_SOURCES = 16;
export const COMPOUND_CONDITION_GUIDE = '<deeprole_reference_guard>For each proposed action, use its own agreement and the latest played evidence about its conditions. A location, preparation or permission for one use does not authorize another use or prove a handover. Keep each source attribution and status. If a condition is unresolved, continue the scene with that uncertainty.</deeprole_reference_guard>';

function actionClauses(query:string) {
  if (query.length > 2000 || !/[?？]$/u.test(query.trim())) return;
  const parts = query.trim().slice(0,-1).split(/[.!?？;:\n]+/u);
  const last = normalizeText(parts.pop() ?? '');
  if (!question.test(last) || !decision.test(last)) return;
  const clauses = parts.flatMap(part=>part.split(separated)).map(s=>s.trim()).filter(Boolean);
  return clauses.length >= 2 && clauses.length <= 10 ? clauses : undefined;
}

export function compoundConditionEvidence(facts:StoryFact[], draft:string, names:string[], roles?:StoryRoleReader, episodes?:EpisodeReader, selected:StoryFact[] = []) {
  const clauses = actionClauses(draft);
  if (!clauses || !episodes || !roles || roles.question) return;
  const lex = storyRecallLexicon(names);
  const terms = (text:string) => new Set(tokenize(lex.mask(text)).filter(t=>/^\p{L}{3,}$/u.test(t) && !framing.has(t)));
  const requests = clauses.map(terms);
  const frequency = new Map<string, number>();
  const rows = facts.map(fact=>{
    // Shared terms must actually occur in the source. Never walk task keys,
    // profile aliases, or quotes that the accepted summary didn't assert.
    const words = terms(fact.text);
    if (fact.text !== fact.quote) {
      const quoted = terms(fact.quote);
      for (const word of words) if (!quoted.has(word)) words.delete(word);
    }
    for (const word of words) frequency.set(word,(frequency.get(word) ?? 0)+1);
    return {fact,words,position:episodes.position(fact),condition:!!fact.task || rule.test(normalizeText(fact.text))};
  });
  const weight = new Map([...frequency].map(([term,n])=>[term,Math.log1p(rows.length/n)]));
  const overlap = (a:Set<string>, b:Set<string>) => {
    let count=0, score=0;
    for (const word of a) if (b.has(word)) { count++; score+=weight.get(word) ?? 0; }
    return count >= 2 ? score : 0;
  };
  type Row = typeof rows[number];
  function ranked(words:Set<string>, candidates:Row[]) {
    return candidates.map(row=>({row,score:overlap(words,row.words)})).filter(hit=>hit.score>0)
      .sort((a,b)=>b.score-a.score || b.row.position-a.row.position);
  }
  const supported = (r:Row)=>!!episodes.read(r.fact) && roles.status?.(r.fact)!==undefined && !Object.values(roles.read(r.fact) ?? {}).some(p=>p.unavailable);
  const anchors = new Set<Row>();
  let groundedClauses = 0;
  let partial = false;
  const unresolved: Set<string>[] = [];
  for (const [index,request] of requests.entries()) {
    const hits = ranked(request,rows);
    if (!hits.length) {
      if (consequential.test(normalizeText(clauses[index]!))) unresolved.push(request);
      continue;
    }
    // A generic repeated phrase cannot elect a recent owner or crowd out
    // another action. Require a small, distinctive best match for this clause.
    const best = hits.filter(hit=>hit.score===hits[0]!.score);
    if (best.length>2 || best.some(hit=>!supported(hit.row))) { partial=true; continue; }
    if (best.some(hit=>!anchors.has(hit.row))) groundedClauses++;
    for (const hit of best) anchors.add(hit.row);
  }
  if (groundedClauses<2) return;
  const result = new Set(anchors);
  const contextual = rows.filter(row=>!anchors.has(row) && row.condition && row.fact.kind!=='belief');
  // Preserve equally strong alternatives at the boundary. If they make the
  // bundle too large, keep the original context and signal insufficient room.
  const strongest = (hits:ReturnType<typeof ranked>,limit:number) => hits.filter(hit=>hit.score >= (hits[limit-1]?.score ?? 0));
  for (const anchor of anchors) {
    for (const hit of strongest(ranked(anchor.words,contextual),4)) {
      if (supported(hit.row)) result.add(hit.row);
      else partial=true;
    }
  }
  // A currently selected open promise can carry the terms missing from the
  // player's shorthand. Follow its own stated topic to a later status report.
  const selectedTasks = new Set(selected.filter(f=>f.task?.status==='open').map(f=>f.task!.key));
  for (const duty of rows) {
    if (duty.fact.task?.status!=='open' || !selectedTasks.has(duty.fact.task.key) || !supported(duty)
      || ![...anchors].some(anchor=>overlap(duty.words,anchor.words)>0)) continue;
    const updates = rows.filter(row=>row.fact.kind==='event' && row.position>duty.position && row.condition
      && (!row.fact.task || row.fact.task.key===duty.fact.task!.key));
    for (const hit of strongest(ranked(duty.words,updates),2)) {
      if (supported(hit.row)) { result.add(duty); result.add(hit.row); }
      else partial=true;
    }
  }
  const mentionedTaskKeys = new Set<string>();
  if (result.size>MAX_SOURCES) return {facts:[] as StoryFact[],mentionedTaskKeys,partial:true,reason:'capacity' as const};
  if (result.size===anchors.size) {
    if (partial) return {facts:[] as StoryFact[],mentionedTaskKeys,partial,reason:'source' as const};
    return;
  }
  const retained = new Set(result);
  const selectedIds = new Set(selected.map(storyFactIdentity));
  for (const row of rows) if (selectedIds.has(storyFactIdentity(row.fact))) {
    if (row.fact.task) {
      if (!requests.some(request=>[...request].some(word=>row.words.has(word)))) continue;
      mentionedTaskKeys.add(row.fact.task.key);
    }
    if (supported(row)) retained.add(row);
  }
  partial ||= unresolved.some(request=>![...retained].some(row=>[...request].some(word=>row.words.has(word))));
  return {facts:[...result].sort((a,b)=>a.position-b.position).map(row=>row.fact),mentionedTaskKeys,partial,reason:'query' as const};
}
