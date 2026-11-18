import { afterAll, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { addedContextTokens, compileGameContext, type GameContextInput } from "../src/core/game-context";
import { GameSearchIndex } from "../src/core/game-search-index";
import { memoryCoverageIssue, type GameMemoryCoverage } from "../src/core/game-memory-coverage";
import { decodeStoryMemory } from "../src/core/story-memory-transport";
import { readTaskArchive } from "../src/core/story-task-archive";
import { assertStoryGraph, type StoryRecord } from "../src/core/story-records";
import type { SceneEntity, WorldProfile } from "../src/core/types";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { plots } from "./fixtures/story-rp404-corpus";
import { probes, expectedOwners } from "./fixtures/story-rp404-expectations";
import { makeHistory } from "./fixtures/story-rp404-history";
import { digest, seals } from "./fixtures/story-rp404-seal";

const planText = readFileSync("docs/benchmarks/rp404-frozen-plan.json", "utf8");
const plan = JSON.parse(planText) as { seals: ReturnType<typeof seals>; expectedRows: number; shiftsPerAct: number[]; budget: number };
const actual = seals();
expect(actual.files).toEqual(plan.seals.files);
const seen = process.env.RP404_SEEN === "1";
if (!seen) expect(actual.runtimeSha256).toBe(plan.seals.runtimeSha256);

// A repeat is opt-in and cannot replace the independent first output.
const output = path.resolve(process.env.RP404_REPORT ?? ".output/rp404-first-results.json");
if (path.dirname(output) !== path.resolve(".output") || (seen && path.basename(output) === "rp404-first-results.json")) throw Error("Use a separate .output report file");

interface Row {
  plot: string; locale: string; history: number; query: string; phase: string;
  selected: string[]; missing: string[]; excludedHits: string[]; ownerIssues: string[];
  coverage: string; notice: string | null; expectedWarning: boolean; noticeMismatch: boolean;
  falseComplete: boolean; integrity: string[]; stable: boolean; tokens: number;
}
const rows: Row[] = [];
const passed = (r: Row) => !r.missing.length && !r.excludedHits.length && !r.ownerIssues.length
  && !r.noticeMismatch && !r.falseComplete && !r.integrity.length && r.stable;

it("validates the fixed source and query IDs, independent wording and case counts", () => {
  const old = ["story-rp336-narrative-holdout", "story-rp340-long-holdout", "story-rp342-free-holdout", "story-rp344-novel-holdout"];
  const usedText = new Set<string>();
  for (const file of old) {
    const data = JSON.parse(readFileSync("tests/fixtures/" + file + ".json", "utf8")) as { worlds: { facts: { text: string }[]; queries: { draft: string }[] }[] };
    for (const world of data.worlds) for (const text of [...world.facts.map(f => f.text), ...world.queries.map(q => q.draft)]) usedText.add(text);
  }
  for (const plot of plots) {
    const ids = new Set(plot.beats.map(b => b.id)), questions = probes[plot.id]!;
    expect(ids.size).toBe(plot.beats.length);
    expect(new Set(questions.map(q => q.id)).size).toBe(questions.length);
    for (const q of questions) {
      const labels = [...q.wanted, ...q.exclude];
      expect(new Set(labels).size).toBe(labels.length);
      expect(labels.every(id => ids.has(id))).toBe(true);
    }
    for (const s of [...plot.beats.flatMap(b => b.prose), ...questions.flatMap(q => q.draft)]) {
      expect(usedText.has(s)).toBe(false);
      usedText.add(s);
    }
  }
  expect(Object.values(probes).flat().length * 2 * plan.shiftsPerAct.length * 3).toBe(plan.expectedRows);
});

for (const plot of plots) for (const locale of ["ru", "en"] as const) for (const shifts of plan.shiftsPerAct) {
  it(`${plot.id}/${locale}/${shifts}: measures all cases from stored history`, async () => {
    const lang = locale === "ru" ? 0 : 1;
    const fixture = makeHistory(plot, locale, shifts);
    const db = new DeepRoleDatabase("rp404-" + crypto.randomUUID());
    const repo = new DeepRoleRepository(db);
    try {
      await repo.mergeRecords(fixture.records);
      const before = digest(JSON.stringify(await repo.rawRecords()));
      const load = async () => {
        const world = (await repo.get<WorldProfile>("world", fixture.worldId))!;
        const records = await repo.list<StoryRecord>("story");
        const projection = records.find(r => r.type === "projection" && r.bindingId === world.sharedGame!.activeBindingId);
        if (!projection) throw Error("Missing managed projection");
        const archive = readTaskArchive(records, world, projection.branchId);
        if (!archive?.facts.length) throw Error("Missing task archive");
        if (plot.id === "orchard") {
          const original = plot.beats.find(b => b.id === "upper")!.prose[lang];
          expect(world.sharedGame!.facts.some(f => f.text === original)).toBe(false);
          expect(archive.facts.some(f => f.text === original)).toBe(true);
        }
        const entities = await repo.list<SceneEntity>("entity");
        return { world, entities, story: { world, chat: fixture.chatId, branch: projection.branchId, facts: world.sharedGame!.facts, taskArchive: archive, sheetsEnabled: false } };
      };
      let state = await load();
      const cold = new Map<string, string>();
      const indexes = new Map<string, GameSearchIndex>();
      for (const phase of ["cold", "warm", "reopened"]) {
        if (phase === "reopened") { db.close(); await db.open(); state = await load(); indexes.clear(); }
        for (const q of probes[plot.id]!) {
          const input: GameContextInput = {
            draft: q.draft[lang], recentMessages: q.recent?.map(pair => pair[lang]) ?? fixture.facts.slice(-2).map(f => f.text),
            entries: [], books: [], entities: state.entities, worlds: [state.world], activeBookId: null,
            scene: { worldId: state.world.id, bookId: null, focusIds: [] },
            settings: { contextBudget: plan.budget, relevanceThreshold: 6 }, story: state.story,
          };
          const index = indexes.get(q.id) ?? new GameSearchIndex();
          indexes.set(q.id, index);
          const coverage: { value: GameMemoryCoverage } = { value: { kind: "not-applicable" } };
          const result = compileGameContext(input, { searchIndex: index }, value => { coverage.value = value; });
          const signature = digest(JSON.stringify([result, coverage.value]));
          if (phase === "cold") cold.set(q.id, signature);
          const selected: string[] = [], integrity: string[] = [], ownerIssues: string[] = [];
          const match = result.text.match(/<deeprole_story_memory>([\s\S]*?)<\/deeprole_story_memory>/);
          if (!match && result.text.includes("<deeprole_story_memory>")) throw Error("Undecodable story memory block");
          for (const hint of match ? decodeStoryMemory(JSON.parse(match[1]!.trim().split("\n").at(-1)!)) : []) {
            const source = fixture.byText.get(hint.text);
            if (!source) { integrity.push("unknown-fact"); continue; }
            selected.push(source.id);
            if (source.revisionId !== hint.episodeSource?.revisionId || (hint.sourceQuote ?? hint.text) !== source.fact.quote
              || hint.kind !== source.fact.kind || JSON.stringify(hint.task ?? null) !== JSON.stringify(source.fact.task ?? null)
              || JSON.stringify(hint.sourceRoles ?? {}) !== JSON.stringify(source.roles)) integrity.push(source.id);
            const owner = expectedOwners[plot.id]![source.id];
            if (owner !== undefined && q.wanted.includes(source.id)) {
              const person = state.entities.find(p => p.name === plot.cast[owner]![lang])!;
              const identified = hint.sourceRoles?.promisor;
              if (identified?.id !== person.id || identified.name !== person.name) ownerIssues.push(source.id);
            }
          }
          const missing = q.wanted.filter(k => !selected.includes(k));
          const excludedHits = q.exclude.filter(k => selected.includes(k));
          const notice = memoryCoverageIssue(coverage.value, result.report)?.kind ?? null;
          const expectedWarning = q.notice === "required" || (q.notice === "when-missing" && missing.length > 0);
          rows.push({ plot: plot.id, locale, history: fixture.facts.length, query: q.id, phase, selected, missing, excludedHits, ownerIssues,
            coverage: coverage.value.kind, notice, expectedWarning, noticeMismatch: !!notice !== expectedWarning,
            falseComplete: (missing.length > 0 || q.notice === "required") && coverage.value.kind === "complete",
            integrity, stable: signature === cold.get(q.id), tokens: result.report.total });
          expect(result.report.total).toBe(addedContextTokens(result.text));
          expect(result.report.total).toBeLessThanOrEqual(plan.budget);
        }
      }
      expect(digest(JSON.stringify(await repo.rawRecords()))).toBe(before);
      assertStoryGraph(fixture.records);
    } finally { await db.delete(); }
  }, 300000);
}

afterAll(() => {
  const distinct = rows.filter(r => r.phase === "cold");
  const summary = { measurements: rows.length, cases: distinct.length, passed: distinct.filter(passed).length,
    missingFacts: distinct.filter(r => r.missing.length).length, excludedHits: distinct.filter(r => r.excludedHits.length).length,
    missingWarnings: distinct.filter(r => r.expectedWarning && !r.notice).length, extraWarnings: distinct.filter(r => !r.expectedWarning && r.notice).length,
    falseComplete: distinct.filter(r => r.falseComplete).length, ownerIssues: distinct.filter(r => r.ownerIssues.length).length,
    integrityFailures: rows.filter(r => r.integrity.length).length, unstable: rows.filter(r => !r.stable).length };
  writeFileSync(output, JSON.stringify({ planSha256: digest(planText.replaceAll("\r\n", "\n")), runtimeSha256: actual.runtimeSha256, seen, summary, rows }, null, 2) + "\n", { flag: "wx" });
  console.info("RP404", JSON.stringify(summary));
});

it("meets the frozen memory, competitor and notice expectations", () => {
  expect(rows).toHaveLength(plan.expectedRows);
  const failures = rows.filter(r => !passed(r));
  expect(failures.length, "See the per-case results for missing facts, competing facts and notice mismatches.").toBe(0);
});
