import 'fake-indexeddb/auto';
import { afterAll, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DeepRoleDatabase } from '../src/storage/database';
import { DeepRoleRepository } from '../src/storage/repository';
import { GameSearchIndex } from '../src/core/game-search-index';
import { addedContextTokens, compileGameContext, type GameContextInput } from '../src/core/game-context';
import { memoryCoverageIssue, type GameMemoryCoverage } from '../src/core/game-memory-coverage';
import { decodeStoryMemory } from '../src/core/story-memory-transport';
import { assertStoryGraph } from '../src/core/story-records';
import { validStoryFact } from '../src/core/story-update';
import type { WorldProfile } from '../src/core/types';
import { narrativeHoldout, narrativeHoldoutWorld } from './fixtures/story-rp336-world';

const datasetFile = path.resolve('tests/fixtures/story-rp336-narrative-holdout.json');
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const goldenSha = '906a8e042884359ecf7bcc8152781373eb28f4c4a3655959298b7b588aa87568';
expect(digest(readFileSync(datasetFile))).toBe(goldenSha);
const frozenManifest = JSON.parse(readFileSync('docs/benchmarks/rp336-frozen-plan.json', 'utf8')) as { runtimeFilesSha256: Record<string, string>; helperSha256: string };
const seenRegression = process.env.RP336_SEEN === '1';
const changedRuntime = Object.entries(frozenManifest.runtimeFilesSha256).filter(([file, hash]) => digest(readFileSync(file)) !== hash).map(([file]) => file);
if (!seenRegression) expect(changedRuntime).toEqual([]);
expect(digest(readFileSync('tests/fixtures/story-persisted-evidence.ts'))).toBe(frozenManifest.helperSha256);
type Row = { world: string; locale: string; historyFacts: number; query: string; control: boolean; phase: string; wanted: number[]; selected: number[]; extras: number[]; missing: number[]; integrity: string[]; coverage: GameMemoryCoverage; falseComplete: boolean; budgetWarning: boolean; preparationWarning: boolean; warningKind: string | null; referenceGuard: boolean; tokens: number; stable: boolean };
const rows: Row[] = [];
const hints = (text: string) => { const b = text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0]; return b ? decodeStoryMemory(JSON.parse(b.split('\n')[1]!)) : []; };

export function holdoutSummary() {
  const cold = rows.filter(r => r.phase === 'cold'), positives = cold.filter(r => !r.control), controls = cold.filter(r => r.control);
  return { measurements: rows.length, queryHistoryCases: cold.length, positiveCases: positives.length, positiveComplete: positives.filter(r => !r.missing.length).length, controls: controls.length, controlsMemoryComplete: controls.filter(r => !r.missing.length).length, falseComplete: controls.filter(r => r.falseComplete).length, missingSources: cold.reduce((sum, r) => sum + r.missing.length, 0), incompleteWithoutBudgetWarning: cold.filter(r => r.missing.length && !r.budgetWarning).length, incompleteWithoutPreparationWarning: cold.filter(r => r.missing.length && !r.preparationWarning).length, integrityIssues: rows.reduce((sum, r) => sum + r.integrity.length, 0), unstable: rows.filter(r => !r.stable).length, byFamily: narrativeHoldout.worlds[0]!.queries.map(q => { const group = cold.filter(r => r.query === q.id); return { id: q.id, cases: group.length, complete: group.filter(r => !r.missing.length).length, falseComplete: group.filter(r => r.falseComplete).length, withBudgetWarning: group.filter(r => r.budgetWarning).length }; }) };
}
afterAll(() => {
  const report = { milestone: 'RP336', datasetSha256: goldenSha, runtimeChanged: changedRuntime.length > 0, changedRuntime, seenRegression, scope: seenRegression ? 'SEEN regression after changes; not an independent holdout or live test' : 'Independent compiler holdout on production-validated synthetic persisted evidence; not live model or UI', summary: holdoutSummary(), rows };
  const target = process.env.RP336_REPORT;
  if (target) { const absolute = path.resolve(target); if (!absolute.startsWith(path.resolve('.output') + path.sep)) throw Error('Audit reports must stay in .output'); writeFileSync(absolute, JSON.stringify(report, null, 2) + '\n'); }
  console.info('RP336 independent summary', JSON.stringify(report.summary));
});

for (const gold of narrativeHoldout.worlds) for (const count of narrativeHoldout.historyRepeatCounts) it(`${gold.id}/${count}: measure frozen long narrative gold, provenance, saved state and index stability`, async () => {
  const f = narrativeHoldoutWorld(gold, count), db = new DeepRoleDatabase('rp336-' + crypto.randomUUID()), repo = new DeepRoleRepository(db);
  try {
    for (const fact of f.facts) expect(validStoryFact(fact)).toBe(true);
    assertStoryGraph(f.base.records); await repo.mergeRecords(f.base.records);
    const beforeStorage = digest(JSON.stringify(await repo.rawRecords())), index = new GameSearchIndex();
    for (const q of gold.queries) {
      let cold: ReturnType<typeof compileGameContext> | undefined, coldCoverage: GameMemoryCoverage | undefined;
      for (const phase of narrativeHoldout.phases) {
        if (phase !== 'warm') index.clear();
        if (phase === 'reopened') { db.close(); await db.open(); }
        const world = (await repo.get<WorldProfile>('world', f.base.world.id))!;
        const input: GameContextInput = { draft: q.draft, recentMessages: f.facts.slice(-2).map(f => f.text), entries: [], books: [], entities: f.base.entities, worlds: [world], activeBookId: null, scene: { worldId: world.id, bookId: null, focusIds: [] }, settings: { contextBudget: narrativeHoldout.budget, relevanceThreshold: 6 }, story: { world, chat: f.base.binding.chatId, branch: 'rp336', facts: world.sharedGame!.facts, sheetsEnabled: false } };
        const before = structuredClone(input); let coverage: GameMemoryCoverage = { kind: 'not-applicable' };
        const out = compileGameContext(input, { searchIndex: index }, c => { coverage = c; });
        const selected: number[] = [], integrity: string[] = [];
        for (const hint of hints(out.text)) {
          const i = f.facts.findIndex(f => f.text === hint.text); selected.push(i);
          if (i < 0) { integrity.push('unknown-source'); continue; }
          const fact = f.facts[i]!;
          if ((hint.sourceQuote ?? hint.text) !== fact.quote || hint.kind !== fact.kind) integrity.push('quote-kind:' + i);
          if (JSON.stringify(hint.task ?? null) !== JSON.stringify(fact.task ?? null)) integrity.push('task:' + i);
          if (JSON.stringify(hint.claim ?? null) !== JSON.stringify(fact.claim ?? null)) integrity.push('claim:' + i);
          if (JSON.stringify(hint.sourceRoles ?? {}) !== JSON.stringify(f.seeds[i]!.binding.roles)) integrity.push('role:' + i);
          if (hint.episodeSource?.revisionId !== f.sources[i]) integrity.push('source:' + i);
        }
        if (phase === 'cold') { cold = out; coldCoverage = coverage; }
        const stable = JSON.stringify(out) === JSON.stringify(cold) && JSON.stringify(coverage) === JSON.stringify(coldCoverage);
        const row: Row = { world: gold.plot, locale: gold.locale, historyFacts: f.facts.length, query: q.id, control: q.control, phase, wanted: q.wanted, selected, extras: selected.filter(i => !q.wanted.includes(i)), missing: q.wanted.filter(i => !selected.includes(i)), integrity, coverage, falseComplete: q.mustNotCertifyComplete && (coverage as GameMemoryCoverage).kind === 'complete', budgetWarning: ["budget","required-overflow"].includes(memoryCoverageIssue(coverage,out.report)?.kind??""), preparationWarning: !!memoryCoverageIssue(coverage,out.report), warningKind: memoryCoverageIssue(coverage,out.report)?.kind??null, referenceGuard: out.text.includes('<deeprole_reference_guard>'), tokens: out.report.total, stable };
        rows.push(row);
        expect(input).toEqual(before); expect(integrity).toEqual([]); expect(stable).toBe(true);
        expect(out.report.total).toBe(addedContextTokens(out.text)); expect(out.report.total).toBeLessThanOrEqual(narrativeHoldout.budget);
      }
    }
    const saved = await repo.rawRecords(); expect(digest(JSON.stringify(saved))).toBe(beforeStorage); assertStoryGraph(saved);
  } finally { await db.delete(); }
}, 120000);

it('all frozen query/history cases retain their required sources without false complete claims', () => {
  expect(rows).toHaveLength(432);
  const problems = rows.filter(r => r.phase === 'cold' && (r.missing.length || r.falseComplete));
  expect(problems.map(r => ({ world: r.world, locale: r.locale, size: r.historyFacts, query: r.query, missing: r.missing, falseComplete: r.falseComplete })), JSON.stringify(holdoutSummary())).toEqual([]);
});
