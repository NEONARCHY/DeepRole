import { expect, it } from 'vitest';
import { narrativeRecallFacts } from '../src/core/story-narrative-recall';
import { compileGameContext, addedContextTokens, type GameContextInput } from '../src/core/game-context';
import { memoryCoverageIssue, type GameMemoryCoverage } from '../src/core/game-memory-coverage';
import { decodeStoryMemory } from '../src/core/story-memory-transport';
import { longHoldout, longHoldoutWorld } from './fixtures/story-rp342-world';
import type { StoryFact } from '../src/core/story-update';
import { unresolvedStoryIntent } from '../src/core/story-unresolved-intent';

const readHints = (text: string) => { const block = text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0]; return block ? decodeStoryMemory(JSON.parse(block.split('\n')[1]!)) : []; };
for (const locale of ['ru', 'en']) for (const id of ['three-literal', 'four-narrative', 'free-equipment', 'free-paperwork', 'grounded-short', 'ungrounded-short', 'unknown-object', 'similar-object', 'cancelled-route']) it(`${locale}:${id}: exact saved evidence and visible caution`, () => {
  const gold = longHoldout.worlds.find(w => w.locale === locale)!, f = longHoldoutWorld(gold, 0), q = gold.queries.find(q => q.id === id)!;
  const input: GameContextInput = { draft: q.draft, recentMessages: q.recentMessages ?? [], entries: [], books: [], entities: f.base.entities, worlds: [f.base.world], activeBookId: null, scene: { worldId: f.base.world.id, bookId: null, focusIds: [] }, settings: { contextBudget: 6000, relevanceThreshold: 6 }, story: { world: f.base.world, chat: f.base.binding.chatId, branch: 'rp343', facts: f.facts, sheetsEnabled: false } };
  const before = structuredClone(input); let coverage: GameMemoryCoverage | undefined;
  const out = compileGameContext(input, {}, c => { coverage = c; }), hints = readHints(out.text);
  for (const index of q.wanted) expect(hints.some(h => h.text === f.important[index]!.text), `missing ${index}`).toBe(true);
  expect(memoryCoverageIssue(coverage, out.report)?.kind).toBe('incomplete');
  expect(out.text).toContain('NOT object identity');
  for (const h of hints) {
    const i = f.facts.findIndex(fact => fact.text === h.text); expect(i).toBeGreaterThanOrEqual(0);
    expect(h.kind).toBe(f.facts[i]!.kind); expect(h.task).toEqual(f.facts[i]!.task);
    expect(h.sourceQuote ?? h.text).toBe(f.facts[i]!.quote);
    expect(h.sourceRoles ?? {}).toEqual(f.seeds[i]!.binding.roles);
    expect(h.episodeSource?.revisionId).toBe(f.sources[i]);
  }
  expect(input).toEqual(before); expect(out.report.total).toBe(addedContextTokens(out.text)); expect(out.report.total).toBeLessThanOrEqual(6000);
});

const title = 'permit for departure';
const facts: StoryFact[] = [
  { kind: 'plan', text: `Ira assigned ${title} after an inspection.`, quote: `Ira assigned ${title} after an inspection.`, task: { key: 'new', title, status: 'open' } },
  { kind: 'event', text: `${title}: no inspection yet.`, quote: `${title}: no inspection yet.` },
];
const roles = { question: undefined, score: () => 0, status: () => 'unknown' as const, read: () => undefined };
const episodes = { read: () => ({ revisionId: 'proven-source', episode: 1, period: 'earlier-turn' as const }), position: () => 1 };
it('available exact sources with unknown roles remain unknown candidates', () => {
  const before = structuredClone(facts), out = narrativeRecallFacts(facts, 'Bring the permit for departure.', ['Ira'], roles, episodes);
  expect(out?.primary).toEqual(facts); expect(roles.read()).toBeUndefined(); expect(facts).toEqual(before);
});
it('unresolved operative request uses bounded open-duty candidates, never lexical identity', () => {
  expect(narrativeRecallFacts(facts, 'Can we return that thing now?', ['Ira'], roles, episodes)?.primary).toEqual(facts);
  expect(narrativeRecallFacts(facts, 'A pleasant morning by the stream.', ['Ira'], roles, episodes)).toBeUndefined();
});
it('source guards reject unavailable members and absent readers', () => {
  expect(narrativeRecallFacts(facts, 'Can we return that thing now?', ['Ira'], roles, { ...episodes, read: f => f === facts[1] ? undefined : episodes.read() })).toMatchObject({ primary: [], reason: 'source' });
  expect(narrativeRecallFacts(facts, 'Can we return that thing now?', ['Ira'], roles)).toMatchObject({ primary: [], reason: 'source' });
});
it('recent topic labels are candidates only for an operative reference', () => {
  // This integration case exercises recentMessages without replacing the draft.
  const gold = longHoldout.worlds[0]!, f = longHoldoutWorld(gold, 0);
  const input: GameContextInput = { draft: 'Good morning.', recentMessages: [gold.queries[0]!.draft], entries: [], books: [], entities: f.base.entities, worlds: [f.base.world], activeBookId: null, scene: { worldId: f.base.world.id, bookId: null, focusIds: [] }, settings: { contextBudget: 6000, relevanceThreshold: 6 }, story: { world: f.base.world, chat: f.base.binding.chatId, branch: 'rp343', facts: f.facts, sheetsEnabled: false } };
  let coverage: GameMemoryCoverage | undefined; const out = compileGameContext(input, {}, c => { coverage = c; });
  expect(memoryCoverageIssue(coverage, out.report)).toBeUndefined(); expect(out.text).not.toContain('NOT object identity');
});

it('fallback capacity is explicit; completed tasks do not consume its label slots', () => {
  const tasks: StoryFact[] = Array.from({ length: 33 }, (_, i) => {
    const title = `pending duty item${String.fromCharCode(97 + Math.floor(i / 26), 97 + i % 26)}`;
    return { kind: 'promise', text: `Ira promised ${title}.`, quote: `Ira promised ${title}.`, task: { key: `open-${i}`, title, status: 'open' } };
  });
  const sources: StoryFact[] = tasks.map(f => ({ kind: 'event', text: `${f.task!.title}: permission pending.`, quote: `${f.task!.title}: permission pending.` }));
  expect(narrativeRecallFacts([...tasks, ...sources], 'Can we return that thing now?', ['Ira'], roles, episodes)).toMatchObject({ primary: [], reason: 'capacity' });
  const completed = tasks.map(f => ({ ...f, kind: 'event' as const, task: { ...f.task!, status: 'completed' as const } }));
  expect(narrativeRecallFacts([...completed, ...sources], 'Can we return that thing now?', ['Ira'], roles, episodes)).toMatchObject({ primary: [], reason: 'query' });
});
it('unknown role is distinct from an unavailable historical person', () => {
  const unavailable = { ...roles, status: () => 'bound' as const, read: () => ({ planner: { id: 'missing-person', name: 'Ira', unavailable: true as const } }) };
  expect(narrativeRecallFacts(facts, 'Can we return that thing now?', ['Ira'], unavailable, episodes)).toMatchObject({ primary: [], reason: 'source' });
});
it('metadata-only label cannot manufacture a candidate group', () => {
  const forged = { ...facts[0]!, text: 'Unrelated task.', quote: 'Unrelated task.' };
  expect(narrativeRecallFacts([forged, facts[1]!], 'Can we return that thing now?', ['Ira'], roles, episodes)).toMatchObject({ primary: [], reason: 'query' });
});
it('a masked character name cannot become an action or an obligation cue', () => {
  expect(unresolvedStoryIntent('Promise, good morning.', '__deeprole_name__ good morning').operative).toBe(false);
  expect(unresolvedStoryIntent('Return is here.', '__deeprole_name__ is here').operative).toBe(false);
});
it('past-event questions do not request unrelated open-duty candidates', () => {
  for (const query of ['Who gave her that gift?', 'Which of them gave it to her?', 'What did she return?', 'Кто подарил ей тот подарок?']) expect(unresolvedStoryIntent(query).operative).toBe(false);
  expect(unresolvedStoryIntent('Can we return that thing now?').operative).toBe(true);
});
for (const locale of ['ru', 'en']) it(`${locale}: wildlife recent-context reference supplements both groups`, () => {
  const gold = longHoldout.worlds.find(w => w.plot === 'wildlife-tracking-camp' && w.locale === locale)!, f = longHoldoutWorld(gold, 0), q = gold.queries.find(q => q.id === 'grounded-short')!;
  const input: GameContextInput = { draft: q.draft, recentMessages: q.recentMessages ?? [], entries: [], books: [], entities: f.base.entities, worlds: [f.base.world], activeBookId: null, scene: { worldId: f.base.world.id, bookId: null, focusIds: [] }, settings: { contextBudget: 6000, relevanceThreshold: 6 }, story: { world: f.base.world, chat: f.base.binding.chatId, branch: 'rp343', facts: f.facts, sheetsEnabled: false } };
  let coverage: GameMemoryCoverage | undefined; const out = compileGameContext(input, {}, c => { coverage = c; });
  for (const i of q.wanted) expect(readHints(out.text).some(h => h.text === f.important[i]!.text)).toBe(true);
  expect(memoryCoverageIssue(coverage, out.report)?.kind).toBe('incomplete');
});
for (const flag of ['contextualRecall', 'referenceRecall', 'referenceBundle', 'contentRelevance', 'topicAdmission', 'actionBalance', 'compoundActionBalance', 'sequencePriority', 'flexiblePriority', 'discussionPriority', 'budgetPriority'] as const) it(`unresolved fallback respects ${flag} opt-out`, () => {
  const gold = longHoldout.worlds[0]!, f = longHoldoutWorld(gold, 0);
  const input: GameContextInput = { draft: gold.queries.find(q => q.id === 'free-equipment')!.draft, recentMessages: [], entries: [], books: [], entities: f.base.entities, worlds: [f.base.world], activeBookId: null, scene: { worldId: f.base.world.id, bookId: null, focusIds: [] }, settings: { contextBudget: 6000, relevanceThreshold: 6 }, story: { world: f.base.world, chat: f.base.binding.chatId, branch: 'rp343', facts: f.facts, sheetsEnabled: false } };
  expect(compileGameContext(input, { [flag]: false }).text).not.toContain('WITHOUT a semantic match');
});
