import type { StoryCheckpointReview } from "../../src/core/story-checkpoint";
import { nativeStoryMessageKey } from "../../src/core/story-transport";
import { storyWorld } from "./story-worlds";
export function checkpointReview(locale: "ru" | "en" = "en"): StoryCheckpointReview {
  const f = storyWorld(locale), scene = f.binding.characterScenes![f.world.id]!;
  return { chatId: f.binding.chatId, worldId: f.world.id, bindingId: f.binding.id, worldName: f.world.name, sceneRevision: scene.revision,
    snapshot: { states: structuredClone(scene.states), presentIds: [...scene.presentIds], partnerIds: [], names: Object.fromEntries(f.entities.slice(0, 2).map(e => [e.id, e.name])) },
    candidates: [
      { requestId: "request-first", observedAt: 10, draft: locale === "ru" ? "Я беру ключ." : "I take the key.", answer: locale === "ru" ? "Мира передала ключ." : "Mira delivered the key.", serverSelection: "different" },
      { requestId: "request-second", observedAt: 20, draft: locale === "ru" ? "Я жду." : "I wait.", answer: locale === "ru" ? "Мира оставила ключ в коробке." : "Mira left the key in the box.", serverSelection: "unknown" },
    ], availableCount: 2, checkpoint: null };
}
export function savedCheckpointReview(locale: "ru" | "en" = "en") {
  return { ...checkpointReview(locale), checkpoint: { branchId: "saved-branch", anchorKey: nativeStoryMessageKey("43"), createdAt: 30 } };
}
