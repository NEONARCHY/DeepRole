import { captureStoryBaselineEffects, matchStoryBaselineEffects, type StoryBaselineEffects } from "../core/story-baseline-effects";
import { sameStoryValue } from "../core/story-value";
import type { StoryBaseline, StoryEvent, StoryRecord } from "../core/story-records";
import type { ChatBinding, DataRecord, SceneEntity, ScenePhoto } from "../core/types";

export function storyEffectsAt(records: StoryRecord[], baseline: StoryBaseline, applied: string[]) {
  let value: StoryBaselineEffects = structuredClone(baseline.legacyEffects ?? { algorithmVersion: 1, scene: {}, photos: [] });
  const created = new Map<string, SceneEntity>();
  for (const id of applied) {
    const event = records.find((e): e is StoryEvent => e.type === "event" && e.id === id)!;
    if (!event?.effects) continue;
    if (!sameStoryValue(value, event.effects.before)) throw Error("story-effects-conflict");
    value = structuredClone(event.effects.after);
    for (const person of event.effects.createdEntities) created.set(person.id, person);
  }
  return { value, created };
}
export function planStoryEffects(all: DataRecord[], binding: ChatBinding, baseline: StoryBaseline, previous: string[], selected: string[], keepManual = false, freshPhotos: ScenePhoto[] = []) {
  const stored = all.filter(r => r.kind === "story").map(r => r.data as StoryRecord), worldId = baseline.origin.worldId;
  const old = storyEffectsAt(stored, baseline, previous), next = storyEffectsAt(stored, baseline, selected);
  if (!matchStoryBaselineEffects(binding, worldId, old.value)) throw Error("story-effects-untracked");
  const records: DataRecord[] = [], removed: { kind: "entity"; id: string }[] = [];
  for (const [id, original] of old.created) if (!next.created.has(id)) {
    const current = all.find(r => r.kind === "entity" && r.id === id)?.data as SceneEntity | undefined;
    const referenced = all.some(r => ["entry", "entity", "binding"].includes(r.kind) && r.id !== binding.id && r.id !== id && JSON.stringify(r.data).includes(JSON.stringify(id)));
    if (current && (!sameStoryValue(current, original) || referenced)) {
      if (!keepManual) throw Error("story-profile-conflict");
    } else if (current) removed.push({ kind: "entity", id });
  }
  for (const [id, person] of next.created) {
    const current = all.find(r => r.kind === "entity" && r.id === id);
    if (!current) records.push({ kind: "entity", id, data: structuredClone(person) });
    else if (!old.created.has(id) && !sameStoryValue(current.data, person) && !keepManual) throw Error("story-profile-conflict");
  }
  const identity = (p: ScenePhoto) => { const { generation: _generation, ...fields } = p; return fields; };
  const archived = stored.flatMap(e => e.type === "event" ? e.effects?.createdPhotos ?? [] : []);
  const photos: ScenePhoto[] = next.value.photos.map(p => {
    const live = binding.scenePhotos?.find(s => sameStoryValue(identity(s), p));
    if (live) return structuredClone(live);
    const saved = archived.find(s => sameStoryValue(identity(s), p));
    if (!saved) return structuredClone(p);
    const copy = structuredClone(saved);
    if (copy.generation && copy.generation.status !== "ready" && !freshPhotos.some(fresh => sameStoryValue(fresh, saved))) {
      copy.generation = { ...copy.generation, status: "failed", error: "expired", updatedAt: Date.now() };
      delete copy.generation.ticketId; delete copy.generation.request;
    }
    return copy;
  });
  return { records, removed, metadata: next.value.scene, photos: [...(binding.scenePhotos ?? []).filter(p => p.worldId !== worldId), ...photos] };
}
/** Store a completed photo receipt with its event. Late jobs have no live photo and
 * cannot change the selected scene. Returning to a reply never starts a paid job. */
export function archiveStoryPhoto(records: DataRecord[], photo: ScenePhoto): DataRecord[] {
  return records.flatMap(row => {
    if (row.kind !== "story" || (row.data as StoryRecord).type !== "event") return [];
    const event = row.data as StoryEvent;
    if (!event.effects?.createdPhotos.some(p => p.worldId === photo.worldId && p.imageKey === photo.imageKey && p.messageKey === photo.messageKey && p.turnKey === photo.turnKey)) return [];
    return [{ ...row, data: { ...event, effects: { ...event.effects, createdPhotos: event.effects.createdPhotos.map(p => p.imageKey === photo.imageKey ? structuredClone(photo) : p) } } }];
  });
}
export { captureStoryBaselineEffects };
