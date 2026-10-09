import type { ChatBinding, DataRecord, SceneEntity, WorldProfile } from "../core/types";
import { emotionsFor, validEmotions } from "../core/characters";
import { cleanCharacterEmotionImages, resolveCharacterEmotion } from "../core/character-emotions";
import { advancePortraitCycles } from "../core/portrait-variations";
import { createId } from "../core/id";
import { MemoryConflictError, repository, type DeepRoleRepository } from "./repository";

/** The whole world update is planned before writing: no lost images, partial
 * detachment or stale world-list overwrite if another window edited it. */
function detachWorld(all: DataRecord[], worldId: string, emotions: string[]): DataRecord[] {
  const now = Date.now(), changes: DataRecord[] = [];
  const people = all.filter(row => row.kind === "entity" && (row.data as SceneEntity).worldId === worldId).map(row => row.data as SceneEntity);
  const nextPeople = people.map(person => {
    if (!person.characterSheet) return person;
    const sheet = cleanCharacterEmotionImages(person.characterSheet, emotions);
    if (sheet === person.characterSheet) return person;
    const next = { ...person, characterSheet: sheet, updatedAt: Math.max(now, person.updatedAt + 1) };
    changes.push({ kind: "entity", id: person.id, data: next }); return next;
  });
  const peopleChanged = changes.length > 0;
  for (const row of all.filter(row => row.kind === "binding")) {
    const binding = row.data as ChatBinding, scene = binding.characterScenes?.[worldId];
    if (!scene) continue;
    const states = Object.fromEntries(Object.entries(scene.states).map(([id, state]) => {
      const sheet = nextPeople.find(person => person.id === id)?.characterSheet;
      const emotion = resolveCharacterEmotion(sheet, state.emotion, undefined, emotions);
      return [id, emotion === state.emotion ? state : { ...state, emotion }];
    }));
    const nextScene = { ...scene, states };
    const cycles = advancePortraitCycles(nextPeople, nextScene, scene, true);
    if (!peopleChanged && Object.entries(states).every(([id, state]) => state === scene.states[id]) && JSON.stringify(cycles) === JSON.stringify(scene.portraitCycles ?? {})) continue;
    const next = { ...binding, characterScenes: { ...binding.characterScenes, [worldId]: { ...nextScene, portraitCycles: cycles, revision: createId("rev"), updatedAt: now } }, updatedAt: now };
    changes.push({ kind: "binding", id: row.id, data: next });
  }
  return changes;
}

export async function saveWorldEmotionList(expected: WorldProfile, emotions: string[], repo: DeepRoleRepository = repository): Promise<void> {
  if (!validEmotions(emotions)) throw new Error("character-invalid");
  await repo.updateRecords(all => {
    const world = all.find(row => row.kind === "world" && row.id === expected.id)?.data as WorldProfile | undefined;
    if (!world || JSON.stringify(world) !== JSON.stringify(expected)) throw new MemoryConflictError();
    const changes = detachWorld(all, world.id, emotions);
    changes.push({ kind: "world", id: world.id, data: { ...world, characterEmotions: [...emotions], updatedAt: Math.max(Date.now(), world.updatedAt + 1) } });
    return { records: changes, removed: [], result: undefined };
  });
}

/** Global defaults apply only to worlds without their own list. */
export async function detachDefaultEmotionImages(previous: string[], emotions: string[], repo: DeepRoleRepository = repository): Promise<void> {
  if (!validEmotions(emotions)) throw new Error("character-invalid");
  if (emotionsFor(previous).every(key => emotions.includes(key))) return;
  await repo.updateRecords(all => {
    const records = new Map<string, DataRecord>(); let planned = all;
    for (const world of all.filter(row => row.kind === "world" && !(row.data as WorldProfile).characterEmotions)) {
      for (const row of detachWorld(planned, world.id, emotions)) records.set(row.kind + ":" + row.id, row);
      // A chat can retain scenes for several worlds. Plan subsequent worlds
      // against the accumulated update so one cannot overwrite another's scene.
      planned = all.map(row => records.get(row.kind + ":" + row.id) ?? row);
    }
    return { records: [...records.values()], removed: [], result: undefined };
  });
}
