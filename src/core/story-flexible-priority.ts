import type { StoryFact } from './story-update';
import type { StoryRoleReader } from './story-source-roles';
import type { EpisodeReader } from './story-episodes';
import type { storyContentRelevance } from './story-content-relevance';
import type { storyActionBalance } from './story-action-balance';
import { isExplicitDiscussionRepeat } from './story-discussion-priority';
import { normalizeText } from './text';

type Admission = ReturnType<typeof storyContentRelevance>['admission'];
type Action = ReturnType<typeof storyActionBalance>;
const inquiry = /(?:^| )(?:said|say|says|talk|talked|conversation|conversations|discussion|discussions|recalled|remember|who|where|when|сказал|сказала|сказали|разговор|разговора|разговоре|разговоры|обсуждение|обсуждения|вспоминали|помнишь|кто|где|когда)(?: |$)/u;
// The head must remain a discussion, not a mixed condition/action/code. This
// finite guard does not claim arbitrary-language contradiction detection.
const mixed = /(?:\b(?:and|but|if|not|will|would|learned|learnt|changed|discovered|promised|promise|agreed|allowed|opened|handed|returned|said|told)\b|(?:^| )(?:и|но|если|не|бы|что|узнали|узнала|узнал|изменили|изменился|сообщили|обещали|обещаю|согласились|разрешили|открыли|передали|вернули|сказали)(?: |$))/u;
const absence = [
  /^(?:ничего нового не узнали|новых фактов не появилось|we learned nothing new|no new facts emerged)$/u,
  /^(?:ничего не сделали|новых действий не было|we did nothing|no new actions occurred)$/u,
  /^(?:новых обещаний не дали|новых обязательств не возникло|we made no new promises|no new commitments arose)$/u,
];

/** Broader finite phrasing/separators/order, still a WHOLE exact frozen quote.
 * A mere repeated conversation or "nothing changed" is not enough. All three
 * absence categories must be stated; no deletion, truth or fulfillment claim. */
export function isFlexibleDiscussionRepeat(fact: StoryFact, roles?: StoryRoleReader, episodes?: EpisodeReader): boolean {
  if (isExplicitDiscussionRepeat(fact, roles, episodes)) return true;
  if (fact.kind !== 'event' || fact.task || fact.claim || fact.text !== fact.quote || !episodes?.read(fact) || roles?.status?.(fact) !== 'bound') return false;
  const attribution = roles.read(fact);
  if (!attribution?.speaker || attribution.speaker.unavailable || Object.keys(attribution).some(key => key !== 'speaker')) return false;
  const source = fact.quote.trim(), colon = source.indexOf(':');
  if (colon < 1 || !/(?: said| сказал| сказала| сказали)$/u.test(normalizeText(source.slice(0, colon)))) return false;
  const quote = source.slice(colon + 1).trim().replace(/([»”"])\.$/u, '$1');
  const close = quote.startsWith('«') ? '»' : quote.startsWith('“') ? '”' : quote.startsWith('"') ? '"' : undefined;
  if (!close || !quote.endsWith(close)) return false;
  const body = quote.slice(1, -1).normalize('NFKC').toLocaleLowerCase().replaceAll('ё', 'е');
  if (body.length > 900 || /[\p{N}<>{}\[\]`«»“”"\r\n]/u.test(body)) return false;
  const boundary = /[.;—]/u.exec(body);
  if (!boundary) return false;
  const head = body.slice(0, boundary.index).trim(), tail = body.slice(boundary.index + 1).trim().replace(/\.$/u, '');
  const ru = /^мы (?:опять говорили про|еще раз обсудили|вернулись к разговору о|вновь вспоминали) (.+)$/u.exec(head);
  const en = /^we (?:(?:talked about (.+) again( .+)?)|(?:went over (.+) once more( .+)?)|(?:returned to our discussion of (.+))|(?:revisited our discussion of (.+)))$/u.exec(head);
  const subject = ru?.[1] ?? en?.slice(1).filter(Boolean).join(' ');
  if (!subject || /[:,?!]/u.test(head) || mixed.test(subject)) return false;
  if (/^(?:новых сведений, действий и обязательств не появилось|no new information, actions or commitments were added)$/u.test(tail)) return true;
  const clauses = tail.split(/[.;]\s*/u);
  // No duplicates, extra clause or single "nothing new" can stand in for a
  // promise/action check. Permutations do not change the original source.
  return clauses.length === 3 && absence.every(pattern => clauses.filter(clause => pattern.test(clause)).length === 1);
}

/** Existing query/action parsers supply the literal match. No synthetic owner,
 * pronoun resolution, compound-action guess or evidence from keys/values. */
export function flexiblePriorityFacts(facts: StoryFact[], query: string, admission: Admission, action: Action, roles?: StoryRoleReader, episodes?: EpisodeReader) {
  if (!roles || !episodes || roles.question || inquiry.test(normalizeText(query))) return;
  const filter = admission ?? (action?.kind === 'object' ? {
    matches: action.matches,
    covers: (selected: StoryFact[]) => selected.some(action.matches),
  } : undefined);
  if (!filter) return;
  const matching = facts.filter(filter.matches);
  if (matching.some(f => !episodes.read(f) || Object.values(roles.read(f) ?? {}).some(person => person.unavailable))) return;
  const repeats = new Set(matching.filter(f => isFlexibleDiscussionRepeat(f, roles, episodes)));
  if (!repeats.size) return;
  const primary = matching.filter(f => !repeats.has(f));
  if (!primary.length || primary.length > 8 || !filter.covers(primary)) return;
  return { primary, repeats, covers: filter.covers };
}
