import { actionIdentity } from "./character-actions";
import type { CharacterScene, CharacterSheet, CharacterStatus, DataRecord, SceneEntity, ChatBinding, HandoffSnapshot } from "./types";
import { createId } from "./id";

export type ActionRenames = Record<string, string>;
const renamedKey = (key: string, renames: ActionRenames) => Object.hasOwn(renames, key) ? renames[key]! : key;
export function validateActionRenames(before: string[], after: string[], renames: ActionRenames): void {
  const targets = Object.values(renames).map(actionIdentity);
  if (new Set(targets).size !== targets.length || Object.entries(renames).some(([from, to]) => from === "neutral" || !before.includes(from) || !after.includes(to) || from === to || ["neutral", "__proto__", "constructor", "prototype"].includes(to) || before.some(key => key !== from && !Object.hasOwn(renames, key) && actionIdentity(key) === actionIdentity(to)))) throw Error("action-rename-invalid");
}
function state(value: CharacterStatus, renames: ActionRenames): CharacterStatus {
  const action = Object.hasOwn(renames, value.action) ? renames[value.action]! : value.action;
  return action === value.action ? value : { ...value, action };
}
function sheet(value: CharacterSheet, renames: ActionRenames): CharacterSheet {
  const sprites = { ...value.sprites };
  for (const [from, to] of Object.entries(renames)) {
    if (Object.hasOwn(value.sprites, from) && Object.hasOwn(value.sprites, to) && !Object.hasOwn(renames, to)) throw Error("action-rename-conflict");
    delete sprites[from];
  }
  for (const [from, to] of Object.entries(renames)) if (Object.hasOwn(value.sprites, from)) sprites[to] = value.sprites[from]!;
  return { ...value, sprites, ...(value.blockedActions ? { blockedActions: [...new Set(value.blockedActions.map(key => renamedKey(key, renames)))] } : {}), ...(value.initialStatus ? { initialStatus: state(value.initialStatus, renames) } : {}) };
}
function scene(value: CharacterScene, renames: ActionRenames): CharacterScene {
  const states = Object.fromEntries(Object.entries(value.states).map(([id, current]) => [id, state(current, renames)]));
  const portraitCycles = value.portraitCycles && Object.fromEntries(Object.entries(value.portraitCycles).map(([id, cycles]) => [id, Object.fromEntries(Object.entries(cycles).map(([key, cycle]) => [renamedKey(key, renames), cycle]))]));
  return { ...value, states, ...(portraitCycles ? { portraitCycles } : {}), revision: createId("rev"), updatedAt: Date.now() };
}
/** Plan one atomic world rename. Never rewrite lore, image bytes, IDs or interaction history. */
export function renameWorldActions(all: DataRecord[], worldId: string, renames: ActionRenames): DataRecord[] {
  if (!Object.keys(renames).length) return all;
  const now = Date.now();
  return all.map(row => {
    if (row.kind === "entity" && (row.data as SceneEntity).worldId === worldId && (row.data as SceneEntity).characterSheet) {
      const person = row.data as SceneEntity;
      return { ...row, data: { ...person, characterSheet: sheet(person.characterSheet!, renames), updatedAt: Math.max(now, person.updatedAt + 1) } };
    }
    if (row.kind === "binding" && (row.data as ChatBinding).characterScenes?.[worldId]) {
      const binding = row.data as ChatBinding;
      return { ...row, data: { ...binding, characterScenes: { ...binding.characterScenes, [worldId]: scene(binding.characterScenes![worldId]!, renames) }, updatedAt: Math.max(now, binding.updatedAt + 1) } };
    }
    if (row.kind === "snapshot" && (row.data as HandoffSnapshot).worldId === worldId && (row.data as HandoffSnapshot).characterScene) {
      const snapshot = row.data as HandoffSnapshot;
      return { ...row, data: { ...snapshot, characterScene: scene(snapshot.characterScene!, renames) } };
    }
    return row;
  });
}
