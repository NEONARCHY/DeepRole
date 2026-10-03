import type { CharacterScene, CharacterSheet, CharacterStatus, SceneEntity } from "./types";
import { characterInterlocutors, EMPTY_CHARACTER, EMPTY_STATUS } from "./characters";

/** Local editor baseline, never part of the prompt or exported world. */
export interface CharacterEditBaseline {
  name: string;
  sheet: CharacterSheet;
  state: CharacterStatus;
  present: boolean;
  interlocutor: boolean;
  protagonists: string[];
}

export function characterEditBaseline(entity: SceneEntity | null, entities: SceneEntity[], scene?: CharacterScene): CharacterEditBaseline {
  return structuredClone({
    name: entity?.name ?? "", sheet: entity?.characterSheet ?? EMPTY_CHARACTER,
    state: scene?.states[entity?.id ?? ""] ?? EMPTY_STATUS,
    present: !!entity && !!scene?.presentIds.includes(entity.id),
    interlocutor: !!entity && characterInterlocutors(entities, scene).some(person => person.id === entity.id),
    protagonists: entities.filter(person => person.characterSheet?.protagonist).map(person => person.id).sort(),
  });
}

function same(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown) => JSON.stringify(value, (_key, part) => part && typeof part === "object" && !Array.isArray(part) ? Object.fromEntries(Object.entries(part).sort(([a], [b]) => a.localeCompare(b))) : part);
  return canonical(a) === canonical(b);
}

function mergeField<T>(original: T, draft: T, current: T): T {
  if (same(draft, original)) return current;
  if (same(current, original) || same(current, draft)) return draft;
  throw new Error("character-edit-conflict");
}

/** Only edited fields are written; unrelated live updates remain authoritative. */
export function mergeCharacterEdit(original: CharacterEditBaseline, draft: Omit<CharacterEditBaseline, "protagonists" | "interlocutor"> & { interlocutor?: boolean }, current: CharacterEditBaseline) {
  const sheet = { ...current.sheet, sprites: { ...current.sheet.sprites } };
  const state = { ...current.state };
  sheet.protagonist = mergeField(original.sheet.protagonist, draft.sheet.protagonist, current.sheet.protagonist);
  // Selecting a new hero must not silently replace someone selected in another editor.
  if (sheet.protagonist && !current.sheet.protagonist && !same(original.protagonists, current.protagonists)) throw new Error("character-edit-conflict");
  for (const key of ["gender", "appearance", "personality", "goals", "background"] as const) {
    Object.assign(sheet, { [key]: mergeField(original.sheet[key], draft.sheet[key], current.sheet[key]) });
  }
  for (const key of new Set([...Object.keys(original.sheet.sprites), ...Object.keys(draft.sheet.sprites)])) {
    const image = mergeField(original.sheet.sprites[key], draft.sheet.sprites[key], current.sheet.sprites[key]);
    if (image === undefined) delete sheet.sprites[key]; else sheet.sprites[key] = image;
  }
  for (const key of ["emotion", "condition", "goal", "relationship", "stats"] as const) {
    Object.assign(state, { [key]: mergeField(original.state[key], draft.state[key], current.state[key]) });
  }
  const present = mergeField(original.present, draft.present, current.present);
  return {
    name: mergeField(original.name, draft.name, current.name), sheet, state, present,
    interlocutor: !present || sheet.protagonist ? false : mergeField(original.interlocutor, draft.interlocutor ?? original.interlocutor, current.interlocutor),
  };
}
