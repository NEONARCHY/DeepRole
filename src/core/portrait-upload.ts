export const DEFAULT_PORTRAIT_MAX_EDGE = 1920;
export const MIN_PORTRAIT_MAX_EDGE = 256;
export const MAX_PORTRAIT_MAX_EDGE = 4096;
/** Encoded local data, not provider model limits. World-wide budget stays 50 MB. */
export const MAX_PORTRAIT_IMAGE_LENGTH = 2_000_000;
export const DEFAULT_PORTRAIT_PREVIEW_SIZE = 128;
export const validPortraitMaxEdge = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= MIN_PORTRAIT_MAX_EDGE && value <= MAX_PORTRAIT_MAX_EDGE;
export const validPortraitPreviewSize = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 96 && value <= 280;
export function portraitUploadDimensions(width: number, height: number, maxEdge: number) {
  if (!validPortraitMaxEdge(maxEdge) || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 25_000_000) throw new Error("image-invalid");
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
