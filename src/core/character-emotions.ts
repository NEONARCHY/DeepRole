import type { CharacterSheet, CharacterStatus, SceneEntity } from "./types";

// Retain restrictions on retired world keys so re-adding a key cannot bypass them.
export const MAX_BLOCKED_EMOTIONS = 128;
export function validBlockedEmotions(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_BLOCKED_EMOTIONS
    && value.every(key => typeof key === "string" && key.length > 0 && key.length <= 32 && key === key.trim()
      && !["neutral", "__proto__", "prototype", "constructor"].includes(key))
    && new Set(value).size === value.length;
}
export const isCharacterEmotionAllowed = (sheet: CharacterSheet | undefined, emotion: string) =>
  emotion === "neutral" || !sheet?.blockedEmotions?.includes(emotion);

export function allowedCharacterEmotions(sheet: CharacterSheet | undefined, emotions: string[]): string[] {
  return [...new Set(["neutral", ...emotions])].filter(key => isCharacterEmotionAllowed(sheet, key));
}

/** Only the mood is substituted. No profile, narrative facts or images are rewritten. */
export function resolveCharacterEmotion(sheet: CharacterSheet | undefined, requested = "neutral", previous?: string, worldEmotions?: string[]): string {
  const allowed = (key: string) => isCharacterEmotionAllowed(sheet, key) && (!worldEmotions || worldEmotions.includes(key));
  if (allowed(requested)) return requested;
  return previous && allowed(previous) ? previous : "neutral";
}
/** Read-time projection also protects old/imported chat states without migrating lore. */
export function characterStatusForSheet(sheet: CharacterSheet | undefined, state: CharacterStatus): CharacterStatus {
  const emotion = resolveCharacterEmotion(sheet, state.emotion);
  return emotion === state.emotion ? state : { ...state, emotion };
}

export function characterEmotionInstruction(roster: SceneEntity[], emotions: string[], byName: boolean): string {
  const restricted = roster.filter(person => person.characterSheet?.blockedEmotions?.length).map(person => ({
    id: byName ? person.name : person.id,
    allowed: allowedCharacterEmotions(person.characterSheet, emotions),
  }));
  if (!restricted.length) return "";
  return `Personal emotion rules: ${JSON.stringify(restricted)}\nFor each listed character choose state.emotion only from their allowed keys, even when the context suggests another mood. These player-edited rules override the general emotion list and older messages; they do not imply missing portraits or authorize changing personality or facts. If uncertain, keep their current allowed emotion or use neutral. Never change these rules.\n`;
}
