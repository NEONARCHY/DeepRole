import type { CharacterSheet } from "./types";
import { MAX_PORTRAIT_VARIATIONS, MAX_STORED_PORTRAIT_EMOTIONS, portraitVariations, validPortrait } from "./portrait-variations";

export const MAX_UNASSIGNED_PORTRAITS = 512;
export const validPortraitLibrary = (value: unknown): value is string[] => Array.isArray(value) && value.length <= MAX_UNASSIGNED_PORTRAITS && value.every(validPortrait) && new Set(value).size === value.length;

export function libraryImages(sheet: CharacterSheet): string[] {
  return [...new Set([...(sheet.portraitLibrary ?? []), ...Object.values(sheet.sprites).flatMap(portraitVariations)])];
}

/** Assigned images already live in sprites; don't duplicate them in the inbox. */
export function withPortraitLibrary(sheet: CharacterSheet, images: string[]): CharacterSheet {
  const assigned = new Set(Object.values(sheet.sprites).flatMap(portraitVariations));
  const pending = [...new Set(images)].filter(image => !assigned.has(image));
  if (!validPortraitLibrary(pending)) throw new Error("portrait-library-full");
  const next = { ...sheet };
  if (pending.length) next.portraitLibrary = pending; else delete next.portraitLibrary;
  return next;
}

export function assignLibraryImages(sheet: CharacterSheet, emotion: string, images: string[]): CharacterSheet {
  if (!emotion || emotion.length > 32 || ["__proto__", "prototype", "constructor"].includes(emotion)) throw new Error("character-invalid");
  if (emotion !== "neutral" && sheet.blockedEmotions?.includes(emotion)) throw new Error("portrait-emotion-blocked");
  const library = libraryImages(sheet);
  if (images.some(image => !library.includes(image))) throw new Error("character-invalid");
  const variations = [...new Set([...portraitVariations(sheet.sprites[emotion]), ...images])];
  if (variations.length > MAX_PORTRAIT_VARIATIONS) throw new Error("portrait-variation-full");
  if (!sheet.sprites[emotion] && Object.keys(sheet.sprites).length >= MAX_STORED_PORTRAIT_EMOTIONS) throw new Error("portrait-emotions-full");
  if (!variations.length) return sheet;
  return withPortraitLibrary({ ...sheet, sprites: { ...sheet.sprites, [emotion]: variations } }, library);
}

export function unassignPortrait(sheet: CharacterSheet, emotion: string, index: number): CharacterSheet {
  const library = libraryImages(sheet); const sprites = { ...sheet.sprites };
  const images = portraitVariations(sprites[emotion]).filter((_, i) => i !== index);
  if (images.length) sprites[emotion] = images; else delete sprites[emotion];
  return withPortraitLibrary({ ...sheet, sprites }, library);
}

/** Remove whole assignments atomically, retaining each image in another emotion
 * or the unassigned library. Never partially detach an overfull library. */
export function unassignPortraitEmotions(sheet: CharacterSheet, emotions: string[]): CharacterSheet {
  const removed = emotions.filter(key => Object.hasOwn(sheet.sprites, key));
  if (!removed.length) return sheet;
  const images = libraryImages(sheet), sprites = { ...sheet.sprites };
  for (const key of removed) delete sprites[key];
  return withPortraitLibrary({ ...sheet, sprites }, images);
}

/** Validate the whole multi-emotion assignment before returning any changes. */
export function assignLibraryEmotions(sheet: CharacterSheet, emotions: string[], images: string[]): CharacterSheet {
  if (!emotions.length) throw new Error("character-invalid");
  return [...new Set(emotions)].reduce((next, emotion) => assignLibraryImages(next, emotion, images), sheet);
}
