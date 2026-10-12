/** Immutable image addresses. Portable files carry every referenced original inline or in a photo table. */
export const PHOTO_PREFIX = "deeprole-photo:";
export const isPhotoAddress = (value: unknown): value is string => typeof value === "string" && /^deeprole-photo:[a-f0-9]{64}:\d+:[a-z0-9]+:[a-z0-9]+$/.test(value);
export const photoLegacyKey = (value: string) => isPhotoAddress(value) ? value.split(":").slice(2).join(":") : undefined;
export const photoImageSource = (image: HTMLImageElement) => image.dataset.drPhotoSource ?? image.getAttribute("src") ?? "";
/** Conservative reference scan: never opens photo blobs or duplicates image bytes. */
export function photoAddresses(value: unknown): Set<string> {
  const result = new Set<string>(), pending: unknown[] = [value];
  while (pending.length) {
    const next = pending.pop();
    if (isPhotoAddress(next)) result.add(next);
    else if (next && typeof next === "object") for (const item of Object.values(next)) pending.push(item);
  }
  return result;
}
export const isPhotoData = (value: unknown): value is string => typeof value === "string" && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);

export function hasInternalPhotoAddresses(kind: string, value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (kind === "illustration" && "image" in value) return isPhotoAddress(value.image);
  if (kind !== "entity" || !("characterSheet" in value)) return false;
  const sheet = value.characterSheet as import("./types").CharacterSheet | undefined;
  if (!sheet) return false;
  return [...Object.values(sheet.sprites ?? {}).flatMap(image => Array.isArray(image) ? image : [image]), ...(sheet.portraitLibrary ?? []), ...(sheet.selfieCategories ?? []).flatMap(c => c.images ?? [])].some(isPhotoAddress);
}

/** Only photo-bearing fields: narrative text is never interpreted as an image. */
export async function mapSheetPhotos<T>(value: T, map: (image: string) => Promise<string>): Promise<T> {
  if (!value || typeof value !== "object" || !("sprites" in value)) return value;
  const sheet = value as T & import("./types").CharacterSheet;
  const list = async (images: string[]) => { const result: string[] = []; for (const image of images) result.push(await map(image)); return result; };
  const sprites: Record<string, string | string[]> = {};
  for (const [key, image] of Object.entries(sheet.sprites)) sprites[key] = Array.isArray(image) ? await list(image) : await map(image);
  const categories = [];
  for (const category of sheet.selfieCategories ?? []) categories.push({ ...category, images: await list(category.images) });
  return { ...sheet, sprites, ...(sheet.portraitLibrary ? { portraitLibrary: await list(sheet.portraitLibrary) } : {}),
    ...(sheet.selfieCategories ? { selfieCategories: categories } : {}) };
}

export async function mapRecordPhotos<T>(kind: string, value: T, map: (image: string) => Promise<string>): Promise<T> {
  if (kind !== "entity" || !value || typeof value !== "object" || !("characterSheet" in value)) return value;
  const entity = value as T & import("./types").SceneEntity;
  return { ...entity, characterSheet: await mapSheetPhotos(entity.characterSheet, map) };
}
