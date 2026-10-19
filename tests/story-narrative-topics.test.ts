import { expect, it } from 'vitest';
import { compileGameContext, type GameContextInput } from '../src/core/game-context';
import { memoryCoverageIssue, type GameMemoryCoverage } from '../src/core/game-memory-coverage';
import { decodeStoryMemory } from '../src/core/story-memory-transport';
import { createEpisodeReader } from '../src/core/story-episodes';
import { createStoryRoleReader } from '../src/core/story-source-roles';
import { storedRoleReader } from '../src/core/story-role-binding';
import { isVerifiedEmptyDiscussion } from '../src/core/story-repeat-selection';
import { topicWindow } from '../src/core/story-topic-terms';
import { narrativeRecallFacts } from '../src/core/story-narrative-recall';
import type { StoryFact } from '../src/core/story-update';
import { longHoldout, longHoldoutWorld } from './fixtures/story-rp340-world';

function fixture(locale: string, count = 0) {
 const f = longHoldoutWorld(longHoldout.worlds.find(w => w.locale === locale)!, count);
 const input: GameContextInput = { draft: '', recentMessages: [], entries: [], books: [], entities: f.base.entities, worlds: [f.base.world], activeBookId: null, scene: { worldId: f.base.world.id, bookId: null, focusIds: [] }, settings: { contextBudget: 6000, relevanceThreshold: 6 }, story: { world: f.base.world, chat: f.base.binding.chatId, branch: 'rp341', facts: f.facts, sheetsEnabled: false } };
 return { f, input };
}
const hints = (text: string) => { const block = text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0]; return block ? decodeStoryMemory(JSON.parse(block.split('\n')[1]!)) : []; };
for (const locale of ['ru', 'en']) {
 for (const id of ['partial-condition', 'actor', 'quotation', 'synonym', 'short-reference']) it(`${locale}: ${id} keeps source groups and warns without changing canon`, () => {
  const { f, input } = fixture(locale);
  const query = f.gold.queries.find(q => q.id === id)!; input.draft = query.draft;
  const before = structuredClone(input); let coverage: GameMemoryCoverage | undefined;
  const out = compileGameContext(input, {}, c => { coverage = c; });
  const selected = hints(out.text);
  for (const i of query.wanted) {
   const fact = f.facts[i]!, hint = selected.find(h => h.text === fact.text);
   expect(hint).toBeDefined(); expect(hint?.task).toEqual(fact.task); expect(hint?.claim).toEqual(fact.claim);
   expect(hint?.sourceQuote ?? hint?.text).toBe(fact.quote); expect(hint?.episodeSource?.revisionId).toBe(f.sources[i]);
   expect(hint?.sourceRoles ?? {}).toEqual(f.seeds[i]!.binding.roles);
  }
  expect(memoryCoverageIssue(coverage, out.report)?.kind).toBe('incomplete');
  expect(out.text).toContain('NOT object identity'); expect(input).toEqual(before);
 });
 it(`${locale}: direct attributed empty discussions use the exact finite grammar`, () => {
  const { f } = fixture(locale, 3), fact = f.facts[18]!;
  const roles = createStoryRoleReader({ worldId: f.base.world.id, entities: f.base.entities }, '', storedRoleReader(f.seeds, f.base.entities, f.base.world.id, {}, true));
  const episodes = createEpisodeReader(f.seeds, f.episodeSources);
  expect(isVerifiedEmptyDiscussion(fact, roles, episodes)).toBe(true);
  for (const changed of [ { ...fact, text: fact.text + ' New fact.' }, { ...fact, claim: { key: 'new', value: 'yes', scope: 'state' as const, lifetime: 'persistent' as const } } ]) expect(isVerifiedEmptyDiscussion(changed, roles, episodes)).toBe(false);
  expect(isVerifiedEmptyDiscussion(fact, roles)).toBe(false);
  expect(isVerifiedEmptyDiscussion(fact, undefined, episodes)).toBe(false);
  // Independently vary the grammar with an available exact source/speaker.
  // These mocks isolate grammar rejection from stale-quote rejection above.
  const speaker = roles.read(fact)!.speaker!;
  const exactRoles = { ...roles, status: () => 'bound' as const, read: () => ({ speaker }) };
  const exactEpisode = { read: () => ({ revisionId: 'exact-source', episode: 0, period: 'earlier-turn' as const }), position: () => 1 };
  const replacements = locale === 'ru'
   ? [['новых сведений нет', 'узнали новое условие'], ['действий и обещаний не было', 'действие уже выполнено'], ['не было', 'не было; разрешение отозвано'], ['S0000', '5721']]
   : [['no new information', 'we learned a condition'], ['actions or promises', 'permission revoked'], ['promises.', 'promises; but allowed now.'], ['S0000', '5721']];
  for (const [from, to] of replacements) {
   const text = fact.text.replace(from!, to!); expect(text).not.toBe(fact.text);
   expect(isVerifiedEmptyDiscussion({ ...fact, text, quote: text }, exactRoles, exactEpisode)).toBe(false);
  }
 });
 for (const flag of ['contextualRecall', 'referenceRecall', 'referenceBundle', 'contentRelevance', 'topicAdmission', 'actionBalance', 'compoundActionBalance', 'sequencePriority', 'flexiblePriority', 'discussionPriority', 'budgetPriority'] as const) it(`${locale}: topic recall respects ${flag} opt-out`, () => {
  const { f, input } = fixture(locale); input.draft = f.gold.queries.find(q => q.id === 'partial-condition')!.draft;
  expect(compileGameContext(input, { [flag]: false }).text).not.toContain('NOT object identity');
 });
}
it('query vocabulary does not join tokens across a name or clause barrier', () => {
 expect(topicWindow([['pump', '__deeprole_name__', 'spring']], ['spring', 'pump'])).toBe(false);
 expect(topicWindow([['pump'], ['spring']], ['spring', 'pump'])).toBe(false);
 // Query-only candidate window can bridge a preposition, never a known name.
 expect(topicWindow([['pump', '__deeprole_gap__', 'spring']], ['spring', 'pump'])).toBe(true);
 expect(topicWindow([['pump', 'spring']], ['spring', 'pump'])).toBe(true);
});
it('label capacity applies to related candidates; unrelated dialogue stays quiet', () => {
 const labels = Array.from({ length: 40 }, (_, i) => `sealed ticket ${String.fromCharCode(97 + Math.floor(i / 26), 97 + i % 26)}`);
 const facts: StoryFact[] = labels.flatMap((title, i) => [
  { kind: 'promise', text: `Ana promised ${title}.`, quote: `Ana promised ${title}.`, task: { key: `duty-${i}`, title, status: 'open' } },
  { kind: 'event', text: `${title}: permission is pending.`, quote: `${title}: permission is pending.` },
 ]);
 const roles = { question: undefined, score: () => 0, status: () => 'bound' as const, read: () => ({}) };
 const episodes = { read: () => ({ revisionId: 'exact', episode: 0, period: 'earlier-turn' as const }), position: () => 1 };
 expect(narrativeRecallFacts(facts, 'Good morning.', ['Ana'], roles, episodes)).toBeUndefined();
 expect(narrativeRecallFacts(facts, labels.join('; '), ['Ana'], roles, episodes)).toMatchObject({ reason: 'capacity', primary: [] });
});
