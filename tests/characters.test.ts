import { afterEach, describe, expect, it } from "vitest";
import { bindCharacterTurn, characterTurnKey, characterInstruction, characterRevision, characterHighlights, characterInterlocutor, EMPTY_CHARACTER, EMPTY_STATUS, parseCharacterTurn, validCharacterSheet, validEmotions, portraitSource, silhouetteSource, type CharacterTurn } from "../src/core/characters";
import { validDataRecord, parseBackupSettings } from "../src/core/record-validation";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { applyCharacterTurn, saveCharacter } from "../src/storage/characters";
import { removeEntity, removeWorld, exportWorld, parseWorldPackage, cloneWorldPackage, duplicateEntity } from "../src/storage/worlds";
import { parseBackup, createBackup } from "../src/storage/backup";
import { injectIntoJsonBody } from "../src/core/request-injection";
import type { ChatBinding, SceneEntity, WorldProfile } from "../src/core/types";
import { isSameDeepSeekChat } from "../src/core/chat-scope";
import { characterEditBaseline } from "../src/core/character-edit";
import { assignLibraryImages, withPortraitLibrary } from "../src/core/portrait-library";

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

it("persists an unassigned library through live updates, reopening, assignment and both exports", async () => {
  const repo = await setup(); const images = Array.from({ length: 20 }, (_, i) => `data:image/png;base64,${btoa(`image-${i}`)}`);
  const edit = { ...scope(), original: characterEditBaseline(entity, [entity]), entityId: entity.id, name: entity.name, sheet: withPortraitLibrary(entity.characterSheet!, images), state: EMPTY_STATUS, present: false };
  await applyCharacterTurn(scope(), turn(), undefined, repo); await saveCharacter(edit, repo);
  let person = (await repo.get<SceneEntity>("entity", entity.id))!;
  expect(person.characterSheet!.portraitLibrary).toEqual(images);
  const scene = (await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!;
  expect(scene.states.mira!.condition).toBe("Safe");
  await saveCharacter({ ...edit, base: characterRevision([person], scene), original: characterEditBaseline(person, [person], scene), sheet: assignLibraryImages(person.characterSheet!, "happy", images.slice(0, 3)), state: scene.states.mira!, present: true }, repo);
  person = (await repo.get<SceneEntity>("entity", entity.id))!;
  expect(person.characterSheet!.portraitLibrary).toEqual(images.slice(3)); expect(person.characterSheet!.sprites.happy).toEqual(images.slice(0, 3));
  const currentScene = (await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!;
  const base = characterRevision([person], currentScene);
  await applyCharacterTurn({ ...scope(), base }, { ...turn(), base, updates: [{ id: "mira", state: { ...EMPTY_STATUS, goal: "Open the observatory" } }] }, undefined, repo);
  expect((await repo.get<SceneEntity>("entity", entity.id))!.characterSheet).toEqual(person.characterSheet);
  const pack = await parseWorldPackage(JSON.stringify(await exportWorld("w", repo)));
  expect((cloneWorldPackage(pack).find(r => r.kind === "entity")!.data as SceneEntity).characterSheet).toEqual(person.characterSheet);
  expect((await parseBackup(JSON.stringify(await createBackup(undefined, repo)))).records).toEqual(await repo.rawRecords());
});

it("rejects conflicting library edits and over-budget libraries without partial writes", async () => {
  const repo = await setup(); const edit = { ...scope(), original: characterEditBaseline(entity, [entity]), entityId: entity.id, name: entity.name, sheet: { ...entity.characterSheet!, portraitLibrary: ["data:image/png;base64,AAAA"] }, state: EMPTY_STATUS, present: false };
  await saveCharacter(edit, repo); const before = await repo.rawRecords();
  await expect(saveCharacter({ ...edit, sheet: { ...edit.sheet, portraitLibrary: ["data:image/png;base64,BBBB"] } }, repo)).rejects.toThrow("character-edit-conflict");
  expect(await repo.rawRecords()).toEqual(before);
  const person = (await repo.get<SceneEntity>("entity", entity.id))!;
  const images = Array.from({ length: 140 }, (_, i) => "data:image/png;base64," + btoa(String(i).padStart(6, "0")) + "A".repeat(179000));
  await expect(saveCharacter({ ...edit, original: characterEditBaseline(person, [person]), sheet: { ...edit.sheet, portraitLibrary: images } }, repo)).rejects.toThrow("character-images-full");
  expect(await repo.rawRecords()).toEqual(before);
});

describe("manual portrait edits alongside live updates", () => {
  const images = { happy: ["data:image/png;base64,AAAA", "data:image/png;base64,BBBB"] };
  const opened = () => ({ ...scope(), original: characterEditBaseline(entity, [entity]), entityId: entity.id, name: entity.name, sheet: structuredClone(entity.characterSheet!), state: structuredClone(EMPTY_STATUS), present: false });

  it("saves a new protagonist and emotion images without rolling back a reply received while editing", async () => {
    const repo = await setup(); const edit = opened();
    edit.sheet.protagonist = true; edit.sheet.sprites = images;
    await applyCharacterTurn(scope(), turn(), undefined, repo);
    const live = (await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!;
    await saveCharacter(edit, repo);
    const person = (await repo.get<SceneEntity>("entity", entity.id))!;
    const scene = (await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!;
    expect(person.characterSheet!.sprites).toEqual(images);
    expect(person.characterSheet!.protagonist).toBe(true);
    expect(person.description).toBe(entity.description);
    expect(scene.states).toEqual(live.states); expect(scene.presentIds).toEqual(live.presentIds);
    expect(scene.lastReply).toBe(live.lastReply); expect(scene.partnerIds).toEqual([]);
    expect((await repo.get<ChatBinding>("binding", "binding:b"))!.characterScenes).toBeUndefined();
    expect((await repo.rawRecords()).every(validDataRecord)).toBe(true);
  });

  it("preserves unrelated state changes while applying a manually edited field", async () => {
    const repo = await setup(); const edit = opened(); edit.state.goal = "Find the telescope";
    await applyCharacterTurn(scope(), turn(), undefined, repo);
    await saveCharacter(edit, repo);
    const scene = (await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!;
    expect(scene.states.mira).toMatchObject({ ...turn().updates[0]!.state, goal: edit.state.goal });
  });

  it("merges separate emotions uploaded in two editors", async () => {
    const repo = await setup(); const first = opened(), second = opened();
    first.sheet.sprites.happy = images.happy; second.sheet.sprites.neutral = images.happy[0]!;
    await saveCharacter(first, repo); await saveCharacter(second, repo);
    expect((await repo.get<SceneEntity>("entity", entity.id))!.characterSheet!.sprites).toEqual({ ...images, neutral: images.happy[0] });
  });

  it.each(["portrait", "profile", "state"])("rejects competing edits to the same %s without a partial save", async kind => {
    const repo = await setup(); const first = opened(), second = opened();
    if (kind === "portrait") { first.sheet.sprites.happy = images.happy[0]!; second.sheet.sprites.happy = images.happy[1]!; }
    if (kind === "profile") { first.sheet.appearance = "Green coat"; second.sheet.appearance = "Red coat"; }
    if (kind === "state") { first.state.goal = "Open the door"; second.state.goal = "Close the door"; }
    await saveCharacter(first, repo); const before = await repo.rawRecords();
    second.sheet.protagonist = true;
    await expect(saveCharacter(second, repo)).rejects.toThrow("character-edit-conflict");
    expect(await repo.rawRecords()).toEqual(before);
    expect(second.sheet.protagonist).toBe(true); // failed save does not mutate the draft
  });

  it("accepts identical concurrent edits instead of reporting a conflict", async () => {
    const repo = await setup(); const edit = opened(); edit.sheet.sprites = images;
    await saveCharacter(edit, repo); await expect(saveCharacter(edit, repo)).resolves.toBeUndefined();
  });

  it("does not restore a hero deselected elsewhere when saving only their portrait", async () => {
    const repo = await setup(); const hero = { ...entity, characterSheet: { ...entity.characterSheet!, protagonist: true } };
    const leon = { ...entity, id: "leon", name: "Leon" };
    await repo.put("entity", hero); await repo.put("entity", leon);
    const edit = { ...opened(), sheet: { ...hero.characterSheet, sprites: images }, original: characterEditBaseline(hero, [hero, leon]) };
    await saveCharacter({ ...opened(), entityId: leon.id, name: leon.name, original: characterEditBaseline(leon, [hero, leon]), sheet: { ...leon.characterSheet!, protagonist: true } }, repo);
    await saveCharacter(edit, repo);
    expect((await repo.get<SceneEntity>("entity", entity.id))!.characterSheet).toMatchObject({ protagonist: false, sprites: images });
    expect((await repo.get<SceneEntity>("entity", leon.id))!.characterSheet!.protagonist).toBe(true);
  });

  it("does not override another editor's new hero selection", async () => {
    const repo = await setup(); const leon = { ...entity, id: "leon", name: "Leon" }; await repo.put("entity", leon);
    const edit = { ...opened(), sheet: { ...entity.characterSheet!, protagonist: true }, original: characterEditBaseline(entity, [entity, leon]) };
    await saveCharacter({ ...opened(), entityId: leon.id, name: leon.name, original: characterEditBaseline(leon, [entity, leon]), sheet: { ...leon.characterSheet!, protagonist: true } }, repo);
    const before = await repo.rawRecords(); await expect(saveCharacter(edit, repo)).rejects.toThrow("character-edit-conflict"); expect(await repo.rawRecords()).toEqual(before);
  });

  it.each(["world", "chat", "deleted"])("keeps %s protections even with an editor baseline", async kind => {
    const repo = await setup(); const edit = opened(); edit.sheet.sprites = images;
    if (kind === "world") await repo.put("binding", { ...binding, worldId: null });
    if (kind === "chat") edit.chatUrl = "https://chat.deepseek.com/chat/s/b";
    if (kind === "deleted") await repo.delete("entity", entity.id);
    const before = await repo.rawRecords(); await expect(saveCharacter(edit, repo)).rejects.toThrow(/character-(scope|conflict)/); expect(await repo.rawRecords()).toEqual(before);
  });
});

it("preserves portrait variations through saves, automatic updates and portable/full exports", async () => {
  const repo = await setup(); const sprites = { neutral: ["data:image/png;base64,AAAA", "data:image/png;base64,BBBB"] };
  await saveCharacter({ ...scope(), entityId: "mira", name: "Mira", sheet: { ...entity.characterSheet!, sprites }, state: EMPTY_STATUS, present: true }, repo);
  const people = [await repo.get<SceneEntity>("entity", "mira")];
  let current = (await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!;
  const cycle = current.portraitCycles!.mira!.neutral!;
  const base = characterRevision(people as SceneEntity[], current);
  await applyCharacterTurn({ ...scope(), base }, { ...turn(), base, updates: [{ id: "mira", state: { ...EMPTY_STATUS, goal: "Find the key", relationship: "Trusts Noah", stats: [{ label: "Energy", value: "Rested" }] } }] }, ["neutral", "happy"], repo);
  current = (await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!;
  expect(current.portraitCycles!.mira!.neutral!.cursor).toBe(cycle.cursor + 1);
  expect(current.states.mira!.relationship).toBe("Trusts Noah");
  expect((await repo.get<ChatBinding>("binding", "binding:b"))!.characterScenes).toBeUndefined();
  const pack = await exportWorld("w", repo); expect((pack.records.find(r => r.kind === "entity")!.data as SceneEntity).characterSheet!.sprites).toEqual(sprites);
  expect(pack.records.every(validDataRecord)).toBe(true);
  const rows = await repo.rawRecords(); expect(rows.every(validDataRecord)).toBe(true);
  expect((await parseBackup(JSON.stringify(await createBackup(undefined, repo)))).records).toEqual(rows);
  expect(rows.find(r => r.kind === "entity")!.data).toEqual(expect.objectContaining({ description: entity.description }));
});

it("saves a thirteenth portrait emotion after replacing an active emotion, including reopening and exports", async () => {
  const repo = await setup();
  const names = ["neutral", "retired-mood", ...Array.from({ length: 10 }, (_, i) => `mood-${i}`)];
  const images = ["data:image/png;base64,AAAA", "data:image/png;base64,BBBB"];
  let person = { ...entity, characterSheet: { ...entity.characterSheet!, sprites: Object.fromEntries(names.map(name => [name, images])) } };
  await repo.put("entity", person);
  const active = [...names.filter(name => name !== "retired-mood"), "happy"];
  await repo.put("world", { ...world, characterEmotions: active });
  const opened = () => ({ ...scope(), original: characterEditBaseline(person, [person]), entityId: person.id, name: person.name, sheet: structuredClone(person.characterSheet!), state: structuredClone(EMPTY_STATUS), present: false });
  let edit = opened(); edit.sheet.sprites.happy = images;
  await saveCharacter(edit, repo);
  person = (await repo.get<SceneEntity>("entity", entity.id))! as typeof person;
  expect(Object.keys(person.characterSheet.sprites)).toHaveLength(13);
  // The editor's opening snapshot can now itself contain thirteen image groups.
  edit = opened(); edit.sheet.protagonist = true; edit.sheet.appearance = "Green coat";
  await saveCharacter(edit, repo);
  const pack = await exportWorld("w", repo);
  const copied = cloneWorldPackage(pack).find(r => r.kind === "entity")!.data as SceneEntity;
  expect(copied.characterSheet).toMatchObject({ protagonist: true, appearance: "Green coat", sprites: { "retired-mood": images, happy: images } });
  expect(Object.keys(copied.characterSheet!.sprites)).toHaveLength(13);
  expect((pack.records.find(r => r.kind === "world")!.data as WorldProfile).characterEmotions).toEqual(active);
  expect(pack.records.every(validDataRecord)).toBe(true);
  const rows = await repo.rawRecords();
  expect((await parseBackup(JSON.stringify(await createBackup(undefined, repo)))).records).toEqual(rows);
  expect(rows.find(r => r.kind === "entity")!.data).toMatchObject({ description: entity.description });
});

it("preserves 32 active emotions through settings, world transfer and a model update", async () => {
  const repo = await setup();
  const emotions = ["neutral", ...Array.from({ length: 31 }, (_, i) => `emotion-${i}`)];
  expect(parseBackupSettings({ characterEmotions: emotions }).characterEmotions).toEqual(emotions);
  await repo.put("world", { ...world, characterEmotions: emotions });
  const pack = await exportWorld("w", repo);
  expect((cloneWorldPackage(pack).find(r => r.kind === "world")!.data as WorldProfile).characterEmotions).toEqual(emotions);
  expect(parseWorldPackage(JSON.stringify(pack)).records.every(validDataRecord)).toBe(true);
  const reply = { ...turn(), updates: [{ id: "mira", state: { ...EMPTY_STATUS, emotion: emotions[31]! } }] };
  const prompt = characterInstruction("w", "a", [entity], undefined, emotions, [], "Mira");
  expect(prompt).toContain(emotions[31]!);
  await applyCharacterTurn(scope(), reply, emotions, repo);
  expect((await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!.states.mira!.emotion).toBe(emotions[31]);
});

describe("portrait stat highlights", () => {
  it("does not invent indicators for an unknown or empty state", () => {
    expect(characterHighlights()).toEqual([]);
    expect(characterHighlights({ ...EMPTY_STATUS, condition: "Safe", goal: "Find the key", relationship: "Trusts Noah" })).toEqual([]);
  });
  it("shows only the first two known values, preserves zero and does not mutate memory", () => {
    const state = { ...EMPTY_STATUS, stats: [{ label: "Keys", value: "0" }, { label: "Energy", value: "Rested" }, { label: "Trust", value: "Cautious" }] };
    const before = structuredClone(state); const result = characterHighlights(state);
    expect(result).toEqual(state.stats.slice(0, 2)); expect(result[0]).not.toBe(state.stats[0]);
    result[0]!.value = "Edited preview"; expect(state).toEqual(before);
  });
  it("skips empty and repeated values without interpreting model text", () => {
    const stats = [{ label: "", value: "8" }, { label: "Energy", value: " " }, { label: "Trust", value: "Unknown" }, { label: " Trust ", value: " Unknown " }, { label: "Signal", value: "<img src=x onerror=alert(1)>" }];
    expect(characterHighlights({ ...EMPTY_STATUS, stats })).toEqual([stats[2], stats[4]]);
  });
});

describe("locally bound character replies", () => {
  it("shares first-message profiles without inventing a destination or requesting unbound updates", () => {
    const prompt = characterInstruction("w", "", [entity], undefined, ["neutral"], [entity.id], "");
    expect(prompt).toContain("Blue coat"); expect(prompt).toContain("Mira");
    expect(prompt).not.toContain("<deeprole_characters>"); expect(prompt).not.toContain("Schema:");
  });
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
  it("updates a uniquely named character even when off-scene characters share an alias", async () => {
    const repo = await setup();
    const extras = ["Leon", "Noah"].map(name => ({ ...entity, id: name.toLowerCase(), name, aliases: ["navigator"] }));
    await repo.mergeRecords(extras.map(data => ({ kind: "entity" as const, id: data.id, data })));
    const base = characterRevision([entity, ...extras]);
    await applyCharacterTurn({ ...scope(), base }, { ...turn(), base, present: ["Mira"], updates: [{ id: "Mira", state: { ...EMPTY_STATUS, emotion: "happy" } }] }, undefined, repo, true);
    const saved = (await repo.list<ChatBinding>("binding")).find(b => b.id === binding.id)!;
    expect(saved.characterScenes?.w?.presentIds).toEqual([entity.id]);
    expect(saved.characterScenes?.w?.states.mira?.emotion).toBe("happy");
  });
  it("rejects two aliases updating the same character without saving either state", async () => {
    const repo = await setup();
    await expect(applyCharacterTurn(scope(), { ...turn(), present: ["Mira"], updates: [{ id: "Mira", state: { ...EMPTY_STATUS, emotion: "happy" } }, { id: "new:Mira", name: "Mira", state: { ...EMPTY_STATUS, emotion: "sad" } }] }, undefined, repo, true)).rejects.toThrow("character-unknown");
    expect((await repo.list<ChatBinding>("binding")).find(b => b.id === binding.id)?.characterScenes).toBeUndefined();
    expect(await repo.list<SceneEntity>("entity")).toHaveLength(1);
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

describe("manual interlocutor", () => {
  it("keeps the legacy fallback but respects explicit absence, presence and protagonist", () => {
    const hero = { ...entity, id: "hero", characterSheet: { ...entity.characterSheet!, protagonist: true } };
    const other = { ...entity, id: "other", name: "Leon" }; const people = [hero, entity, other];
    const scene = { revision: "1", presentIds: ["hero", "mira", "other"], states: {}, updatedAt: 1 };
    expect(characterInterlocutor(people, scene)).toBe(entity);
    expect(characterInterlocutor(people, { ...scene, partnerId: "other" })).toBe(other);
    for (const partnerId of [null, "missing", "hero"]) expect(characterInterlocutor(people, { ...scene, partnerId })).toBeUndefined();
    expect(characterInterlocutor(people, { ...scene, presentIds: ["hero"], partnerId: "other" })).toBeUndefined();
    expect(characterInterlocutor(people)).toBeUndefined();
  });
  it("switches only this chat, keeps other profiles and does not clear an unrelated partner", async () => {
    const repo = await setup(); const other = { ...entity, id: "leon", name: "Leon" };
    await repo.mergeRecords([{ kind: "entity", id: other.id, data: other }]);
    const initial = { ...turn(), base: characterRevision([entity, other]), present: ["mira", "leon"], partner: "mira" };
    await applyCharacterTurn({ ...scope(), base: initial.base }, initial, undefined, repo);
    const beforeB = await repo.get<ChatBinding>("binding", "binding:b");
    const edit = async (person: SceneEntity, interlocutor: boolean) => {
      const people = await repo.list<SceneEntity>("entity"); const scene = (await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w;
      await saveCharacter({ ...scope(), base: characterRevision(people, scene), entityId: person.id, name: person.name, sheet: person.characterSheet!, state: scene!.states[person.id] ?? EMPTY_STATUS, present: true, interlocutor }, repo);
    };
    await edit(other, true); expect((await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!.partnerId).toBe("leon");
    expect(await repo.get<SceneEntity>("entity", entity.id)).toEqual(entity);
    await edit(entity, false); expect((await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!.partnerId).toBe("leon");
    await edit(other, false); const scene = (await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!;
    expect(scene.partnerId).toBeNull(); expect(scene.presentIds).toEqual(["mira", "leon"]);
    expect(scene.lastReply).toBe(characterTurnKey(initial)); expect(await repo.get<ChatBinding>("binding", "binding:b")).toEqual(beforeB);
  });
  it("selects a newly created person and can clear an inferred legacy interlocutor", async () => {
    const repo = await setup();
    await saveCharacter({ ...scope(), entityId: null, name: "Leon", sheet: EMPTY_CHARACTER, state: EMPTY_STATUS, present: true, interlocutor: true }, repo);
    const people = await repo.list<SceneEntity>("entity"); const leon = people.find(e => e.name === "Leon")!;
    const scene = (await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!; expect(scene.partnerId).toBe(leon.id);
    const legacy = { ...scene, partnerId: undefined };
    await repo.mergeRecords([{ kind: "binding", id: binding.id, data: { ...binding, characterScenes: { w: legacy } } }]);
    await saveCharacter({ ...scope(), base: characterRevision(people, legacy), entityId: leon.id, name: leon.name, sheet: leon.characterSheet!, state: EMPTY_STATUS, present: true, interlocutor: false }, repo);
    expect((await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!.partnerId).toBeNull();
  });
  it.each(["absent", "protagonist", "nonboolean"])("rejects an invalid %s choice atomically", async reason => {
    const repo = await setup(); const before = await repo.rawRecords();
    await expect(saveCharacter({ ...scope(), entityId: entity.id, name: entity.name, sheet: { ...entity.characterSheet!, protagonist: reason === "protagonist" }, state: EMPTY_STATUS, present: reason !== "absent", interlocutor: reason === "nonboolean" ? "yes" as unknown as boolean : true }, repo)).rejects.toThrow("character-invalid");
    expect(await repo.rawRecords()).toEqual(before);
  });
  it("clears the partner when they leave without silently picking a bystander", async () => {
    const repo = await setup(); const leon = { ...entity, id: "leon", name: "Leon" };
    await repo.mergeRecords([{ kind: "entity", id: leon.id, data: leon }]); const base = characterRevision([entity, leon]);
    await applyCharacterTurn({ ...scope(), base }, { ...turn(), base, present: ["mira", "leon"], partner: "mira" }, undefined, repo);
    const scene = (await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!;
    await saveCharacter({ ...scope(), base: characterRevision([entity, leon], scene), entityId: entity.id, name: entity.name, sheet: entity.characterSheet!, state: EMPTY_STATUS, present: false }, repo);
    const next = (await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!;
    expect(next.partnerId).toBeNull(); expect(next.presentIds).toEqual(["leon"]); expect(characterInterlocutor([entity, leon], next)).toBeUndefined();
  });
  it("does not exceed the scene limit or save any part of a refused selection", async () => {
    const repo = await setup(); const people = Array.from({ length: 12 }, (_, i) => ({ ...entity, id: `extra-${i}`, name: `Person ${i}` }));
    await repo.mergeRecords(people.map(data => ({ kind: "entity" as const, id: data.id, data })));
    const base = characterRevision([entity, ...people]); await applyCharacterTurn({ ...scope(), base }, { ...turn(), base, present: people.map(e => e.id), updates: [] }, undefined, repo);
    const scene = (await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w; const before = await repo.rawRecords();
    await expect(saveCharacter({ ...scope(), base: characterRevision([entity, ...people], scene), entityId: entity.id, name: entity.name, sheet: entity.characterSheet!, state: EMPTY_STATUS, present: true, interlocutor: true }, repo)).rejects.toThrow("character-limit");
    expect(await repo.rawRecords()).toEqual(before);
  });
  it("rejects a stale manual selection without overwriting the newer scene", async () => {
    const repo = await setup(); await applyCharacterTurn(scope(), turn(), undefined, repo); const before = await repo.rawRecords();
    await expect(saveCharacter({ ...scope(), entityId: entity.id, name: entity.name, sheet: entity.characterSheet!, state: EMPTY_STATUS, present: true, interlocutor: true }, repo)).rejects.toThrow("character-conflict");
    expect(await repo.rawRecords()).toEqual(before);
  });
});

it("keeps the consumed reply marker after a manual edit without reverting the edit", async () => {
  const repo = await setup(); const incoming = turn();
  await applyCharacterTurn(scope(), incoming, undefined, repo);
  const before = (await repo.get<ChatBinding>("binding", binding.id))!;
  await saveCharacter({ ...scope(), base: characterRevision([entity], before.characterScenes!.w), entityId: entity.id, name: entity.name, sheet: entity.characterSheet!, state: { ...EMPTY_STATUS, condition: "Manually checked" }, present: true }, repo);
  const scene = (await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!;
  expect(scene.lastReply).toBe(characterTurnKey(incoming));
  expect(scene.states.mira!.condition).toBe("Manually checked"); expect(scene.revision).not.toBe(before.characterScenes!.w!.revision);
  await expect(applyCharacterTurn(scope(), incoming, undefined, repo)).rejects.toThrow("character-conflict");
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
