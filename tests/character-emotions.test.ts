import { afterEach, expect, it } from "vitest";
import { addCharacterEmotion } from "../src/storage/characters";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { DEFAULT_EMOTIONS, EMPTY_CHARACTER } from "../src/core/characters";
import { DEFAULT_PANEL_WIDTH, panelWidth } from "../src/core/panel-width";
import { parseBackupSettings } from "../src/core/record-validation";
import type { DataRecord } from "../src/core/types";

const databases: DeepRoleDatabase[] = [];
const scope = { worldId: "world", chatId: "chat", chatUrl: "https://chat.deepseek.com/a/chat/s/chat", base: "unused-for-additive-edit" };
const records: DataRecord[] = [
  { kind: "world", id: "world", data: { id: "world", name: "World", description: "Original lore", color: "#123456", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 } },
  { kind: "binding", id: "binding:chat", data: { id: "binding:chat", chatId: "chat", chatUrl: scope.chatUrl, worldId: "world", focusIds: [], bookId: null, messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1 } },
  { kind: "entity", id: "mira", data: { id: "mira", worldId: "world", name: "Mira", kind: "character", description: "Do not alter this profile", aliases: [], memberIds: [], characterSheet: EMPTY_CHARACTER, createdAt: 1, updatedAt: 1 } },
];
async function setup() { const db = new DeepRoleDatabase("emotion-ux-" + crypto.randomUUID()); databases.push(db); const repo = new DeepRoleRepository(db); await repo.mergeRecords(structuredClone(records)); return repo; }
afterEach(async () => { await Promise.all(databases.map(db => db.delete())); databases.length = 0; });

it("adds emotions atomically without changing characters, lore or chat state", async () => {
  const repo = await setup(); const before = await repo.rawRecords();
  await Promise.all([addCharacterEmotion(scope, "Focused", DEFAULT_EMOTIONS, repo), addCharacterEmotion(scope, "смеётся", DEFAULT_EMOTIONS, repo)]);
  const after = await repo.rawRecords();
  expect(after.filter(row => row.kind !== "world")).toEqual(before.filter(row => row.kind !== "world"));
  expect(await repo.get("world", "world")).toMatchObject({ description: "Original lore", characterEmotions: [...DEFAULT_EMOTIONS, "Focused", "смеётся"] });
  await addCharacterEmotion(scope, "Focused", DEFAULT_EMOTIONS, repo);
  expect((await repo.get<any>("world", "world"))!.characterEmotions).toHaveLength(8);
});

it.each(["__proto__", "constructor", "", " padded ", "x".repeat(33)])("rejects unsafe or invalid emotion %s without writing", async name => {
  const repo = await setup(); const before = await repo.rawRecords();
  await expect(addCharacterEmotion(scope, name, DEFAULT_EMOTIONS, repo)).rejects.toThrow("character-invalid");
  expect(await repo.rawRecords()).toEqual(before);
});

it("rejects the wrong chat/world and a full emotion list", async () => {
  const repo = await setup(); const before = await repo.rawRecords();
  await expect(addCharacterEmotion({ ...scope, worldId: "other" }, "new", DEFAULT_EMOTIONS, repo)).rejects.toThrow("character-scope");
  await expect(addCharacterEmotion({ ...scope, chatUrl: "https://chat.deepseek.com/chat/s/other" }, "new", DEFAULT_EMOTIONS, repo)).rejects.toThrow("character-scope");
  await expect(addCharacterEmotion(scope, "new", ["neutral", ...Array.from({ length: 31 }, (_, i) => `emotion-${i}`)], repo)).rejects.toThrow("character-invalid");
  expect(await repo.rawRecords()).toEqual(before);
});

it("restores bounded shared widths and gives old backups the new default", () => {
  expect(panelWidth()).toBe(DEFAULT_PANEL_WIDTH); expect(panelWidth(NaN)).toBe(224);
  expect(panelWidth(80)).toBe(200); expect(panelWidth(1000)).toBe(360);
  expect(parseBackupSettings({ floatingPanelWidth: 288 }).floatingPanelWidth).toBe(288);
  expect(parseBackupSettings({}).floatingPanelWidth).toBe(224);
  for (const value of [NaN, "288", 199, 361, 220.1]) expect(() => parseBackupSettings({ floatingPanelWidth: value })).toThrow();
});
