import { createId } from "../core/id";
import { isSameDeepSeekChat } from "../core/chat-scope";
import { characterRevision, characterTurnKey, characterInterlocutors, DEFAULT_EMOTIONS, EMPTY_CHARACTER, validCharacterSheet, validCharacterStatus, type CharacterTurn } from "../core/characters";
import type { CharacterSheet, CharacterStatus, ChatBinding, DataRecord, SceneEntity } from "../core/types";
import { repository, type DeepRoleRepository } from "./repository";
import { advancePortraitCycles, portraitVariations } from "../core/portrait-variations";

export interface CharacterScope { worldId: string; chatId: string; chatUrl: string; base: string }
export interface CharacterEdit extends CharacterScope {
  entityId: string | null; name: string; sheet: CharacterSheet; state: CharacterStatus; present: boolean; interlocutor?: boolean;
}
function current(all: DataRecord[], scope: CharacterScope) {
  if ([scope.worldId, scope.chatId].some(id => !id || ["__proto__", "prototype", "constructor"].includes(id))) throw new Error("character-scope");
  const binding = all.find(r => r.kind === "binding" && (r.data as ChatBinding).chatId === scope.chatId)?.data as ChatBinding | undefined;
  const entities = all.filter(r => r.kind === "entity" && (r.data as SceneEntity).worldId === scope.worldId && (r.data as SceneEntity).kind === "character").map(r => r.data as SceneEntity);
  if (!binding || binding.worldId !== scope.worldId || !isSameDeepSeekChat(binding.chatUrl, scope.chatUrl, scope.chatId) || !all.some(r => r.kind === "world" && r.id === scope.worldId)) throw new Error("character-scope");
  const scene = binding.characterScenes?.[scope.worldId];
  if (characterRevision(entities, scene) !== scope.base) throw new Error("character-conflict");
  return { binding, entities, scene };
}
const record = (kind: "entity" | "binding", data: SceneEntity | ChatBinding): DataRecord => ({ kind, id: data.id, data });

export async function saveCharacter(edit: CharacterEdit, repo: DeepRoleRepository = repository): Promise<void> {
  if (!edit.name.trim() || edit.name.length > 80 || !validCharacterSheet(edit.sheet) || !validCharacterStatus(edit.state)) throw new Error("character-invalid");
  if ((edit.interlocutor !== undefined && typeof edit.interlocutor !== "boolean") || (edit.interlocutor === true && (!edit.present || edit.sheet.protagonist))) throw new Error("character-invalid");
  await repo.updateRecords(all => {
    const { binding, entities, scene } = current(all, edit);
    const before = entities.find(e => e.id === edit.entityId);
    if (edit.entityId && !before || !before && entities.length >= 40) throw new Error("character-conflict");
    const now = Date.now();
    const entity: SceneEntity = { ...(before ?? { id: createId("entity"), kind: "character", worldId: edit.worldId, description: "", aliases: [], memberIds: [], createdAt: now }), name: edit.name.trim(), characterSheet: structuredClone(edit.sheet), updatedAt: Math.max(now, (before?.updatedAt ?? 0) + 1) };
    const changes: DataRecord[] = [record("entity", entity)];
    // Only one protagonist per world. Do not touch any original description.
    if (entity.characterSheet!.protagonist) for (const e of entities) if (e.id !== entity.id && e.characterSheet?.protagonist) changes.push(record("entity", { ...e, characterSheet: { ...e.characterSheet, protagonist: false }, updatedAt: Math.max(now, e.updatedAt + 1) }));
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
    // Keep full backup sizes practical. Images are encrypted with the rest of the library.
    const replaced = new Set(changes.map(r => r.id));
    const bytes = [...all.filter(r => r.kind === "entity" && !replaced.has(r.id)), ...changes.filter(r => r.kind === "entity")].reduce((sum, r) => sum + Object.values((r.data as SceneEntity).characterSheet?.sprites ?? {}).flatMap(portraitVariations).reduce((n, s) => n + s.length, 0), 0);
    if (bytes > 25_000_000) throw new Error("character-images-full");
    return { records: changes, removed: [], result: undefined };
  });
}

export async function applyCharacterTurn(scope: CharacterScope, turn: CharacterTurn, emotions: string[] = DEFAULT_EMOTIONS, repo: DeepRoleRepository = repository, namedIds = false): Promise<void> {
  if (turn.world !== scope.worldId || turn.chat !== scope.chatId || turn.base !== scope.base) throw new Error("character-scope");
  await repo.updateRecords(all => {
    const { binding, entities, scene } = current(all, scope);
    const now = Date.now(); const changes: DataRecord[] = []; const mapping = new Map(entities.map(e => [e.id, e.id]));
    const names = new Map<string, string | null>();
    for (const entity of entities) for (const name of [entity.name, ...entity.aliases]) {
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
      if (!validCharacterStatus(update.state) || !emotions.includes(update.state.emotion)) throw new Error("character-invalid");
      let id = resolve(update.id);
      if (namedIds && !id && update.name) id = resolveName(update.name);
      const newName = update.id.startsWith("new:") ? (update.name ?? update.id.slice(4)).trim() : "";
      if (!id && newName && newName.length <= 80) {
        id = resolveName(newName);
        if (!id) {
          if (entities.length + changes.length >= 40) throw new Error("character-limit");
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
      states[id] = structuredClone(update.state);
    }
    const presentIds = turn.present.map(resolve);
    if (presentIds.some(id => !id) || new Set(presentIds).size !== presentIds.length) throw new Error("character-unknown");
    const partnerId = turn.partner ? resolve(turn.partner) : turn.partner;
    if (turn.partner && (!partnerId || !presentIds.includes(partnerId))) throw new Error("character-unknown");
    const partnerIds = turn.partners?.map(resolve);
    const allPeople = [...entities, ...changes.map(r => r.data as SceneEntity)];
    if (partnerIds && (partnerIds.some(id => !id || !presentIds.includes(id) || allPeople.find(e => e.id === id)?.characterSheet?.protagonist) || new Set(partnerIds).size !== partnerIds.length)) throw new Error("character-unknown");
    const nextScene = { revision: createId("rev"), lastReply: characterTurnKey(turn), partnerId: partnerIds ? partnerIds[0] ?? null : partnerId, ...(partnerIds ? { partnerIds: partnerIds as string[] } : {}), presentIds: presentIds as string[], states, updatedAt: now };
    changes.push(record("binding", { ...binding, characterScenes: { ...binding.characterScenes, [scope.worldId]: { ...nextScene, portraitCycles: advancePortraitCycles(allPeople, nextScene, scene) } }, updatedAt: now }));
    return { records: changes, removed: [], result: undefined };
  });
}
