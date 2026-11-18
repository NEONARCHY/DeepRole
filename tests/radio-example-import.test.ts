import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { characterRevision } from "../src/core/characters";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { compileGameContext } from "../src/core/game-context";
import { memoryCoverageIssue, type GameMemoryCoverage } from "../src/core/game-memory-coverage";
import { decodeStoryMemory } from "../src/core/story-memory-transport";
import type { StoryRecord } from "../src/core/story-records";
import { readTaskArchive } from "../src/core/story-task-archive";
import type { ChatBinding, SceneEntity, WorldProfile } from "../src/core/types";
import { parseBackup, restoreBackup } from "../src/storage/backup";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { runStoryGame } from "../src/storage/story-game";
import { activateWorldGame } from "../src/storage/world-game";
import { plots } from "./fixtures/story-rp404-corpus";
import { probes } from "./fixtures/story-rp404-expectations";

it("imports the portable radio world and compares its promises from a new chat", async () => {
  const payload = await parseBackup(readFileSync("examples/rp410-night-frequency.json", "utf8"));
  const db = new DeepRoleDatabase("radio-example-" + crypto.randomUUID());
  const repo = new DeepRoleRepository(db);
  try {
    await restoreBackup(payload, "merge", repo);
    await restoreBackup(payload, "merge", repo);
    const [imported] = await repo.list<WorldProfile>("world");
    expect(imported!.sharedGame!.facts).toHaveLength(1024);
    const worldId = imported!.id;
    const chatId = crypto.randomUUID();
    const chatUrl = "https://chat.deepseek.com/a/chat/s/" + chatId;
    await repo.put<ChatBinding>("binding", { id: "binding:" + chatId, chatId, chatUrl, worldId,
      bookId: null, messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1 });
    const game = await activateWorldGame({ worldId, chatId, chatUrl, mode: "attach",
      expectedRevision: imported!.sharedGame!.revision }, repo);
    const binding = (await repo.get<ChatBinding>("binding", game.activeBindingId))!;
    const entities = await repo.list<SceneEntity>("entity");
    await runStoryGame({ chatId, worldId, operation: "start",
      expectedBase: characterRevision(entities, binding.characterScenes?.[worldId]), nativeParentKey: null,
      manual: "stop", snapshot: { chatId, messages: [], selectedNativeKey: null } }, DEFAULT_SETTINGS, repo);
    const world = (await repo.get<WorldProfile>("world", worldId))!;
    const records = await repo.list<StoryRecord>("story");
    const branch = records.find(r => r.type === "projection" && r.bindingId === game.activeBindingId)!.branchId;
    const question = probes.radio!.find(p => p.id === "contrast")!;
    let coverage: GameMemoryCoverage | undefined;
    const result = compileGameContext({ draft: question.draft[0], recentMessages: [], books: [], entries: [],
      entities, worlds: [world], activeBookId: null,
      scene: { worldId, bookId: null, focusIds: [] }, settings: { contextBudget: 6000, relevanceThreshold: 6 },
      story: { world, chat: chatId, branch, facts: world.sharedGame!.facts, taskArchive: readTaskArchive(records, world, branch), sheetsEnabled: false } },
    {}, value => { coverage = value; });
    const memory = result.text.match(/<deeprole_story_memory>([\s\S]*?)<\/deeprole_story_memory>/)![1]!;
    const selected = decodeStoryMemory(JSON.parse(memory.trim().split("\n").at(-1)!));
    const beats = plots.find(p => p.id === "radio")!.beats;
    expect(selected.map(f => f.text).sort()).toEqual(question.wanted.map(id => beats.find(b => b.id === id)!.prose[0]).sort());
    expect(memoryCoverageIssue(coverage, result.report)).toBeFalsy();
  } finally {
    await db.delete();
  }
}, 30000);
