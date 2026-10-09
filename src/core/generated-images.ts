export function validGeneratedImage(value: unknown): value is string {
  return typeof value === "string"
    && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}
