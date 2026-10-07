import { type ImageProviderConfig } from "../../core/image-generation";
import { ImageTransport, type ImagePermissionCheck } from "./transport";
import { OpenAiImagesProvider } from "./openai-images";
import { VeniceNativeProvider } from "./venice-native";
export function imageProvider(config: ImageProviderConfig, key: string, permitted: ImagePermissionCheck) {
  const transport = new ImageTransport(config, key, permitted);
  return config.kind === "openai-images" ? new OpenAiImagesProvider(config, transport) : new VeniceNativeProvider(config, transport);
}
