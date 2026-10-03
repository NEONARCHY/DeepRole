import { createId } from "../core/id";
import { isSameDeepSeekChat } from "../core/chat-scope";
import { characterRevision, characterTurnKey, DEFAULT_EMOTIONS, EMPTY_CHARACTER, validCharacterSheet, validCharacterStatus, type CharacterTurn } from "../core/characters";
import type { CharacterSheet, CharacterStatus, ChatBinding, DataRecord, SceneEntity } from "../core/types";
import { repository, type DeepRoleRepository } from "./repository";

export interface CharacterScope { worldId: string; chatId: string; chatUrl: string; base: string }
export interface CharacterEdit extends CharacterScope {
  entityId: string | null; name: string; sheet: CharacterSheet; state: CharacterStatus; present: boolean;
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
    const partnerId = scene?.partnerId === null ? null : scene?.partnerId && presentIds.includes(scene.partnerId) ? scene.partnerId : undefined;
    const next: ChatBinding = { ...binding, characterScenes: { ...binding.characterScenes, [edit.worldId]: { revision: createId("rev"), partnerId, presentIds, states: { ...scene?.states, [entity.id]: structuredClone(edit.state) }, updatedAt: now } }, updatedAt: now };
    changes.push(record("binding", next));
    // Keep full backup sizes practical. Images are encrypted with the rest of the library.
    const replaced = new Set(changes.map(r => r.id));
    const bytes = [...all.filter(r => r.kind === "entity" && !replaced.has(r.id)), ...changes.filter(r => r.kind === "entity")].reduce((sum, r) => sum + Object.values((r.data as SceneEntity).characterSheet?.sprites ?? {}).reduce((n, s) => n + s.length, 0), 0);
    if (bytes > 25_000_000) throw new Error("character-images-full");
    return { records: changes, removed: [], result: undefined };
  });
}

export async function applyCharacterTurn(scope: CharacterScope, turn: CharacterTurn, emotions: string[] = DEFAULT_EMOTIONS, repo: DeepRoleRepository = repository, namedIds = false): Promise<void> {
  if (turn.world !== scope.worldId || turn.chat !== scope.chatId || turn.base !== scope.base) throw new Error("character-scope");
  await repo.updateRecords(all => {
    const { binding, entities, scene } = current(all, scope);
    const now = Date.now(); const changes: DataRecord[] = []; const mapping = new Map(entities.map(e => [e.id, e.id]));
    const names = new Map(entities.flatMap(e => [e.name, ...e.aliases].map(name => [name.trim().toLocaleLowerCase(), e.id] as const)));
    if (namedIds) {
      const seen = new Map<string, string>();
      for (const entity of entities) for (const name of [entity.name, ...entity.aliases]) {
        const key = name.trim().toLocaleLowerCase();
        if (seen.has(key) && seen.get(key) !== entity.id) throw new Error("character-unknown");
        seen.set(key, entity.id); mapping.set(name, entity.id);
      }
    }
    const states = { ...scene?.states };
    for (const update of turn.updates) {
      if (!validCharacterStatus(update.state) || !emotions.includes(update.state.emotion)) throw new Error("character-invalid");
      let id = mapping.get(update.id);
      if (namedIds && !id && update.name) id = names.get(update.name.trim().toLocaleLowerCase());
      const newName = update.id.startsWith("new:") ? (update.name ?? update.id.slice(4)).trim() : "";
      if (!id && newName && newName.length <= 80) {
        id = names.get(newName.toLocaleLowerCase());
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
      mapping.set(update.id, id);
      states[id] = structuredClone(update.state);
    }
    const presentIds = turn.present.map(id => mapping.get(id));
    if (presentIds.some(id => !id) || new Set(presentIds).size !== presentIds.length) throw new Error("character-unknown");
    const partnerId = turn.partner ? mapping.get(turn.partner) : turn.partner;
    if (turn.partner && (!partnerId || !presentIds.includes(partnerId))) throw new Error("character-unknown");
    changes.push(record("binding", { ...binding, characterScenes: { ...binding.characterScenes, [scope.worldId]: { revision: createId("rev"), lastReply: characterTurnKey(turn), partnerId, presentIds: presentIds as string[], states, updatedAt: now } }, updatedAt: now }));
    return { records: changes, removed: [], result: undefined };
  });
}
