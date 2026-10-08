import { validIllustration, type Illustration } from "../core/image-generation";
import type { ChatBinding, DataRecord, SceneEntity } from "../core/types";
import { portraitVariations } from "../core/portrait-variations";
import { repository, type DeepRoleRepository } from "./repository";
export const MAX_WORLD_ILLUSTRATIONS = 60;
export const MAX_WORLD_IMAGE_BYTES = 50_000_000;
/** Same encoded-image budget as portraits. Count all image collections together. */
export function worldImageUsage(records: DataRecord[], worldId: string): { bytes: number; illustrations: number } {
  let bytes = 0, illustrations = 0;
  for (const record of records) {
    if (record.kind === "binding") bytes += ((record.data as ChatBinding).illustrationAttempts ?? []).filter(a => a.worldId === worldId).reduce((sum, a) => sum + (a.request?.images.reduce((n, image) => n + image.length, 0) ?? 0), 0);
    if (record.kind === "binding") bytes += ((record.data as ChatBinding).scenePhotos ?? []).filter(p => p.worldId === worldId).reduce((sum, p) => sum + (p.generation?.request?.images.reduce((n, image) => n + image.length, 0) ?? 0), 0);
    if (!("worldId" in record.data) || record.data.worldId !== worldId) continue;
    if (record.kind === "illustration") { bytes += (record.data as Illustration).image.length + ((record.data as Illustration).request?.images.reduce((sum, image) => sum + image.length, 0) ?? 0); illustrations++; }
    if (record.kind === "entity") { const sheet = (record.data as SceneEntity).characterSheet; bytes += [...Object.values(sheet?.sprites ?? {}).flatMap(portraitVariations), ...(sheet?.portraitLibrary ?? []), ...(sheet?.selfieCategories ?? []).flatMap(c => c.images)].reduce((sum, image) => sum + image.length, 0); }
  }
  return { bytes, illustrations };
}
export function validateWorldImageBudgets(records: DataRecord[]): boolean {
  return records.filter(r => r.kind === "world").every(r => { const usage = worldImageUsage(records, r.id); return usage.bytes <= MAX_WORLD_IMAGE_BYTES && usage.illustrations <= MAX_WORLD_ILLUSTRATIONS; });
}
export async function saveIllustration(value: Illustration, repo: DeepRoleRepository = repository, attemptId?: string): Promise<void> {
  if (!validIllustration(value)) throw new Error("image-invalid");
  await repo.updateRecords(records => {
    if (!records.some(r => r.kind === "world" && r.id === value.worldId) || value.entityId && !records.some(r => r.kind === "entity" && r.id === value.entityId && "worldId" in r.data && r.data.worldId === value.worldId)) throw new Error("image-scope");
    const next: DataRecord = { kind: "illustration", id: value.id, data: value };
    const changes: DataRecord[] = [next];
    if (attemptId) for (const record of records.filter(r => r.kind === "binding")) {
      const binding = record.data as ChatBinding;
      if (binding.chatId === value.chatId && binding.illustrationAttempts?.some(a => a.id === attemptId && a.worldId === value.worldId && a.messageKey === value.messageKey)) changes.push({ ...record, data: { ...binding, illustrationAttempts: binding.illustrationAttempts.filter(a => a.id !== attemptId) } });
    }
    if (value.id.startsWith("selfie:")) for (const record of records.filter(r => r.kind === "binding")) {
      const base = (changes.find(c => c.kind === "binding" && c.id === record.id) ?? record), binding = base.data as ChatBinding;
      if (binding.chatId === value.chatId && binding.scenePhotos?.some(p => "selfie:" + p.imageKey === value.id && p.generation?.request)) {
        const change = { ...base, data: { ...binding, scenePhotos: binding.scenePhotos.map(p => "selfie:" + p.imageKey === value.id && p.generation ? { ...p, generation: { ...p.generation, request: undefined } } : p) } };
        const index = changes.findIndex(c => c.kind === "binding" && c.id === record.id); if (index >= 0) changes[index] = change; else changes.push(change);
      }
    }
    const all = [...records.filter(r => !changes.some(c => c.kind === r.kind && c.id === r.id)), ...changes];
    if (!validateWorldImageBudgets(all)) throw new Error("image-full");
    return { records: changes, removed: [], result: undefined };
  });
}
