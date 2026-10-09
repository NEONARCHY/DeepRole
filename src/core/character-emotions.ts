import type { CharacterSheet, CharacterStatus, SceneEntity } from "./types";
import { portraitVariations } from "./portrait-variations";
import { unassignPortraitEmotions } from "./portrait-library";

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

/** User edits detach images, not delete them. Re-enabling never restores an old
 * assignment behind the user's back; references and selfie collections stay. */
export function withCharacterEmotionRules(sheet: CharacterSheet, blocked: string[]): CharacterSheet {
  if (!validBlockedEmotions(blocked)) throw new Error("character-invalid");
  let next = { ...sheet };
  if (blocked.length) next.blockedEmotions = [...blocked]; else delete next.blockedEmotions;
  next = cleanCharacterEmotionImages(next);
  return next;
}

/** Save-time protection also removes retired world keys and stale assignments. */
export function cleanCharacterEmotionImages(sheet: CharacterSheet, worldEmotions?: string[]): CharacterSheet {
  const retired = Object.keys(sheet.sprites).filter(key => key !== "neutral" && (!isCharacterEmotionAllowed(sheet, key) || worldEmotions && !worldEmotions.includes(key)));
  let next = unassignPortraitEmotions(sheet, retired);
  if (sheet.initialStatus) {
    const emotion = resolveCharacterEmotion(sheet, sheet.initialStatus.emotion, undefined, worldEmotions);
    if (emotion !== sheet.initialStatus.emotion) next = { ...next, initialStatus: { ...sheet.initialStatus, emotion } };
  }
  return next;
}

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

/** The player speaks through user messages; they are never an NPC interlocutor. */
export function playerAvatarInstruction(roster: SceneEntity[], emotions: string[], byName: boolean): string {
  const hero = roster.find(person => person.characterSheet?.protagonist);
  if (!hero) return "";
  const sheet = hero.characterSheet;
  const portraits = allowedCharacterEmotions(sheet, emotions).filter(key => portraitVariations(sheet?.sprites[key]).length > 0);
  return `Player avatar: ${JSON.stringify({ id: byName ? hero.name : hero.id, portraitEmotions: portraits })}\nThe player:true character is the user\'s protagonist. Include their state update in EVERY story reply, keeping unchanged fields. Read first-person speech/actions in the latest user message as theirs, then consider the completed scene; do not invent their dialogue or actions. For actual in-character speech prefer an allowed speaking/talking pose when available. Distinguish dialogue from actions, thoughts, out-of-character requests, past quotations and unsent choices: not every message means speaking. Use exact configured emotion keys, including custom names. Never leave the player permanently neutral merely because their speech is in a user message. The player is never a partners entry.\n`;
}

export function characterEmotionInstruction(roster: SceneEntity[], emotions: string[], byName: boolean): string {
  const restricted = roster.filter(person => person.characterSheet?.blockedEmotions?.length).map(person => ({
    id: byName ? person.name : person.id,
    allowed: allowedCharacterEmotions(person.characterSheet, emotions),
  }));
  if (!restricted.length) return "";
  return `Personal emotion rules: ${JSON.stringify(restricted)}\nFor each listed character choose state.emotion only from their allowed keys, even when the context suggests another mood. These player-edited rules override the general emotion list and older messages; they do not imply missing portraits or authorize changing personality or facts. If uncertain, keep their current allowed emotion or use neutral. Never change these rules.\n`;
}
