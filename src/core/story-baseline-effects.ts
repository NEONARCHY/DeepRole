import { validCharacterScenes } from "./characters";
import { validScenePhotos } from "./selfies";
import { canonicalStoryValue, sameStoryValue } from "./story-value";
import type { CharacterScene, ChatBinding, ScenePhoto } from "./types";

/** Before-checkpoint identities, not a photo/job snapshot or an event ledger. */
export interface StoryBaselineEffects {
  algorithmVersion: 1;
  scene: Pick<CharacterScene, "lastReply" | "progress" | "relationshipNotice" | "portraitCycles">;
  photos: Omit<ScenePhoto, "generation">[];
}
const sceneKeys = ["lastReply", "progress", "relationshipNotice", "portraitCycles"] as const;
const photoKeys = ["worldId", "entityId", "messageKey", "turnKey", "categoryId", "imageKey", "createdAt"];
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keys = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).every(key => allowed.includes(key) && value[key] !== undefined);
const photoOrder = (a: StoryBaselineEffects["photos"][number], b: StoryBaselineEffects["photos"][number]) => {
  const left = canonicalStoryValue(a), right = canonicalStoryValue(b); return left < right ? -1 : left > right ? 1 : 0;
};

export function validStoryBaselineEffects(value: unknown, worldId: string): value is StoryBaselineEffects {
  if (!object(value) || Object.keys(value).length !== 3 || !keys(value, ["algorithmVersion", "scene", "photos"]) || value.algorithmVersion !== 1
    || !object(value.scene) || !keys(value.scene, sceneKeys)
    || !validCharacterScenes({ baseline: { ...value.scene, revision: "baseline", presentIds: [], states: {}, updatedAt: 0 } })) return false;
  const progress = value.scene.progress;
  if (progress !== undefined && (!object(progress) || !keys(progress, ["status", "rejected", "turn"]))) return false;
  const cycles = value.scene.portraitCycles;
  if (cycles !== undefined && (!object(cycles) || !Object.values(cycles).every(actions => object(actions) && Object.values(actions).every(cycle =>
    object(cycle) && Object.keys(cycle).length === 3 && keys(cycle, ["key", "order", "cursor"]) && Array.isArray(cycle.order)
    && Array.from(cycle.order).every(index => Number.isInteger(index)))))) return false;
  return Array.isArray(value.photos) && Array.from(value.photos).every(photo => object(photo) && Object.keys(photo).length === photoKeys.length
    && keys(photo, photoKeys) && photo.worldId === worldId && validScenePhotos([photo]));
}

/** Called under the library lock. Generation payloads, tickets and image bytes stay live. */
export function captureStoryBaselineEffects(binding: ChatBinding, worldId: string): StoryBaselineEffects {
  const current = binding.characterScenes?.[worldId];
  const scene = Object.fromEntries(sceneKeys.filter(key => current?.[key] !== undefined).map(key => [key, structuredClone(current![key])])) as StoryBaselineEffects["scene"];
  const photos = (binding.scenePhotos ?? []).filter(photo => photo.worldId === worldId).map(({ worldId, entityId, messageKey, turnKey, categoryId, imageKey, createdAt }) =>
    ({ worldId, entityId, messageKey, turnKey, categoryId, imageKey, createdAt }));
  // Order is display-only; retain multiplicity and compare every immutable field.
  photos.sort(photoOrder);
  const result: StoryBaselineEffects = { algorithmVersion: 1, scene, photos };
  if (!validStoryBaselineEffects(result, worldId)) throw Error("story-effects-invalid");
  return result;
}

/** An old checkpoint with no manifest keeps the conservative no-effects rule. */
export function matchStoryBaselineEffects(binding: ChatBinding, worldId: string, expected?: StoryBaselineEffects): boolean {
  const current = captureStoryBaselineEffects(binding, worldId);
  return expected ? sameStoryValue(current, { ...expected, photos: [...expected.photos].sort(photoOrder) }) : current.photos.length === 0 && Object.keys(current.scene).length === 0;
}
