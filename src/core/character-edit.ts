import type { CharacterScene, CharacterSheet, CharacterStatus, SceneEntity } from "./types";
import { characterInterlocutors, EMPTY_CHARACTER, EMPTY_STATUS } from "./characters";
import { withPortraitLibrary } from "./portrait-library";
import { attributeState } from "./attributes";
import { relationshipState } from "./relationships";

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
    state: scene?.states[entity?.id ?? ""] ?? entity?.characterSheet?.initialStatus ?? EMPTY_STATUS,
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
  for (const key of ["gender", "appearance", "personality", "goals", "background", "relationships", "attributes", "selfieCategories", "selfieAccess", "imageGeneration"] as const) {
    Object.assign(sheet, { [key]: mergeField(original.sheet[key], draft.sheet[key], current.sheet[key]) });
  }
  for (const key of new Set([...Object.keys(original.sheet.sprites), ...Object.keys(draft.sheet.sprites)])) {
    const image = mergeField(original.sheet.sprites[key], draft.sheet.sprites[key], current.sheet.sprites[key]);
    if (image === undefined) delete sheet.sprites[key]; else sheet.sprites[key] = image;
  }
  const library = mergeField(original.sheet.portraitLibrary ?? [], draft.sheet.portraitLibrary ?? [], current.sheet.portraitLibrary ?? []);
  const blocked = [...new Set([...(original.sheet.blockedEmotions ?? []), ...(draft.sheet.blockedEmotions ?? []), ...(current.sheet.blockedEmotions ?? [])])]
    .filter(key => mergeField(!!original.sheet.blockedEmotions?.includes(key), !!draft.sheet.blockedEmotions?.includes(key), !!current.sheet.blockedEmotions?.includes(key)));
  if (blocked.length) sheet.blockedEmotions = blocked; else delete sheet.blockedEmotions;
  const mergedSheet = withPortraitLibrary(sheet, library);
  for (const key of ["emotion", "condition", "goal", "relationship", "stats"] as const) {
    Object.assign(state, { [key]: mergeField(original.state[key], draft.state[key], current.state[key]) });
  }
  if (same(original.state.attributes, draft.state.attributes) || !draft.state.attributes) {
    state.attributes = mergeField(original.state.attributes, draft.state.attributes, current.state.attributes);
  } else {
    const before = attributeState(original.sheet.attributes ?? [], original.state.attributes);
    const edited = attributeState(draft.sheet.attributes ?? [], draft.state.attributes);
    const live = attributeState(current.sheet.attributes ?? [], current.state.attributes);
    const definitions = mergedSheet.attributes ?? [];
    state.attributes = {
      values: Object.fromEntries(definitions.map(a => [a.id, mergeField(before.values[a.id], edited.values[a.id], live.values[a.id] ?? before.values[a.id] ?? a.initial) ?? a.initial])),
      locked: definitions.filter(a => mergeField(before.locked.includes(a.id), edited.locked.includes(a.id), live.locked.includes(a.id))).map(a => a.id),
      // Only committed history is authoritative; a stale form must never erase it.
      history: current.state.attributes?.history ?? [],
    };
  }
  if (original.state.bonds || draft.state.bonds || current.state.bonds) {
    state.bonds = { ...current.state.bonds };
    for (const hero of new Set([...Object.keys(original.state.bonds ?? {}), ...Object.keys(draft.state.bonds ?? {})])) {
      const initial = original.state.bonds?.[hero]; const edit = draft.state.bonds?.[hero]; const live = current.state.bonds?.[hero];
      let bond = live;
      if (same(initial, edit) || !edit || !draft.sheet.relationships) bond = mergeField(initial, edit, live);
      else {
        const before = relationshipState(original.sheet.relationships ?? draft.sheet.relationships, initial);
        const currentBond = relationshipState(current.sheet.relationships ?? draft.sheet.relationships, live);
        bond = { ...currentBond,
          trust: mergeField(before.trust, edit.trust, currentBond.trust),
          affinity: mergeField(before.affinity, edit.affinity, currentBond.affinity),
          locked: mergeField(before.locked, edit.locked, currentBond.locked),
          completed: [...new Set([...before.completed, ...edit.completed, ...currentBond.completed])].filter(id => mergeField(before.completed.includes(id), edit.completed.includes(id), currentBond.completed.includes(id))),
          history: currentBond.history,
        };
      }
      if (bond === undefined) delete state.bonds[hero]; else state.bonds[hero] = bond;
    }
  }
  const present = mergeField(original.present, draft.present, current.present);
  return {
    name: mergeField(original.name, draft.name, current.name), sheet: mergedSheet, state, present,
    interlocutor: !present || sheet.protagonist ? false : mergeField(original.interlocutor, draft.interlocutor ?? original.interlocutor, current.interlocutor),
  };
}
