import type { ImageSettings } from "./image-generation";
import type { SceneEntity } from "./types";
import type { ImageScenePlan } from "./image-plan";
import { imageReferences } from "./image-prompt";

export const IMAGE_REFERENCE_POLICIES = ["auto", "neutral", "suggestive"] as const;
export type ImageReferencePolicy = typeof IMAGE_REFERENCE_POLICIES[number];
export type ImageReferenceOverrides = Record<string, ImageReferencePolicy>;
export interface ImageReferenceChoice { entityId: string; reference: "neutral" | "suggestive" | "none" }
export const validImageReferencePolicy = (v: unknown): v is ImageReferencePolicy => IMAGE_REFERENCE_POLICIES.includes(v as ImageReferencePolicy);
const safeId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 160 && !["__proto__", "prototype", "constructor"].includes(v);
export function validImageReferenceOverrides(v: unknown): v is ImageReferenceOverrides {
  return !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length <= 40 && Object.entries(v).every(([id, policy]) => safeId(id) && validImageReferencePolicy(policy));
}
export function validImageReferenceChoices(v: unknown): v is ImageReferenceChoice[] {
  return Array.isArray(v) && v.length <= 40 && v.every(c => c && safeId(c.entityId) && ["neutral", "suggestive", "none"].includes(c.reference)) && new Set(v.map(c => c.entityId)).size === v.length;
}
export function imagePlanCast(plan: ImageScenePlan, worldId: string, entities: SceneEntity[]) {
  const importance = { primary: 0, supporting: 1, background: 2 };
  const cast = plan.characters.map((chosen, index) => ({ ...chosen, focus: chosen.focus ?? (index === 0 ? "primary" as const : "supporting" as const) })).sort((a, b) => importance[a.focus] - importance[b.focus]).map(chosen => {
    const matches = entities.filter(e => e.worldId === worldId && e.kind === "character" && (e.id === chosen.id || e.name === chosen.id));
    if (matches.length !== 1) throw new Error("invalidPlan");
    return { chosen, person: matches[0]! };
  });
  if (new Set(cast.map(c => c.person.id)).size !== cast.length) throw new Error("invalidPlan");
  return cast;
}
export function resolveImageReferences(plan: ImageScenePlan, worldId: string, entities: SceneEntity[], settings: ImageSettings, overrides: ImageReferenceOverrides = {}) {
  if (!validImageReferenceOverrides(overrides)) throw new Error("invalidPlan");
  const cast = imagePlanCast(plan, worldId, entities);
  if (Object.keys(overrides).some(id => !cast.some(c => c.person.id === id))) throw new Error("invalidPlan");
  const config = settings.profiles.find(p => p.id === settings.profileByLevel[settings.contentLevel] && p.enabled);
  if (!settings.enabled || !config) throw new Error("disabled");
  let count = 0;
  return cast.map(({ chosen, person }) => {
    const profile = person.characterSheet?.imageGeneration, available = imageReferences(person.characterSheet);
    const neutral = available.find(r => r.key === profile?.referenceKey), suggestive = available.find(r => r.key === profile?.suggestiveReferenceKey);
    const policy = overrides[person.id] ?? profile?.referencePolicy ?? "auto";
    // New plans describe the actual look separately; legacy plans retain their selected slot.
    const requested = policy === "auto" ? chosen.look === "alternate" ? "suggestive" : chosen.look ? "neutral" : chosen.reference === "suggestive" ? "suggestive" : "neutral" : policy;
    const selected = requested === "suggestive" && settings.contentLevel !== "off" ? suggestive ?? neutral : neutral;
    const attached = !!selected && count < config.maxReferences;
    if (attached) count++;
    const reference: ImageReferenceChoice["reference"] = !attached ? "none" : selected === suggestive && requested === "suggestive" && settings.contentLevel !== "off" ? "suggestive" : "neutral";
    const reason: "referenceMissing" | "referenceLimit" | "referencePreset" | "referenceFallback" | undefined = !selected ? "referenceMissing" : !attached ? "referenceLimit" : requested === "suggestive" && settings.contentLevel === "off" ? "referencePreset" : requested === "suggestive" && !suggestive ? "referenceFallback" : undefined;
    return { chosen, person, policy, requested, reference, selected, attached, reason, neutral, suggestive };
  });
}
/** Detect changes to the connection, image style or reviewed identities before a paid request. */
export function imageReviewContextKey(plan: ImageScenePlan, worldId: string, entities: SceneEntity[], settings: ImageSettings): string {
  const profile = settings.profiles.find(p => p.id === settings.profileByLevel[settings.contentLevel]);
  const cast = imagePlanCast(plan, worldId, entities).map(({ person }) => [person.id, person.name, person.description, person.characterSheet?.appearance, person.characterSheet?.imageGeneration, imageReferences(person.characterSheet).map(r => r.key)]);
  const value = JSON.stringify([worldId, settings.enabled, settings.contentLevel, settings.adultConfirmed, profile, settings.stylePrefix, settings.styleSuffix, cast]);
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return value.length + ":" + (hash >>> 0).toString(36);
}
export function sameImagePlanCast(a: ImageScenePlan, b: ImageScenePlan): boolean {
  return a.characters.length === b.characters.length && a.characters.every(c => b.characters.some(other => other.id === c.id));
}
