import { afterEach, describe, expect, it } from "vitest";
import { bindCharacterTurn, characterTurnKey, characterInstruction, characterRevision, EMPTY_CHARACTER, EMPTY_STATUS, parseCharacterTurn, validCharacterSheet, validEmotions, portraitSource, silhouetteSource, type CharacterTurn } from "../src/core/characters";
import { validDataRecord, parseBackupSettings } from "../src/core/record-validation";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { applyCharacterTurn, saveCharacter } from "../src/storage/characters";
import { removeEntity, removeWorld, exportWorld, cloneWorldPackage, duplicateEntity } from "../src/storage/worlds";
import { parseBackup, createBackup } from "../src/storage/backup";
import { injectIntoJsonBody } from "../src/core/request-injection";
import type { ChatBinding, SceneEntity, WorldProfile } from "../src/core/types";
import { isSameDeepSeekChat } from "../src/core/chat-scope";

const entity: SceneEntity = { id: "mira", worldId: "w", name: "Mira", kind: "character", description: "  ORIGINAL LORE\n", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1, characterSheet: { ...EMPTY_CHARACTER, appearance: "Blue coat", sprites: {} } };
const world: WorldProfile = { id: "w", name: "World", description: "", color: "#123456", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
const binding: ChatBinding = { id: "binding:a", chatId: "a", chatUrl: "https://chat.deepseek.com/chat/s/a", worldId: "w", focusIds: [], bookId: null, messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1 };
const databases: DeepRoleDatabase[] = [];
async function setup() {
  const db = new DeepRoleDatabase("characters-" + crypto.randomUUID()); databases.push(db); const repo = new DeepRoleRepository(db);
  await repo.mergeRecords([{ kind: "world", id: "w", data: world }, { kind: "entity", id: entity.id, data: entity }, { kind: "binding", id: binding.id, data: binding }, { kind: "binding", id: "binding:b", data: { ...binding, id: "binding:b", chatId: "b", chatUrl: "https://chat.deepseek.com/chat/s/b" } }]);
  return repo;
}
afterEach(async () => { await Promise.all(databases.map(db => db.delete())); databases.length = 0; });
const scope = () => ({ worldId: "w", chatId: "a", chatUrl: binding.chatUrl, base: characterRevision([entity]) });
const turn = (): CharacterTurn => ({ world: "w", chat: "a", base: scope().base, present: ["mira"], updates: [{ id: "mira", state: { ...EMPTY_STATUS, emotion: "happy", condition: "Safe", stats: [{ label: "Energy", value: "Tired" }] } }] });
const block = (value: unknown) => `<deeprole_characters>${JSON.stringify(value)}</deeprole_characters>`;

describe("locally bound character replies", () => {
  const receipt = () => ({ id: "request-123456", ...scope(), accepted: true, createdAt: 1 });
  it("uses a request marker and names, not local world/entity identifiers", () => {
    const prompt = characterInstruction("world-local-secret", "a", [entity], undefined, ["neutral"], [], "", receipt().id);
    const schema = JSON.parse(prompt.match(/Schema: (.*)\nRoster:/)![1]!);
    expect(schema).toMatchObject({ request: receipt().id, present: ["Mira"] });
    expect(schema.world).toBeUndefined(); expect(schema.base).toBeUndefined();
    expect(parseCharacterTurn(block(schema))).not.toBeNull(); expect(prompt).not.toContain("world-local-secret");
  });
  it("ignores obsolete model scope fields only for a verified local send", () => {
    const incoming = { ...turn(), request: receipt().id, world: "old-copy", chat: "old-chat", base: "old-version" };
    const bound = bindCharacterTurn(incoming, receipt(), scope())!;
    expect(bound).toMatchObject({ world: "w", chat: "a", base: scope().base });
    expect(characterTurnKey(bound)).toBe(characterTurnKey(incoming));
    expect(bindCharacterTurn(incoming, undefined, scope())).toBeNull();
    expect(bindCharacterTurn(incoming, { ...receipt(), accepted: false }, scope())).toBeNull();
  });
  it.each(["worldId", "chatId", "base"] as const)("rejects an actual changed %s", field => {
    expect(bindCharacterTurn({ ...turn(), request: receipt().id }, receipt(), { ...scope(), [field]: "changed" })).toBeNull();
  });
  it("rejects a marker belonging to the same chat in another browser", () => {
    expect(bindCharacterTurn({ ...turn(), request: "another-browser-request" }, receipt(), scope())).toBeNull();
    expect(parseCharacterTurn(block({ ...turn(), request: "__proto__" }))).toBeNull();
  });
  it("recognizes the same reply despite reordered keys, but keeps null/omitted partner distinct", () => {
    const original = { ...turn(), request: receipt().id };
    const reversed = JSON.parse(JSON.stringify(original, (_key, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value));
    expect(characterTurnKey(original)).toBe(characterTurnKey(reversed));
    expect(characterTurnKey(original)).not.toBe(characterTurnKey({ ...original, partner: null }));
  });
  it("resolves verified names locally and creates the missing interlocutor atomically", async () => {
    const repo = await setup();
    const named = { ...turn(), request: receipt().id, present: ["Mira", "new:Noah"], partner: "new:Noah", updates: [{ id: "Mira", state: EMPTY_STATUS }, { id: "new:Noah", name: "Noah", state: EMPTY_STATUS }] };
    await applyCharacterTurn(scope(), named, undefined, repo, true);
    const people = await repo.list<SceneEntity>("entity"); expect(people).toHaveLength(2);
    expect(people.find(p => p.id === "mira")!.description).toBe(entity.description);
    const scene = (await repo.list<ChatBinding>("binding")).find(b => b.id === binding.id)!.characterScenes!.w!;
    expect(scene.partnerId).toBe(people.find(p => p.name === "Noah")!.id);
    expect(scene.presentIds).toHaveLength(2);
  });
  it("never chooses between two different characters with the same name", async () => {
    const repo = await setup(); const duplicate = { ...entity, id: "mira-other" };
    await repo.mergeRecords([{ kind: "entity", id: duplicate.id, data: duplicate }]);
    await expect(applyCharacterTurn({ ...scope(), base: characterRevision([entity, duplicate]) }, { ...turn(), base: characterRevision([entity, duplicate]), request: receipt().id }, undefined, repo, true)).rejects.toThrow("character-unknown");
  });
});

it("keeps one protagonist when a profile is duplicated", async () => {
  const repo = await setup();
  const hero = { ...entity, characterSheet: { ...entity.characterSheet!, protagonist: true } };
  await repo.mergeRecords([{ kind: "entity", id: hero.id, data: hero }]);
  await duplicateEntity(hero, "Copy", repo);
  const entities = await repo.list<SceneEntity>("entity");
  expect(entities.filter(e => e.characterSheet?.protagonist)).toHaveLength(1);
  expect(entities.find(e => e.name === "Copy")?.characterSheet?.appearance).toBe("Blue coat");
});

it("preserves an explicit no-interlocutor state after a manual edit", async () => {
  const repo = await setup();
  const incoming = { ...turn(), partner: null };
  await applyCharacterTurn(scope(), incoming, undefined, repo);
  const current = (await repo.list<ChatBinding>("binding")).find(r => r.id === binding.id)!;
  await saveCharacter({ ...scope(), base: characterRevision([entity], current.characterScenes!.w), entityId: entity.id, name: entity.name, sheet: entity.characterSheet!, state: EMPTY_STATUS, present: true }, repo);
  const next = (await repo.list<ChatBinding>("binding")).find(r => r.id === binding.id)!;
  expect(next.characterScenes!.w!.partnerId).toBeNull();
});

describe("character protocol", () => {
  it("gives an empty imported world a usable named first-character schema", () => {
    const prompt = characterInstruction("w", "a", [], undefined, ["neutral"], [], "");
    const schema = JSON.parse(prompt.match(/Schema: (.*)\nRoster:/)![1]!);
    expect(schema.updates[0]).toMatchObject({ id: "new:Character name", name: "Character name" });
    expect(parseCharacterTurn(block(schema))).not.toBeNull();
    expect(prompt).toContain("latest instruction");
  });
  it("always keeps the protagonist in the six active profiles", () => {
    const cast = Array.from({ length: 9 }, (_, i) => ({ ...entity, id: `actor${i}`, name: `Actor ${i}`, characterSheet: { ...entity.characterSheet!, protagonist: i === 8, appearance: `LOOK_${i}` } }));
    const prompt = characterInstruction("w", "a", cast, undefined, ["neutral"], cast.map(e => e.id), "");
    expect(prompt).toContain("LOOK_8");
    expect(prompt.match(/LOOK_/g)).toHaveLength(6);
  });
  it("accepts a complete neutral update with an ordinary scene around it", () => expect(parseCharacterTurn("Mira smiles.\n" + block(turn()))).toEqual(turn()));
  it.each(["{}", "<deeprole_characters>{}", block(turn()) + block(turn()), block({ ...turn(), present: ["mira", "mira"] }), block({ ...turn(), updates: [turn().updates[0], turn().updates[0]] }), block({ ...turn(), updates: [{ id: "__proto__", state: EMPTY_STATUS }] })])("rejects malformed, duplicate or prototype data: %s", text => expect(parseCharacterTurn(text)).toBeNull());
  it("rejects oversized stats and profiles", () => {
    expect(parseCharacterTurn(block({ ...turn(), updates: [{ id: "mira", state: { ...EMPTY_STATUS, stats: Array(7).fill({ label: "a", value: "b" }) } }] }))).toBeNull();
    expect(validCharacterSheet({ ...EMPTY_CHARACTER, appearance: "x".repeat(1201) })).toBe(false);
  });
  it("uses custom emotions and excludes all image bytes from context", () => {
    const e = { ...entity, characterSheet: { ...entity.characterSheet!, protagonist: true, sprites: { neutral: "data:image/png;base64,AAAA" } } };
    const prompt = characterInstruction("w", "a", [e], undefined, ["neutral", "Focused"], [], "");
    expect(prompt).toContain("Focused"); expect(prompt).toContain("Blue coat"); expect(prompt).not.toContain("base64"); expect(prompt).not.toContain("sprites"); expect(prompt).not.toContain("ORIGINAL LORE");
    expect(prompt.length).toBeLessThan(2600);
  });
  it("accepts custom emotion names but rejects duplicate, reserved and missing defaults", () => {
    expect(validEmotions(["neutral", "Смущение"])).toBe(true);
    for (const v of [["happy"], ["neutral", "neutral"], ["neutral", "__proto__"], ["neutral", "x".repeat(33)]]) expect(validEmotions(v)).toBe(false);
  });
  it("never renders remote URLs or user SVG", () => {
    for (const image of ["https://example.test/a.png", "data:image/svg+xml;base64,PHN2Zz4=", "javascript:alert(1)"]) {
      expect(validCharacterSheet({ ...EMPTY_CHARACTER, sprites: { neutral: image } })).toBe(false);
      expect(portraitSource({ ...entity, characterSheet: { ...EMPTY_CHARACTER, sprites: { neutral: image } } })).toBeNull();
    }
  });
  it("falls back to the neutral portrait", () => expect(portraitSource({ ...entity, characterSheet: { ...EMPTY_CHARACTER, sprites: { neutral: "data:image/png;base64,AAAA" } } }, { ...EMPTY_STATUS, emotion: "happy" })).toBe("data:image/png;base64,AAAA"));
  it.each(["male", "female", "neutral"] as const)("uses a native 3:4 %s placeholder with a full portrait background", gender => {
    const svg = new DOMParser().parseFromString(decodeURIComponent(silhouetteSource(gender).split(",")[1]!), "image/svg+xml").documentElement;
    expect(svg.getAttribute("viewBox")).toBe("0 0 120 160");
    expect(svg.getAttribute("width")).toBe("120"); expect(svg.getAttribute("height")).toBe("160");
    expect(svg.querySelector("rect")?.getAttribute("width")).toBe("120");
    expect(svg.querySelector("rect")?.getAttribute("height")).toBe("160");
  });
  it("does not inject twice with choices disabled and no lore selected", () => {
    const body = JSON.stringify({ prompt: "<deeprole_character_mode>already</deeprole_character_mode>" });
    expect(injectIntoJsonBody(body, "more").body).toBe(body);
  });
});

describe("character storage and isolation", () => {
  it("accepts the same DeepSeek chat at /chat and /a/chat without accepting another chat or origin", async () => {
    const repo = await setup();
    const canonical = "https://chat.deepseek.com/chat/s/a";
    const alternative = "https://chat.deepseek.com/a/chat/s/a";
    expect(isSameDeepSeekChat(canonical, alternative, "a")).toBe(true);
    for (const other of ["https://chat.deepseek.com/a/chat/s/b", "https://other.example/chat/s/a", "https://chat.deepseek.com/not-chat/a", "not a url"]) expect(isSameDeepSeekChat(canonical, other, "a")).toBe(false);
    await applyCharacterTurn({ ...scope(), chatUrl: alternative }, turn(), undefined, repo);
    expect((await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!.states.mira!.emotion).toBe("happy");
  });
  it("uses the explicit new:Name when the model omits the redundant name field", async () => {
    const repo = await setup();
    const t = { ...turn(), present: ["new:Noah"], partner: "new:Noah", updates: [{ id: "new:Noah", state: EMPTY_STATUS }] };
    await applyCharacterTurn(scope(), t, undefined, repo);
    const created = (await repo.list<SceneEntity>("entity")).find(e => e.name === "Noah")!;
    expect(created).toBeDefined();
    expect((await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!.partnerId).toBe(created.id);
  });
  it("saves the chat state without rewriting source lore or other chats", async () => {
    const repo = await setup(); await applyCharacterTurn(scope(), turn(), undefined, repo);
    expect(await repo.get("entity", "mira")).toEqual(entity);
    expect((await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!.states.mira!.emotion).toBe("happy");
    expect((await repo.get<ChatBinding>("binding", "binding:b"))!.characterScenes).toBeUndefined();
    await expect(applyCharacterTurn(scope(), turn(), undefined, repo)).rejects.toThrow("character-conflict");
  });
  it("manual edits protect against an older reply and keep original text intact", async () => {
    const repo = await setup(); await saveCharacter({ ...scope(), entityId: "mira", name: "Mira", sheet: { ...entity.characterSheet!, appearance: "Red coat", protagonist: true }, state: { ...EMPTY_STATUS, goal: "Find the key" }, present: true }, repo);
    const saved = (await repo.get<SceneEntity>("entity", "mira"))!;
    expect(saved.description).toBe(entity.description); expect(saved.characterSheet!.appearance).toBe("Red coat");
    await expect(applyCharacterTurn(scope(), turn(), undefined, repo)).rejects.toThrow("character-conflict");
    expect(characterInstruction("w", "a", [saved], (await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w, ["neutral"], [], "")).toContain("Find the key");
  });
  it("creates new characters once and puts them in the world/map entity collection", async () => {
    const repo = await setup(); const t = turn(); t.present.push("new:Noah"); t.updates.push({ id: "new:Noah", name: "Noah", appearance: "Green coat", state: EMPTY_STATUS });
    await applyCharacterTurn(scope(), t, undefined, repo);
    const entities = await repo.list<SceneEntity>("entity"); expect(entities).toHaveLength(2); expect(entities.find(e => e.name === "Noah")!.worldId).toBe("w");
  });
  it("rejects wrong chat/world or invented known IDs atomically", async () => {
    const repo = await setup(); const before = await repo.rawRecords();
    for (const t of [{ ...turn(), chat: "b" }, { ...turn(), world: "other" }, { ...turn(), present: ["missing"] }, { ...turn(), updates: [{ id: "missing", state: EMPTY_STATUS }] }]) await expect(applyCharacterTurn(scope(), t, undefined, repo)).rejects.toThrow();
    expect(await repo.rawRecords()).toEqual(before);
  });
  it("accepts configured emotions only", async () => {
    const repo = await setup(); await expect(applyCharacterTurn(scope(), turn(), ["neutral"], repo)).rejects.toThrow("character-invalid");
    const t = turn(); t.updates[0]!.state.emotion = "Focused"; await applyCharacterTurn(scope(), t, ["neutral", "Focused"], repo);
  });
  it("persists sprites and states through full backup validation", async () => {
    const repo = await setup(); await saveCharacter({ ...scope(), entityId: "mira", name: "Mira", sheet: { ...entity.characterSheet!, sprites: { neutral: "data:image/png;base64,AAAA" } }, state: EMPTY_STATUS, present: true }, repo);
    const parsed = await parseBackup(JSON.stringify(await createBackup(undefined, repo)));
    expect(parsed.records).toEqual(await repo.rawRecords()); expect(parseBackupSettings({ locale: "ru" }).characterSheetsEnabled).toBe(true);
    expect(validDataRecord({ kind: "entity", id: "mira", data: { ...entity, characterSheet: { ...EMPTY_CHARACTER, sprites: { neutral: "https://tracker.test" } } } })).toBe(false);
  });
  it("carries profiles/sprites, but not private chat states, into a portable world", async () => {
    const repo = await setup(); await applyCharacterTurn(scope(), turn(), undefined, repo); const portable = await exportWorld("w", repo);
    expect(portable.records.some(r => r.kind === "binding")).toBe(false);
    const clone = cloneWorldPackage(portable); expect((clone.find(r => r.kind === "entity")!.data as SceneEntity).characterSheet).toEqual(entity.characterSheet);
  });
  it("cleans states when their character or world is removed", async () => {
    const repo = await setup(); await applyCharacterTurn(scope(), turn(), undefined, repo); await removeEntity("mira", repo);
    expect((await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!.states).toEqual({});
    await removeWorld("w", repo); expect((await repo.get<ChatBinding>("binding", binding.id))!.characterScenes).toEqual({});
  });
  it("encrypts sheets, images and scene state together and refuses writes while locked", async () => {
    const repo = await setup();
    await saveCharacter({ ...scope(), entityId: "mira", name: "Mira", sheet: { ...entity.characterSheet!, sprites: { neutral: "data:image/png;base64,AAAA" } }, state: EMPTY_STATUS, present: true }, repo);
    await repo.enableVault("character-test-password");
    const rows = await databases.at(-1)!.records.toArray();
    expect(rows.every(row => row.data === undefined && !!row.encrypted)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("base64,AAAA");
    await repo.lockVault(); await expect(applyCharacterTurn(scope(), turn(), undefined, repo)).rejects.toThrow("locked");
    await repo.unlockVault("character-test-password");
    expect((await repo.get<SceneEntity>("entity", "mira"))!.characterSheet!.sprites.neutral).toBe("data:image/png;base64,AAAA");
  });
  it("rejects a partner who is not present", async () => {
    const repo = await setup(); await expect(applyCharacterTurn(scope(), { ...turn(), partner: "unknown" }, undefined, repo)).rejects.toThrow("character-unknown");
    await applyCharacterTurn(scope(), { ...turn(), partner: "mira" }, undefined, repo);
    expect((await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!.partnerId).toBe("mira");
  });
});
