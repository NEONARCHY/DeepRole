import { isPhotoAddress, isPhotoData, PHOTO_PREFIX } from "./photo-assets";
import { uncachedSelfieImageKey } from "./selfies";
import type { DataRecord } from "./types";
export interface PortablePhoto { id: string; image: string }
/** Replay requests must carry image data for the generation provider. */
export function restoreReplayImages<T>(value: T, photos: unknown): T {
  if (!Array.isArray(photos)) return value;
  const images = new Map<string, string>();
  for (const photo of photos) {
    if (photo && isPhotoAddress(photo.id) && isPhotoData(photo.image)) images.set(photo.id, photo.image);
  }
  const walk = (v: unknown): unknown => {
    if (!v || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(walk);
    const entries = Object.entries(v);
    const replay = entries.some(([key]) => key === "input") && entries.some(([key]) => key === "config")
      && entries.some(([key, item]) => key === "images" && Array.isArray(item));
    return Object.fromEntries(entries.map(([key, item]) => [key, replay && key === "images" && Array.isArray(item)
      ? item.map(image => isPhotoAddress(image) ? images.get(image) ?? image : image)
      : walk(item)]));
  };
  return walk(value) as T;
}
const imageSource = (v: unknown): v is string => isPhotoAddress(v) || isPhotoData(v);
/** Only structured photo fields. Lore, descriptions, quotes and native text remain exact. */
export function mapPortablePhotoFields<T>(value: T, map: (image: string) => string): T {
  const seen = new WeakMap<object, unknown>();
  const walk = (v: unknown): unknown => {
    if (!v || typeof v !== "object") return v;
    if (seen.has(v)) return seen.get(v);
    if (Array.isArray(v)) { const a: unknown[] = []; seen.set(v,a); for (const item of v) a.push(walk(item)); return a; }
    const result: Record<string,unknown> = {}; seen.set(v,result);
    const assign = (k: string, val: unknown) => Object.defineProperty(result,k,{ value:val,enumerable:true,writable:true,configurable:true });
    const images = (items: unknown[]) => items.map(item => imageSource(item) ? map(item) : walk(item));
    for (const [key,item] of Object.entries(v)) {
      if (key === "sprites" && item && typeof item === "object" && !Array.isArray(item)) {
        const sprites = Object.fromEntries(Object.entries(item).map(([action,image]) => [action,Array.isArray(image) ? images(image) : imageSource(image) ? map(image) : walk(image)]));
        assign(key,sprites);
      } else if ((key === "portraitLibrary" || key === "images") && Array.isArray(item)) assign(key,images(item));
      else if (key === "image" && imageSource(item)) assign(key,map(item));
      else assign(key,walk(item));
    }
    return result;
  };
  return walk(value) as T;
}
export function portablePhotoReferences(records: DataRecord[]) {
  const ids = new Set<string>();
  mapPortablePhotoFields(records,image => { if (isPhotoAddress(image)) ids.add(image); return image; });
  return ids;
}
export function validPortablePhotos(value: unknown, records: DataRecord[]): value is PortablePhoto[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  for (const photo of value) {
    if (!photo || typeof photo !== "object" || Array.isArray(photo) || Object.keys(photo).length !== 2 || !isPhotoAddress(photo.id) || !isPhotoData(photo.image) || ids.has(photo.id)) return false;
    ids.add(photo.id);
  }
  return [...portablePhotoReferences(records)].every(id => ids.has(id));
}
export async function portablePhotoId(image: string) {
  if (!isPhotoData(image)) throw Error("photo-invalid");
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(image))),b=>b.toString(16).padStart(2,"0")).join("");
  return PHOTO_PREFIX + hash + ":" + uncachedSelfieImageKey(image);
}
export async function packPortablePhotos(records: DataRecord[], read: (id: string) => Promise<string>, progress?: (done: number,total: number) => void) {
  const sources = new Set<string>();
  mapPortablePhotoFields(records,image => { sources.add(image);return image; });
  const mapped = new Map<string,string>(), photos = new Map<string,PortablePhoto>(); let done = 0;
  for (const source of sources) {
    const image = isPhotoAddress(source) ? await read(source) : source;
    if (!isPhotoData(image)) throw Error("photo-invalid");
    const id = isPhotoAddress(source) ? source : await portablePhotoId(image);
    mapped.set(source,id); if (!photos.has(id)) photos.set(id,{id,image});
    progress?.(++done,sources.size);
  }
  const table = [...photos.values()];
  return { records: restoreReplayImages(mapPortablePhotoFields(records,image => mapped.get(image)!), table), photos: table };
}
