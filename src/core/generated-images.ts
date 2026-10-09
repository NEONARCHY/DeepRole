// Local storage safeguards, not model capabilities. Portraits retain their own small limit.
export const MAX_GENERATED_IMAGE_LENGTH = 10_000_000;
export const MAX_GENERATED_IMAGE_BYTES = Math.floor((MAX_GENERATED_IMAGE_LENGTH - 64) * 3 / 4);
export function validGeneratedImage(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_GENERATED_IMAGE_LENGTH
    && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}
