import { afterEach, describe, expect, it } from "vitest";
import { characterCast, characterInterlocutors, characterInstruction, characterRevision, characterTurnKey, EMPTY_CHARACTER, EMPTY_STATUS, parseCharacterTurn } from "../src/core/characters";
import { PORTRAIT_MAX_WIDTH, portraitBounds, portraitPose, validPortraitLayout, validPortraitPose } from "../src/core/portrait-layout";
import { validDataRecord, parseBackupSettings } from "../src/core/record-validation";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { applyCharacterTurn, saveCharacter } from "../src/storage/characters";
import { savePortraitLayout } from "../src/storage/portrait-layout";
import { removeEntity, removeWorld } from "../src/storage/worlds";
import { createBackup, parseBackup } from "../src/storage/backup";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import type { CharacterScene, ChatBinding, SceneEntity } from "../src/core/types";

const people: SceneEntity[] = ["hero", "mira", "leon", "guard"].map(id => ({ id, name: id, worldId: "w", kind: "character", description: "Original", aliases: [], memberIds: [], characterSheet: { ...EMPTY_CHARACTER, protagonist: id === "hero" }, createdAt: 1, updatedAt: 1 }));
const initial: CharacterScene = { revision: "v", presentIds: people.map(p => p.id), partnerIds: ["mira", "leon"], partnerId: "mira", states: { mira: EMPTY_STATUS }, lastReply: "consumed", updatedAt: 1 };
const binding: ChatBinding = { id: "binding:a", chatId: "a", chatUrl: "https://chat.deepseek.com/chat/s/a", worldId: "w", bookId: null, focusIds: [], messageCountAtAnalysis: 0, characterScenes: { w: initial }, createdAt: 1, updatedAt: 1 };
const databases: DeepRoleDatabase[] = [];
async function setup() {
  const db = new DeepRoleDatabase(`portrait-${crypto.randomUUID()}`); databases.push(db); const repo = new DeepRoleRepository(db);
  await repo.mergeRecords([{ kind: "world", id: "w", data: { id: "w", name: "World", description: "", color: "#123456", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 } }, ...people.map(data => ({ kind: "entity" as const, id: data.id, data })), { kind: "binding", id: binding.id, data: binding }, { kind: "binding", id: "binding:b", data: { ...binding, id: "binding:b", chatId: "b", chatUrl: "https://chat.deepseek.com/chat/s/b", characterScenes: {} } }]); return repo;
}
afterEach(async () => { await Promise.all(databases.map(db => db.delete())); databases.length = 0; });
const scope = () => ({ worldId: "w", chatId: "a", chatUrl: binding.chatUrl, base: characterRevision(people, initial) });
const pose = { x: .4, y: 100, width: 240 };
const edit = () => ({ ...scope(), entityId: "mira", pose, resetAt: 0 });
const block = (data: unknown) => `<deeprole_characters>${JSON.stringify(data)}</deeprole_characters>`;

describe("multiple speakers and bystanders", () => {
  it("keeps all participants when Leon talks to the guard, without making Mira leave", () => {
    const scene = { ...initial, partnerIds: ["mira"], partnerId: "mira" };
    expect(characterCast(people, scene).map(p => p.id)).toEqual(["hero", "mira", "leon", "guard"]);
    expect(characterInterlocutors(people, scene).map(p => p.id)).toEqual(["mira"]);
    expect(characterCast(people, { ...scene, partnerIds: [], partnerId: null })).toHaveLength(4);
  });
  it("accepts multiple speakers and old single-speaker replies", () => {
    const turn = { world: "w", chat: "a", base: scope().base, present: initial.presentIds, partners: ["mira", "leon"], updates: [] };
    expect(parseCharacterTurn(block(turn))).toEqual(turn);
    expect(parseCharacterTurn(block({ ...turn, partner: "mira" }))).not.toBeNull();
    expect(parseCharacterTurn(block({ ...turn, partner: "leon" }))).toBeNull();
    expect(parseCharacterTurn(block({ ...turn, partners: ["mira", "mira"] }))).toBeNull();
    expect(parseCharacterTurn(block({ ...turn, partners: ["outsider"] }))).toBeNull();
    const { partners, ...legacy } = turn;
    expect(parseCharacterTurn(block({ ...legacy, partner: "leon" }))).not.toBeNull();
    expect(characterTurnKey(turn)).not.toBe(characterTurnKey({ ...turn, partners: [] }));
  });
  it("updates several speakers atomically without putting the player in their own list", async () => {
    const repo = await setup(); const turn = { world: "w", chat: "a", base: scope().base, present: initial.presentIds, partners: ["leon", "mira"], updates: [] };
    await expect(applyCharacterTurn(scope(), { ...turn, partners: ["hero"] }, undefined, repo)).rejects.toThrow();
    await applyCharacterTurn(scope(), turn, undefined, repo);
    expect((await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w).toMatchObject({ partnerIds: ["leon", "mira"], partnerId: "leon", presentIds: initial.presentIds });
  });
  it("manual selection adds/removes only that speaker and preserves the consumed reply", async () => {
    const repo = await setup();
    await saveCharacter({ ...scope(), entityId: "guard", name: "guard", sheet: people[3]!.characterSheet!, state: EMPTY_STATUS, present: true, interlocutor: true }, repo);
    const scene = (await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!;
    expect(scene.partnerIds).toEqual(["guard", "mira", "leon"]); expect(scene.lastReply).toBe("consumed");
    await saveCharacter({ ...scope(), base: characterRevision(await repo.list<SceneEntity>("entity"), scene), entityId: "leon", name: "leon", sheet: people[2]!.characterSheet!, state: EMPTY_STATUS, present: false }, repo);
    expect((await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!.partnerIds).toEqual(["guard", "mira"]);
  });
  it("explains simultaneous speakers and bystanders in one normal request", () => {
    const prompt = characterInstruction("w", "a", people, initial, ["neutral"], [], "");
    expect(prompt).toContain("Several people"); expect(prompt).toContain("A change of addressee is not a departure");
    expect(prompt).not.toContain("portraitLayouts"); expect(prompt).not.toContain("data:image");
  });
});

describe("saved UI layout", () => {
  it("stores viewport coordinates without accepting ambiguous or unsafe versions", () => {
    const floating = portraitPose(900, 300, 240, 1200, 900);
    expect(floating).toEqual({ x: .9375, y: 1 / 3, width: 240, space: "viewport" });
    expect(portraitBounds(floating, 1200, 900)).toEqual({ x: 900, y: 300, width: 240 });
    expect(validPortraitPose(floating)).toBe(true);
    expect(validPortraitPose({ ...floating, y: 1.01 })).toBe(false);
    expect(validPortraitPose({ ...floating, space: "unknown" })).toBe(false);
    expect(validPortraitPose(pose)).toBe(true);
  });
  it("preserves floating positions in backups without sending them to DeepSeek", async () => {
    const repo = await setup(); const floating = { x: .9, y: .2, width: 260, space: "viewport" as const };
    await savePortraitLayout({ ...edit(), pose: floating }, repo);
    const backup = await parseBackup(JSON.stringify(await createBackup(undefined, repo)));
    const restored = backup.records.find(r => r.id === binding.id)!;
    expect(validDataRecord(restored)).toBe(true);
    expect((restored.data as ChatBinding).portraitLayouts!.w!.positions.mira).toEqual(floating);
    expect((restored.data as ChatBinding).characterScenes!.w).toEqual(initial);
  });
  it.each([{ ...pose, x: NaN }, { ...pose, y: -1 }, { ...pose, y: 1201 }, { ...pose, x: 1.01 }, { ...pose, width: 0 }, { ...pose, width: Infinity }, { ...pose, width: 8193 }, { ...pose, manualSize: "true" }])("rejects unsafe coordinates %j", value => expect(validPortraitPose(value)).toBe(false));
  it("clamps resizing and adapts to narrow panels without changing the saved width", () => {
    expect(portraitPose(-20, -10, 900, 300)).toEqual({ x: 0, y: 0, width: 900 });
    expect(portraitPose(900, 9000, 240, 900)).toEqual({ x: 1, y: 1200, width: 240 });
    expect(portraitBounds({ x: 1, y: 100, width: 360 }, 280)).toEqual({ x: 0, y: 100, width: 280 });
    expect(validPortraitLayout({ resetAt: 0, positions: JSON.parse('{"__proto__":{"x":0,"y":0,"width":120}}') })).toBe(false);
  });
  it("accepts large manual sizes without removing the technical bound or accepting invalid flags", () => {
    expect(PORTRAIT_MAX_WIDTH).toBe(8192);
    expect(validPortraitPose({ ...pose, width: 640, manualSize: true })).toBe(true);
    expect(validPortraitPose({ ...pose, width: PORTRAIT_MAX_WIDTH })).toBe(true);
    expect(validPortraitPose({ ...pose, width: PORTRAIT_MAX_WIDTH + 1 })).toBe(false);
    expect(validPortraitPose({ ...pose, manualSize: null })).toBe(false);
    expect(portraitPose(0, 0, 90000, 1800, 1000).width).toBe(PORTRAIT_MAX_WIDTH);
  });
  it("fits the full card using actual caption height without rewriting the requested width", () => {
    const full = { x: 1, y: .2, width: 900, space: "viewport" as const, manualSize: true };
    expect(portraitBounds(full, 1784, 944, 64)).toEqual({ x: 1124, y: 188.8, width: 660 });
    expect(portraitBounds(full, 304, 784, 64).width).toBe(304);
    expect(portraitBounds(full, 1784, 1400, 64).width).toBe(900);
    expect(full.width).toBe(900);
  });
  it("keeps resized identities and scene data intact through storage and full backups", async () => {
    const repo = await setup(); const large = { x: .9, y: .01, width: 640, space: "viewport" as const, manualSize: true };
    await savePortraitLayout({ ...edit(), pose: large }, repo);
    const backup = await parseBackup(JSON.stringify(await createBackup(undefined, repo)));
    const restored = backup.records.find(r => r.id === binding.id)!;
    expect(validDataRecord(restored)).toBe(true);
    expect((restored.data as ChatBinding).portraitLayouts!.w!.positions.mira).toEqual(large);
    expect((restored.data as ChatBinding).characterScenes!.w).toEqual(initial);
    expect(await repo.list<SceneEntity>("entity")).toEqual([...people].sort((a, b) => a.id.localeCompare(b.id)));
  });
  it("merges concurrent UI changes without rewriting memory, scene version or the other chat", async () => {
    const repo = await setup(); const before = await repo.get<ChatBinding>("binding", "binding:b");
    await Promise.all([savePortraitLayout(edit(), repo), savePortraitLayout({ ...edit(), entityId: "leon", pose: { ...pose, width: 192 } }, repo)]);
    const saved = (await repo.get<ChatBinding>("binding", binding.id))!;
    expect(saved.portraitLayouts!.w!.positions).toEqual({ mira: pose, leon: { ...pose, width: 192 } });
    expect(saved.characterScenes!.w).toEqual(initial); expect(characterRevision(people, saved.characterScenes!.w)).toBe(scope().base);
    expect(await repo.get<ChatBinding>("binding", "binding:b")).toEqual(before); expect(await repo.list<SceneEntity>("entity")).toEqual([...people].sort((a, b) => a.id.localeCompare(b.id)));
    const turn = { world: "w", chat: "a", base: scope().base, present: initial.presentIds, partners: ["mira"], updates: [] };
    await applyCharacterTurn(scope(), turn, undefined, repo); expect((await repo.get<ChatBinding>("binding", binding.id))!.portraitLayouts).toEqual(saved.portraitLayouts);
  });
  it.each(["world", "chat", "entity", "url", "invalid"])("rejects wrong %s without modifying anything", async reason => {
    const repo = await setup(); const before = await repo.rawRecords();
    const bad = { ...edit(), ...(reason === "world" ? { worldId: "other" } : reason === "chat" ? { chatId: "b" } : reason === "entity" ? { entityId: "unknown" } : reason === "url" ? { chatUrl: "https://chat.deepseek.com/chat/s/b" } : { pose: { ...pose, width: 0 } }) };
    if (reason === "chat") bad.chatUrl = binding.chatUrl;
    await expect(savePortraitLayout(bad, repo)).rejects.toThrow(); expect(await repo.rawRecords()).toEqual(before);
  });
  it("resets only layout, and includes the positions and multiple speakers in a full backup", async () => {
    const repo = await setup(); await savePortraitLayout(edit(), repo);
    const backup = await parseBackup(JSON.stringify(await createBackup(undefined, repo)));
    const restored = backup.records.find(r => r.id === binding.id)!; expect(validDataRecord(restored)).toBe(true);
    expect((restored.data as ChatBinding).portraitLayouts!.w!.positions.mira).toEqual(pose);
    expect((restored.data as ChatBinding).characterScenes!.w!.partnerIds).toEqual(["mira", "leon"]);
    await savePortraitLayout({ ...edit(), entityId: null, pose: null }, repo);
    expect((await repo.get<ChatBinding>("binding", binding.id))!.portraitLayouts!.w!.positions).toEqual({});
    expect((await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w).toEqual(initial);
    expect(parseBackupSettings({ ...DEFAULT_SETTINGS, portraitLayoutResetAt: 42 }).portraitLayoutResetAt).toBe(42);
  });
  it("removes deleted participants and worlds from UI layouts and speaker lists", async () => {
    const repo = await setup(); await savePortraitLayout(edit(), repo); await removeEntity("mira", repo);
    const after = (await repo.get<ChatBinding>("binding", binding.id))!;
    expect(after.portraitLayouts!.w!.positions).toEqual({}); expect(after.characterScenes!.w!.partnerIds).toEqual(["leon"]);
    await removeWorld("w", repo); expect((await repo.get<ChatBinding>("binding", binding.id))!.portraitLayouts).toEqual({});
  });
});
