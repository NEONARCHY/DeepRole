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
    "For every in-character scene reply, including a short dialogue exchange, end the final answer with exactly one <deeprole_choices> JSON block. Always offer four ways for the protagonist to reply or act. Do not add choices to out-of-character explanations or summaries.",
    "The block must be valid JSON in this exact shape: <deeprole_choices>{\"version\":1,\"options\":[{\"kind\":\"positive\",\"label\":\"short choice\",\"text\":\"protagonist's reply or action\"},{\"kind\":\"neutral\",\"label\":\"short choice\",\"text\":\"protagonist's reply or action\"},{\"kind\":\"negative\",\"label\":\"short choice\",\"text\":\"protagonist's reply or action\"},{\"kind\":\"surprise\",\"label\":\"short choice\",\"text\":\"protagonist's reply or action\"}]}</deeprole_choices>.",
    "Write all four options in the story's language. Make each option specific to the current scene, distinct, and actionable. Each text must be ready to send as the player's next message: only the protagonist's own reply or action, with no NPC reaction, predicted outcome, numbering, or menu language. Positive is warm or constructive; neutral is restrained or pragmatic; negative is harsh, selfish, or confrontational; surprise is an unexpected but plausible action or proposal. None is a prewritten outcome. Do not decide what the protagonist chose.",
    "Let each character react according to their established personality, goals, history, and the situation. A harsh choice can attract a character who likes that behavior; a kind choice can alienate someone. Do not assign automatic good/evil points or guaranteed relationship changes. Consequences emerge only after the player sends a choice.",
    "Do not list the choices in the visible prose. Do not put the JSON block in a code fence or in a reasoning section. Do not explain the format in the story.",
    "</deeprole_choice_mode>",
  ].join("\n");
}

/** An explicit, visible request. The existing scene stays intact; no choice is made. */
export function sceneChoiceRecoveryPrompt(locale: Locale): string {
  const request = locale === "ru"
    ? "Предложи четыре ответа или действия моего героя для последней ролевой сцены перед этим запросом. Не продолжай и не переписывай сцену. Ничего не выбирай за меня и не обновляй память. Если выше уже был такой запрос, используй исходную сцену, а не служебный ответ."
    : "Suggest four replies or actions for my protagonist in the last roleplay scene before this request. Do not continue or rewrite the scene, choose for me, or update memory. If a previous request asked for options, use the original scene rather than the technical reply.";
  return ["[DeepRole Service]", "[DeepRole Scene Choices]", request,
    "This is an explicit request for options, even though it is out of character. Return only one complete <deeprole_choices> block in the final answer, not in reasoning. Labels: at most 100 characters. Each option text: at most 600 characters.",
    sceneChoiceInstruction(),
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
  ru: {
    title: "Ваш ход", hint: "Выбор попадёт в поле сообщения. Отправляете вы.",
    navigation: "На вариантах: стрелки — переход, 1–4 — выбор.", selected: "Вставлено в поле сообщения: «{label}». Можно изменить перед отправкой.",
    notInserted: "Вариант не вставлен. Ваш текст не заменён — проверьте поле сообщения.",
    positive: "Доброжелательно", neutral: "Нейтрально", negative: "Жёстко", surprise: "Неожиданный ход",
    toggleOn: "Выборы в сценах · вкл", toggleOff: "Выборы в сценах · выкл", toggleHelp: "Четыре варианта в ролевых сценах всех чатов с подключённым миром.",
    draftBusy: "Сначала завершите или очистите свой черновик.", unavailable: "Поле ввода сейчас недоступно.",
    request: "Предложить варианты", requestHint: "Отправит запрос в чат: четыре хода без продолжения сцены.",
    waiting: "DeepSeek готовит варианты…", waitingHint: "Ответ виден в чате. Выбор появится после завершения.",
    failed: "Варианты не получены", failedHint: "Проверьте ответ в чате. Можно запросить варианты ещё раз. Лор не менялся.",
    changed: "Сцена уже изменилась. Запросите варианты под новым ответом.", busy: "Дождитесь завершения текущего ответа или запроса.",
  },
  en: {
    title: "Your move", hint: "A choice fills the message box. You decide when to send.",
    navigation: "On the options: arrows to move, 1–4 to choose.", selected: "Inserted into the message box: “{label}”. You can edit it before sending.",
    notInserted: "The option was not inserted. Your text was left unchanged — check the message box.",
    positive: "Warm", neutral: "Neutral", negative: "Confrontational", surprise: "Unexpected move",
    toggleOn: "Scene choices · on", toggleOff: "Scene choices · off", toggleHelp: "Four options in roleplay scenes across chats with a connected world.",
    draftBusy: "Finish or clear your current draft first.", unavailable: "The composer is unavailable right now.",
    request: "Suggest options", requestHint: "Sends a request in chat: four moves without continuing the scene.",
    waiting: "DeepSeek is preparing options…", waitingHint: "The reply is visible in chat. Options appear when it finishes.",
    failed: "Options could not be retrieved", failedHint: "Check the reply in chat. You can request options again. Lore is unchanged.",
    changed: "The scene has changed. Request options below the new reply.", busy: "Wait for the current reply or request to finish.",
  },
} as const;
export function sceneChoiceText(locale: Locale, key: keyof typeof copy.en): string { return copy[locale][key]; }
