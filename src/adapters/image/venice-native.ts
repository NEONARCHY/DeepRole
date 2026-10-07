import { object, type EditInput, type GenerateInput, type ImageModelInfo, type ImageProvider, type ImageProviderConfig } from "../../core/image-generation";
import { ImageApiError, ImageTransport, requestBody } from "./transport";
export class VeniceNativeProvider implements ImageProvider {
  constructor(private readonly config: ImageProviderConfig, private readonly transport: ImageTransport) {}
  async listModels(): Promise<ImageModelInfo[]> {
    const images = await this.models("image"), edits = await this.models("inpaint");
    return [...new Map([...images, ...edits].map(model => [model.id, model])).values()];
  }
  private async models(type: "image" | "inpaint"): Promise<ImageModelInfo[]> {
    const response = await this.transport.request(`/models?type=${type}`); const json: unknown = await response.json();
    if (!object(json) || !Array.isArray(json.data)) throw new ImageApiError("unsupported");
    return json.data.filter(item => object(item) && typeof item.id === "string" && item.id.length <= 200).slice(0, 2000).map(item => {
      const spec = object(item.model_spec) ? item.model_spec : {}, capabilities = object(spec.capabilities) ? spec.capabilities : {}, constraints = object(spec.constraints) ? spec.constraints : {}, pricing = object(spec.pricing) ? spec.pricing : {};
      // Only actual API fields: no guessed prices, resolutions, steps or model-name heuristics.
      const max = capabilities.maxInputImages ?? constraints.maxInputImages;
      return { id: item.id as string, label: typeof spec.name === "string" ? spec.name.slice(0, 200) : item.id as string,
        ...(spec.privacy === "private" || spec.privacy === "anonymized" ? { privacy: spec.privacy } : {}),
        ...(typeof pricing.usd === "number" && Number.isFinite(pricing.usd) && pricing.usd >= 0 ? { priceUsd: pricing.usd } : {}),
        ...(Number.isInteger(max) && Number(max) > 0 ? { maxInputImages: Number(max) } : {}),
        ...(Number.isInteger(constraints.promptCharacterLimit) && Number(constraints.promptCharacterLimit) > 0 ? { promptLimit: Number(constraints.promptCharacterLimit) } : {}),
        supportsEdit: type === "inpaint", constraints } satisfies ImageModelInfo;
    });
  }
  async generate(input: GenerateInput) { return this.transport.image(await this.transport.request("/image/generate", requestBody(this.config, input)), json => Array.isArray(json.images) ? json.images[0] : undefined); }
  async edit(input: EditInput) {
    if (!input.images.length || input.images.length > this.config.maxReferences) throw new ImageApiError("invalid");
    // Multi-edit explicitly documents JSON data URLs; single edit documents raw base64.
    // Do not claim data-URL support for single edit until its contract confirms it.
    const model = this.config.editModelId || this.config.modelId;
    const body = requestBody(this.config, input, input.images.length === 1 ? { model, image: input.images[0]!.split(",")[1] } : { modelId: model, images: input.images });
    if (input.images.length > 1) delete body.model;
    const response = await this.transport.request(input.images.length === 1 ? "/image/edit" : "/image/multi-edit", body);
    return this.transport.image(response, () => undefined); // edit returns raw image bytes, not JSON.
  }
}
