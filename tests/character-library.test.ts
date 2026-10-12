import { afterEach, expect, it } from "vitest";
import { characterInstruction, characterRevision, EMPTY_CHARACTER, EMPTY_STATUS, validCharacterScenes } from "../src/core/characters";
import { CHARACTER_ROSTER_BUDGET, mentionsCharacter, selectCharacterContext } from "../src/core/character-context";
import { validDataRecord } from "../src/core/record-validation";
import { validPortraitLayout } from "../src/core/portrait-layout";
import { validPortraitCycles } from "../src/core/portrait-variations";
import { validImageReferenceOverrides } from "../src/core/image-references";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { saveCharacter, applyCharacterTurn } from "../src/storage/characters";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { exportWorld, parseWorldPackage } from "../src/storage/worlds";
import { storyWorld } from "./fixtures/story-worlds";
import { parseStoryUpdate } from "../src/core/story-update";
import { relationshipLoreBrief } from "../src/core/relationship-setup";
import type { ChatBinding, SceneEntity } from "../src/core/types";
const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { await Promise.all(dbs.splice(0).map(db => db.delete())); });
const empty = () => { const db = new DeepRoleDatabase("character-library-" + crypto.randomUUID()); dbs.push(db); return new DeepRoleRepository(db); };
it.each([41, 100, 1000])("manual and automatic creation work beyond %i existing people without a total cap", async count => {
  const f = storyWorld("en", count), repo = empty(); await repo.mergeRecords(f.records);
  const scene = f.binding.characterScenes![f.world.id]!;
  const edit = { worldId: f.world.id, chatId: f.binding.chatId, chatUrl: f.binding.chatUrl!, base: characterRevision(f.entities, scene), entityId: null, name: "Manual visitor", sheet: structuredClone(EMPTY_CHARACTER), state: structuredClone(EMPTY_STATUS), present: false };
  await saveCharacter(edit, repo); const people = await repo.list<SceneEntity>("entity"), binding = (await repo.get<ChatBinding>("binding", f.binding.id))!;
  const scope = { ...edit, base: characterRevision(people, binding.characterScenes![f.world.id]) };
  await applyCharacterTurn(scope, { world: f.world.id, chat: f.binding.chatId, base: scope.base, present: ["new:Courier"], updates: [{ id: "new:Courier", name: "Courier", appearance: "Gray coat", state: EMPTY_STATUS }] }, undefined, repo);
  expect(await repo.list("entity")).toHaveLength(count + 2); expect((await repo.rawRecords()).every(validDataRecord)).toBe(true);
  const copy = empty(); await restoreBackup(await parseBackup(JSON.stringify(await createBackup(undefined, repo))), "replace", copy); expect(await copy.rawRecords()).toEqual(await repo.rawRecords()); expect(parseWorldPackage(JSON.stringify(await exportWorld(f.world.id, repo))).records.filter(r => r.kind === "entity")).toHaveLength(count + 2);
});
it.each([41, 100, 1000])("request selection finds late people in a library of %i without sending it all", count => {
  const f = storyWorld("en", count), late = f.entities.at(-1)!; late.characterSheet!.background = "LATE_PROFILE_NOT_A_FIRST_PAGE"; late.aliases = ["Copper courier"];
  for (const focus of [[late.id], []]) { const result = selectCharacterContext(f.entities, f.binding.characterScenes![f.world.id], focus, "Talk to Copper courier"); expect(result.roster).toContain(late); expect(result.active).toContain(late); expect(JSON.stringify(result.roster.map(e => ({ id: e.id, name: e.name, player: !!e.characterSheet?.protagonist }))).length).toBeLessThanOrEqual(CHARACTER_ROSTER_BUDGET); }
  const prompt = characterInstruction(f.world.id, f.binding.chatId, f.entities, f.binding.characterScenes![f.world.id], ["neutral"], [], "Talk to Copper courier"); expect(prompt).toContain("LATE_PROFILE_NOT_A_FIRST_PAGE"); expect(prompt.length).toBeLessThan(20000);
});
it("name matching supports single-letter, Unicode and whitespace aliases without prefix collisions", () => {
  const person = storyWorld().entities[0]!; person.name = "Анна"; person.aliases = ["A", "Copper Courier"];
  expect(mentionsCharacter("Аннабель", person)).toBe(false); expect(mentionsCharacter("AAA", person)).toBe(false); expect(mentionsCharacter("Talk to A.", person)).toBe(true); expect(mentionsCharacter("У Анны нет новостей", person)).toBe(false); expect(mentionsCharacter("«Анна», подойди", person)).toBe(true); expect(mentionsCharacter("COPPER\n\nCOURIER", person)).toBe(true);
});
it("large stored states and portrait maps remain valid, with per-field safety unchanged", () => {
  const f = storyWorld("en", 1000), states = Object.fromEntries(f.entities.map(e => [e.id, EMPTY_STATUS]));
  expect(validCharacterScenes({ [f.world.id]: { ...f.binding.characterScenes![f.world.id], states } })).toBe(true);
  expect(validPortraitLayout({ resetAt: 0, positions: Object.fromEntries(f.entities.map(e => [e.id, { x: 0, y: 0, width: 96 }])) })).toBe(true);
  expect(validPortraitCycles(Object.fromEntries(f.entities.map(e => [e.id, { neutral: { key: "1:test", order: [0], cursor: 0 } }])))).toBe(true);
  expect(validImageReferenceOverrides(Object.fromEntries(f.entities.map(e => [e.id, "neutral"])))).toBe(true);
  // Removing the total bound must not introduce a new rejection of stored
  // legacy keys. Outgoing protocol IDs retain their separate existing checks.
  expect(validCharacterScenes({ [f.world.id]: { ...f.binding.characterScenes![f.world.id], states: { ["legacy-id".repeat(30)]: EMPTY_STATUS } } })).toBe(true);
  states["person-1000"] = { ...EMPTY_STATUS, action: "__proto__" }; expect(validCharacterScenes({ [f.world.id]: { ...f.binding.characterScenes![f.world.id], states } })).toBe(false);
});
it("duplicate names use stable request IDs; canonical IDs do not become ambiguous aliases", () => {
  const f = storyWorld("en", 1000), first = f.entities[1]!, late = f.entities.at(-1)!; first.name = late.name = "Alex"; first.aliases = [late.id];
  const prompt = characterInstruction(f.world.id, f.binding.chatId, f.entities, f.binding.characterScenes![f.world.id], ["neutral"], [late.id], "Alex", "request_00000001"); const roster = JSON.parse(prompt.match(/Roster: (.*)\nCurrent profiles/)![1]!);
  expect(roster.filter((e: any) => e.name === "Alex").map((e: any) => e.id)).toEqual(expect.arrayContaining([first.id, late.id]));
  const source = (id: string) => `<deeprole_characters>${JSON.stringify({ version: 2, world: f.world.id, chat: f.binding.chatId, branch: "b", updates: [{ id, state: { condition: "At the gate" } }] })}</deeprole_characters>`;
  const scope = { world: f.world.id, chat: f.binding.chatId, branch: "b", base: "base", entities: f.entities };
  expect(parseStoryUpdate(source("Alex"), scope).turn).toBeNull(); expect(parseStoryUpdate(source(late.id), scope).turn!.updates[0]!.id).toBe(late.id);
});
it("a partial lore-reference packet includes late mentioned people and identifies omitted profiles", () => {
  const f = storyWorld("en", 1000), last = f.entities.at(-1)!; last.characterSheet!.personality = "UNIQUE_LAST_PERSON"; const brief = relationshipLoreBrief(f.entities, last.name); expect(brief).toContain("UNIQUE_LAST_PERSON"); expect(brief).toContain("remain stored and unchanged"); expect(brief.length).toBeLessThan(20500);
  for (const entity of f.entities) entity.characterSheet!.protagonist = true; const packet = selectCharacterContext(f.entities, undefined, [], ""); expect(JSON.stringify(packet.roster.map(e => ({ id: e.id, name: e.name, player: true }))).length).toBeLessThanOrEqual(CHARACTER_ROSTER_BUDGET);
});
it("a genuinely new person's name is not confused with another person's internal ID", () => {
  const f = storyWorld("en", 1000), id = f.entities.at(-1)!.id;
  const text = `<deeprole_characters>${JSON.stringify({ version: 2, world: f.world.id, chat: f.binding.chatId, branch: "b", updates: [{ id: "new:Namesake", name: id, state: { condition: "Arrived" } }] })}</deeprole_characters>`;
  const parsed = parseStoryUpdate(text, { world: f.world.id, chat: f.binding.chatId, branch: "b", base: "base", entities: f.entities }); expect(parsed.turn!.updates[0]).toMatchObject({ id: "new:Namesake", name: id });
});
