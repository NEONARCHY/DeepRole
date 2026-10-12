import { validStoryBaselineEffects, type StoryBaselineEffects } from "./story-baseline-effects";
import { validDataRecord } from "./record-validation";
import { validScenePhotos } from "./selfies";
import type { SceneEntity, ScenePhoto } from "./types";

/** Reply-owned effects. Replay never reauthorises an image job. */
export interface StoryTurnEffects {
  before: StoryBaselineEffects;
  after: StoryBaselineEffects;
  createdEntities: SceneEntity[];
  createdPhotos: ScenePhoto[];
}
export function validStoryTurnEffects(value: unknown, worldId: string | null): value is StoryTurnEffects {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as StoryTurnEffects;
  if (Object.keys(v).length !== 4 || !["before", "after", "createdEntities", "createdPhotos"].every(k => Object.hasOwn(v, k))) return false;
  const scope = worldId ?? v.before?.photos?.[0]?.worldId ?? v.createdEntities?.[0]?.worldId ?? v.createdPhotos?.[0]?.worldId ?? "detached";
  return validStoryBaselineEffects(v.before, scope) && validStoryBaselineEffects(v.after, scope)
    && Array.isArray(v.createdEntities) && Array.from(v.createdEntities).every(e => !!e && e.worldId === scope && e.kind === "character" && validDataRecord({ kind: "entity", id: e.id, data: e }))
    && new Set(v.createdEntities.map(e => e.id)).size === v.createdEntities.length
    && Array.isArray(v.createdPhotos) && validScenePhotos(v.createdPhotos) && Array.from(v.createdPhotos).every(p => !!p && p.worldId === scope);
}
