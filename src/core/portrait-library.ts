import type { CharacterSheet } from "./types";
import { portraitVariations, validPortrait } from "./portrait-variations";

export const validPortraitLibrary = (value: unknown): value is string[] => Array.isArray(value) && value.every(validPortrait) && new Set(value).size === value.length;

export function libraryImages(sheet: CharacterSheet): string[] {
  return [...new Set([...(sheet.portraitLibrary ?? []), ...Object.values(sheet.sprites).flatMap(portraitVariations)])];
}

/** Assigned images already live in sprites; don't duplicate them in the inbox. */
export function withPortraitLibrary(sheet: CharacterSheet, images: string[]): CharacterSheet {
  const assigned = new Set(Object.values(sheet.sprites).flatMap(portraitVariations));
  const pending = [...new Set(images)].filter(image => !assigned.has(image));
  if (!validPortraitLibrary(pending)) throw new Error("portrait-library-invalid");
  const next = { ...sheet };
  if (pending.length) next.portraitLibrary = pending; else delete next.portraitLibrary;
  return next;
}

export function assignLibraryImages(sheet: CharacterSheet, action: string, images: string[]): CharacterSheet {
  if (!action || action.length > 32 || ["__proto__", "prototype", "constructor"].includes(action)) throw new Error("character-invalid");
  if (action !== "neutral" && sheet.blockedActions?.includes(action)) throw new Error("portrait-action-blocked");
  const library = libraryImages(sheet);
  if (images.some(image => !library.includes(image))) throw new Error("character-invalid");
  const variations = [...new Set([...portraitVariations(sheet.sprites[action]), ...images])];
  if (!variations.length) return sheet;
  return withPortraitLibrary({ ...sheet, sprites: { ...sheet.sprites, [action]: variations } }, library);
}

export function unassignPortrait(sheet: CharacterSheet, action: string, index: number): CharacterSheet {
  const library = libraryImages(sheet); const sprites = { ...sheet.sprites };
  const images = portraitVariations(sprites[action]).filter((_, i) => i !== index);
  if (images.length) sprites[action] = images; else delete sprites[action];
  return withPortraitLibrary({ ...sheet, sprites }, library);
}

/** Remove whole assignments atomically, retaining each image in another action
 * or the unassigned library. Never partially detach an overfull library. */
export function unassignPortraitActions(sheet: CharacterSheet, actions: string[]): CharacterSheet {
  const removed = actions.filter(key => Object.hasOwn(sheet.sprites, key));
  if (!removed.length) return sheet;
  const images = libraryImages(sheet), sprites = { ...sheet.sprites };
  for (const key of removed) delete sprites[key];
  return withPortraitLibrary({ ...sheet, sprites }, images);
}

/** Validate the whole multi-action assignment before returning any changes. */
export function assignLibraryActions(sheet: CharacterSheet, actions: string[], images: string[]): CharacterSheet {
  if (!actions.length) throw new Error("character-invalid");
  return [...new Set(actions)].reduce((next, action) => assignLibraryImages(next, action, images), sheet);
}
