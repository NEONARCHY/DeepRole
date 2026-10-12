import { createId } from "../core/id";
import { localMergeProfile } from "../core/story-character-merge";
import { isSameDeepSeekChat } from "../core/chat-scope";
import { characterRevision, characterTurnKey, characterInterlocutors, characterInChat, DEFAULT_ACTIONS, EMPTY_CHARACTER, validCharacterSheet, validCharacterStatus, type CharacterTurn } from "../core/characters";
import type { CharacterSheet, CharacterStatus, ChatBinding, DataRecord, SceneEntity, WorldProfile } from "../core/types";
import { actionsFor, validActions } from "../core/characters";
import { repository, type DeepRoleRepository } from "./repository";
import { advancePortraitCycles } from "../core/portrait-variations";
import { characterEditBaseline, mergeCharacterEdit, type CharacterEditBaseline } from "../core/character-edit";
import { advanceRelationship, recordManualBonds, relationshipNarrative, relationshipState, validRelationshipPatches } from "../core/relationships";
import { EMPTY_STATUS, narrativeCharacterStatus } from "../core/characters";
import { advanceAttributes, attributeState, recordManualAttributes, validAttributePatches } from "../core/attributes";
import { cleanCharacterActionImages, resolveCharacterAction } from "../core/character-actions";

import { selfieCategories, selfieGate, selfieImageKey, validSelfieEvents, GENERATED_SELFIE, generatedSelfieCategory, selfieWasSent } from "../core/selfies";
import { storySceneOwner } from "./story-scene-owner";
import { currentStoryProfileEntities } from "../core/story-profile-view";
import { PROFILE_FIELDS } from "../core/character-profile";
import { assertWorldGameWriter } from "../core/world-game";
import { boundStory } from "../core/story-continuation";
import { storyReplyProse } from "../core/story-update";

export interface CharacterScope { worldId: string; chatId: string; chatUrl: string; base: string; replyText?: string; replyIdentity?: string; replyCompletedAt?: number }
export interface CharacterEdit extends CharacterScope {
  entityId: string | null; name: string; sheet: CharacterSheet; state: CharacterStatus; present: boolean; interlocutor?: boolean;
  original?: CharacterEditBaseline;
}
/** Exact committed snapshot for continued editing; never sent to the model. */
export interface CharacterSaveResult { entityId: string; base: string; original: CharacterEditBaseline }
function current(all: DataRecord[], scope: CharacterScope, checkRevision = true) {
  if ([scope.worldId, scope.chatId].some(id => !id || ["__proto__", "prototype", "constructor"].includes(id))) throw new Error("character-scope");
  const bindings = all.filter(r => r.kind === "binding" && (r.data as ChatBinding).chatId === scope.chatId);
  const binding = bindings.length === 1 ? bindings[0]!.data as ChatBinding : undefined;
  const entities = all.filter(r => r.kind === "entity" && (r.data as SceneEntity).worldId === scope.worldId && (r.data as SceneEntity).kind === "character" && characterInChat(r.data as SceneEntity, scope.chatId)).map(r => r.data as SceneEntity);
  if (!binding || binding.worldId !== scope.worldId || !isSameDeepSeekChat(binding.chatUrl, scope.chatUrl, scope.chatId) || !all.some(r => r.kind === "world" && r.id === scope.worldId)) throw new Error("character-scope");
  assertWorldGameWriter(all, binding, scope.worldId);
  const scene = binding.characterScenes?.[scope.worldId];
  if (checkRevision && characterRevision(entities, scene) !== scope.base) throw new Error("character-conflict");
  return { binding, entities, scene };
}
const record = (kind: "entity" | "binding", data: SceneEntity | ChatBinding): DataRecord => ({ kind, id: data.id, data });

/** Additive and atomic: never rewrite existing action keys or portrait assignments. */
export async function addCharacterAction(scope: CharacterScope, name: string, fallback: string[] = DEFAULT_ACTIONS, repo: DeepRoleRepository = repository): Promise<string[]> {
  if (typeof name !== "string" || name !== name.trim()) throw new Error("character-invalid");
  return repo.updateRecords(all => {
    current(all, scope, false);
    const world = all.find(row => row.kind === "world" && row.id === scope.worldId)!.data as WorldProfile;
    const existing = actionsFor(world.characterActions ?? fallback);
    if (existing.includes(name)) return { records: [], removed: [], result: existing };
    const next = [...existing, name];
    if (!validActions(next)) throw new Error("character-invalid");
    return { records: [{ kind: "world", id: world.id, data: { ...world, characterActions: next, updatedAt: Date.now() } }], removed: [], result: next };
  });
}

export async function saveCharacter(edit: CharacterEdit, repo: DeepRoleRepository = repository, defaultActions?: string[]): Promise<CharacterSaveResult> {
  if (!edit.name.trim() || edit.name.length > 80 || !validCharacterSheet(edit.sheet) || !validCharacterStatus(edit.state)) throw new Error("character-invalid");
  if ((edit.interlocutor !== undefined && typeof edit.interlocutor !== "boolean") || (edit.interlocutor === true && (!edit.present || edit.sheet.protagonist))) throw new Error("character-invalid");
  const original = edit.original;
  if (original !== undefined && (!original || typeof original.name !== "string" || original.name.length > 80 || !validCharacterSheet(original.sheet) || !validCharacterStatus(original.state) || typeof original.present !== "boolean" || typeof original.interlocutor !== "boolean" || !Array.isArray(original.protagonists) || !original.protagonists.every(id => typeof id === "string" && id.length <= 160))) throw new Error("character-invalid");
  return repo.updateRecords(all => {
    const { binding, entities, scene } = current(all, edit, !original);
    const before = entities.find(e => e.id === edit.entityId);
    if (edit.entityId && !before) throw new Error("character-conflict");
    // Model updates retain strict revision checks. Manual edits use their opening
    // snapshot to merge disjoint fields atomically under the same library lock.
    const authored = PROFILE_FIELDS.filter(k => !original || edit.sheet[k] !== original.sheet[k]);
    const stored = all.filter(r => r.kind === "story").map(r => r.data as import("../core/story-records").StoryRecord);
    const visible = currentStoryProfileEntities(entities, stored, edit.worldId, edit.chatId, binding.id), visibleBefore = visible.find(e => e.id === before?.id);
    if (original) edit = { ...edit, ...mergeCharacterEdit(original, edit, characterEditBaseline(visibleBefore ?? before ?? null, visible, scene)) };
    // Merely saving another tab/control must not promote every borrowed story
    // addition to world canon. Only text explicitly edited by the author changes.
    if (before?.characterSheet && original) for (const k of PROFILE_FIELDS) if (!authored.includes(k)) edit.sheet[k] = before.characterSheet[k];
    if (!validCharacterSheet(edit.sheet) || !validCharacterStatus(edit.state)) throw new Error("character-invalid");
    const world = all.find(row => row.kind === "world" && row.id === edit.worldId)!.data as WorldProfile;
    const worldActions = world.characterActions ?? defaultActions;
    edit = { ...edit, sheet: cleanCharacterActionImages(edit.sheet, worldActions), state: { ...edit.state, action: resolveCharacterAction(edit.sheet, edit.state.action, undefined, worldActions) } };
    const now = Date.now();
    edit = { ...edit, state: { ...edit.state, attributes: recordManualAttributes(edit.sheet.attributes ?? [], scene?.states[before?.id ?? ""]?.attributes, edit.state.attributes, now) } };
    edit = { ...edit, state: { ...edit.state, ...(edit.state.bonds || scene?.states[before?.id ?? ""]?.bonds ? { bonds: recordManualBonds(scene?.states[before?.id ?? ""]?.bonds, edit.state.bonds, now, before?.characterSheet?.relationships?.initial ?? edit.sheet.relationships?.initial) } : {}) } };
    const entity: SceneEntity = { ...(before ?? { id: createId("entity"), kind: "character", worldId: edit.worldId, description: "", aliases: [], memberIds: [], createdAt: now }), name: edit.name.trim(), characterSheet: structuredClone(edit.sheet), updatedAt: Math.max(now, (before?.updatedAt ?? 0) + 1) };
    if (authored.length && stored.some(e => e.type === "event" && e.profileSupplement?.entityId === entity.id || e.type === "baseline" && !!e.profileSeeds?.[entity.id])) {
      entity.profileFieldRevisions = { ...entity.profileFieldRevisions };
      for (const k of authored) entity.profileFieldRevisions[k] = createId("profile");
    }
    // Explicit manual save adopts the customised profile as world canon.
    if (!localMergeProfile(entity.id, stored)) delete entity.playthroughChatId;
    const changes: DataRecord[] = [record("entity", entity)];
    // Only one protagonist per world. Do not touch any original description.
    if (entity.characterSheet!.protagonist && !localMergeProfile(entity.id, stored)) for (const e of entities) if (e.id !== entity.id && e.characterSheet?.protagonist) changes.push(record("entity", { ...e, characterSheet: { ...e.characterSheet, protagonist: false }, updatedAt: Math.max(now, e.updatedAt + 1) }));
    const presentIds = (scene?.presentIds ?? []).filter(id => id !== entity.id);
    if (edit.present) presentIds.push(entity.id);
    if (presentIds.length > 12) throw new Error("character-limit");
    let partnerIds = characterInterlocutors(entities, scene).map(person => person.id).filter(id => presentIds.includes(id));
    if (edit.interlocutor === false || !edit.present || edit.sheet.protagonist) partnerIds = partnerIds.filter(id => id !== entity.id);
    if (edit.interlocutor === true) partnerIds = [entity.id, ...partnerIds.filter(id => id !== entity.id)];
    const partnerId = partnerIds[0] ?? null;
    // A manual revision blocks stale writes, but the already-consumed reply
    // must remain recognized after reopening instead of reporting a false conflict.
    const next: ChatBinding = { ...binding, characterScenes: { ...binding.characterScenes, [edit.worldId]: { revision: createId("rev"), lastReply: scene?.lastReply, partnerId, partnerIds, presentIds, states: { ...scene?.states, [entity.id]: structuredClone(edit.state) }, updatedAt: now } }, updatedAt: now };
    const nextScene = next.characterScenes![edit.worldId]!;
    nextScene.portraitCycles = advancePortraitCycles([...entities.filter(e => !changes.some(r => r.id === e.id)), ...changes.map(r => r.data as SceneEntity)], nextScene, scene, true);
    changes.push(record("binding", next));
    const replaced = new Set(changes.map(r => r.id));
    const savedEntities = [...entities.filter(e => !replaced.has(e.id)), ...changes.filter(r => r.kind === "entity").map(r => r.data as SceneEntity)];
    const savedVisible = currentStoryProfileEntities(savedEntities, stored, edit.worldId, edit.chatId, binding.id);
    return { records: changes, removed: [], result: { entityId: entity.id, base: characterRevision(savedEntities, nextScene), original: characterEditBaseline(savedVisible.find(e => e.id === entity.id)!, savedVisible, nextScene) } };
  }, undefined, ["world", "entity", "binding", "story"]);
}

export async function applyCharacterTurn(scope: CharacterScope, turn: CharacterTurn, actions: string[] = DEFAULT_ACTIONS, repo: DeepRoleRepository = repository, namedIds = false, relationshipsEnabled = false, generatedSelfiesEnabled = false): Promise<void> {
  if (turn.world !== scope.worldId || turn.chat !== scope.chatId || turn.base !== scope.base) throw new Error("character-scope");
  await repo.updateRecords(all => {
    const plan = planCharacterTurn(all, scope, turn, actions, namedIds, relationshipsEnabled, generatedSelfiesEnabled);
    const world = all.find(r => r.kind === "world" && r.id === scope.worldId)?.data as WorldProfile | undefined;
    if (plan.records.length && world?.sharedGame && scope.replyText?.trim()) plan.records.push({ kind: "world", id: world.id, data: { ...world, sharedGame: { ...world.sharedGame, recentStory: boundStory([...(world.sharedGame.recentStory?.turns ?? []), { role: "assistant", text: storyReplyProse(scope.replyText) }], "page", true, world.sharedGame.recentStory?.omittedTurns ?? 0), recentChatId: scope.chatId } } });
    return plan;
  });
}

/** Shared pure planner. The chronicle calls it only against the replayed parent,
 * inside the same transaction that records and selects the resulting effects. */
export function planCharacterTurn(all: DataRecord[], scope: CharacterScope, turn: CharacterTurn, actions: string[] = DEFAULT_ACTIONS, namedIds = false, relationshipsEnabled = false, generatedSelfiesEnabled = false, chronicle = false) {
    const { binding, entities, scene } = current(all, scope);
    // A replay-owned scene must not be overwritten by the legacy DOM writer.
    // An unselected checkpoint does not disable ordinary roleplay updates.
    if (!chronicle && storySceneOwner(all, binding, scope.worldId)) throw new Error("character-story-managed");
    const roster = currentStoryProfileEntities(entities, all.filter(r => r.kind === "story").map(r => r.data as import("../core/story-records").StoryRecord), scope.worldId, scope.chatId, binding.id);
    const now = Date.now(); const revision = createId("rev"); const changes: DataRecord[] = []; const mapping = new Map(roster.map(e => [e.id, e.id]));
    const names = new Map<string, string | null>();
    for (const entity of roster) for (const name of [entity.name, ...entity.aliases]) {
      const key = name.trim().toLocaleLowerCase();
      if (!key) continue;
      names.set(key, names.has(key) && names.get(key) !== entity.id ? null : entity.id);
    }
    const resolveName = (name: string) => {
      const found = names.get(name.trim().toLocaleLowerCase());
      if (found === null) throw new Error("character-unknown");
      return found;
    };
    const resolve = (name: string) => (namedIds ? resolveName(name) : undefined) ?? mapping.get(name);
    const updatedIds = new Set<string>();
    const states = { ...scene?.states };
    for (const update of turn.updates) {
      if (!validCharacterStatus(update.state)) throw new Error("character-invalid");
      let id = resolve(update.id);
      if (namedIds && !id && update.name) id = resolveName(update.name);
      const newName = update.id.startsWith("new:") ? (update.name ?? update.id.slice(4)).trim() : "";
      if (!id && newName && newName.length <= 80) {
        id = resolveName(newName);
        if (!id) {
          id = createId("entity");
          const entity: SceneEntity = { id, worldId: scope.worldId, kind: "character", name: newName, description: "", aliases: [], memberIds: [], characterSheet: { ...EMPTY_CHARACTER, appearance: update.appearance ?? "", personality: update.personality ?? "", sprites: {} }, createdAt: now, updatedAt: now };
          if (!validCharacterSheet(entity.characterSheet)) throw new Error("character-invalid");
          changes.push(record("entity", entity)); names.set(entity.name.toLocaleLowerCase(), id);
        }
        mapping.set(update.id, id);
      }
      if (!id) throw new Error("character-unknown");
      // Different aliases/new: names can resolve to one person. Never silently
      // overwrite one state with another in an otherwise atomic response.
      if (updatedIds.has(id)) throw new Error("character-unknown");
      updatedIds.add(id);
      mapping.set(update.id, id);
      const sheet = entities.find(person => person.id === id)?.characterSheet ?? (changes.find(row => row.id === id)?.data as SceneEntity | undefined)?.characterSheet;
      // Model output may never assign local numeric states or overwrite their history.
      states[id] = { ...structuredClone(narrativeCharacterStatus(update.state)), action: resolveCharacterAction(sheet, update.state.action, states[id]?.action, actions), ...(states[id]?.bonds ? { bonds: structuredClone(states[id]!.bonds) } : {}), ...(states[id]?.attributes ? { attributes: structuredClone(states[id]!.attributes) } : {}) };
    }
    const presentIds = turn.present.map(resolve);
    if (presentIds.some(id => !id) || new Set(presentIds).size !== presentIds.length) throw new Error("character-unknown");
    const partnerId = turn.partner ? resolve(turn.partner) : turn.partner;
    if (turn.partner && (!partnerId || !presentIds.includes(partnerId))) throw new Error("character-unknown");
    const partnerIds = turn.partners?.map(resolve);
    const allPeople = [...roster, ...changes.map(r => r.data as SceneEntity)];
    let relationshipNotice: "unverified" | "limited" | undefined;
    let rejected = 0; let changed = false;
    const hero = allPeople.find(e => e.characterSheet?.protagonist);
    const world = all.find(r => r.kind === "world" && r.id === scope.worldId)?.data as WorldProfile | undefined;
    if (relationshipsEnabled && world?.relationshipsEnabled !== false && turn.bonds?.length) {
      const narrative = typeof scope.replyText === "string" && scope.replyText.length <= 250_000 ? relationshipNarrative(scope.replyText) : "";
      const patchesValid = validRelationshipPatches(turn.bonds);
      const touched = new Set<string>();
      for (const patch of patchesValid ? turn.bonds : []) {
        const id = resolve(patch.id); const heroId = resolve(patch.hero);
        const person = allPeople.find(e => e.id === id); const policy = person?.characterSheet?.relationships;
        if (!id || !hero || heroId !== hero.id || id === hero.id || !policy?.enabled || touched.has(id)
          || ![...presentIds, ...(scene?.presentIds ?? [])].includes(id)) { relationshipNotice = "limited"; rejected++; continue; }
        touched.add(id);
        const previous = relationshipState(policy, states[id]?.bonds?.[hero.id]);
        const next = advanceRelationship(policy, previous, patch, narrative, now, revision);
        if (!next) { relationshipNotice = "unverified"; rejected++; continue; }
        if (next === previous) continue;
        states[id] = { ...(states[id] ?? EMPTY_STATUS), bonds: { ...states[id]?.bonds, [hero.id]: next } };
        changed = true;
      }
      if (!patchesValid) { relationshipNotice = "unverified"; rejected++; }
    }
    if (relationshipsEnabled && world?.relationshipsEnabled !== false && turn.attributes?.length) {
      const narrative = typeof scope.replyText === "string" && scope.replyText.length <= 250_000 ? relationshipNarrative(scope.replyText) : "";
      const valid = validAttributePatches(turn.attributes); const touched = new Set<string>();
      for (const patch of valid ? turn.attributes : []) {
        const id = resolve(patch.id); const person = allPeople.find(e => e.id === id); const definitions = person?.characterSheet?.attributes;
        if (!id || !definitions?.length || touched.has(id) || ![...presentIds, ...(scene?.presentIds ?? [])].includes(id)) { relationshipNotice = "limited"; rejected++; continue; }
        touched.add(id);
        const previous = attributeState(definitions, states[id]?.attributes);
        const next = advanceAttributes(definitions, previous, patch, narrative, now, revision);
        if (!next) { relationshipNotice = "unverified"; rejected++; continue; }
        if (next === previous) continue;
        states[id] = { ...(states[id] ?? EMPTY_STATUS), attributes: next }; changed = true;
      }
      if (!valid) { relationshipNotice = "unverified"; rejected++; }
    }
    if (partnerIds && (partnerIds.some(id => !id || !presentIds.includes(id) || allPeople.find(e => e.id === id)?.characterSheet?.protagonist) || new Set(partnerIds).size !== partnerIds.length)) throw new Error("character-unknown");
    const tracking = relationshipsEnabled && world?.relationshipsEnabled !== false && allPeople.some(e => (e.characterSheet?.attributes?.length || hero && e.id !== hero.id && e.characterSheet?.relationships?.enabled) && [...presentIds, ...(scene?.presentIds ?? [])].includes(e.id));
    const nextScene = { revision, lastReply: characterTurnKey(turn), relationshipNotice, ...(tracking ? { progress: { status: rejected ? "partial" as const : changed ? "changed" as const : "unchanged" as const, rejected, turn: revision } } : {}), partnerId: partnerIds ? partnerIds[0] ?? null : partnerId, ...(partnerIds ? { partnerIds: partnerIds as string[] } : {}), presentIds: presentIds as string[], states, updatedAt: now };
    // Photo events never grant access by increasing scores in this same response.
    const scenePhotos = [...(binding.scenePhotos ?? [])];
    if (scope.replyIdentity && scope.replyIdentity.length <= 1000 && validSelfieEvents(turn.selfies)) {
      const narrative = relationshipNarrative(scope.replyText ?? "");
      for (const event of turn.selfies) {
        const person = allPeople.find(e => e.id === resolve(event.id));
        if (!person || !narrative.includes(event.quote.trim()) || !selfieWasSent(event.quote)) continue;
        if (event.category === GENERATED_SELFIE) {
          if (!generatedSelfiesEnabled || !event.scene?.trim() || scenePhotos.some(p => p.worldId === scope.worldId && p.entityId === person.id && p.turnKey === nextScene.lastReply)) continue;
          const gate = selfieGate(person, generatedSelfieCategory(person.characterSheet), hero, scene, relationshipsEnabled && world?.relationshipsEnabled !== false);
          if (!["allowed", "story"].includes(gate)) continue;
          scenePhotos.push({ worldId: scope.worldId, entityId: person.id, categoryId: GENERATED_SELFIE, imageKey: selfieImageKey(nextScene.lastReply + ":" + person.id), messageKey: scope.replyIdentity, turnKey: nextScene.lastReply, createdAt: now,
            generation: { ...(event.reference ? { reference: event.reference } : {}), scene: event.scene.trim(), ...(event.appearance ? { appearance: event.appearance } : {}), status: "queued", updatedAt: now } });
          continue;
        }
        const categories = selfieCategories(person.characterSheet);
        const selected = categories.find(c => c.id === event.category);
        const category = selected?.images.length ? selected : categories.find(c => c.default && c.images.length);
        if (!person || !category?.images.length || !narrative.includes(event.quote.trim())
          || /(?:\b(?:won't|will not|refus\w*|later|tomorrow)\b|не\s+(?:отправ|пришл|пошл|согла)|отказ|потом|завтра)/iu.test(event.quote)) continue;
        const gate = selfieGate(person, category, hero, scene, relationshipsEnabled && world?.relationshipsEnabled !== false);
        if (!["allowed", "story"].includes(gate) || scenePhotos.some(p => p.worldId === scope.worldId && p.entityId === person.id && p.turnKey === nextScene.lastReply)) continue;
        const previous = scenePhotos.filter(p => p.entityId === person.id && p.categoryId === category.id).at(-1);
        const pool = category.images.filter(image => category.images.length === 1 || selfieImageKey(image) !== previous?.imageKey);
        const image = pool[Math.floor(Math.random() * pool.length)]!;
        scenePhotos.push({ worldId: scope.worldId, entityId: person.id, categoryId: category.id, imageKey: selfieImageKey(image),
          messageKey: scope.replyIdentity, turnKey: nextScene.lastReply, createdAt: typeof scope.replyCompletedAt === "number" && Number.isFinite(scope.replyCompletedAt) ? Math.max(0, Math.min(now, scope.replyCompletedAt)) : now });
      }
    }
    changes.push(record("binding", { ...binding, ...(scenePhotos.length ? { scenePhotos } : {}), characterScenes: { ...binding.characterScenes, [scope.worldId]: { ...nextScene, portraitCycles: advancePortraitCycles(allPeople, nextScene, scene) } }, updatedAt: now }));
    return { records: changes, removed: [], result: undefined };
}
