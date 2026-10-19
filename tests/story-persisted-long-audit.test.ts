import 'fake-indexeddb/auto';
import { afterAll, expect, it } from 'vitest';
import { DeepRoleDatabase } from '../src/storage/database';
import { DeepRoleRepository } from '../src/storage/repository';
import { GameSearchIndex } from '../src/core/game-search-index';
import { addedContextTokens, compileGameContext, type GameContextInput } from '../src/core/game-context';
import type { GameMemoryCoverage } from '../src/core/game-memory-coverage';
import { decodeStoryMemory } from '../src/core/story-memory-transport';
import { validWorldGame } from '../src/core/world-game';
import type { WorldProfile } from '../src/core/types';
import { persistedLongWorld } from './fixtures/story-persisted-long-audit';
import { withPersistedEvidence } from './fixtures/story-persisted-evidence';
import { assertStoryGraph } from '../src/core/story-records';
import { activateWorldGame } from '../src/storage/world-game';
import { runStoryGame } from '../src/storage/story-game';
import { DEFAULT_SETTINGS } from '../src/core/defaults';
import { characterRevision } from '../src/core/characters';
import { nativeStoryMessageKey } from '../src/core/story-transport';
import type { ChatBinding } from '../src/core/types';
import { assertTopicRecall } from './fixtures/assert-topic-recall';

const audit: object[] = [];
afterAll(() => console.info('RP335-persisted-long', JSON.stringify(audit)));
const decode = (text: string) => {
  const block = text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];
  return block ? decodeStoryMemory(JSON.parse(block.split('\n')[1]!)) : [];
};
it('opens a new native chat over the validated historical source graph', async () => {
  const f = withPersistedEvidence(persistedLongWorld('ru', 'observatory', 400)), db = new DeepRoleDatabase('rp335-start-' + crypto.randomUUID()), repo = new DeepRoleRepository(db);
  try {
    await repo.mergeRecords(f.base.records);
    await activateWorldGame({ chatId: f.base.binding.chatId, worldId: f.base.world.id, chatUrl: f.base.binding.chatUrl, expectedRevision: f.base.world.sharedGame!.revision, mode: 'initialize' }, repo);
    const b = (await repo.get<ChatBinding>('binding', f.base.binding.id))!;
    const snapshot = { chatId: b.chatId, selectedNativeKey: nativeStoryMessageKey('41'), messages: [{ identity: { nativeMessageKey: nativeStoryMessageKey('40'), nativeParentKey: null, role: 'user' as const }, completion: 'complete' as const, content: 'Begin' }, { identity: { nativeMessageKey: nativeStoryMessageKey('41'), nativeParentKey: nativeStoryMessageKey('40'), role: 'assistant' as const }, completion: 'complete' as const, content: 'Workshop' }] };
    await runStoryGame({ chatId: b.chatId, worldId: f.base.world.id, operation: 'start', expectedBase: characterRevision(f.base.entities, b.characterScenes?.[f.base.world.id]), nativeParentKey: null, manual: 'stop', snapshot }, DEFAULT_SETTINGS, repo);
    assertStoryGraph(await repo.rawRecords());
  } finally { await db.delete(); }
}, 60000);
for (const locale of ['ru', 'en'] as const) for (const plot of ['observatory', 'theatre'] as const) for (const count of [80, 400]) {
  it(`${locale}/${plot}/${count}: persisted roles and complete compound sources survive reload`, async () => {
    const f = withPersistedEvidence(persistedLongWorld(locale, plot, count)), db = new DeepRoleDatabase('rp335-' + crypto.randomUUID()), repo = new DeepRoleRepository(db);
    try {
      expect(validWorldGame(f.base.world.sharedGame)).toBe(true);
      await repo.mergeRecords(f.base.records);
      const saved = await repo.rawRecords(), index = new GameSearchIndex();
      for (const q of f.questions) {
        const outputs = [];
        for (const phase of ['cold', 'warm', 'reopened']) {
          if (phase !== 'warm') index.clear();
          if (phase === 'reopened') { db.close(); await db.open(); }
          const world = (await repo.get<WorldProfile>('world', f.base.world.id))!;
          expect(world.sharedGame!.facts).toHaveLength(count + 9);
          expect(world.sharedGame!.factRoleSeeds).toHaveLength(count + 9);
          const input: GameContextInput = { draft: q.draft, recentMessages: f.facts.slice(-2).map(x => x.text), entries: [], books: [], entities: f.base.entities, worlds: [world], activeBookId: null, scene: { worldId: world.id, bookId: null, focusIds: [] }, settings: { contextBudget: 6000, relevanceThreshold: 6 }, story: { world, chat: f.base.binding.chatId, branch: 'persisted', facts: world.sharedGame!.facts, sheetsEnabled: false } };
          const before = structuredClone(input);
          let coverage: GameMemoryCoverage = { kind: 'not-applicable' };
          const output = compileGameContext(input, { searchIndex: index }, value => { coverage = value; });
          const hints = decode(output.text), missing = q.wanted.filter(i => !hints.some(h => h.text === f.important[i]!.text));
          audit.push({ locale, plot, count, query: q.id, phase, missing, selected: hints.length, coverage, tokens: output.report.total });
          for (const hint of hints) {
            const i = f.facts.findIndex(x => x.text === hint.text);
            expect(i).toBeGreaterThanOrEqual(0);
            const fact = f.facts[i]!;
            expect(hint.sourceQuote ?? hint.text).toBe(fact.quote);
            expect(hint.kind).toBe(fact.kind);
            expect(hint.task).toEqual(fact.task);
            expect(hint.claim).toEqual(fact.claim);
            expect(hint.sourceRoles ?? {}).toEqual(f.seeds[i]!.binding.roles);
            expect(hint.episodeSource?.revisionId).toBe(f.sources[i]);
          }
          expect(output.report.total).toBe(addedContextTokens(output.text));
          expect(output.report.total).toBeLessThanOrEqual(6000);
          expect(input).toEqual(before);
          outputs.push(output);
          // Audit all questions even if one misses; assert the frozen gold below.
          if (phase === 'reopened') {
            expect(outputs[1]).toEqual(outputs[0]); expect(outputs[2]).toEqual(outputs[0]);
          }
        }
      }
      expect(await repo.rawRecords()).toEqual(saved); assertStoryGraph(await repo.rawRecords());
    } finally { await db.delete(); }
  }, 60000);
}
it('satisfies the frozen independent gold in every persisted index phase', () => {
  const rows = audit as Array<{ query: string; missing: number[]; coverage: GameMemoryCoverage }>;
  expect(rows).toHaveLength(168);
  const failures = rows.filter(row => row.missing.length || ['unknown', 'pronoun'].includes(row.query) && row.coverage.kind === 'complete');
  expect(failures).toEqual([]);
});

for (const locale of ['ru', 'en'] as const) for (const control of ['missing-source', 'unavailable-role', 'no-roles', 'unknown-clause', 'pronoun-clause', 'tight-budget', 'disabled-actions', 'disabled-compounds', 'disabled-sequences'] as const) {
  it(`${locale}/${control}: repeat filtering preserves the complete prior fallback`, () => {
    const f = persistedLongWorld(locale, 'observatory', 400), world = f.base.world;
    const input: GameContextInput = { draft: f.questions[3]!.draft, recentMessages: f.facts.slice(-2).map(x => x.text), entries: [], books: [], entities: f.base.entities, worlds: [world], activeBookId: null, scene: { worldId: world.id, bookId: null, focusIds: [] }, settings: { contextBudget: 6000, relevanceThreshold: 6 }, story: { world, chat: f.base.binding.chatId, branch: 'persisted', facts: world.sharedGame!.facts, sheetsEnabled: false } };
    const options = control === 'disabled-actions' ? { actionBalance: false } : control === 'disabled-compounds' ? { compoundActionBalance: false } : control === 'disabled-sequences' ? { sequencePriority: false } : {};
    if (control === 'missing-source') world.sharedGame!.episodeSources = f.sources.slice(1);
    if (control === 'unavailable-role') input.entities = input.entities!.slice(1);
    if (control === 'no-roles') world.sharedGame!.factRoleSeeds = [];
    if (control === 'unknown-clause') input.draft = f.questions[5]!.draft;
    if (control === 'pronoun-clause') input.draft = f.questions[6]!.draft;
    if (control === 'tight-budget') input.settings.contextBudget = 700;
    const next=compileGameContext(input,options),prior=compileGameContext(input,{...options,repeatSelection:false});
    if(['unknown-clause','pronoun-clause'].includes(control)&&next.text!==prior.text)assertTopicRecall(input,next,prior,f.important);
    else expect(next).toEqual(prior);
  });
}
