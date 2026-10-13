import type { Locale } from "./types";
const ru = {
  title: "Кратко по сохранённой памяти", hint: "Собрано из полных цитат. Номер рядом с текстом открывает источник.",
  omitted: "В краткий текст не вошло записей: {count}. Полные сведения — ниже.", tooLong: "Для краткого текста записи слишком длинные. Полные сведения — ниже.", source: "Открыть источник {number}",
  first: "В записанной истории", later: "В более поздней реплике", same: "В той же реплике", unplaced: "В сохранённой памяти",
  event: "событие", state: "записанное состояние", promise: "обещание без подтверждённого статуса", plan: "намерение, не подтверждение выполнения", belief: "мнение, не установленный факт", secret: "раскрытые сведения", task: "обязанность без подтверждённого статуса",
  openPromise: "открытое обещание", openPlan: "открытый план", openTask: "незавершённое дело", completed: "выполненное дело", cancelled: "отменённое дело",
  earlier: "состояние в прежней сцене", lastKnown: "последнее известное состояние", persistent: "постоянные сведения", unknown: "состояние с неизвестным временем", ended: "завершённое обстоятельство", clock: "игровая отметка времени",
} as const;
const en: Record<keyof typeof ru,string> = {
  title: "Accepted memory in brief", hint: "Built from complete quotes. A number beside the text opens its source.",
  omitted: "Records not included in this brief: {count}. Full details are below.", tooLong: "These records are too long for a brief. Full details are below.", source: "Open source {number}",
  first: "In the recorded story", later: "In a later recorded turn", same: "In that same turn", unplaced: "In saved memory",
  event: "event", state: "recorded state", promise: "promise with no confirmed task status", plan: "intention, not proof of completion", belief: "belief, not an established fact", secret: "disclosed information", task: "obligation with no confirmed task status",
  openPromise: "open promise", openPlan: "open plan", openTask: "unfinished task", completed: "completed task", cancelled: "cancelled task",
  earlier: "state from an earlier scene", lastKnown: "last known state", persistent: "lasting information", unknown: "state of unknown time", ended: "ended circumstance", clock: "game time marker",
};
export const storyNarrativeText = (locale: Locale) => locale === "ru" ? ru : en;
export type NarrativeSignal = Exclude<keyof typeof ru,"title"|"hint"|"omitted"|"tooLong"|"source"|"first"|"later"|"same"|"unplaced">;
