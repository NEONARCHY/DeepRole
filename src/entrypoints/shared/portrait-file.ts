import { validPortrait } from "../../core/portrait-variations";

export async function readPortrait(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5_000_000) throw new Error("image-invalid");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    if (image.naturalWidth * image.naturalHeight > 25_000_000 || !image.naturalWidth || !image.naturalHeight) throw new Error("image-invalid");
    const scale = Math.min(1, 384 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d"); if (!context) throw new Error("image-invalid");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/webp", .8);
    if (!validPortrait(data)) throw new Error("image-invalid");
    return data;
  } finally { URL.revokeObjectURL(url); }
}
