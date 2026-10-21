import { blobDataUrl, dataImageBlob } from "./image/image-codec";

/** Display-only derivatives. Never written into a character sheet or original photo. */
export class PhotoPreviewCache {
  private readonly cached = new Map<string, string>();
  private readonly pending = new Map<string, Promise<string>>();
  private readonly waiting: (() => void)[] = [];
  private bytes = 0;
  private active = 0;
  private generation = 0;

  clear() { this.generation++; this.cached.clear(); this.pending.clear(); this.bytes = 0; }

  get(id: string, size: number, read: () => Promise<string>): Promise<string> {
    const limit = size <= 256 ? 256 : size <= 512 ? 512 : 1024;
    const key = `${limit}:${id}`, hit = this.cached.get(key);
    if (hit) { this.cached.delete(key); this.cached.set(key, hit); return Promise.resolve(hit); }
    const pending = this.pending.get(key); if (pending) return pending;
    const generation = this.generation;
    const task = (async () => {
      if (this.active >= 2) await new Promise<void>(resolve => this.waiting.push(resolve));
      else this.active++;
      try {
        if (generation !== this.generation) throw new Error("photo-preview-cancelled");
        if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap !== "function") throw new Error("photo-preview-unavailable");
        const blob = dataImageBlob(await read());
        const bitmap = await createImageBitmap(blob);
        let image: string;
        try {
          const scale = Math.min(1, limit / Math.max(bitmap.width, bitmap.height));
          const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
          try {
            const context = canvas.getContext("2d"); if (!context) throw new Error("photo-preview-unavailable");
            context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            image = await blobDataUrl(await canvas.convertToBlob({ type: "image/webp", quality: .85 }));
          } finally { canvas.width = canvas.height = 0; }
        } finally { bitmap.close(); }
        // A small bounded LRU holds only thumbnails. Originals are never cached.
        const bytes = image.length * 2;
        if (generation === this.generation && bytes <= 16 * 1024 * 1024) {
          this.cached.set(key, image); this.bytes += bytes;
          while (this.cached.size > 96 || this.bytes > 16 * 1024 * 1024) {
            const first = this.cached.keys().next().value!;
            this.bytes -= this.cached.get(first)!.length * 2; this.cached.delete(first);
          }
        }
        return image;
      } finally {
        const next = this.waiting.shift(); if (next) next(); else this.active--;
      }
    })();
    this.pending.set(key, task);
    void task.finally(() => { if (this.pending.get(key) === task) this.pending.delete(key); }).catch(() => undefined);
    return task;
  }
}
