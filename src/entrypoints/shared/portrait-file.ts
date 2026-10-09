import { validPortrait } from "../../core/portrait-variations";
import { DEFAULT_PORTRAIT_MAX_EDGE, portraitUploadDimensions, validPortraitMaxEdge } from "../../core/portrait-upload";
import { getSettings } from "../../storage/settings";

export type PortraitUploadMode = "original" | "configured" | "compact";
async function decodePortrait(file: File, maxEdge: number, mode: PortraitUploadMode): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("image-invalid");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const size = portraitUploadDimensions(image.naturalWidth, image.naturalHeight, mode === "compact" ? Math.min(maxEdge, 1280) : maxEdge);
    // Preserve a fitting PNG/JPEG/WebP byte-for-byte, including its transparency.
    if (mode === "original" || mode === "configured" && size.width === image.naturalWidth && size.height === image.naturalHeight) {
      const original = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("image-invalid")); reader.readAsDataURL(file); });
      if (validPortrait(original)) return original;
      if (mode === "original") throw new Error("image-invalid");
    }
    const canvas = document.createElement("canvas"); canvas.width = size.width; canvas.height = size.height;
    const context = canvas.getContext("2d"); if (!context) throw new Error("image-invalid");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/webp", mode === "compact" ? .82 : .92);
    if (!validPortrait(data)) throw new Error("image-invalid");
    return data;
  } finally { URL.revokeObjectURL(url); }
}

async function maxEdge() { const setting = (await getSettings()).portraitMaxEdge; return validPortraitMaxEdge(setting) ? setting : DEFAULT_PORTRAIT_MAX_EDGE; }
export async function readPortrait(file: File, mode: PortraitUploadMode = "configured"): Promise<string> { return decodePortrait(file, await maxEdge(), mode); }
/** Capture preferences once per batch, not on every image or asynchronous step. */
export async function readPortraitFiles(files: File[], onProgress?: (done: number) => void, mode: PortraitUploadMode = "configured"): Promise<string[]> {
  const edge = await maxEdge(), images: string[] = [];
  for (const file of files) {
    const image = await decodePortrait(file, edge, mode);
    images.push(image); onProgress?.(images.length);
  }
  return images;
}
