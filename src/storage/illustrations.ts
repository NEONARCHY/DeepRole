import { validIllustration, type Illustration } from "../core/image-generation";
import type { DataRecord, SceneEntity } from "../core/types";
import { portraitVariations } from "../core/portrait-variations";
import { repository, type DeepRoleRepository } from "./repository";
export const MAX_WORLD_ILLUSTRATIONS = 60;
export const MAX_WORLD_IMAGE_BYTES = 50_000_000;
/** Same encoded-image budget as portraits. Count all image collections together. */
export function worldImageUsage(records: DataRecord[], worldId: string): { bytes: number; illustrations: number } {
  let bytes = 0, illustrations = 0;
  for (const record of records) {
    if (!("worldId" in record.data) || record.data.worldId !== worldId) continue;
    if (record.kind === "illustration") { bytes += (record.data as Illustration).image.length; illustrations++; }
    if (record.kind === "entity") { const sheet = (record.data as SceneEntity).characterSheet; bytes += [...Object.values(sheet?.sprites ?? {}).flatMap(portraitVariations), ...(sheet?.portraitLibrary ?? []), ...(sheet?.selfieCategories ?? []).flatMap(c => c.images)].reduce((sum, image) => sum + image.length, 0); }
  }
  return { bytes, illustrations };
}
export function validateWorldImageBudgets(records: DataRecord[]): boolean {
  return records.filter(r => r.kind === "world").every(r => { const usage = worldImageUsage(records, r.id); return usage.bytes <= MAX_WORLD_IMAGE_BYTES && usage.illustrations <= MAX_WORLD_ILLUSTRATIONS; });
}
export async function saveIllustration(value: Illustration, repo: DeepRoleRepository = repository): Promise<void> {
  if (!validIllustration(value)) throw new Error("image-invalid");
  await repo.updateRecords(records => {
    if (!records.some(r => r.kind === "world" && r.id === value.worldId) || value.entityId && !records.some(r => r.kind === "entity" && r.id === value.entityId && "worldId" in r.data && r.data.worldId === value.worldId)) throw new Error("image-scope");
    const next: DataRecord = { kind: "illustration", id: value.id, data: value };
    const all = [...records.filter(r => !(r.kind === next.kind && r.id === next.id)), next];
    if (!validateWorldImageBudgets(all)) throw new Error("image-full");
    return { records: [next], removed: [], result: undefined };
  });
}
