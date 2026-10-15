import type { StoryFact } from './story-update';
import type { StoryRoleReader } from './story-source-roles';
import type { EpisodeReader } from './story-episodes';
import { storyActionBalance } from './story-action-balance';
import { storyCompoundAction } from './story-compound-action';
import { isFlexibleDiscussionRepeat } from './story-flexible-priority';
import { normalizeText } from './text';

export interface ActionSequence {
  matches: ((fact: StoryFact) => boolean)[];
  short: boolean;
}
/** Candidate retrieval only, NEVER evidence that an action happened. Reuse
 * both existing validators; don't split away a failed/conditional clause. */
export function storyActionSequence(query: string, names: Iterable<string> = []): ActionSequence | undefined {
  let raw = query.trim();
  if (!raw || raw.length > 480) return;
  const wrapped = /^(\*{1,2})([^*]+)\1$/u.exec(raw);
  if (wrapped) raw = wrapped[2]!.trim();
  // A missing subject is grammatical shorthand, not referent resolution.
  if (normalizeText(raw).split(' ').some(w => /^(?:this|that|these|those|это|эта|этот|эту|этой|этого|эти|этим|тот|та|ту|той|того|те|тем)$/u.test(w))) return;
  const known = [...names];
  const explicit = /^(?:я\s|i(?:['’]m| am)?\s)/iu.test(raw);
  for (const text of explicit ? [raw] : ['Я ' + raw, 'I ' + raw]) {
    if (!explicit) {
      const single = storyActionBalance(text, known);
      if (single?.kind === 'object') return { matches: [single.matches], short: true };
    }
    const compound = storyCompoundAction(text, known);
    if (compound && compound.every(c => !c.goal)) return { matches: compound.map(c => c.matchesObject), short: !explicit };
  }
}

/** All clauses must have substantive evidence, and ALL matching substantive
 * sources stay separate. Quotes/keys/state values cannot manufacture a match.
 * The compiler additionally retains prior non-repeat selection and full cost. */
export function sequencePriorityFacts(facts: StoryFact[], sequence: ActionSequence, roles?: StoryRoleReader, episodes?: EpisodeReader) {
  if (!roles || !episodes || roles.question) return;
  const matching = facts.filter(f => sequence.matches.some(matches => matches(f)));
  if (matching.some(f => !episodes.read(f) || Object.values(roles.read(f) ?? {}).some(person => person.unavailable))) return;
  const repeats = new Set(matching.filter(f => isFlexibleDiscussionRepeat(f, roles, episodes)));
  if (!repeats.size) return;
  const primary = matching.filter(f => !repeats.has(f));
  const covers = (selected: StoryFact[]) => sequence.matches.every(matches => selected.some(matches));
  if (!primary.length || primary.length > 8 || !covers(primary)) return;
  return { primary, repeats, covers };
}
