import type { CharacterSheet, CharacterStatus, SceneEntity } from "./types";
import { portraitVariations } from "./portrait-variations";
import { unassignPortraitActions } from "./portrait-library";

export const DEFAULT_ACTIONS = ["neutral", "standing", "sitting", "walking", "talking", "resting", "happy", "sad", "angry", "surprised", "worried"];
const labels: Record<string, { ru: string; en: string }> = {
  neutral: { ru: "Спокойствие", en: "Calm" }, standing: { ru: "Стоит", en: "Standing" }, sitting: { ru: "Сидит", en: "Sitting" },
  walking: { ru: "Идёт", en: "Walking" }, talking: { ru: "Разговаривает", en: "Talking" }, resting: { ru: "Отдыхает", en: "Resting" },
  // Existing expression/reaction keys stay compatible with older worlds.
  happy: { ru: "Радость", en: "Happy" }, sad: { ru: "Грусть", en: "Sad" }, angry: { ru: "Злость", en: "Angry" }, surprised: { ru: "Удивление", en: "Surprised" }, worried: { ru: "Тревога", en: "Worried" },
};
export const configuredActionLabel = (locale: "ru" | "en", key: string) => labels[key]?.[locale] ?? key;
export const builtInAction = (key: string) => Object.hasOwn(labels, key);
export const actionIdentity = (key: string) => key.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase();
/** Resolve spelling only, not story meaning. Exact keys win; ambiguous matches never guess. */
export function matchCharacterAction(requested: string, keys: string[]): string | undefined {
  if (keys.includes(requested)) return requested;
  const identity = actionIdentity(requested);
  const matches = keys.filter(key => actionIdentity(key) === identity || labels[key] && Object.values(labels[key]).some(label => actionIdentity(label) === identity));
  return matches.length === 1 ? matches[0] : undefined;
}

// Action restrictions retain retired keys so re-adding a key cannot bypass them.
export const MAX_BLOCKED_ACTIONS = 128;
export function validBlockedActions(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_BLOCKED_ACTIONS
    && value.every(key => typeof key === "string" && key.length > 0 && key.length <= 32 && key === key.trim()
      && !["neutral", "__proto__", "prototype", "constructor"].includes(key))
    && new Set(value).size === value.length;
}
export const isCharacterActionAllowed = (sheet: CharacterSheet | undefined, action: string) =>
  action === "neutral" || !sheet?.blockedActions?.includes(action);

/** User edits detach images, not delete them. Re-enabling never restores an old
 * assignment behind the user's back; references and selfie collections stay. */
export function withCharacterActionRules(sheet: CharacterSheet, blocked: string[]): CharacterSheet {
  if (!validBlockedActions(blocked)) throw new Error("character-invalid");
  let next = { ...sheet };
  if (blocked.length) next.blockedActions = [...blocked]; else delete next.blockedActions;
  next = cleanCharacterActionImages(next);
  return next;
}

/** Save-time protection also removes retired world keys and stale assignments. */
export function cleanCharacterActionImages(sheet: CharacterSheet, worldActions?: string[]): CharacterSheet {
  const retired = Object.keys(sheet.sprites).filter(key => key !== "neutral" && (!isCharacterActionAllowed(sheet, key) || worldActions && !worldActions.includes(key)));
  let next = unassignPortraitActions(sheet, retired);
  if (sheet.initialStatus) {
    const action = resolveCharacterAction(sheet, sheet.initialStatus.action, undefined, worldActions);
    if (action !== sheet.initialStatus.action) next = { ...next, initialStatus: { ...sheet.initialStatus, action } };
  }
  return next;
}

export function allowedCharacterActions(sheet: CharacterSheet | undefined, actions: string[]): string[] {
  return [...new Set(["neutral", ...actions])].filter(key => isCharacterActionAllowed(sheet, key));
}

/** Only the action is substituted. No profile, narrative facts or images are rewritten. */
export function resolveCharacterAction(sheet: CharacterSheet | undefined, requested = "neutral", previous?: string, worldActions?: string[]): string {
  const keys = worldActions ?? [...new Set(["neutral", ...Object.keys(sheet?.sprites ?? {}), ...(sheet?.blockedActions ?? [])])];
  const resolved = matchCharacterAction(requested, keys) ?? (!worldActions ? requested : undefined);
  if (resolved && isCharacterActionAllowed(sheet, resolved)) return resolved;
  const old = previous && (matchCharacterAction(previous, keys) ?? (!worldActions ? previous : undefined));
  return old && isCharacterActionAllowed(sheet, old) ? old : "neutral";
}
/** Read-time projection also protects old/imported chat states without migrating lore. */
export function characterStatusForSheet(sheet: CharacterSheet | undefined, state: CharacterStatus): CharacterStatus {
  const action = resolveCharacterAction(sheet, state.action);
  return action === state.action ? state : { ...state, action };
}

/** The player speaks through user messages; they are never an NPC interlocutor. */
export function playerAvatarInstruction(roster: SceneEntity[], actions: string[], byName: boolean): string {
  const hero = roster.find(person => person.characterSheet?.protagonist);
  if (!hero) return "";
  const sheet = hero.characterSheet;
  const portraits = allowedCharacterActions(sheet, actions).filter(key => portraitVariations(sheet?.sprites[key]).length > 0);
  return `Player avatar: ${JSON.stringify({ id: byName ? hero.name : hero.id, portraitActions: portraits })}\nThe player:true character is the user\'s protagonist. Include their state update in EVERY story reply, keeping unchanged fields. Read first-person speech/actions in the latest user message as theirs, then consider the completed scene; do not invent their dialogue or actions. For actual in-character speech prefer an allowed speaking/talking pose when available. Distinguish dialogue from actions, thoughts, out-of-character requests, past quotations and unsent choices: not every message means speaking. Use exact configured action keys, including custom names. Never leave the player permanently neutral merely because their speech is in a user message. The player is never a partners entry.\n`;
}

export function characterActionInstruction(roster: SceneEntity[], actions: string[], byName: boolean, writes = true): string {
  const restricted = roster.map(person => ({
    id: byName ? person.name : person.id,
    ...(person.characterSheet?.blockedActions?.length ? { allowed: allowedCharacterActions(person.characterSheet, actions) } : {}),
    portraits: allowedCharacterActions(person.characterSheet, actions).filter(key => portraitVariations(person.characterSheet?.sprites[key]).length),
  }));
  return `Action catalog: ${JSON.stringify(actions)}\nPersonal action rules: ${JSON.stringify(restricted)}\nChoose state.action from the configured action catalog or the character's narrower allowed list. It describes what the person is doing, receiving or allowing, their sustained pose, expression or visible reaction at the END of this completed scene. Physical movement is NOT required: configured reactions or calm states such as \"Смеётся\", \"Смущается\", \"Спокойствие\", Laughing, Blushing or Calm are equally valid actions. Custom labels such as "Сидит", "Стоит", "Даёт себя обнять" or "Sitting" are valid action keys. Use their exact configured spelling, not synonyms or translations. A sitting person remains sitting while talking unless the completed story changes their posture; prefer a specific matching pose or interaction when it best matches the completed moment; expression/reaction labels remain valid. Never invent an action to match an image. A performed action overrides an older saved action. Keep a sustained established action when it has not changed; use neutral only when no configured action fits. ${writes ? "Include a state update for EVERY physically present person and the protagonist, even if their action remains unchanged." : "These are read-only action meanings; do not output character updates for this service."}\nInteractions update BOTH participants according to their own role, not only the initiator. First-person actions in the latest user message belong to the protagonist. If the user writes "*я обнимаю её*" and the completed reply establishes that she accepts and remains in that embrace, select her configured "Даёт себя обнять" action and the protagonist's matching initiating action if available. Receiving or allowing an interaction is a valid action even without the recipient actively moving. Do not copy the initiator's action onto the recipient or unrelated bystanders. An attempted action is not acceptance: refusal, pulling away, interruption or the interaction ending in the completed reply must not select a receiving/allowing portrait. Never infer consent from an image, label, relationship score or user's attempt. Unplayed choices, thoughts, plans, negations and past quotations do not change actions. Restrictions override the catalog and older messages, but never change the story, personality or facts. Missing portraits do not prohibit an action; the UI can use the default picture. Never change these rules.\n`;
}
