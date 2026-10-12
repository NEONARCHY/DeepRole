import { afterEach, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { EMPTY_CHARACTER, EMPTY_STATUS, characterInstruction, characterRevision, parseCharacterTurn, portraitSource, type CharacterTurn } from "../src/core/characters";
import { matchCharacterAction, resolveCharacterAction } from "../src/core/character-actions";
import { normalizeActionRecord, normalizeActionSettings, normalizeActionStatus } from "../src/core/action-compat";
import { renameWorldActions, validateActionRenames } from "../src/core/action-renames";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { characterEditBaseline } from "../src/core/character-edit";
import { DeepRoleDatabase, recordKey } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { saveDefaultActionList, saveWorldActionList } from "../src/storage/action-settings";
import { applyCharacterTurn, saveCharacter } from "../src/storage/characters";
import { getSettings, saveSettings } from "../src/storage/settings";
import { parseWorldPackage } from "../src/storage/worlds";
import { parseBackup } from "../src/storage/backup";
import { deriveVaultKey, encryptJsonWithKey, exportKey, encodeSalt } from "../src/storage/crypto";
import { saveVaultConfig, saveSessionKey } from "../src/storage/settings";
import { createCastJob } from "../src/storage/cast-initialization";
import { castParts, castPrompt } from "../src/core/cast-initialization";
import type { ChatBinding, DataRecord, SceneEntity, WorldProfile } from "../src/core/types";

const photos = ["data:image/png;base64,AAAA", "data:image/png;base64,BBBB", "data:image/png;base64,CCCC"];
const actions = ["neutral", "Сидит", "Смеётся", "Смущается", "Даёт себя обнять", "Обнимает"];
const world: WorldProfile = { id: "w", name: "World", description: "Untouched lore", color: "#123456", contextBudget: 8000, relevanceThreshold: 6, characterActions: actions, createdAt: 1, updatedAt: 1 };
const person: SceneEntity = { id: "mira", worldId: "w", kind: "character", name: "Mira", description: "Untouched age and lore", aliases: [], memberIds: [], characterSheet: { ...EMPTY_CHARACTER, sprites: { neutral: photos[0]!, "Сидит": [photos[1]!, photos[2]!], "Даёт себя обнять": photos[2]! }, initialStatus: { ...EMPTY_STATUS, action: "Сидит", goal: "Keep goal" } }, createdAt: 1, updatedAt: 1 };
const hero: SceneEntity = { ...person, id: "hero", name: "Leon", characterSheet: { ...EMPTY_CHARACTER, protagonist: true, sprites: { neutral: photos[0]!, "Обнимает": photos[1]! } } };
const scene = { revision: "old", presentIds: ["mira", "hero"], states: { mira: { ...EMPTY_STATUS, action: "Сидит", condition: "Safe" }, hero: { ...EMPTY_STATUS } }, updatedAt: 1 };
const binding: ChatBinding = { id: "binding:a", chatId: "a", chatUrl: "https://chat.deepseek.com/a/chat/s/a", worldId: "w", bookId: null, messageCountAtAnalysis: 0, characterScenes: { w: scene }, createdAt: 1, updatedAt: 1 };
const rows = (): DataRecord[] => [{ kind: "world", id: "w", data: structuredClone(world) }, { kind: "entity", id: "mira", data: structuredClone(person) }, { kind: "entity", id: "hero", data: structuredClone(hero) }, { kind: "binding", id: binding.id, data: structuredClone(binding) }];
const databases: DeepRoleDatabase[] = [];
async function setup() { const db = new DeepRoleDatabase("actions-" + crypto.randomUUID()); databases.push(db); const repo = new DeepRoleRepository(db); await repo.mergeRecords(rows()); return { db, repo }; }
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(databases.splice(0).map(db => db.delete())); });

it("matches configured spelling and built-in labels, not meanings or ambiguous guesses", () => {
  expect(matchCharacterAction("  сидит  ", actions)).toBe("Сидит");
  expect(matchCharacterAction("Даёт  себя обнять", actions)).toBe("Даёт себя обнять");
  expect(matchCharacterAction("Sitting", ["neutral", "sitting"])).toBe("sitting");
  expect(matchCharacterAction("смех", actions)).toBeUndefined();
  expect(matchCharacterAction("SITTING", ["sitting", "Sitting"])).toBeUndefined();
  expect(matchCharacterAction("Sitting", ["sitting", "Sitting"])).toBe("Sitting");
  expect(resolveCharacterAction({ ...EMPTY_CHARACTER, blockedActions: ["Сидит"] }, "сидит", "Смеётся", actions)).toBe("Смеётся");
  for (const key of ["Смеётся", "Смущается", "neutral"]) expect(resolveCharacterAction(person.characterSheet, key, undefined, actions)).toBe(key);
});

it("cast preparation captures custom world or inherited action catalogs without images", async () => {
  const { repo } = await setup(); const job = await createCastJob("w", "ru", false, repo);
  expect(job.actions).toEqual(actions);
  const prompt = castPrompt({ ...job, step: castParts(job.sources).length, phase: "analyzing" });
  expect(prompt).toContain("Configured action catalog: " + JSON.stringify(actions)); expect(prompt).toContain("state.action"); expect(prompt).not.toContain("data:image");
  const { repo: inherited } = await setup(); await inherited.put("world", { ...world, characterActions: undefined });
  await saveSettings({ ...DEFAULT_SETTINGS, characterActions: ["neutral", "Laughing"] });
  expect((await createCastJob("w", "en", false, inherited)).actions).toEqual(["neutral", "Laughing"]);
});

it("new story schemas explain both interaction roles and keep read-only requests read-only", () => {
  const story = characterInstruction("w", "a", [person, hero], scene, actions, ["mira"], "*я обнимаю её*", "ticket");
  expect(story).toContain('"action":"'); expect(story).not.toContain('"emotion":');
  for (const text of ["BOTH participants", "Даёт себя обнять", "Physical movement is NOT required", "Смеётся", "Смущается", "Спокойствие", "refusal, pulling away", "EVERY physically present person"]) expect(story).toContain(text);
  expect(story).not.toContain("data:image");
  const readonly = characterInstruction("w", "a", [person, hero], scene, actions, [], "", undefined, false, true);
  expect(readonly).toContain("do not output character updates for this service");
  expect(readonly).not.toContain("Include a state update for EVERY");
});

it("parses old emotion replies without permitting invalid new action fields to fall back", () => {
  const update = { world: "w", chat: "a", base: "v", present: ["mira"], updates: [{ id: "mira", state: { ...EMPTY_STATUS, emotion: "Сидит", action: undefined } }] };
  const wire = (value: unknown) => `<deeprole_characters>${JSON.stringify(value)}</deeprole_characters>`;
  expect(parseCharacterTurn(wire(update))?.updates[0]?.state.action).toBe("Сидит");
  update.updates[0]!.state.action = 123 as never;
  expect(parseCharacterTurn(wire(update))).toBeNull();
  expect(normalizeActionStatus({ action: "Смеётся", emotion: "sad" })).toEqual({ action: "Смеётся" });
});

it("updates the recipient and protagonist portraits from completed scene actions; later refusal can replace them", async () => {
  const { repo } = await setup();
  async function apply(recipient: string, initiator: string, text: string) {
    const people = await repo.list<SceneEntity>("entity"); const current = (await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!;
    const base = characterRevision(people, current);
    const turn: CharacterTurn = { world: "w", chat: "a", base, present: ["mira", "hero"], partners: ["mira"], updates: [{ id: "mira", state: { ...EMPTY_STATUS, action: recipient } }, { id: "hero", state: { ...EMPTY_STATUS, action: initiator } }] };
    await applyCharacterTurn({ worldId: "w", chatId: "a", chatUrl: binding.chatUrl, base, replyText: text }, turn, actions, repo);
    return (await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!;
  }
  const accepted = await apply("Даёт себя обнять", "Обнимает", "Mira accepts Leon's hug and remains in his arms.");
  expect(portraitSource(person, accepted.states.mira!)).toBe(photos[2]);
  expect(portraitSource(hero, accepted.states.hero!)).toBe(photos[1]);
  const ended = await apply("Сидит", "neutral", "She pulls away, then sits down. The embrace has ended.");
  expect(ended.states.mira!.action).toBe("Сидит"); expect(ended.states.hero!.action).toBe("neutral");
  expect((await repo.get<SceneEntity>("entity", "mira"))!.description).toBe(person.description);
});

it("reads old settings, raw database records, world packages and backups without rewriting photo bytes or names", async () => {
  const { db, repo } = await setup();
  const oldWorld = { ...world, characterActions: undefined, characterEmotions: actions };
  const oldPerson = { ...person, characterSheet: { ...person.characterSheet, blockedEmotions: ["Смущается"], initialStatus: { ...EMPTY_STATUS, action: undefined, emotion: "Сидит" } } };
  const oldRows = JSON.parse(JSON.stringify([{ kind: "world", id: "w", data: oldWorld }, { kind: "entity", id: "mira", data: oldPerson }, { kind: "binding", id: binding.id, data: { ...binding, characterScenes: { w: { ...scene, states: { mira: { ...EMPTY_STATUS, action: undefined, emotion: "Сидит" } } } } } }]));
  const before = structuredClone(oldRows);
  await db.records.bulkPut(oldRows.map((row: DataRecord) => ({ ...row, pk: recordKey(row.kind, row.id), updatedAt: 1 })));
  expect((await repo.get<WorldProfile>("world", "w"))!.characterActions).toEqual(actions);
  expect((await repo.get<SceneEntity>("entity", "mira"))!.characterSheet).toMatchObject({ sprites: person.characterSheet!.sprites, blockedActions: ["Смущается"], initialStatus: { action: "Сидит" } });
  expect((await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!.states.mira!.action).toBe("Сидит");
  expect((await db.records.get(recordKey("entity", "mira")))!.data).toEqual(oldRows[1].data);
  const pack = parseWorldPackage(JSON.stringify({ format: "deeprole-world", version: 1, records: oldRows.slice(0, 2) }));
  expect((pack.records[1]!.data as SceneEntity).characterSheet!.sprites).toEqual(person.characterSheet!.sprites);
  const backup = await parseBackup(JSON.stringify({ format: "deeprole-backup", version: 1, exportedAt: new Date().toISOString(), records: oldRows, settings: { ...DEFAULT_SETTINGS, characterActions: undefined, characterEmotions: actions } }));
  expect(backup.settings.characterActions).toEqual(actions); expect(backup.records).toEqual(oldRows.map(normalizeActionRecord)); expect(oldRows).toEqual(before);
  await browser.storage.local.set({ deeprole_settings: { characterEmotions: actions, locale: "en" } });
  expect((await getSettings()).characterActions).toEqual(actions);
  expect(normalizeActionSettings({ characterActions: ["neutral"], characterEmotions: actions })).toEqual({ characterActions: ["neutral"] });
});

it("reads encrypted legacy records and writes only the new action format after unlock", async () => {
  const { db, repo } = await setup(); const salt = crypto.getRandomValues(new Uint8Array(16)); const key = await deriveVaultKey("password", salt, 1);
  const old = { ...person, characterSheet: { ...person.characterSheet, initialStatus: { ...EMPTY_STATUS, action: undefined, emotion: "Сидит" }, blockedEmotions: ["Смущается"] } };
  await saveVaultConfig({ enabled: true, salt: encodeSalt(salt), iterations: 1, verifier: await encryptJsonWithKey({ ok: true }, key, salt, 1) }); await saveSessionKey(await exportKey(key));
  await db.records.clear(); await db.records.put({ pk: recordKey("entity", "mira"), kind: "entity", id: "mira", encrypted: await encryptJsonWithKey(old, key, salt, 1), updatedAt: 1 });
  const loaded = (await repo.get<SceneEntity>("entity", "mira"))!;
  expect(loaded.characterSheet!.initialStatus!.action).toBe("Сидит"); expect(loaded.characterSheet!.blockedActions).toEqual(["Смущается"]);
  expect(loaded.characterSheet!.sprites).toEqual(person.characterSheet!.sprites); await repo.put("entity", loaded);
  expect((await db.records.get(recordKey("entity", "mira")))!.data).toBeUndefined();
  await repo.lockVault(); await expect(repo.get("entity", "mira")).rejects.toThrow("locked"); await repo.unlockVault("password");
  expect((await repo.get<SceneEntity>("entity", "mira"))!.characterSheet).toEqual(loaded.characterSheet);
});

it("renames every portrait variation, restriction, initial/chat state and snapshot; unrelated worlds remain unchanged", async () => {
  const { repo } = await setup();
  await repo.put("binding", { ...binding, id: "binding:b", chatId: "b", characterScenes: { w: scene, other: scene } });
  await repo.put("entity", { ...person, id: "blocked", characterSheet: { ...person.characterSheet!, blockedActions: ["Сидит"] } });
  const snapshot = { kind: "snapshot", id: "snap", data: { id: "snap", worldId: "w", characterScene: scene } } as unknown as DataRecord;
  const planned = renameWorldActions([...await repo.rawRecords(), snapshot], "w", { "Сидит": "Сидит рядом" });
  expect((planned.at(-1)!.data as any).characterScene.states.mira.action).toBe("Сидит рядом");
  await saveWorldActionList(world, actions.map(key => key === "Сидит" ? "Сидит рядом" : key), repo, { "Сидит": "Сидит рядом" });
  const next = (await repo.get<SceneEntity>("entity", "mira"))!;
  expect(next.characterSheet!.sprites["Сидит рядом"]).toEqual(person.characterSheet!.sprites["Сидит"]);
  expect(next.characterSheet!.sprites["Сидит"]).toBeUndefined(); expect(next.characterSheet!.initialStatus!.action).toBe("Сидит рядом");
  // A prohibited legacy assignment is detached, not silently restored by renaming.
  const blocked = (await repo.get<SceneEntity>("entity", "blocked"))!.characterSheet!;
  expect(blocked.blockedActions).toEqual(["Сидит рядом"]); expect(blocked.portraitLibrary).toContain(photos[1]);
  for (const id of [binding.id, "binding:b"]) expect((await repo.get<ChatBinding>("binding", id))!.characterScenes!.w!.states.mira!.action).toBe("Сидит рядом");
  expect((await repo.get<ChatBinding>("binding", "binding:b"))!.characterScenes!.other).toEqual(scene);
});

it("refuses duplicate names, neutral rename and orphan target collisions without partial writes", async () => {
  const invalidMaps: Record<string, string>[] = [{ neutral: "Calm" }, { "Сидит": "Смеётся" }, { "Сидит": "constructor" }, { "Сидит": "X", "Смеётся": "X" }];
  for (const map of invalidMaps) expect(() => validateActionRenames(actions, [...actions, "Calm", "X"], map)).toThrow("action-rename-invalid");
  const { repo } = await setup(); await repo.put("entity", { ...person, characterSheet: { ...person.characterSheet!, sprites: { ...person.characterSheet!.sprites, "Сидит рядом": photos[0]! } } });
  const before = await repo.rawRecords();
  await expect(saveWorldActionList(world, actions.map(key => key === "Сидит" ? "Сидит рядом" : key), repo, { "Сидит": "Сидит рядом" })).rejects.toThrow("action-rename-conflict");
  expect(await repo.rawRecords()).toEqual(before);
});

it("a stale editor cannot undo renaming while saving unrelated profile text", async () => {
  const { repo } = await setup(); const original = characterEditBaseline(person, [person, hero], scene);
  await saveWorldActionList(world, actions.map(key => key === "Сидит" ? "Сидит рядом" : key), repo, { "Сидит": "Сидит рядом" });
  await saveCharacter({ original, ...original, sheet: { ...original.sheet, appearance: "Green coat" }, entityId: person.id, worldId: "w", chatId: "a", chatUrl: binding.chatUrl, base: "old" }, repo);
  const next = (await repo.get<SceneEntity>("entity", "mira"))!;
  expect(next.characterSheet!.sprites["Сидит рядом"]).toEqual(person.characterSheet!.sprites["Сидит"]); expect(next.characterSheet!.sprites["Сидит"]).toBeUndefined();
  expect(next.characterSheet!.appearance).toBe("Green coat");
  expect((await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!.states.mira!.action).toBe("Сидит рядом");
});

it("global renames affect inherited worlds only and roll back records when settings cannot be stored", async () => {
  const { repo } = await setup(); await repo.put("world", { ...world, characterActions: undefined });
  await repo.put("world", { ...world, id: "explicit" }); await repo.put("entity", { ...person, id: "explicit-person", worldId: "explicit" });
  const settings = { ...DEFAULT_SETTINGS, characterActions: actions }; await saveSettings(settings);
  const before = await repo.rawRecords(); const writer = vi.spyOn(browser.storage.local, "set").mockRejectedValueOnce(Error("quota"));
  await expect(saveDefaultActionList(settings, actions.map(key => key === "Сидит" ? "Сидит рядом" : key), { "Сидит": "Сидит рядом" }, repo)).rejects.toThrow("quota");
  expect(await repo.rawRecords()).toEqual(before); expect((await getSettings()).characterActions).toEqual(actions); writer.mockRestore();
  await saveDefaultActionList(settings, actions.map(key => key === "Сидит" ? "Сидит рядом" : key), { "Сидит": "Сидит рядом" }, repo);
  expect((await repo.get<SceneEntity>("entity", "mira"))!.characterSheet!.sprites["Сидит рядом"]).toEqual(person.characterSheet!.sprites["Сидит"]);
  expect((await repo.get<SceneEntity>("entity", "explicit-person"))!.characterSheet!.sprites).toEqual(person.characterSheet!.sprites);
  expect((await getSettings()).characterActions).toContain("Сидит рядом");
});
