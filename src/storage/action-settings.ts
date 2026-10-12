import type { ChatBinding, DataRecord, SceneEntity, WorldProfile, DeepRoleSettings } from "../core/types";
import { actionsFor, validActions } from "../core/characters";
import { cleanCharacterActionImages, resolveCharacterAction } from "../core/character-actions";
import { advancePortraitCycles } from "../core/portrait-variations";
import { createId } from "../core/id";
import { MemoryConflictError, repository, type DeepRoleRepository } from "./repository";
import { renameWorldActions, validateActionRenames, type ActionRenames } from "../core/action-renames";
import { getSettings, saveSettings } from "./settings";

/** The whole action-list update is planned before writing: no lost images, partial
 * detachment or stale world-list overwrite if another window edited it. */
function detachWorld(all: DataRecord[], worldId: string, actions: string[]): DataRecord[] {
  const now = Date.now(), changes: DataRecord[] = [];
  const people = all.filter(row => row.kind === "entity" && (row.data as SceneEntity).worldId === worldId).map(row => row.data as SceneEntity);
  const nextPeople = people.map(person => {
    if (!person.characterSheet) return person;
    const sheet = cleanCharacterActionImages(person.characterSheet, actions);
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
      const action = resolveCharacterAction(sheet, state.action, undefined, actions);
      return [id, action === state.action ? state : { ...state, action }];
    }));
    const nextScene = { ...scene, states };
    const cycles = advancePortraitCycles(nextPeople, nextScene, scene, true);
    if (!peopleChanged && Object.entries(states).every(([id, state]) => state === scene.states[id]) && JSON.stringify(cycles) === JSON.stringify(scene.portraitCycles ?? {})) continue;
    const next = { ...binding, characterScenes: { ...binding.characterScenes, [worldId]: { ...nextScene, portraitCycles: cycles, revision: createId("rev"), updatedAt: now } }, updatedAt: now };
    changes.push({ kind: "binding", id: row.id, data: next });
  }
  return changes;
}

export async function saveWorldActionList(expected: WorldProfile, actions: string[], repo: DeepRoleRepository = repository, renames: ActionRenames = {}, previous?: string[]): Promise<void> {
  if (!validActions(actions)) throw new Error("character-invalid");
  await repo.updateRecords(all => {
    const world = all.find(row => row.kind === "world" && row.id === expected.id)?.data as WorldProfile | undefined;
    if (!world || JSON.stringify(world) !== JSON.stringify(expected)) throw new MemoryConflictError();
    validateActionRenames(actionsFor(world.characterActions ?? previous), actions, renames);
    const renamed = renameWorldActions(all, world.id, renames);
    const planned = new Map(renamed.filter((row, index) => row !== all[index]).map(row => [row.kind + ":" + row.id, row]));
    for (const row of detachWorld(renamed, world.id, actions)) planned.set(row.kind + ":" + row.id, row);
    const changes = [...planned.values()];
    changes.push({ kind: "world", id: world.id, data: { ...world, characterActions: [...actions], updatedAt: Math.max(Date.now(), world.updatedAt + 1) } });
    return { records: changes, removed: [], result: undefined };
  });
}

/** Global defaults apply only to worlds without their own list. */
export async function detachDefaultActionImages(previous: string[], actions: string[], repo: DeepRoleRepository = repository): Promise<void> {
  if (!validActions(actions)) throw new Error("character-invalid");
  if (actionsFor(previous).every(key => actions.includes(key))) return;
  await repo.updateRecords(all => {
    const records = new Map<string, DataRecord>(); let planned = all;
    for (const world of all.filter(row => row.kind === "world" && !(row.data as WorldProfile).characterActions)) {
      for (const row of detachWorld(planned, world.id, actions)) records.set(row.kind + ":" + row.id, row);
      // A chat can retain scenes for several worlds. Plan subsequent worlds
      // against the accumulated update so one cannot overwrite another's scene.
      planned = all.map(row => records.get(row.kind + ":" + row.id) ?? row);
    }
    return { records: [...records.values()], removed: [], result: undefined };
  });
}

/** Defaults and every inheriting world commit together, including rollback if settings cannot be saved. */
export async function saveDefaultActionList(expected: DeepRoleSettings, actions: string[], renames: ActionRenames = {}, repo: DeepRoleRepository = repository): Promise<DeepRoleSettings> {
  if (!validActions(actions)) throw Error("character-invalid");
  const previous = actionsFor(expected.characterActions);
  validateActionRenames(previous, actions, renames);
  let saved: DeepRoleSettings | undefined;
  await repo.updateRecords(all => {
    let planned = all;
    for (const row of all.filter(row => row.kind === "world" && !(row.data as WorldProfile).characterActions)) {
      planned = renameWorldActions(planned, row.id, renames);
      const detached = new Map(detachWorld(planned, row.id, actions).map(change => [change.kind + ":" + change.id, change]));
      planned = planned.map(change => detached.get(change.kind + ":" + change.id) ?? change);
    }
    return { records: planned.filter((row, index) => row !== all[index]), removed: [], result: undefined };
  }, async () => {
    const current = await getSettings();
    if (JSON.stringify(actionsFor(current.characterActions)) !== JSON.stringify(previous)) throw new MemoryConflictError();
    saved = { ...current, characterActions: [...actions] };
    await saveSettings(saved);
  });
  return saved!;
}
