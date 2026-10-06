import { relationshipStage } from "./relationships";
import type { CharacterScene, SceneEntity } from "./types";
export interface TurnConsequence {
  person: SceneEntity;
  kind: "relationship" | "attribute";
  changes: { label: string; before: number; after: number }[];
  stages?: { before: ReturnType<typeof relationshipStage>; after: ReturnType<typeof relationshipStage> };
  events: string[];
  reason: string;
  quote: string;
}
/** Only committed changes from this reply, never previews, older logs or manual edits. */
export function turnConsequences(entities: SceneEntity[], scene?: CharacterScene): TurnConsequence[] {
  if (!scene?.progress) return [];
  if (scene.progress.status === "unchanged") return [];
  const current = (change: { turn?: string; at: number }) => scene.progress!.turn ? change.turn === scene.progress!.turn : change.at === scene.updatedAt;
  const hero = entities.find(e => e.characterSheet?.protagonist); const result: TurnConsequence[] = [];
  for (const person of entities) {
    const state = scene.states[person.id]; const bond = hero ? state?.bonds?.[hero.id]?.history[0] : undefined;
    if (bond?.source === "scene" && current(bond)) result.push({ person, kind: "relationship", changes: (["trust", "affinity"] as const).filter(key => bond.before[key] !== bond.after[key]).map(key => ({ label: key, before: bond.before[key], after: bond.after[key] })), stages: { before: relationshipStage(bond.before), after: relationshipStage(bond.after) }, events: bond.milestones.flatMap(id => person.characterSheet?.relationships?.milestones.find(m => m.id === id)?.label ?? []), reason: bond.reason, quote: bond.quote });
    const attribute = state?.attributes?.history[0];
    if (attribute?.source === "scene" && current(attribute)) result.push({ person, kind: "attribute", changes: (person.characterSheet?.attributes ?? []).filter(a => attribute.before[a.id] !== attribute.after[a.id] && attribute.after[a.id] !== undefined).map(a => ({ label: a.label, before: attribute.before[a.id]!, after: attribute.after[a.id]! })), events: [], reason: attribute.reason, quote: attribute.quote });
  }
  return result;
}
