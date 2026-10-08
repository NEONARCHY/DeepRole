import type { CharacterImagePrompt, ImageProviderConfig, ImageResponseHeaders } from "./image-generation";
import type { ImageCopyKey } from "./image-i18n";
export interface ImageTarget { worldId: string; chatId: string; chatUrl: string; messageKey: string }
export interface ImageJobInput extends ImageTarget { providerId: string; entityId?: string; prompt: string; referenceKeys: string[]; references?: { entityId: string; key: string }[]; entityIds?: string[]; seed?: number; aspectRatio?: import("./image-generation").ImageAspectRatio }
export type ImageMessage =
  | { type: "DR_IMAGE_MODELS"; profile: ImageProviderConfig }
  | { type: "DR_IMAGE_GENERATE"; input: ImageJobInput }
  | { type: "DR_IMAGE_START"; target: ImageTarget }
  | { type: "DR_IMAGE_RENDER"; target: ImageTarget; id: string; plan: import("./image-plan").ImageScenePlan }
  | { type: "DR_IMAGE_FAIL"; target: ImageTarget; id: string; error: ImageCopyKey }
  | { type: "DR_IMAGE_REPEAT"; target: ImageTarget; id: string; attempt?: boolean }
  | { type: "DR_IMAGE_SELFIE"; target: ImageTarget; entityId: string; turnKey: string; retry?: boolean }
  | { type: "DR_IMAGE_REMOVE"; target: ImageTarget; id: string }
  | { type: "DR_IMAGE_PROFILE"; target: ImageTarget; entityId: string; expected: CharacterImagePrompt | null; profile: CharacterImagePrompt }
  | { type: "DR_IMAGE_OPEN_DOWNLOAD"; ticketId: string }
  | { type: "DR_IMAGE_TICKET"; ticketId: string }
  | { type: "DR_IMAGE_DOWNLOAD"; ticketId: string };
export interface ImageFailure { ok: false; error: ImageCopyKey; headers?: ImageResponseHeaders; ticketId?: string; downloadOrigin?: string }
