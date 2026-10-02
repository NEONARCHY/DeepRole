import type { Locale } from "./types";

export type SceneChoiceKind = "positive" | "neutral" | "negative" | "surprise";
export interface SceneChoice { kind: SceneChoiceKind; label: string; text: string }
export interface SceneChoices { options: [SceneChoice, SceneChoice, SceneChoice, SceneChoice] }

const START = "<deeprole_choices>";
const END = "</deeprole_choices>";
const KINDS: SceneChoiceKind[] = ["positive", "neutral", "negative", "surprise"];

export function sceneChoiceInstruction(): string {
  return [
    "<deeprole_choice_mode version=\"1\">",
    "When writing an in-character scene with dialogue or a meaningful opportunity for the protagonist to act, end the final answer with exactly one <deeprole_choices> JSON block. Do not add choices to out-of-character explanations or summaries.",
    "The block must be valid JSON in this exact shape: <deeprole_choices>{\"version\":1,\"options\":[{\"kind\":\"positive\",\"label\":\"short choice\",\"text\":\"protagonist's reply or action\"},{\"kind\":\"neutral\",\"label\":\"short choice\",\"text\":\"protagonist's reply or action\"},{\"kind\":\"negative\",\"label\":\"short choice\",\"text\":\"protagonist's reply or action\"},{\"kind\":\"surprise\",\"label\":\"short choice\",\"text\":\"protagonist's reply or action\"}]}</deeprole_choices>.",
    "Write all four options in the story's language. Make each option specific to the current scene, distinct, and actionable. Each text must be ready to send as the player's next message: only the protagonist's own reply or action, with no NPC reaction, predicted outcome, numbering, or menu language. Positive is warm or constructive; neutral is restrained or pragmatic; negative is harsh, selfish, or confrontational; surprise is an unexpected but plausible action or proposal. None is a prewritten outcome. Do not decide what the protagonist chose.",
    "Let each character react according to their established personality, goals, history, and the situation. A harsh choice can attract a character who likes that behavior; a kind choice can alienate someone. Do not assign automatic good/evil points or guaranteed relationship changes. Consequences emerge only after the player sends a choice.",
    "Do not list the choices in the visible prose. Do not put the JSON block in a code fence or in a reasoning section. Do not explain the format in the story.",
    "</deeprole_choice_mode>",
  ].join("\n");
}

/** Accept only a complete, ordered set of four actionable choices. Never execute model output. */
export function parseSceneChoices(text: string): { choices: SceneChoices; start: number; end: number } | null {
  const start = text.lastIndexOf(START);
  if (start < 0) return null;
  const endTag = text.indexOf(END, start + START.length);
  if (endTag < 0 || endTag - start > 8000) return null;
  const body = text.slice(start + START.length, endTag).trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  let value: unknown;
  try { value = JSON.parse(body); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const block = value as Record<string, unknown>;
  if (block.version !== 1 || !Array.isArray(block.options) || block.options.length !== 4) return null;
  const options = block.options as unknown[];
  if (!options.every((option) => {
    if (!option || typeof option !== "object" || Array.isArray(option)) return false;
    const item = option as Record<string, unknown>;
    return (KINDS.includes(item.kind as SceneChoiceKind) || item.kind === "random") && typeof item.label === "string" && item.label.trim().length > 0 && item.label.length <= 100 && typeof item.text === "string" && item.text.trim().length > 0 && item.text.length <= 600;
  })) return null;
  const normalized = options.map((option) => { const item = option as Pick<SceneChoice, "label" | "text"> & { kind: SceneChoiceKind | "random" }; return { ...item, kind: item.kind === "random" ? "surprise" as const : item.kind }; });
  if (new Set(normalized.map((option) => option.kind)).size !== 4) return null;
  return { choices: { options: KINDS.map((kind) => normalized.find((option) => option.kind === kind)!) as SceneChoices["options"] }, start, end: endTag + END.length };
}

const copy = {
  ru: { title: "Выберите ответ или действие", hint: "Нажмите вариант, затем измените его перед отправкой.", positive: "Доброжелательно", neutral: "Нейтрально", negative: "Жёстко", surprise: "Неожиданный ход", toggleOn: "Выборы в сценах · вкл", toggleOff: "Выборы в сценах · выкл", toggleHelp: "Четыре варианта в ролевых сценах всех чатов с подключённым миром.", draftBusy: "Сначала завершите или очистите свой черновик.", unavailable: "Поле ввода сейчас недоступно." },
  en: { title: "Choose a reply or action", hint: "Pick an option, then edit it before sending.", positive: "Warm", neutral: "Neutral", negative: "Confrontational", surprise: "Unexpected move", toggleOn: "Scene choices · on", toggleOff: "Scene choices · off", toggleHelp: "Four options in roleplay scenes across chats with a connected world.", draftBusy: "Finish or clear your current draft first.", unavailable: "The composer is unavailable right now." },
} as const;
export function sceneChoiceText(locale: Locale, key: keyof typeof copy.en): string { return copy[locale][key]; }
