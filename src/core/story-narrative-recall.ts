import type { StoryFact } from './story-update';
import type { StoryRoleReader } from './story-source-roles';
import type { EpisodeReader } from './story-episodes';
import { storyRecallLexicon, storyTaskObject } from './story-natural-recall';
import { isUnsafeStoryActionWord } from './story-action-balance';
import { storyActionSequence } from './story-sequence-priority';
import { isVerifiedEmptyDiscussion } from './story-repeat-selection';
import { topicTerm, topicWindow } from './story-topic-terms';
import { unresolvedStoryIntent } from './story-unresolved-intent';

// Intent only. These words never prove that an action happened or was allowed.
const action = /^(?:открываю|открою|открыл[аи]?|закрываю|закрою|беру|возьму|взял[аи]?|достаю|кладу|осматриваю|осмотрю|проверяю|проверю|читаю|прочитаю|чиню|починю|починил[аи]?|двигаю|подключаю|отключаю|open|opening|opened|close|closing|take|taking|took|inspect|inspecting|examine|examining|check|checking|read|reading|repair|repairing|repaired|fix|move|moving|connect|disconnect)$/u;
const contains = (clauses: string[][], terms: string[]) => clauses.some(words => words.some((_, at) => terms.every((term, i) => words[at + i] === term)));
export const NARRATIVE_RECALL_GUIDE = '<deeprole_reference_guard>These records are literal topic candidates, NOT a complete interpretation of the user\'s action sequence. A small query-only vocabulary may also retrieve related descriptions; that is NOT object identity. For an unresolved operative reference, recent named topics or a bounded set of open-duty candidates may be included WITHOUT a semantic match. Do not treat those candidates as the requested object. An available source may have unknown frozen roles; do not assign an owner or reinterpret its historical roles. Every owner, task, condition, denial, belief and status stays separate. A question, quotation, user action, future plan, conditional, negation or asserted completion is NOT played evidence, permission, possession or fulfillment. A bare or personal object reference may fit several objects; do not select an owner or merge them by a shared noun. Extra clauses and unknown objects may remain unresolved. Use source quotes, preserve uncertainty, and do not erase accepted conditions because the draft asks for it.</deeprole_reference_guard>';

/** Source-backed topical supplementation, deliberately separate from the strict
 * action parser. It retrieves known evidence even if another clause is unknown;
 * it never strips a clause to certify the remaining action as fully understood. */
export function narrativeRecallFacts(facts: StoryFact[], query: string, names: string[], roles?: StoryRoleReader, episodes?: EpisodeReader, recentMessages: string[] = []) {
  if (!query.trim()) return;
  // Questions about what was said need the discussion itself, including empty
  // repetitions. Leave that specialised history lane intact.
  const speechInquiry = /(?:что .{0,120}(?:сказал|говорил)|what did .{0,120} say|кто (?:сказал|говорил|обсуждал)|(?:где|когда).*(?:говорили|обсуждали)|who (?:said|discussed)|(?:where|when).*discuss)/iu.test(query);
  if (speechInquiry) return;
  const lex = storyRecallLexicon(names), masked = lex.mask(query);
  const intent = unresolvedStoryIntent(query, masked);
  const priorIntent = masked.split(' ').filter(word => action.test(word)).length >= 2;
  const incomplete = (reason: 'query' | 'source' | 'capacity') => ({ primary: [] as StoryFact[], repeats: new Set<StoryFact>(), reason });
  if (query.length > 4000) return priorIntent || intent.operative ? incomplete('query') : undefined;
  if (!roles || !episodes) return priorIntent || intent.operative ? incomplete('source') : undefined;
  const requested = lex.clauses(query), cache = new WeakMap<StoryFact, string[][]>(), texts = new WeakMap<StoryFact, string[][]>(), availability = new WeakMap<StoryFact, boolean>();
  // Only supplement an operative pronoun reference. Recent prose never replaces
  // the user's draft, supplies roles, proves an action or crosses field barriers.
  const recent = intent.operative && intent.reference ? recentMessages.slice(-2).filter(text => text.length <= 2000).flatMap(text => lex.clauses(text)) : [];
  const contentTerms = (terms: string[]) => terms.filter(term => term !== '__deeprole_gap__');
  const related = (clauses: string[][], terms: string[]) => topicWindow(clauses, contentTerms(terms)) || clauses.some(words => words.some(word => topicTerm(word) === topicTerm(contentTerms(terms).at(-1)!)));
  const textFields = (f: StoryFact) => { let value = texts.get(f); if (!value) { value = lex.clauses(f.text); texts.set(f, value); } return value; };
  const fields = (f: StoryFact) => { let value = cache.get(f); if (!value) { value = [...textFields(f), ...lex.clauses(f.task?.title ?? '')]; cache.set(f, value); } return value; };
  const available = (f: StoryFact) => { if (!availability.has(f)) availability.set(f, !!episodes.read(f) && !Object.values(roles.read(f) ?? {}).some(person => person.unavailable)); return availability.get(f)!; };
  const labels = new Map<string, string[]>();
  let expanded = false, blockedSource = false, directLabel = false, contextualLabel = false;
  const admit = (fact: StoryFact, fallback = false) => {
    if (!fact.task) return;
    const bare = lex.mask(fact.task.title).split(' ');
    const parsed = storyTaskObject(fact.task.title, names)?.terms;
    const literal = bare.length >= 2 && bare.length <= 6 && bare.every(word => /^\p{L}+$/u.test(word) && !isUnsafeStoryActionWord(word)) ? lex.clauses(fact.task.title)[0] : undefined;
    // A noun starting with an action stem is still a literal multiword title.
    const terms = parsed && contentTerms(parsed).length >= 2 ? parsed : literal;
    if (!terms || terms.filter(term => term !== '__deeprole_gap__').length < 2 || terms.some(t => t.startsWith('__deeprole_') && t !== '__deeprole_gap__')) return;
    // Bound the related candidate set, not every task in a large library.
    // An unrelated greeting must not acquire a capacity warning. This also
    // avoids re-tokenizing every unrelated source for each stored task title.
    const direct = related(requested, terms), contextual = recent.length > 0 && related(recent, terms);
    if (!fallback && !direct && !contextual) return;
    const key = terms.join(' ');
    // Exact episode proof establishes availability. Frozen unknown roles stay
    // unknown; they must not erase a recorded cancellation/replacement group.
    if (labels.has(key)) return;
    // Neither a metadata-only title nor an unrelated quote may invent a label.
    if (!contains(textFields(fact), terms) || !contains(lex.clauses(fact.quote), terms)) return;
    if (roles.status?.(fact) === undefined || !available(fact)) { blockedSource = true; return; }
    const witnesses = facts.filter(other => other !== fact && contains(textFields(other), terms));
    if (!witnesses.length) return;
    if (!witnesses.some(available)) { blockedSource = true; return; }
    labels.set(key, terms);
    // A shortened shared noun does not resolve every clause of a paraphrase.
    directLabel ||= topicWindow(requested, contentTerms(terms));
    contextualLabel ||= topicWindow(recent, contentTerms(terms));
    expanded ||= fallback || !direct && contextual || roles.status?.(fact) === 'unknown';
  };
  for (const fact of facts) {
    admit(fact);
    if (labels.size > 32) return incomplete('capacity');
  }
  // A semantic paraphrase is not resolved by a growing object dictionary. If no
  // literal/recent topic matched, reserve bounded source-backed pending duties
  // as candidates. Completed side tasks never displace unfinished obligations.
  const fallback = !directLabel && intent.broad && (!contextualLabel || intent.statusQuestion);
  if (fallback) for (const fact of facts) {
    if (fact.task?.status === 'open' || fact.task?.status === 'cancelled' || intent.closedQuestion && fact.task?.status === 'completed') admit(fact, true);
    if (labels.size > 32) return incomplete('capacity');
  }
  let generic = false;
  const matches: Array<(fact: StoryFact) => boolean> = [];
  for (const terms of labels.values()) {
    const full = topicWindow(requested, contentTerms(terms)), head = contentTerms(terms).at(-1)!;
    // A shortened noun supplies candidates only, never one physical identity.
    const bare = !full && requested.some(words => words.some(word => topicTerm(word) === topicTerm(head)));
    const contextual = related(recent, terms);
    if (!full && !bare && !contextual && !fallback) continue;
    generic ||= bare;
    const contrast = /(?:^| )(?:как|значит|поэтому|like|so|therefore|same|too)(?: |$)/iu.test(masked);
    matches.push(f => contains(fields(f), bare ? [head] : terms) || contrast && contains(textFields(f), [head]));
  }
  // Preserve the strict supported path and its existing comparison contracts.
  const strict = storyActionSequence(query, names);
  if (strict && !generic && !expanded && strict.matches.every(match => facts.some(match))) return;
  if (!matches.length) return priorIntent || intent.operative ? incomplete(blockedSource ? 'source' : 'query') : undefined;
  const matching = facts.filter(f => matches.some(match => match(f)));
  if (matching.some(f => !available(f))) return incomplete('source');
  const repeats = new Set(matching.filter(f => isVerifiedEmptyDiscussion(f, roles, episodes)));
  return { primary: matching.filter(f => !repeats.has(f)), repeats, reason: 'query' as const };
}
