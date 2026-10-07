import type { Illustration, ImageProviderConfig } from "../src/core/image-generation";
import type { WorldProfile } from "../src/core/types";
export const profile: ImageProviderConfig = { id: "11111111-1111-4111-8111-111111111111", label: "Test connection", kind: "openai-images", baseUrl: "https://images.example.test/v1", modelId: "synthetic-image-model", maxReferences: 1, enabled: true };
export const tinyImage = "data:image/jpeg;base64,YQ==";
// Real browser-encoded PNG (not just a plausible file signature).
export const realPng = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4AWJiYGD4D8IgBpBmYAAAAAD//7vS9wEAAAAGSURBVAMAGDACA6ybwrYAAAAASUVORK5CYII=";
export const world: WorldProfile = { id: "world-test", name: "Test world", description: "Original lore", color: "blue", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
export const illustration: Illustration = { id: "illustration-test", worldId: world.id, chatId: "chat-test", messageKey: '["message","reply-1"]', providerId: profile.id, modelId: profile.modelId, prompt: "An observatory at dusk", contentLevel: "off", image: tinyImage, createdAt: 1, updatedAt: 1 };
