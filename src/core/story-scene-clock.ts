import { gameTimeLabel, isGameTimeFact, validGameTimeFact } from "./story-time";
import type { StoryRecord } from "./story-records";
import { createEpisodeReader } from "./story-episodes";
import type { WorldGame } from "./world-game";

const dayParts = {
  morning: "morning", утро: "morning", afternoon: "afternoon", день: "afternoon",
  evening: "evening", вечер: "evening", night: "night", ночь: "night",
} as const;

export interface SceneClock {
  label: string;
  kind: "named-day" | "date" | "elapsed";
  precision: "day" | "part" | "minute" | "relative";
  day?: number;
  date?: string;
  clock?: string;
  part?: typeof dayParts[keyof typeof dayParts];
  flashback?: true;
}

interface ClockSource extends SceneClock {
  revisionId: string;
  quote: string;
  nativeMessageKey: string;
  worldId: string | null;
  chatId?: string;
}

export function sceneClockHeading(prose: string): SceneClock | undefined {
  const first = prose.trimStart().slice(0, 181).split(/\r?\n/u, 1)[0]!.trim();
  if (first.length > 180) return;
  const heading = first.replace(/^#{1,6} +/u, "").replace(/^\*\*(.+)\*\*$/u, "$1");
  const backwards = heading.replace(/^(?:Flashback|Флешбэк) *[·—–] */iu, "");
  const flashback = backwards !== heading;
  const label = backwards.replace(/^(?:Scene time|Время сцены) *[·—–] */iu, "");
  const explicit = flashback || label !== heading;
  const [dateLabel, detail, extra] = label.split(/ *[·—–] */u);
  if (!dateLabel || extra !== undefined) return;
  const kind = gameTimeLabel(dateLabel);
  if (!kind) return;
  if (kind === "elapsed") return explicit && !detail && !flashback ? { label: heading, kind, precision: "relative" } : undefined;
  const clock = detail && /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(detail) ? detail : undefined;
  const normalizedPart = detail?.toLowerCase();
  const part = normalizedPart && Object.hasOwn(dayParts, normalizedPart) ? dayParts[normalizedPart as keyof typeof dayParts] : undefined;
  if (detail === undefined ? !explicit : !clock && !part) return;
  return {
    label: heading, kind, precision: clock ? "minute" : part ? "part" : "day",
    ...(kind === "named-day" ? { day: Number(dateLabel.match(/\d+/u)![0]) } : { date: dateLabel.slice(0, 10) }),
    ...(clock ? { clock } : {}), ...(part ? { part } : {}), ...(flashback ? { flashback: true } : {}),
  };
}

/** Read literal headings from completed written scenes. The index stores no
 * transcript and cannot place a marker outside the game's selected sources. */
export function indexSceneClocks(records: StoryRecord[]) {
  const origins = new Map(records.flatMap(record => record.type === "baseline" ? [[record.id, record.origin.chatId] as const] : []));
  const chats = new Map(records.flatMap(record => record.type === "branch" ? [[record.id, origins.get(record.baselineId)] as const] : []));
  const result = new Map<string, ClockSource>();
  for (const record of records) {
    if (record.type !== "revision" || record.role !== "assistant" || record.completion !== "complete" || record.storyPurpose === "out-of-character") continue;
    const clock = sceneClockHeading(record.content);
    if (clock) result.set(record.id, { ...clock, quote: clock.label, worldId: record.worldId, revisionId: record.id, nativeMessageKey: record.nativeMessageKey, chatId: chats.get(record.branchId) });
  }
  return result;
}

export type SceneClockIndex = ReturnType<typeof indexSceneClocks>;
export type SceneClockPosition = ClockSource & { order: number };

function dateOrder(a: SceneClock, b: SceneClock) {
  if (a.day !== undefined && b.day !== undefined) return a.day - b.day;
  if (a.date !== undefined && b.date !== undefined) return a.date.localeCompare(b.date);
  return undefined;
}

export function createSceneClockTimeline(sources: readonly string[], index: SceneClockIndex, worldId: string, legacy?: Pick<WorldGame, "facts" | "factRoleSeeds">) {
  // Legacy paragraph markers still depend on their accepted fact. A rejected
  // legacy clock cannot reappear simply because its quote remains in the chat.
  const accepted = new Map<string, ClockSource>();
  if (legacy) {
    const episodes = createEpisodeReader(legacy.factRoleSeeds, [...sources]);
    for (const fact of legacy.facts) {
      if (!isGameTimeFact(fact) || !validGameTimeFact(fact)) continue;
      const source = episodes.read(fact);
      const clock = sceneClockHeading("Scene time · " + fact.quote);
      if (source && clock) accepted.set(source.revisionId, { ...clock, label: fact.quote, quote: fact.quote, worldId, revisionId: source.revisionId, nativeMessageKey: "" });
    }
  }
  const markers = new Map<string, SceneClockPosition>();
  const transitions: SceneClockPosition[] = [];
  let current: SceneClockPosition | undefined, latest: SceneClockPosition | undefined;
  let boundary = 0;
  for (const [position, id] of sources.entries()) {
    const entry = index.get(id) ?? accepted.get(id);
    if (!entry || entry.worldId !== worldId) continue;
    const marker = { ...entry, order: position + 1 };
    if (!entry.flashback) {
      const difference = current && dateOrder(entry, current);
      if (difference !== undefined && (difference < 0 || difference === 0 && entry.clock && current?.clock && entry.clock < current.clock)) continue;
      // Models can echo an unchanged time in several successive replies.
      // That confirms the marker again without ageing the scene's state.
      if (!current || difference !== 0 || entry.clock !== current.clock || entry.part !== current.part) {
        boundary = marker.order;
        transitions.push(marker);
      }
      current = marker;
    } else transitions.push(marker);
    latest = marker;
    markers.set(id, marker);
  }
  return { markers, transitions, current, latest, boundary };
}

export type SceneClockTimeline = ReturnType<typeof createSceneClockTimeline>;

export const SCENE_CLOCK_HEADING_GUIDE = [
  "When the played scene explicitly changes time, put the matching time heading on the first line, in the story's language.",
  "Exact or partial time: Day N · HH:mm / День N · HH:mm (ISO date or known daypart also valid). Day only: Scene time · Day N / Время сцены · День N.",
  "Relative time: Scene time · Three days later / Время сцены · Прошло три дня. Keep the stated duration. Never calculate a numbered day or carry the old hour across a relative jump.",
  "A played flashback MUST begin with Flashback · Day N · HH:mm / Флешбэк · День N · HH:mm, using only known details. The current clock stays unchanged.",
  "Skip the heading if nothing changes. Dialogue, guesses and plans do not change the clock.",
].join(" ");

const UNANCHORED_CLOCK_GUIDE = "Known clock: standalone Day N · HH:mm / День N · HH:mm (ISO/daypart OK). Without hours: Scene time · Day N / Время сцены · День N. Flashback · … / Флешбэк · … is historical. Never guess.";

export function sceneClockHeadingGuide(draft: string, hasAnchor: boolean) {
  const opening = /^([^,:;.!?\r\n]{1,120})(?:[,:\r\n]|\.(?!\.)|$)/u.exec(draft.trimStart())?.[1]?.trim();
  if (!opening || gameTimeLabel(opening) !== "elapsed") return hasAnchor ? SCENE_CLOCK_HEADING_GUIDE : UNANCHORED_CLOCK_GUIDE;
  const russian = /\p{Script=Cyrillic}/u.test(opening);
  const heading = (russian ? "Время сцены · " : "Scene time · ") + opening;
  return `${SCENE_CLOCK_HEADING_GUIDE} The player's opening gives only a relative jump. If you play it now, the first line must be "${heading}". Do not derive a day number from the old clock.`;
}
