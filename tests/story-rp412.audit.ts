import { readFileSync, writeFileSync } from "node:fs";
import { afterAll, expect, it } from "vitest";
import { addedContextTokens, compileGameContext } from "../src/core/game-context";
import { GameSearchIndex } from "../src/core/game-search-index";
import { memoryCoverageIssue, type GameMemoryCoverage } from "../src/core/game-memory-coverage";
import { decodeStoryMemory } from "../src/core/story-memory-transport";
import { readTaskArchive } from "../src/core/story-task-archive";
import type { StoryRecord } from "../src/core/story-records";
import type { WorldProfile, SceneEntity } from "../src/core/types";
import { DeepRoleRepository } from "../src/storage/repository";
import { DeepRoleDatabase } from "../src/storage/database";
import { makeHistory } from "./fixtures/story-rp404-history";
import { digest, seals } from "./fixtures/story-rp404-seal";
import { stories, draft } from "./fixtures/story-rp412-promises";

const plan = JSON.parse(readFileSync("docs/benchmarks/rp412-frozen-plan.json", "utf8"));
for (const [path, expected] of Object.entries(plan.files)) {
  expect(digest(readFileSync(path, "utf8").replaceAll("\r\n", "\n"))).toBe(expected);
}
const runtime = seals().runtimeSha256;
const rows: { world: string; locale: string; probe: string; phase: string; expected: string[]; selected: string[];
  warning: string | null; guard: boolean; problems: string[] }[] = [];
const started = new Date().toISOString();
const output = ".output/rp412-" + started.replace(/[:.]/g, "-");
writeFileSync(output + ".receipt", JSON.stringify({ started, runtime, plan }), { flag: "wx" });

for (const { plot, discussion, cues } of stories) for (const locale of ["ru", "en"] as const) {
  it(plot.id + " " + locale, async () => {
    const lang = locale === "ru" ? 0 : 1;
    const fixture = makeHistory(plot, locale, 127);
    expect(fixture.facts).toHaveLength(1020);
    const db = new DeepRoleDatabase("rp412-" + crypto.randomUUID());
    const repo = new DeepRoleRepository(db);
    try {
      await repo.mergeRecords(fixture.records);
      const before = digest(JSON.stringify(await repo.rawRecords()));
      const cold = new Map<string, string>();
      for (const phase of ["cold", "reopened"]) {
        if (phase === "reopened") { db.close(); await db.open(); }
        const world = (await repo.get<WorldProfile>("world", fixture.worldId))!;
        const records = await repo.list<StoryRecord>("story");
        const branch = records.find(r => r.type === "projection" && r.bindingId === world.sharedGame!.activeBindingId)!.branchId;
        const taskArchive = readTaskArchive(records, world, branch);
        const entities = await repo.list<SceneEntity>("entity");
        for (const [index, probe] of ["both", "first", "second"].entries()) {
          const recentMessages = [discussion[lang]];
          if (index) recentMessages.push(cues[index - 1]![lang]);
          const expected: string[] = plan.expected[plot.id][probe];
          let coverage: GameMemoryCoverage | undefined;
          const result = compileGameContext({
            draft: draft[lang], recentMessages, entries: [], books: [], entities, worlds: [world], activeBookId: null,
            scene: { worldId: world.id, bookId: null, focusIds: [] }, settings: { contextBudget: 6000, relevanceThreshold: 6 },
            story: { world, chat: fixture.chatId, branch, facts: world.sharedGame!.facts, taskArchive, sheetsEnabled: false },
          }, { searchIndex: new GameSearchIndex() }, state => { coverage = state; });
          const block = result.text.match(/<deeprole_story_memory>([\s\S]*?)<\/deeprole_story_memory>/)?.[1];
          const hints = block ? decodeStoryMemory(JSON.parse(block.trim().split("\n").at(-1)!)) : [];
          const problems: string[] = [];
          const selected = hints.map(hint => {
            const s = fixture.byText.get(hint.text);
            if (!s || s.revisionId !== hint.episodeSource?.revisionId || (hint.sourceQuote ?? hint.text) !== s.fact.quote ||
                hint.kind !== s.fact.kind || JSON.stringify(hint.task) !== JSON.stringify(s.fact.task) ||
                JSON.stringify(hint.sourceRoles ?? {}) !== JSON.stringify(s.roles)) problems.push("source");
            return s?.id ?? "unknown";
          });
          if (JSON.stringify([...selected].sort()) !== JSON.stringify([...expected].sort())) problems.push("selection");
          const warning = memoryCoverageIssue(coverage, result.report)?.kind ?? null;
          const guard = result.text.includes("<deeprole_reference_guard>");
          if (Boolean(warning) !== (probe === "both") || (probe === "both" && !guard)) problems.push("clarification");
          if (result.report.total > 6000 || result.report.total !== addedContextTokens(result.text)) problems.push("budget");
          const signature = digest(JSON.stringify([result, coverage]));
          if (phase === "cold") cold.set(probe, signature);
          else if (cold.get(probe) !== signature) problems.push("reopen");
          rows.push({ world: plot.id, locale, probe, phase, expected, selected, warning, guard, problems });
        }
      }
      expect(digest(JSON.stringify(await repo.rawRecords()))).toBe(before);
    } finally { await db.delete(); }
  }, 180000);
}
afterAll(() => {
  const summary = { cases: rows.filter(r => r.phase === "cold").length,
    passed: rows.filter(r => r.phase === "cold" && !r.problems.length).length, measurements: rows.length };
  writeFileSync(output + ".json", JSON.stringify({ started, runtime, summary, rows }, null, 2) + "\n", { flag: "wx" });
  expect(rows).toHaveLength(24);
  expect(rows.filter(row => row.problems.length).map(row => [row.world, row.locale, row.probe, row.phase, row.problems])).toEqual([]);
});
