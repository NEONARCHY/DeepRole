import { IMAGE_RESPONSE_HEADERS, validExtraParams, validImageProviderConfig, object, type GenerateInput, type ImageProviderConfig, type ImageResponseHeaders, type ImageResult, validImageAspect } from "../../core/image-generation";
import { dataImageBlob, MAX_IMAGE_RESPONSE_BYTES, normalizeImage } from "./image-codec";
import type { ImageCopyKey } from "../../core/image-i18n";
export class ImageApiError extends Error {
  constructor(public readonly code: ImageCopyKey, public readonly headers: ImageResponseHeaders = {}, public readonly downloadUrl?: string, public readonly ticketId?: string) { super(code); }
}
export type ImagePermissionCheck = (url: string) => Promise<boolean>;
export function responseHeaders(response: Response): ImageResponseHeaders {
  return Object.fromEntries(IMAGE_RESPONSE_HEADERS.flatMap(name => { const value = response.headers.get(name); return value === null ? [] : [[name, value.slice(0, 1000)]]; }));
}
export function requestBody(config: ImageProviderConfig, input: GenerateInput, service: Record<string, unknown> = {}): Record<string, unknown> {
  if (!validImageProviderConfig(config) || config.extraParams && !validExtraParams(config.extraParams)) throw new ImageApiError("invalid");
  if (!config.enabled) throw new ImageApiError("disabled");
  if (!config.modelId) throw new ImageApiError("missingModel");
  if (!input.prompt.trim() || input.prompt.length > 12_000) throw new ImageApiError("invalid");
  // A free model seed is preserved unless a separate fixed character seed would replace it.
  if (input.seed !== undefined && config.extraParams && Object.hasOwn(config.extraParams, "seed")) throw new ImageApiError("seedConflict");
  // No model-parameter parsing, rewriting or allowlist. Only transport collisions are rejected.
  if (input.aspectRatio !== undefined && !validImageAspect(input.aspectRatio)) throw new ImageApiError("invalid");
  const sizing = input.aspectRatio ? config.kind === "openai-images" ? { size: input.aspectRatio === "16:9" ? "1536x1024" : "1024x1536" } : config.extraParams?.width !== undefined || config.extraParams?.height !== undefined ? { width: input.aspectRatio === "16:9" ? 1024 : 576, height: input.aspectRatio === "16:9" ? 576 : 1024 } : { aspect_ratio: input.aspectRatio } : {};
  const body = { ...config.extraParams, model: config.modelId, prompt: input.prompt, ...(input.seed === undefined ? {} : { seed: input.seed }), ...sizing, ...service };
  if (input.aspectRatio && config.kind === "venice-native" && ("width" in sizing || "height" in sizing)) delete body.aspect_ratio;
  return body;
}
export class ImageTransport {
  constructor(readonly config: ImageProviderConfig, private readonly key: string, private readonly permitted: ImagePermissionCheck, private readonly normalizer = normalizeImage, private readonly timeoutMs = 120_000) {}
  async request(path: string, body?: Record<string, unknown>): Promise<Response> {
    if (!validImageProviderConfig(this.config)) throw new ImageApiError("invalid");
    if (!this.config.enabled) throw new ImageApiError("disabled");
    if (!this.key) throw new ImageApiError("missingKey");
    const url = this.config.baseUrl.replace(/\/$/, "") + path;
    if (!await this.permitted(url)) throw new ImageApiError("permission");
    // One attempt. redirect:error prevents credentials reaching a redirected host.
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${this.key}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal });
      if (!response.ok) {
        // Do not echo an untrusted error body: it may contain a key or the entire request.
        // TODO: parse non-402 balance codes/payment URLs only after a provider documents their schema.
        const code: ImageCopyKey = ({ 401: "unauthorized", 402: "balance", 403: "forbidden", 415: "unsupported", 429: "rate", 500: "server", 503: "unavailable" } as Record<number, ImageCopyKey>)[response.status] ?? "failed";
        await response.body?.cancel(); throw new ImageApiError(code, responseHeaders(response));
      }
      // Keep the deadline active through the body, not only until headers arrive.
      const bytes = await boundedBody(response, MAX_IMAGE_RESPONSE_BYTES, controller.signal);
      return new Response(bytes, { status: response.status, headers: response.headers });
    } catch (error) {
      if (controller.signal.aborted) throw new ImageApiError("timeout");
      if (error instanceof ImageApiError) throw error;
      throw new ImageApiError("failed");
    } finally { clearTimeout(timer); }
  }
  async image(response: Response, extract: (value: Record<string, unknown>) => unknown, aspectRatio?: import("../../core/image-generation").ImageAspectRatio): Promise<ImageResult> {
    const headers = responseHeaders(response), type = response.headers.get("content-type")?.split(";")[0]?.trim();
    let blob: Blob;
    if (type && ["image/png", "image/jpeg", "image/webp"].includes(type)) blob = await response.blob();
    else if (type === "application/json") {
      const json: unknown = await response.json(); if (!object(json)) throw new ImageApiError("unsupported", headers);
      const value = extract(json);
      if (typeof value !== "string") throw new ImageApiError("unsupported", headers);
      if (value.startsWith("https://")) {
        const url = new URL(value); if (url.username || url.password) throw new ImageApiError("unsupported", headers);
        if (!await this.permitted(url.href)) throw new ImageApiError("downloadOrigin", headers, url.href);
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
          // Download uses NO API authorization, cookies or referrer, even on another host.
          const result = await fetch(url.href, { credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", signal: controller.signal });
          if (!result.ok) throw new ImageApiError("failed", headers);
          const data = await boundedBody(result, MAX_IMAGE_RESPONSE_BYTES, controller.signal); blob = new Blob([data], { type: result.headers.get("content-type")?.split(";")[0] ?? "" });
        } catch (error) { if (error instanceof ImageApiError) throw error; throw new ImageApiError(controller.signal.aborted ? "timeout" : "failed", headers); }
        finally { clearTimeout(timer); }
      } else { try { blob = dataImageBlob(value); } catch { throw new ImageApiError("unsupported", headers); } }
    } else throw new ImageApiError("unsupported", headers);
    try { return { image: await this.normalizer(blob, false, aspectRatio), headers }; } catch { throw new ImageApiError("unsupported", headers); }
  }
}
export async function boundedBody(response: Response, max: number, signal: AbortSignal): Promise<ArrayBuffer> {
  if (Number(response.headers.get("content-length")) > max) { await response.body?.cancel(); throw new ImageApiError("unsupported", responseHeaders(response)); }
  const reader = response.body?.getReader(); if (!reader) throw new ImageApiError("unsupported");
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { if (signal.aborted) throw new Error("timeout"); const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > max) throw new ImageApiError("unsupported", responseHeaders(response)); chunks.push(value); } }
  catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; } return bytes.buffer;
}
