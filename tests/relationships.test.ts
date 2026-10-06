import { afterEach, describe, expect, it } from "vitest";
import { advanceRelationship, bondFor, DEFAULT_RELATIONSHIP, relationshipGate, relationshipInstruction, relationshipNarrative, relationshipStage, relationshipState, validBonds, validRelationshipPatches, validRelationshipProfile } from "../src/core/relationships";
import { bindCharacterTurn, characterInstruction, characterRevision, characterTurnKey, EMPTY_CHARACTER, EMPTY_STATUS, parseCharacterTurn, relationshipTurnEnabled, validCharacterScenes } from "../src/core/characters";
import { parseBackupSettings, validDataRecord } from "../src/core/record-validation";
import { characterEditBaseline } from "../src/core/character-edit";
import { relationshipCastRecords, relationshipLoreBrief } from "../src/core/relationship-setup";
import { handoffCharacterScene, withHandoffCharacters } from "../src/core/relationship-handoff";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { applyCharacterTurn, saveCharacter } from "../src/storage/characters";
import { exportWorld, parseWorldPackage, cloneWorldPackage } from "../src/storage/worlds";
import { createBackup, parseBackup } from "../src/storage/backup";
import { loreDraftPrompt } from "../src/core/service-protocol";
import type { CharacterScene, ChatBinding, HandoffSnapshot, RelationshipPatch, SceneEntity, WorldProfile } from "../src/core/types";

const world: WorldProfile = { id: "world", name: "Test world", description: "KEEP THIS LORE", color: "#123456", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
const hero: SceneEntity = { id: "hero", name: "Leon", kind: "character", worldId: world.id, description: "Original protagonist", aliases: [], memberIds: [], characterSheet: { ...EMPTY_CHARACTER, protagonist: true, adultConfirmed: true }, createdAt: 1, updatedAt: 1 };
const mira: SceneEntity = { ...hero, id: "mira", name: "Mira", description: "Original NPC", characterSheet: { ...EMPTY_CHARACTER, adultConfirmed: true, relationships: { ...structuredClone(DEFAULT_RELATIONSHIP), romance: true } } };
const binding: ChatBinding = { id: "binding:a", chatId: "a", chatUrl: "https://chat.deepseek.com/chat/s/a", worldId: world.id, bookId: null, focusIds: [], messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1 };
const quote = "Mira thanked Leon for keeping his promise.";
const patch: RelationshipPatch = { id: "Mira", hero: "Leon", trust: 3, affinity: 2, reason: "She values promises", quote };
const dbs: DeepRoleDatabase[] = [];
async function setup() {
  const db = new DeepRoleDatabase("relationships-" + crypto.randomUUID()); dbs.push(db); const repo = new DeepRoleRepository(db);
  await repo.mergeRecords([{ kind: "world", id: world.id, data: world }, { kind: "entity", id: hero.id, data: hero }, { kind: "entity", id: mira.id, data: mira }, { kind: "binding", id: binding.id, data: binding }, { kind: "binding", id: "binding:b", data: { ...binding, id: "binding:b", chatId: "b", chatUrl: "https://chat.deepseek.com/chat/s/b" } }]); return repo;
}
async function request(repo: DeepRoleRepository, change: RelationshipPatch = patch, replyText = quote, enabled = true) {
  const people = await repo.list<SceneEntity>("entity"); const scene = (await repo.get<ChatBinding>("binding", binding.id))!.characterScenes?.[world.id];
  const base = characterRevision(people, scene); const turn = { world: world.id, chat: "a", base, request: "request_123456", present: ["Leon", "Mira"], partners: ["Mira"], updates: [{ id: "Mira", state: { ...EMPTY_STATUS, emotion: "happy" } }], bonds: [change] };
  await applyCharacterTurn({ worldId: world.id, chatId: "a", chatUrl: binding.chatUrl, base, replyText }, turn, undefined, repo, true, enabled);
  return { scene: (await repo.get<ChatBinding>("binding", binding.id))!.characterScenes![world.id]!, base, turn };
}
afterEach(async () => { await Promise.all(dbs.map(db => db.delete())); dbs.length = 0; });

describe("relationship mechanics", () => {
  it("keeps trust and affinity independent, with a derived stage", () => {
    expect(relationshipStage({ trust: 10, affinity: 99 })).toBe("guarded"); expect(relationshipStage({ trust: 99, affinity: 10 })).toBe("trusting");
    expect(relationshipStage({ trust: 30, affinity: 20 })).toBe("acquaintance"); expect(relationshipStage({ trust: 50, affinity: 35 })).toBe("trusting"); expect(relationshipStage({ trust: 70, affinity: 65 })).toBe("close");
  });
  it("requires explicit configuration; never guesses from relationships text or age", () => {
    expect(bondFor({ ...mira, characterSheet: EMPTY_CHARACTER }, hero, { ...EMPTY_STATUS, relationship: "Madly in love, 22" })).toBeUndefined();
    expect(relationshipGate({ ...mira, characterSheet: { ...mira.characterSheet!, adultConfirmed: false } }, hero, { ...relationshipState(DEFAULT_RELATIONSHIP), trust: 100, affinity: 100 })).toBe("adults");
    expect(relationshipGate(mira, { ...hero, characterSheet: EMPTY_CHARACTER }, { ...relationshipState(DEFAULT_RELATIONSHIP), trust: 100, affinity: 100 })).toBe("adults");
  });
  it("checks individual thresholds and every event without assuming consent", () => {
    const person = { ...mira, characterSheet: { ...mira.characterSheet!, relationships: { ...DEFAULT_RELATIONSHIP, romance: true, milestones: [{ id: "promise", label: "Kept a promise" }] } } };
    const state = { ...relationshipState(DEFAULT_RELATIONSHIP), trust: 80, affinity: 80 };
    expect(relationshipGate(person, hero, state)).toBe("milestonesNeeded"); expect(relationshipGate(person, hero, { ...state, completed: ["promise"] })).toBe("eligible");
    expect(relationshipGate(person, hero, { ...state, trust: 69 })).toBe("trustNeeded"); expect(relationshipGate(person, hero, { ...state, affinity: 64 })).toBe("affinityNeeded");
    expect(relationshipGate({ ...person, characterSheet: { ...person.characterSheet, relationships: { ...person.characterSheet.relationships, romance: false } } }, hero, state)).toBe("off");
  });
  it("accepts actual narrative, caps progress, supports decreases and bounds 0–100", () => {
    const before = relationshipState(DEFAULT_RELATIONSHIP); expect(advanceRelationship(DEFAULT_RELATIONSHIP, before, patch, quote, 10)).toMatchObject({ trust: 23, affinity: 22, history: [{ source: "scene", reason: patch.reason, quote }] });
    expect(advanceRelationship(DEFAULT_RELATIONSHIP, before, { ...patch, trust: 6 }, quote, 10)).toBeNull();
    expect(advanceRelationship({ ...DEFAULT_RELATIONSHIP, pace: "slow" }, before, patch, quote, 10)).toBeNull();
    expect(advanceRelationship({ ...DEFAULT_RELATIONSHIP, pace: "open" }, { ...before, trust: 98, affinity: 1 }, { ...patch, trust: 8, affinity: -8 }, quote, 10)).toMatchObject({ trust: 100, affinity: 0 });
    expect(advanceRelationship(DEFAULT_RELATIONSHIP, { ...before, locked: true }, patch, quote, 10)?.history).toHaveLength(0);
  });
  it("does not use technical JSON, unchosen options or imagined text as evidence", () => {
    const hidden = `Nothing happened.<deeprole_choices>{"text":"${quote}"}</deeprole_choices><deeprole_characters>{"quote":"${quote}"}</deeprole_characters>`;
    const narrative = relationshipNarrative(hidden); expect(narrative).toBe("Nothing happened."); expect(advanceRelationship(DEFAULT_RELATIONSHIP, relationshipState(DEFAULT_RELATIONSHIP), patch, narrative, 10)).toBeNull();
  });
  it("validates bounded states and patches, hostile IDs, NaN, excessive logs and duplicate targets", () => {
    expect(validRelationshipProfile(DEFAULT_RELATIONSHIP)).toBe(true); expect(validBonds({ hero: relationshipState(DEFAULT_RELATIONSHIP) })).toBe(true);
    for (const value of [NaN, -1, 101, 1.5]) expect(validRelationshipProfile({ ...DEFAULT_RELATIONSHIP, initial: { trust: value, affinity: 20 } })).toBe(false);
    expect(validRelationshipPatches([patch, patch])).toBe(false); expect(validRelationshipPatches([{ ...patch, id: "__proto__" }])).toBe(false);
    expect(validRelationshipPatches([{ ...patch, trust: 80 }])).toBe(false); expect(validRelationshipPatches([{ ...patch, milestones: Array(9).fill("event") }])).toBe(false);
    expect(validBonds({ hero: { ...relationshipState(DEFAULT_RELATIONSHIP), history: Array(21).fill({}) } })).toBe(false);
  });
  it("uses compact current rules for story and choices without sending history or portraits", () => {
    const scene: CharacterScene = { revision: "rev", presentIds: [hero.id, mira.id], states: {}, updatedAt: 1 };
    const prompt = characterInstruction(world.id, "a", [hero, mira], scene, ["neutral"], [], "Mira", "request_123456", true);
    expect(prompt).toContain('"trust":20'); expect(prompt).toContain("These rules apply equally to story and reply options"); expect(prompt).toContain("never implies consent"); expect(prompt).not.toContain('"history"');
    expect(characterInstruction(world.id, "a", [hero, mira], scene, ["neutral"], [], "Mira", "request_123456", false)).not.toContain("Configured relationships:");
    expect(relationshipInstruction([hero, mira], [hero, mira], scene)).toContain("signed deltas");
  });
});

describe("atomic sync and persistence", () => {
  it("updates once, keeps stable lore/profiles and isolates chats", async () => {
    const repo = await setup(); const { scene, base, turn } = await request(repo);
    expect(scene.states.mira!.bonds!.hero).toMatchObject({ trust: 23, affinity: 22 }); expect((await repo.get<ChatBinding>("binding", "binding:b"))!.characterScenes).toBeUndefined();
    expect(await repo.get("entity", mira.id)).toEqual(mira); expect(await repo.get("world", world.id)).toEqual(world);
    await expect(applyCharacterTurn({ worldId: world.id, chatId: "a", chatUrl: binding.chatUrl, base, replyText: quote }, turn, undefined, repo, true, true)).rejects.toThrow("character-conflict");
    expect(scene.states.mira!.bonds!.hero!.history).toHaveLength(1);
  });
  it.each(["disabled", "world-disabled", "no-quote", "wrong-hero", "unknown-event", "big-step"])("keeps prior scores for %s while allowing normal sheet updates", async mode => {
    const repo = await setup(); if (mode === "world-disabled") await repo.put("world", { ...world, relationshipsEnabled: false });
    const changed = mode === "wrong-hero" ? { ...patch, hero: "Mira" } : mode === "unknown-event" ? { ...patch, milestones: ["missing"] } : mode === "big-step" ? { ...patch, trust: 8 } : patch;
    const { scene } = await request(repo, changed, mode === "no-quote" ? "Unrelated text" : quote, mode !== "disabled");
    expect(scene.states.mira!.emotion).toBe("happy"); expect(scene.states.mira!.bonds).toBeUndefined();
  });
  it("preserves locks and logs across regular model state replacement", async () => {
    const repo = await setup(); const first = await request(repo);
    const edit = characterEditBaseline(mira, [hero, mira], first.scene);
    await saveCharacter({ worldId: world.id, chatId: "a", chatUrl: binding.chatUrl, base: characterRevision([hero, mira], first.scene), entityId: mira.id, ...edit, state: { ...edit.state, bonds: { hero: { ...edit.state.bonds!.hero!, trust: 90, locked: true } } }, original: edit }, repo);
    const { scene } = await request(repo); expect(scene.states.mira!.bonds!.hero).toMatchObject({ trust: 90, affinity: 22, locked: true }); expect(scene.states.mira!.bonds!.hero!.history.map(h => h.source)).toEqual(["manual", "scene"]);
    const scene2 = await request(repo, patch, quote, false); expect(scene2.scene.states.mira!.bonds).toEqual(scene.states.mira!.bonds);
  });
  it("does not overwrite manual score edits made during a model reply", async () => {
    const repo = await setup(); const first = await request(repo); const original = characterEditBaseline(mira, [hero, mira], first.scene);
    const nextQuote = "Mira trusted Leon with another important secret.";
    await request(repo, { ...patch, quote: nextQuote }, nextQuote);
    await expect(saveCharacter({ worldId: world.id, chatId: "a", chatUrl: binding.chatUrl, base: characterRevision([hero, mira], first.scene), entityId: mira.id, ...original, original, state: { ...original.state, bonds: { hero: { ...original.state.bonds!.hero!, trust: 88 } } } }, repo)).rejects.toThrow("character-edit-conflict");
  });
  it("accepts only the bound current request and rejects model-owned history/settings", () => {
    const base = characterRevision([hero, mira]); const raw = { request: "request_123456", present: ["Mira"], updates: [], bonds: [patch] };
    const turn = parseCharacterTurn(`<deeprole_characters>${JSON.stringify(raw)}</deeprole_characters>`)!;
    expect(bindCharacterTurn(turn, { id: raw.request, accepted: true, base, worldId: world.id, chatId: "a", createdAt: 1 }, { worldId: world.id, chatId: "a", base })).not.toBeNull();
    expect(bindCharacterTurn(turn, { id: "other_request", accepted: true, base, worldId: world.id, chatId: "a", createdAt: 1 }, { worldId: world.id, chatId: "a", base })).toBeNull();
    expect(characterTurnKey(turn)).not.toBe(characterTurnKey({ ...turn, bonds: [{ ...patch, trust: -3 }] }));
    expect(parseCharacterTurn(`<deeprole_characters>${JSON.stringify({ ...raw, updates: [{ id: "Mira", state: { ...EMPTY_STATUS, bonds: { hero: relationshipState(DEFAULT_RELATIONSHIP) } } }] })}</deeprole_characters>`)).toBeNull();
  });
  it("never retroactively enables tracking for an older, unaccepted or service send", () => {
    const scope = { worldId: world.id, chatId: "a", base: "revision" };
    const turn = { ...scope, world: scope.worldId, chat: scope.chatId, request: "request_123456", present: ["Mira"], updates: [], bonds: [patch] };
    const receipt = { ...scope, id: turn.request, createdAt: 1, accepted: true, relationshipsEnabled: true };
    expect(relationshipTurnEnabled(turn, receipt, scope, true)).toBe(true);
    for (const candidate of [undefined, { ...receipt, relationshipsEnabled: undefined }, { ...receipt, relationshipsEnabled: false }, { ...receipt, accepted: false }, { ...receipt, id: "other_request" }]) expect(relationshipTurnEnabled(turn, candidate, scope, true)).toBe(false);
    expect(relationshipTurnEnabled(turn, receipt, scope, false)).toBe(false);
    expect(relationshipTurnEnabled({ ...turn, request: undefined }, receipt, scope, true)).toBe(false);
    expect(relationshipTurnEnabled(turn, receipt, { ...scope, chatId: "other" }, true)).toBe(false);
  });
  it("exports profiles in portable worlds and reached scores in full backups", async () => {
    const repo = await setup(); await request(repo);
    const pack = parseWorldPackage(JSON.stringify(await exportWorld(world.id, repo))); const copy = cloneWorldPackage(pack);
    expect((copy.find(r => r.kind === "entity" && (r.data as SceneEntity).name === "Mira")!.data as SceneEntity).characterSheet!.relationships).toEqual(mira.characterSheet!.relationships);
    expect(pack.records.some(r => r.kind === "binding")).toBe(false);
    const backup = await parseBackup(JSON.stringify(await createBackup(undefined, repo))); const restored = backup.records.find(r => r.id === binding.id)!.data as ChatBinding;
    expect(restored.characterScenes!.world!.states.mira!.bonds!.hero!.trust).toBe(23); expect(validDataRecord({ kind: "binding", id: restored.id, data: restored })).toBe(true);
  });
  it("defaults old settings on, supports display modes and validates imported fields", () => {
    expect(parseBackupSettings({}).relationshipsEnabled).toBe(true); expect(parseBackupSettings({ relationshipDisplay: "stages", relationshipsEnabled: false })).toMatchObject({ relationshipDisplay: "stages", relationshipsEnabled: false }); expect(() => parseBackupSettings({ relationshipDisplay: "unsupported" })).toThrow();
    expect(validDataRecord({ kind: "world", id: world.id, data: { ...world, relationshipsEnabled: "yes" } as any })).toBe(false);
  });
});

describe("new players and handoff", () => {
  it("creates player-authored starting cast and an editable always rule without inventing age", () => {
    const records = relationshipCastRecords(world.id, { hero: "Leon", heroAdult: true, people: [{ name: "Mira", trust: 25, affinity: 80, adult: false, romance: false }] }, "en", 1);
    expect(records).toHaveLength(3); expect(records.every(validDataRecord)).toBe(true);
    const npc = records[1]!.data as SceneEntity; expect(npc.characterSheet).toMatchObject({ adultConfirmed: false, relationships: { initial: { trust: 25, affinity: 80 } } });
    expect(records[2]!.data).toMatchObject({ activation: "always", priority: "high" });
    const brief = relationshipLoreBrief(records.filter(r => r.kind === "entity").map(r => r.data as SceneEntity)); expect(loreDraftPrompt("A calm mystery", "en", brief)).toContain("Do not replace their numeric settings");
  });
  it("rejects duplicate names and incomplete setup atomically instead of silently dropping people", () => {
    expect(() => relationshipCastRecords(world.id, { hero: "Leon", heroAdult: false, people: [{ name: "leon", trust: 20, affinity: 20, adult: false, romance: false }] }, "ru", 1)).toThrow();
    expect(() => relationshipCastRecords(world.id, { hero: "", heroAdult: false, people: [{ name: "Mira", trust: 20, affinity: 20, adult: false, romance: false }] }, "ru", 1)).toThrow();
    expect(relationshipCastRecords(world.id, undefined, "ru", 1)).toEqual([]);
  });
  it("carries structured progress only into an empty matching branch, never replaces played state", () => {
    const scene: CharacterScene = { revision: "source", lastReply: "old", presentIds: [hero.id, mira.id], states: { mira: { ...EMPTY_STATUS, bonds: { hero: { ...relationshipState(DEFAULT_RELATIONSHIP), trust: 85 } } } }, updatedAt: 1 };
    const snapshot: HandoffSnapshot = { id: "save", title: "Recap", summary: "Story", worldId: world.id, sourceChatId: "source", sourceChatUrl: "https://chat.deepseek.com/chat/s/source", bookId: null, createdAt: 1, characterScene: scene };
    const next = withHandoffCharacters(binding, snapshot); expect(next.characterScenes!.world!.states.mira!.bonds!.hero!.trust).toBe(85);
    expect(next.characterScenes!.world!.revision).toBe(handoffCharacterScene(snapshot, world.id)!.revision); expect(next.characterScenes!.world!.lastReply).toBeUndefined();
    expect(withHandoffCharacters(next, { ...snapshot, characterScene: { ...scene, states: {} } })).toBe(next); expect(withHandoffCharacters({ ...binding, worldId: "other" }, snapshot).characterScenes).toBeUndefined();
    expect(validCharacterScenes({ world: next.characterScenes!.world! })).toBe(true); expect(validDataRecord({ kind: "snapshot", id: snapshot.id, data: snapshot })).toBe(true);
  });
});
