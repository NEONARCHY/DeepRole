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
export function playerAvatarInstruction(roster: SceneEntity[], byName: boolean, compact = false): string {
  const hero = roster.find(person => person.characterSheet?.protagonist);
  if (!hero) return "";
  const player = JSON.stringify({ id: byName ? hero.name : hero.id });
  if (compact) return `Player avatar: ${player}\nFirst-person played actions/speech belong to this protagonist. Update their action each completed scene; prefer a configured speaking pose for actual speech, not thoughts/OOC/past quotes/unsent choices. Never invent their dialogue or actions; player is never partners.\n`;
  return `Player avatar: ${player}\nThe player:true character is the user's protagonist. Include their state update in EVERY story reply, keeping unchanged fields. Read first-person speech/actions in the latest user message as theirs, then consider the completed scene; do not invent their dialogue or actions. For actual in-character speech prefer an allowed speaking/talking pose when available. Distinguish dialogue from actions, thoughts, out-of-character requests, past quotations and unsent choices: not every message means speaking. The player is never a partners entry.\n`;
}

type ActionGroup = { ids: string[]; actions: string[] };

export function characterActionReference(roster: SceneEntity[], actions: string[], byName: boolean): string {
  const catalog = [...new Set(["neutral", ...actions])];
  const blocked = new Map<string, ActionGroup>(), portraits = new Map<string, ActionGroup>();
  const add = (groups: Map<string, ActionGroup>, id: string, keys: string[]) => {
    if (!keys.length) return;
    const key = JSON.stringify(keys);
    let group = groups.get(key);
    if (!group) groups.set(key, group = { ids: [], actions: keys });
    group.ids.push(id);
  };
  for (const person of roster) {
    const id = byName ? person.name : person.id;
    const sheet = person.characterSheet;
    const blockedKeys = new Set(sheet?.blockedActions);
    add(blocked, id, catalog.filter(action => action !== "neutral" && blockedKeys.has(action)));
    add(portraits, id, catalog.filter(action => !blockedKeys.has(action) && portraitVariations(sheet?.sprites[action]).length > 0));
  }
  const rules = { ...(blocked.size ? { blocked: [...blocked.values()] } : {}), ...(portraits.size ? { portraits: [...portraits.values()] } : {}) };
  return `Action catalog: ${JSON.stringify(catalog)}\n${blocked.size || portraits.size ? `Personal action rules: ${JSON.stringify(rules)}\nEach group applies to every listed ID. Blocked keys are forbidden for those IDs; portraits list available images only.\n` : ""}`;
}

export const SCENE_ACTION_RULES = "Choose each person's state.action from exact allowed catalog keys. First determine physical presence at the end of the scene; mentions, memories, photos and remote messages do not establish presence. Use the most specific evidenced ongoing action, pose or visible reaction. Keep a sustained action unless the scene changes it. An available portrait breaks ties between equally fitting keys; do not invent an action to use an image. Use neutral only when no better permitted key fits. Interactions update BOTH participants according to their own roles. Receiving or allowing requires established acceptance at scene end. Attempts, refusals, plans, past events and unchosen options do not establish it.";

export function characterActionInstruction(roster: SceneEntity[], actions: string[], byName: boolean, writes = true, compact = false): string {
  const reference = characterActionReference(roster, actions, byName);
  const update = writes ? "Include a state update for EVERY physically present person and the protagonist, even if their action is unchanged." : "Read-only reference; do not output character updates for this service.";
  const examples = compact ? "" : "\nPhysical movement is NOT required. Reactions such as Смеётся, Смущается and Спокойствие are valid. Update BOTH participants: with a confirmed ongoing embrace, use the initiator's matching action and the recipient's configured Даёт себя обнять. A refusal, pulling away or interrupting the interaction does not establish acceptance.";
  return `${reference}${SCENE_ACTION_RULES} Never infer acceptance from a portrait, label or relationship score. ${update}${examples}\n`;
}
