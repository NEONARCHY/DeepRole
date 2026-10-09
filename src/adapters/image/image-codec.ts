import { MAX_GENERATED_IMAGE_BYTES, validGeneratedImage } from "../../core/generated-images";
export const MAX_IMAGE_RESPONSE_BYTES = 20_000_000;
export function dataImageBlob(data: string): Blob {
  if (data.length > Math.ceil(MAX_IMAGE_RESPONSE_BYTES * 4 / 3) + 100) throw new Error("image-invalid");
  const match = /^(?:data:image\/(png|jpeg|webp);base64,)?([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if (!match) throw new Error("image-invalid");
  const raw = atob(match[2]!); const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
  const type = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 ? "image/png" : bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg" : raw.startsWith("RIFF") && raw.slice(8, 12) === "WEBP" ? "image/webp" : null;
  if (!type || bytes.length > MAX_IMAGE_RESPONSE_BYTES || match[1] && type !== "image/" + match[1]) throw new Error("image-invalid");
  return new Blob([bytes], { type });
}
export async function blobDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${blob.type};base64,${btoa(binary)}`;
}
/** Browser-native decoder/canvas also works in the MV3 worker; no DOM or libraries. */
export async function normalizeImage(blob: Blob, reference = false, _aspectRatio?: import("../../core/image-generation").ImageAspectRatio): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(blob.type) || !blob.size || blob.size > MAX_IMAGE_RESPONSE_BYTES) throw new Error("image-invalid");
  const bitmap = await createImageBitmap(blob);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 80_000_000) throw new Error("image-invalid");
    if (!reference && blob.size <= MAX_GENERATED_IMAGE_BYTES) {
      const data = await blobDataUrl(blob);
      // Check signatures for binary responses as well as JSON base64 results.
      dataImageBlob(data);
      if (validGeneratedImage(data)) return data;
      throw new Error("image-invalid");
    }
    // References retain the existing upload budget. Results are never downscaled or cropped.
    const scale = reference ? Math.min(1, Math.sqrt(1_500_000 / (bitmap.width * bitmap.height))) : 1;
    const canvas = new OffscreenCanvas(Math.max(1, Math.floor(bitmap.width * scale)), Math.max(1, Math.floor(bitmap.height * scale)));
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("image-invalid");
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of reference ? [.88, .75, .6, .45, .3] : [.94, .90, .86]) {
      const result = await canvas.convertToBlob({ type: "image/jpeg", quality });
      if (reference ? result.size < 10_000_000 : result.size <= MAX_GENERATED_IMAGE_BYTES) { const data = await blobDataUrl(result); if (reference || validGeneratedImage(data)) return data; }
    }
    throw new Error(reference ? "image-invalid" : "image-too-large");
  } finally { bitmap.close(); }
}
