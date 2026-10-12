import type { Locale } from "./types";
export const profileCopy = (locale: Locale) => ({
 ru: {
  generate: "Сгенерировать анкету", hint: "Для одного персонажа. Укажите имя и известные детали в полях ниже — например, «подруга Миры» в «О персонаже».",
  history: "Сначала найти по истории", historyHint: "Найти факты в доступной истории и лоре. Для недостающих полей предложить новые детали с пометкой «Придумано».",
  suggest: "Придумать анкету", suggestHint: "Создать новую анкету с учётом вашего описания и мира. Известные факты и другие персонажи не меняются.",
  review: "Предложенная анкета", reviewHint: "Проверьте и отредактируйте варианты. Заполненные поля не выбраны: отметьте их, только если хотите заменить. После переноса нажмите «Сохранить персонажа»: принятые тексты станут сведениями вашего мира для дальнейшей игры.",
  edited: "Изменено вами", originalQuotes: "Цитаты относятся к исходному предложению, до вашей правки.",
  found: "По истории", suggested: "Придумано", missing: "Недостаточно сведений", conflict: "Противоречие — нужно уточнить", select: "Перенести", proposal: "Вариант", apply: "Перенести выбранное в поля", dismiss: "Убрать варианты",
  fallback: "Для недостающих полей предлагаем новые детали…", ready: "Анкета готова к проверке. Ничего ещё не сохранено.", applied: "Выбранные тексты перенесены. Сохраните персонажа, если всё подходит.",
  changed: "Часть полей изменилась во время подготовки. Ваши правки сохранены; варианты можно выбрать отдельно.", skipped: "Изменённые поля не заменены. Проверьте вариант и отметьте поле заново, если хотите перенести его.",
  cleanup: "Сначала проверьте очистку временного чата. Новые детали пока не запрашивались.", cancel: "Отмена", cancelled: "Подготовка отменена. Поля не изменены.",
 },
 en: {
  generate: "Generate profile", hint: "For one character. Enter a name and known details below — for example, “Mira’s friend” in “About”.",
  history: "Find in history first", historyHint: "Find facts in available history and lore. Suggest new details for missing fields, clearly marked “Invented”.",
  suggest: "Invent a profile", suggestHint: "Create a new profile using your description and setting. Known facts and other characters stay unchanged.",
  review: "Suggested profile", reviewHint: "Review and edit the suggestions. Filled fields are unselected: select them only if you want to replace them. After inserting, click “Save character”: accepted text becomes part of your world for future play.",
  edited: "Edited by you", originalQuotes: "These quotes support the original suggestion, before your edit.",
  found: "From history", suggested: "Invented", missing: "Not enough information", conflict: "Conflict — needs clarification", select: "Insert", proposal: "Suggestion", apply: "Insert selected into fields", dismiss: "Dismiss suggestions",
  fallback: "Suggesting new details for missing fields…", ready: "Profile ready for review. Nothing has been saved yet.", applied: "Selected text inserted. Save the character if it fits.",
  changed: "Some fields changed during preparation. Your edits are kept; suggestions can be selected separately.", skipped: "Edited fields were not replaced. Review the suggestion and select the field again if you want to insert it.",
  cleanup: "Check temporary chat cleanup first. New details have not been requested yet.", cancel: "Cancel", cancelled: "Preparation cancelled. Fields are unchanged.",
 },
}[locale]);
