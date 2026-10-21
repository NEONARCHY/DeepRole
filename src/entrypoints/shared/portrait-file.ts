import { validPortrait } from "../../core/portrait-variations";
import { DEFAULT_PORTRAIT_MAX_EDGE, portraitUploadDimensions, validPortraitMaxEdge } from "../../core/portrait-upload";
import { getSettings } from "../../storage/settings";
import { isPhotoData, mapSheetPhotos } from "../../core/photo-assets";
import { libraryImages } from "../../core/portrait-library";
import { selfieImageKey } from "../../core/selfies";
import { dataImageBlob } from "../../adapters/image/image-codec";
import type { CharacterSheet } from "../../core/types";
import { portraitVariations } from "../../core/portrait-variations";
import { withPortraitLibrary } from "../../core/portrait-library";

export type PortraitUploadMode = "original" | "configured" | "compact";
let photoStorage: ((image: string) => Promise<string>) | undefined;
let photoReader: ((image: string) => Promise<string>) | undefined;
/** Production mounts install storage; standalone UI previews stay self-contained. */
export function setPortraitPhotoStorage(store: (image: string) => Promise<string>, read?: (image: string) => Promise<string>): () => void {
  photoStorage = store; photoReader = read; return () => { if (photoStorage === store) { photoStorage = undefined; photoReader = undefined; } };
}
async function decodePortrait(file: File, maxEdge: number, mode: PortraitUploadMode, forceCompress = false): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("image-invalid");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const size = portraitUploadDimensions(image.naturalWidth, image.naturalHeight, mode === "compact" ? Math.min(maxEdge, 1280) : maxEdge);
    // Preserve a fitting PNG/JPEG/WebP byte-for-byte, including its transparency.
    if (mode === "original" || !forceCompress && mode === "configured" && size.width === image.naturalWidth && size.height === image.naturalHeight) {
      const original = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("image-invalid")); reader.readAsDataURL(file); });
      if (validPortrait(original)) return original;
      if (mode === "original") throw new Error("image-invalid");
    }
    const canvas = document.createElement("canvas"); canvas.width = size.width; canvas.height = size.height;
    const context = canvas.getContext("2d"); if (!context) throw new Error("image-invalid");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/webp", mode === "compact" ? .82 : .92);
    canvas.width = canvas.height = 0;
    if (!validPortrait(data)) throw new Error("image-invalid");
    return data;
  } finally { URL.revokeObjectURL(url); }
}

/** Read one original at a time; publish the replacement sheet only after all succeed. */
export async function compressPortraitLibrary(sheet: CharacterSheet, mode: "configured" | "compact", progress: (done: number, total: number) => void, signal: AbortSignal) {
  const read = photoReader, store = photoStorage, edge = await maxEdge();
  const images = libraryImages(sheet), replacements = new Map<string, string>();
  const check = () => { if (signal.aborted) throw new Error("compression-cancelled"); };
  let beforeBytes = 0, afterBytes = 0, changed = 0, done = 0;
  for (const source of images) {
    check();
    const original = isPhotoData(source) ? source : read ? await read(source) : (() => { throw new Error("photo-missing"); })();
    check();
    const blob = dataImageBlob(original);
    const compressed = await decodePortrait(new File([blob], "portrait", { type: blob.type }), edge, mode, true);
    check(); beforeBytes += blob.size;
    const size = dataImageBlob(compressed).size;
    if (size < blob.size) {
      const next = store ? await store(compressed) : compressed;
      check(); replacements.set(source, next); afterBytes += size; changed++;
    } else afterBytes += blob.size;
    progress(++done, images.length);
  }
  check();
  const next = await mapSheetPhotos(sheet, image => Promise.resolve(replacements.get(image) ?? image));
  next.sprites = Object.fromEntries(Object.entries(next.sprites).map(([action, value]) => [action, [...new Set(portraitVariations(value))]]));
  if (next.selfieCategories) next.selfieCategories = next.selfieCategories.map(category => ({ ...category, images: [...new Set(category.images)] }));
  if (sheet.imageGeneration) {
    const keys = new Map([...replacements].map(([before, after]) => [selfieImageKey(before), selfieImageKey(after)]));
    next.imageGeneration = { ...sheet.imageGeneration };
    for (const slot of ["referenceKey", "suggestiveReferenceKey"] as const) {
      const old = sheet.imageGeneration[slot]; if (old && keys.has(old)) next.imageGeneration[slot] = keys.get(old)!;
    }
  }
  check(); return { sheet: withPortraitLibrary(next, next.portraitLibrary ?? []), changed, beforeBytes, afterBytes };
}

async function maxEdge() { const setting = (await getSettings()).portraitMaxEdge; return validPortraitMaxEdge(setting) ? setting : DEFAULT_PORTRAIT_MAX_EDGE; }
export async function readPortrait(file: File, mode: PortraitUploadMode = "configured"): Promise<string> { const image = await decodePortrait(file, await maxEdge(), mode); return photoStorage ? photoStorage(image) : image; }
/** Capture preferences once per batch, not on every image or asynchronous step. */
export async function readPortraitFiles(files: File[], onProgress?: (done: number) => void, mode: PortraitUploadMode = "configured"): Promise<string[]> {
  const edge = await maxEdge(), images: string[] = [];
  for (const file of files) {
    const image = await decodePortrait(file, edge, mode);
    images.push(photoStorage ? await photoStorage(image) : image); onProgress?.(images.length);
  }
  return images;
}
