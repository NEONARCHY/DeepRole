import { object, type EditInput, type GenerateInput, type ImageModelInfo, type ImageProvider, type ImageProviderConfig } from "../../core/image-generation";
import { ImageApiError, ImageTransport, requestBody } from "./transport";
export class OpenAiImagesProvider implements ImageProvider {
  constructor(private readonly config: ImageProviderConfig, private readonly transport: ImageTransport) {}
  async listModels(): Promise<ImageModelInfo[]> {
    const response = await this.transport.request("/models"); const json: unknown = await response.json();
    if (!object(json) || !Array.isArray(json.data)) throw new ImageApiError("unsupported");
    // Official /models has no image pricing, limits or edit capability metadata.
    // TODO: consume a documented metadata extension if a compatible provider offers one.
    return json.data.filter(item => object(item) && typeof item.id === "string" && item.id.length <= 200).slice(0, 2000).map(item => ({ id: item.id, label: item.id }));
  }
  async generate(input: GenerateInput) { return this.transport.image(await this.transport.request("/images/generations", requestBody(this.config, input)), extractImage); }
  async edit(input: EditInput) {
    if (!input.images.length || input.images.length > this.config.maxReferences) throw new ImageApiError("invalid");
    // Official JSON endpoint accepts data URLs in images[].image_url (checked 2026-10-08).
    const body = requestBody(this.config, input, { model: this.config.editModelId || this.config.modelId, images: input.images.map(image_url => ({ image_url })) });
    return this.transport.image(await this.transport.request("/images/edits", body), extractImage);
  }
}
function extractImage(json: Record<string, unknown>): unknown { const item = Array.isArray(json.data) ? json.data[0] : undefined; return object(item) ? item.b64_json ?? item.url : undefined; }
