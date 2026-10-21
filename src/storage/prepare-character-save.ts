import { isPhotoAddress, mapSheetPhotos } from "../core/photo-assets";
import type { CharacterEdit } from "./characters";

/** Keep thumbnails/blob URLs out of persistence; stage each unique original once. */
export async function prepareCharacterSave(edit: CharacterEdit, storePhoto: (image: string) => Promise<string>): Promise<CharacterEdit> {
  const staged = new Map<string, Promise<string>>();
  const store = (image: string) => {
    if (isPhotoAddress(image)) return Promise.resolve(image);
    let pending = staged.get(image);
    if (!pending) { pending = storePhoto(image); staged.set(image, pending); }
    return pending;
  };
  let sheet = await mapSheetPhotos(edit.sheet, store);
  let original = edit.original ? { ...edit.original, sheet: await mapSheetPhotos(edit.original.sheet, store) } : undefined;
  if (original) {
    const baseline = { ...original.sheet }; sheet = { ...sheet };
    if (JSON.stringify(sheet.sprites) === JSON.stringify(baseline.sprites)) { sheet.sprites = {}; baseline.sprites = {}; }
    for (const field of ["portraitLibrary", "selfieCategories"] as const) {
      if (JSON.stringify(sheet[field]) === JSON.stringify(baseline[field])) { delete sheet[field]; delete baseline[field]; }
    }
    original = { ...original, sheet: baseline };
  }
  return { ...edit, sheet, ...(original ? { original } : {}) };
}
