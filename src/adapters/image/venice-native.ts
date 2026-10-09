import { object, type EditInput, type GenerateInput, type ImageModelInfo, type ImageProvider, type ImageProviderConfig } from "../../core/image-generation";
import { ImageApiError, ImageTransport, requestBody } from "./transport";
/** Venice nests prices per mode (inpaint, resolutions, inputImages); the top-level usd key may be absent. */
export function usdPrices(pricing: Record<string, unknown>, found: number[] = []): number[] {
  const usd = pricing.usd;
  if (typeof usd === "number" && Number.isFinite(usd) && usd >= 0) found.push(usd);
  for (const value of Object.values(pricing)) if (object(value)) usdPrices(value, found);
  return found;
}
/** The cheapest documented price of this model, or undefined when the API reports no amount at all. */
export function lowestUsdPrice(pricing: Record<string, unknown>): number | undefined {
  const prices = usdPrices(pricing);
  return prices.length ? Math.min(...prices) : undefined;
}
export class VeniceNativeProvider implements ImageProvider {
  constructor(private readonly config: ImageProviderConfig, private readonly transport: ImageTransport) {}
  async listModels(): Promise<ImageModelInfo[]> {
    const images = await this.models("image"), edits = await this.models("inpaint");
    const models = new Map<string, ImageModelInfo>();
    for (const model of [...images, ...edits]) {
      const previous = models.get(model.id);
      models.set(model.id, { ...previous, ...model, supportsEdit: !!(previous?.supportsEdit || model.supportsEdit), supportsGenerate: !!(previous?.supportsGenerate || model.supportsGenerate) });
    }
    return [...models.values()];
  }
  private async models(type: "image" | "inpaint"): Promise<ImageModelInfo[]> {
    const response = await this.transport.request(`/models?type=${type}`); const json: unknown = await response.json();
    if (!object(json) || !Array.isArray(json.data)) throw new ImageApiError("unsupported");
    return json.data.filter(item => object(item) && typeof item.id === "string" && item.id.length <= 200).slice(0, 2000).map(item => {
      const spec = object(item.model_spec) ? item.model_spec : {}, capabilities = object(spec.capabilities) ? spec.capabilities : {}, constraints = object(spec.constraints) ? spec.constraints : {}, pricing = object(spec.pricing) ? spec.pricing : {};
      // Only actual API fields: no guessed prices, resolutions, steps or model-name heuristics.
      // Multi-edit's maximum is per model (capabilities.maxInputImages), not a
      // universal count. combineImages is only a boolean, not a numeric limit.
      const raw = capabilities.maxInputImages ?? constraints.maxInputImages;
      const max = Number.isInteger(raw) && Number(raw) > 0 ? Number(raw) : undefined;
      const price = lowestUsdPrice(pricing);
      return { id: item.id as string, label: typeof spec.name === "string" ? spec.name.slice(0, 200) : item.id as string,
        ...(spec.privacy === "private" || spec.privacy === "anonymized" ? { privacy: spec.privacy } : {}),
        ...(price === undefined ? {} : { priceUsd: price }),
        ...(max === undefined ? {} : { maxInputImages: max }),
        ...(Number.isInteger(constraints.promptCharacterLimit) && Number(constraints.promptCharacterLimit) > 0 ? { promptLimit: Number(constraints.promptCharacterLimit) } : {}),
        ...(spec.uncensored === true ? { uncensored: true } : {}),
        supportsEdit: type === "inpaint", supportsGenerate: type === "image", constraints } satisfies ImageModelInfo;
    });
  }
  async generate(input: GenerateInput) { return this.transport.image(await this.transport.request("/image/generate", requestBody(this.config, input)), json => Array.isArray(json.images) ? json.images[0] : undefined, input.aspectRatio); }
  async edit(input: EditInput) {
    if (!input.images.length || input.images.length > this.config.maxReferences) throw new ImageApiError("invalid");
    // Multi-edit explicitly documents JSON data URLs; single edit documents raw base64.
    // Do not claim data-URL support for single edit until its contract confirms it.
    const model = this.config.editModelId || this.config.modelId;
    const body = requestBody(this.config, input, input.images.length === 1 ? { model, image: input.images[0]!.split(",")[1] } : { modelId: model, images: input.images });
    if (input.images.length > 1) delete body.model;
    const response = await this.transport.request(input.images.length === 1 ? "/image/edit" : "/image/multi-edit", body);
    return this.transport.image(response, () => undefined, input.aspectRatio); // edit returns raw image bytes, not JSON.
  }
}
