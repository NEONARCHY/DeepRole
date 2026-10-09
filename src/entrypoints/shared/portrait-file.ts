import { validPortrait } from "../../core/portrait-variations";
import { DEFAULT_PORTRAIT_MAX_EDGE, MAX_PORTRAIT_IMAGE_LENGTH, portraitUploadDimensions, validPortraitMaxEdge } from "../../core/portrait-upload";
import { getSettings } from "../../storage/settings";

async function decodePortrait(file: File, maxEdge: number): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 10_000_000) throw new Error("image-invalid");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const size = portraitUploadDimensions(image.naturalWidth, image.naturalHeight, maxEdge);
    // Preserve a fitting PNG/JPEG/WebP byte-for-byte, including its transparency.
    if (size.width === image.naturalWidth && size.height === image.naturalHeight && file.size <= Math.floor((MAX_PORTRAIT_IMAGE_LENGTH - 64) * 3 / 4)) {
      const original = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("image-invalid")); reader.readAsDataURL(file); });
      if (validPortrait(original)) return original;
    }
    const canvas = document.createElement("canvas"); canvas.width = size.width; canvas.height = size.height;
    const context = canvas.getContext("2d"); if (!context) throw new Error("image-invalid");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/webp", .92);
    if (!validPortrait(data)) throw new Error("image-too-large");
    return data;
  } finally { URL.revokeObjectURL(url); }
}

async function maxEdge() { const setting = (await getSettings()).portraitMaxEdge; return validPortraitMaxEdge(setting) ? setting : DEFAULT_PORTRAIT_MAX_EDGE; }
export async function readPortrait(file: File): Promise<string> { return decodePortrait(file, await maxEdge()); }
/** Capture preferences once per batch, not on every image or asynchronous step. */
export async function readPortraitFiles(files: File[], onProgress?: (done: number) => void): Promise<string[]> {
  const edge = await maxEdge(), images: string[] = []; let bytes = 0;
  for (const file of files) {
    const image = await decodePortrait(file, edge); bytes += image.length;
    if (bytes > 50_000_000) throw new Error("image-too-large");
    images.push(image); onProgress?.(images.length);
  }
  return images;
}
