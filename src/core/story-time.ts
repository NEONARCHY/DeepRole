import type { StoryFact } from "./story-update";
import type { EpisodeReader } from "./story-episodes";
import { CIRCUMSTANCE_INSTRUCTION, CIRCUMSTANCE_COMPACT } from "./story-circumstances";

/** A reserved accepted state, not wall-clock time or an inferred calendar. */
export const GAME_TIME_KEY = "deeprole:game-time";
const count = "(?:[1-9]\\d{0,3}|one|two|three|four|five|six|seven|eight|nine|ten|один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять)";
export function gameTimeLabel(value: string): "named-day" | "date" | "elapsed" | undefined {
  const label = value.replace(/[.!]$/u, "");
  if (/^(?:Day|День) [1-9]\d{0,5}$/iu.test(label)) return "named-day";
  if (/^\d{4}-\d{2}-\d{2}$/u.test(label)) {
    const [year, month, day] = label.split("-").map(Number);
    const date = new Date(0); date.setUTCFullYear(year!, month! - 1, day!); date.setUTCHours(0, 0, 0, 0);
    if (date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day) return "date";
  }
  if (new RegExp(`^(?:${count} (?:days?|weeks?|months?|years?) (?:later|passed|have passed)|(?:Прошло|Прошли) ${count} (?:день|дня|дней|неделя|недели|недель|месяц|месяца|месяцев|год|года|лет)|${count} (?:день|дня|дней|неделя|недели|недель|месяц|месяца|месяцев|год|года|лет) спустя)$`, "iu").test(label)) return "elapsed";
  return undefined;
}
export const isGameTimeFact = (fact: StoryFact) => fact.claim?.key === GAME_TIME_KEY;
export function validGameTimeFact(fact: StoryFact) {
  if (!isGameTimeFact(fact)) return true;
  return fact.kind === "event" && fact.claim!.scope === "state" && fact.claim!.lifetime === undefined && fact.text.length <= 120 && fact.text === fact.quote && fact.text === fact.claim!.value && !!gameTimeLabel(fact.text);
}
/** Time markers must also be a literal paragraph opening in played prose.
 * A date merely mentioned inside speech, a plan or a memory is not a clock. */
export function gameTimeEvidence(fact: StoryFact, prose: string) {
  if (!isGameTimeFact(fact)) return true;
  return validGameTimeFact(fact) && prose.split(/\r?\n/u).some(line => {
    const text = line.trimStart();
    if (!text.startsWith(fact.quote)) return false;
    const rest = text.slice(fact.quote.length);
    return !rest || /^[.!:。](?:\s|$)/u.test(rest) || /[.!]$/u.test(fact.quote) && /^\s/u.test(rest);
  });
}
export function gameTimeMovesBack(old: StoryFact, next: StoryFact) {
  if (!isGameTimeFact(old) || !isGameTimeFact(next)) return false;
  const kind = gameTimeLabel(old.text);
  if (kind !== gameTimeLabel(next.text)) return false;
  if (kind === "named-day") return Number(next.text.match(/\d+/u)![0]) < Number(old.text.match(/\d+/u)![0]);
  if (kind === "date") return next.text.slice(0, 10) < old.text.slice(0, 10);
  return false; // Elapsed labels are individual transitions, never absolute dates.
}
export interface GameTimeAnchor { label: string; kind: "named-day" | "date" | "elapsed"; revisionId: string; quote: string }
export type StoryTimeStatus = "earlier-scene" | "last-known" | "persistent" | "unknown" | "ended";
export interface StoryTimeReader { anchor?: GameTimeAnchor; read(fact: StoryFact): StoryTimeStatus | undefined }
export function createStoryTimeReader(facts: StoryFact[], episodes: EpisodeReader): StoryTimeReader {
  let clock: StoryFact | undefined, position = 0;
  for (const fact of facts) if (isGameTimeFact(fact) && validGameTimeFact(fact) && episodes.position(fact) > position) { clock = fact; position = episodes.position(fact); }
  const source = clock && episodes.read(clock), kind = clock && gameTimeLabel(clock.text);
  const anchor = clock && source && kind ? { label: clock.text, kind, revisionId: source.revisionId, quote: clock.quote } : undefined;
  return { ...(anchor ? { anchor } : {}), read(fact) {
    if (!fact.claim?.lifetime) return undefined;
    const at = episodes.position(fact);
    if (!at) return "unknown";
    if (fact.claim.status === "ended") return "ended";
    if (fact.claim.lifetime === "persistent") return "persistent";
    return anchor && at < position ? "earlier-scene" : "last-known";
  } };
}
export const STORY_TIME_INSTRUCTION = 'Optional state claim.lifetime:"scene"|"persistent": scene=temporary position/activity/clothes, persistent=explicit lasting knowledge/trait. Omit if uncertain; never use on tasks or event claims. Time: ONLY an explicit played paragraph opening in these supported forms: Day 12 / День 12, YYYY-MM-DD, Three days later / Прошло три дня (also numeric days/weeks/months/years). Emit kind:event, text=quote=claim.value=the EXACT opening label, claim:{key:"deeprole:game-time",value,scope:"state",transition:"progress"}. No lifetime on this reserved claim. Do not invent a time heading, infer dates from turn numbers, computer time, tomorrow, dialogue, plans or flashbacks. A time passage NEVER completes/cancels tasks. Repeated elapsed phrases at different sources are different transitions; do not add them into a calendar.' + ' ' + CIRCUMSTANCE_INSTRUCTION;
export const STORY_TIME_GUIDE = "timeStatus: earlier-scene=temporary state BEFORE a later time marker; last-known=source state not guaranteed current; persistent=lasting detail, not immutable circumstances; unknown=unproved order. No inferred expiry/task closure. Omit timeStatus from proposals.";
export const STORY_TIME_COMPACT = 'state lifetime scene|persistent=temporary|lasting; omit unknown. Clock: event,text=quote=claim.value=L,key="deeprole:game-time",scope:state,progress. L exact played opening Day N/День N/ISO/RUEN elapsed. No clock lifetime/guesses/dialogue/plans/flashbacks/summed durations; time NEVER closes tasks. ' + CIRCUMSTANCE_COMPACT;
export const EPISODE_TIME_GUIDE = "episodeSource=exact source, NOT dates; timeStatus: earlier-scene=before later clock, last-known=NOT current proof, persistent=NOT immutable, unknown=unproved. Time NEVER fulfills or cancels tasks. Keep kind/status/negation/conditions; source/time fields=request-only.";
export function formatStoryTime(reader: StoryTimeReader) {
  const value = reader.anchor ?? { label: null, kind: "unknown" };
  return '<deeprole_story_time>Source-backed data. elapsed is NOT an absolute date or summed duration; unknown stays unknown.\n' + JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e") + '\n</deeprole_story_time>';
}
