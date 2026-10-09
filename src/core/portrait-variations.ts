import type { CharacterScene, CharacterSheet, PortraitCycle, SceneEntity } from "./types";
import { resolveCharacterEmotion } from "./character-emotions";

export const validPortrait = (value: unknown): value is string => typeof value === "string" && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
const variationCache = new WeakMap<object, { source: unknown[]; images: string[] }>();
export const portraitVariations = (value: unknown): string[] => {
  if (!Array.isArray(value)) return validPortrait(value) ? [value] : [];
  const cached = variationCache.get(value);
  if (cached && cached.source.length === value.length && cached.source.every((v, i) => v === value[i])) return cached.images;
  const images = [...new Set(value.filter(validPortrait))];
  variationCache.set(value, { source: [...value], images }); return images;
};
export const validPortraitVariations = (value: unknown): boolean => validPortrait(value) || Array.isArray(value) && value.length > 0 && value.every(validPortrait) && new Set(value).size === value.length;

const fingerprints = new WeakMap<string[], string>();
function fingerprint(images: string[]): string {
  const cached = fingerprints.get(images); if (cached) return cached;
  let hash = 2166136261;
  for (const image of images) for (const char of image + "|") hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const key = `${images.length}:${(hash >>> 0).toString(36)}`; fingerprints.set(images, key); return key;
}
export function validPortraitCycles(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const safe = (key: string) => key.length > 0 && key.length <= 160 && !["__proto__", "prototype", "constructor"].includes(key);
  return Object.keys(value).length <= 100 && Object.entries(value).every(([id, cycles]) => safe(id) && cycles && typeof cycles === "object" && !Array.isArray(cycles)
    && Object.entries(cycles).every(([emotion, cycle]) => {
      if (!safe(emotion) || emotion.length > 32 || !cycle || typeof cycle !== "object" || Array.isArray(cycle)) return false;
      const c = cycle as Partial<PortraitCycle>;
      return typeof c.key === "string" && c.key.length <= 40 && Array.isArray(c.order) && c.order.length > 0
        && c.order.every(n => Number.isInteger(n) && n >= 0 && n < c.order!.length) && new Set(c.order).size === c.order.length
        && Number.isInteger(c.cursor) && Number(c.cursor) >= 0 && Number(c.cursor) < c.order.length;
    }));
}

/** A shuffled bag is consumed once per accepted scene update, never per render. */
export function nextPortraitCycle(images: string[], previous?: PortraitCycle, random = Math.random): PortraitCycle {
  const key = fingerprint(images);
  if (previous?.key === key && previous.cursor + 1 < previous.order.length) return { ...previous, cursor: previous.cursor + 1 };
  const order = images.map((_, index) => index);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j]!, order[i]!]; }
  const last = previous?.key === key ? previous.order[previous.cursor] : undefined;
  if (order.length > 1 && order[0] === last) [order[0], order[1]] = [order[1]!, order[0]!];
  return { key, order, cursor: 0 };
}

function bucket(sheet: CharacterSheet | undefined, emotion: string): string {
  emotion = resolveCharacterEmotion(sheet, emotion);
  return portraitVariations(sheet?.sprites[emotion]).length ? emotion : "neutral";
}
export function scenePortraitIndex(entity: SceneEntity, scene?: CharacterScene): number {
  const emotion = bucket(entity.characterSheet, scene?.states[entity.id]?.emotion ?? "neutral");
  const images = portraitVariations(entity.characterSheet?.sprites[emotion]);
  if (images.length < 2) return 0;
  const cycle = scene?.portraitCycles?.[entity.id]?.[emotion];
  return cycle?.key === fingerprint(images) ? cycle.order[cycle.cursor] ?? 0 : 0;
}
export function advancePortraitCycles(entities: SceneEntity[], scene: CharacterScene, previous?: CharacterScene, manual = false): NonNullable<CharacterScene["portraitCycles"]> {
  const result: NonNullable<CharacterScene["portraitCycles"]> = {};
  for (const entity of entities) {
    const sheet = entity.characterSheet;
    const cycles = Object.fromEntries(Object.entries(previous?.portraitCycles?.[entity.id] ?? {}).filter(([emotion]) => portraitVariations(sheet?.sprites[emotion]).length));
    if (scene.presentIds.includes(entity.id) || sheet?.protagonist) {
      const emotion = bucket(sheet, scene.states[entity.id]?.emotion ?? "neutral");
      const images = portraitVariations(sheet?.sprites[emotion]);
      let old = cycles[emotion];
      const oldEmotion = bucket(sheet, previous?.states[entity.id]?.emotion ?? "neutral");
      // A portable/imported sheet has no saved cycle: its visible default is image 0.
      // Count that first display before advancing an already-present character.
      if (!old && !manual && images.length > 1 && previous && oldEmotion === emotion && (previous.presentIds.includes(entity.id) || sheet?.protagonist)) {
        const initial = nextPortraitCycle(images); const order = [0, ...initial.order.filter(index => index !== 0)];
        old = { ...initial, order };
      }
      if (images.length && (!manual || !old || old.key !== fingerprint(images) || oldEmotion !== emotion)) cycles[emotion] = nextPortraitCycle(images, old);
    }
    if (Object.keys(cycles).length) result[entity.id] = cycles;
  }
  return result;
}
