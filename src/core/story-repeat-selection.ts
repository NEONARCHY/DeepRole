import type { StoryFact } from './story-update';
import type { StoryRoleReader } from './story-source-roles';
import type { EpisodeReader } from './story-episodes';
import type { BudgetTopicFilter } from './story-budget-priority';
import { normalizeText } from './text';

const absence=[
  /^(?:новых сведений не появилось|ничего нового не выяснили|no new information emerged|we discovered nothing new)$/u,
  /^(?:ничего не предприняли|действий не совершали|no actions were taken|we took no action)$/u,
  /^(?:ничего не обещали|обязательств не добавили|no promises were made|we made no commitments)$/u,
];
const mixed=/(?:\b(?:and|but|if|not|will|would|learned|changed|discovered|promised|allowed|except|only|said|told|is|are|was|were|has|have|can|must|because|after|before|granted|unlocked)\b|(?:^| )(?:и|но|если|не|бы|что|узнали|изменили|сообщили|обещали|разрешили|кроме|только|сказали|после|до|теперь|нужно|можно|нельзя|отозван|открыт|разрешен)(?: |$))/u;
const inquiry=/(?:^| )(?:who|whose|where|when|how many|said|say|says|told|talk\p{L}*|discuss\p{L}*|conversation\p{L}*|recall\p{L}*|кто|чей|чья|чье|чьи|где|когда|сколько|сказ\p{L}*|говор\p{L}*|обсуж\p{L}*|разговор\p{L}*|вспомин\p{L}*)(?: |$)/u;

/** A whole multiword literal question may be common to every stored source.
 * Unlike frequency weighting this needs no unrelated artificial document to
 * distinguish it. No stemming, quote-only evidence, pronouns or owner guessing. */
export function repeatSelectionTopic(query:string,names:string[]):BudgetTopicFilter|undefined {
  if(query.length>600||!/^[\p{L} ]+[?.]?$/u.test(query.trim()))return;
  const topic=/^(?:what do we know about (?:the )?|что известно о (?:предмете )?)(.+)$/u.exec(normalizeText(query))?.[1];
  if(!topic||topic.length<8||topic.length>120||topic.split(' ').length<2||mixed.test(topic)||inquiry.test(topic)||/(?:^| )(?:it|this|that|his|her|their|ее|его|это|этом|том|моем|твоем)(?: |$)/u.test(topic)||names.some(n=>(' '+topic+' ').includes(' '+normalizeText(n)+' ')))return;
  const matches=(fact:StoryFact)=>(' '+normalizeText(fact.text)+' ').includes(' '+topic+' ')||(' '+normalizeText(fact.task?.title??'')+' ').includes(' '+topic+' ');
  return {matches,covers:chosen=>chosen.some(matches)};
}

/** A finite literal grammar, NOT a semantic "nothing changed" classifier.
 * A whole frozen available speaker explicitly denies ALL three change kinds.
 * This excludes tasks, claims, summaries, unknown roles and new disclosures.
 * Original memory is never edited or deleted, even for a qualified repeat. */
export function isVerifiedEmptyDiscussion(fact:StoryFact,roles?:StoryRoleReader,episodes?:EpisodeReader):boolean {
  if(fact.kind!=='event'||fact.task||fact.claim||fact.text!==fact.quote||roles?.status?.(fact)!=='bound'||!episodes?.read(fact))return false;
  const attribution=roles.read(fact);
  if(!attribution?.speaker||attribution.speaker.unavailable||Object.keys(attribution).some(k=>k!=='speaker'))return false;
  const source=fact.quote.trim(),colon=source.indexOf(':');
  if(colon<1||!/(?: said| сказал| сказала| сказали)$/u.test(normalizeText(source.slice(0,colon))))return false;
  const quote=source.slice(colon+1).trim().replace(/([»”"])\.$/u,'$1');
  const close=quote.startsWith('«')?'»':quote.startsWith('“')?'”':quote.startsWith('"')?'"':undefined;
  if(!close||!quote.endsWith(close))return false;
  const body=quote.slice(1,-1).normalize('NFKC').toLocaleLowerCase().replaceAll('ё','е');
  if(body.length>900||/[\p{N}<>{}\[\]`«»“”"\r\n]/u.test(body))return false;
  const parts=body.replace(/\.$/u,'').split(/[.;]\s*/u);
  if(parts.length!==4)return false;
  const head=parts.shift()!,topic=/^мы снова говорили о (.+)$/u.exec(head)?.[1]??/^we discussed (.+) again( .+)?$/u.exec(head)?.slice(1).filter(Boolean).join(' ');
  if(!topic||/[:,?!—]/u.test(head)||mixed.test(topic))return false;
  return absence.every(pattern=>parts.filter(p=>pattern.test(p)).length===1);
}

/** Request-local whole-topic reservation. Every non-repeat source plus every
 * previously selected substantive source is retained by the compiler. If the
 * entire bundle cannot fit, exact prior selection/report is returned instead. */
export function repeatSelectionFacts(facts:StoryFact[],query:string,filter:BudgetTopicFilter|undefined,roles?:StoryRoleReader,episodes?:EpisodeReader){
  if(!filter||!roles||!episodes||roles.question||inquiry.test(normalizeText(query)))return;
  const matching=facts.filter(filter.matches);
  if(matching.some(f=>!episodes.read(f)||Object.values(roles.read(f)??{}).some(p=>p.unavailable)))return;
  const repeats=new Set(matching.filter(f=>isVerifiedEmptyDiscussion(f,roles,episodes)));
  if(!repeats.size)return;
  const primary=matching.filter(f=>!repeats.has(f));
  if(!primary.length||!filter.covers(primary))return;
  return {primary,repeats};
}
