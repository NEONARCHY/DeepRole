import type { Locale } from "./types";
export type CharacterUpdateKind = "profile" | "scene" | "relationships" | "attributes" | "events";
export type CharacterUpdateMode = "active" | "paused" | "locked";
const copy = {
  ru: {
    profile: { title: "Постоянная анкета", body: "Обычные ответы DeepSeek не перезаписывают эти поля. Правьте их, чтобы уточнить лор. При включённом сопровождении новые сведения из сцен дополняют игровую анкету; исходный текст сохраняется. Защищённые поля ждут проверки." },
    scene: { title: "Состояние меняется по ходу игры", body: "DeepSeek обновляет эти поля, если присылает изменения после ответа. Ручная правка заменит состояние в общей игре этого лора; следующий ответ может изменить его снова. Правьте их, чтобы исправить ошибку или задать нужное состояние." },
    relationships: { title: "Текущие отношения обновляются по ходу игры", body: "DeepSeek может менять доверие, симпатию и отметки событий после сыгранных сцен. Ручная правка заменит текущие значения в этой игре. Фиксация запрещает автоматические изменения, но не ручные." },
    attributes: { title: "Текущие значения обновляются по ходу игры", body: "DeepSeek может менять значения «Сейчас в этой игре» после сыгранных сцен. Ручная правка заменит их в этой игре. Зафиксированные шкалы не обновляются автоматически; начальные значения и правила задаёте вы." },
    events: { title: "Отметки событий обновляются по ходу игры", body: "DeepSeek может отмечать «Произошло в этой игре» по сыгранным сценам. Ставьте или снимайте отметку вручную, чтобы исправить событие. Название и условия события задаёте вы." },
    paused: "Автообновление выключено",
    locked: "Значения зафиксированы",
    pausedBody: "Эти значения сейчас не обновляются автоматически. Ручная правка заменит их в общей игре этого лора после сохранения.",
    lockedBody: "DeepSeek не меняет зафиксированные значения и отметки событий. Вы можете исправить их вручную; изменения применятся после сохранения.",
    lockedAttributesBody: "DeepSeek не меняет зафиксированные шкалы. Вы можете исправить их вручную; изменения применятся после сохранения.",
  },
  en: {
    profile: { title: "Lasting profile", body: "Ordinary DeepSeek replies do not overwrite these fields. Edit them to clarify lore. With accompaniment enabled, source-backed scene details extend the game profile while original text is preserved. Protected fields await review." },
    scene: { title: "State changes as the story progresses", body: "DeepSeek updates these fields when it sends changes after a reply. Manual edits replace the state in this lore’s shared game; a later reply may change it again. Edit them to correct a mistake or set the intended state." },
    relationships: { title: "Current relationships change as the story progresses", body: "DeepSeek may update trust, affinity and completed events after played scenes. Manual edits replace current values in this game. Locking prevents automatic changes, while manual edits remain available." },
    attributes: { title: "Current values change as the story progresses", body: "DeepSeek may update Now in this game values after played scenes. Manual edits replace them in this game. Locked scales do not update automatically; you set starting values and rules." },
    events: { title: "Event marks change as the story progresses", body: "DeepSeek may mark Happened in this game from played scenes. Set or clear marks manually to correct an event. You set its name and requirements." },
    paused: "Automatic updates are off",
    locked: "Values are locked",
    pausedBody: "These values do not update automatically right now. Saving manual edits replaces them in this lore’s shared game.",
    lockedBody: "DeepSeek does not change locked values or event marks. You can correct them manually; changes apply when saved.",
    lockedAttributesBody: "DeepSeek does not change locked scales. You can correct them manually; changes apply when saved.",
  },
};
export function characterUpdateText(locale: Locale, kind: CharacterUpdateKind, mode: CharacterUpdateMode = "active") {
  const t = copy[locale];
  return kind === "profile" || kind === "scene" || mode === "active" ? t[kind] : { title: t[mode], body: mode === "paused" ? t.pausedBody : kind === "attributes" ? t.lockedAttributesBody : t.lockedBody };
}
