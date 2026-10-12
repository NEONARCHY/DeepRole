import type { Locale } from "./types";

const copy = {
  ru: {
    title: "Доступные действия", count: "Доступно {count} из {total}",
    hint: "Правило персонажа для всех чатов этого мира. DeepSeek получает разрешённый список; DeepRole не применяет запрещённые действия.",
    customize: "Настроить список", search: "Найти действие", allow: "Разрешить действие: {action}",
    all: "Разрешить все", neutralOnly: "Только спокойствие", neutral: "Всегда доступно для безопасного возврата.",
    safety: "Если модель вернёт запрещённое действие, останется прежнее допустимое или «Спокойствие». Остальные поля обновятся. Это не гарантирует запрет в сюжетном тексте.",
    images: "Выключение снимает все изображения с этого действия. Они остаются в библиотеке или в других назначенных действиях. Повторное включение не возвращает старые привязки.",
    future: "Новые действия мира доступны автоматически. Настройка сохранится после нажатия «Сохранить».",
    retired: "Вне списка мира", retiredHint: "Эти запреты сохранены. Если название вернётся в список мира, запрет продолжит действовать. Включите переключатель, чтобы снять его.",
    empty: "Ничего не найдено. Попробуйте другое название.", limit: "Сохранено слишком много прежних запретов. Разрешите ненужные действия в разделе «Вне списка мира» и повторите.",
    manage: "Настроить доступные действия", unavailable: "Действие выключено: изображения отвязаны. Включите его переключателем, чтобы снова назначать портреты.",
    detachFull: "Не удалось отвязать изображения. Настройка и изображения не изменены.",
  },
  en: {
    title: "Available actions", count: "{count} of {total} available",
    hint: "A character rule shared by all chats in this world. DeepSeek receives the allowed list; DeepRole rejects blocked actions.",
    customize: "Customize list", search: "Find an action", allow: "Allow action: {action}",
    all: "Allow all", neutralOnly: "Calm only", neutral: "Always available as a safe fallback.",
    safety: "If the model returns a blocked action, the previous allowed action stays, or Calm is used. Other fields still update. This cannot guarantee a ban in story text.",
    images: "Turning an action off detaches all its images. They stay in the library or their other assigned actions. Turning it back on does not restore old assignments.",
    future: "New world actions are allowed automatically. Your changes apply after you press Save.",
    retired: "Outside the world list", retiredHint: "These restrictions are retained. Re-adding the same name keeps it blocked. Turn on its switch to remove the restriction.",
    empty: "No matches. Try another name.", limit: "Too many retained restrictions. Allow unused actions under Outside the world list, then try again.",
    manage: "Manage available actions", unavailable: "Action disabled: its images are detached. Turn on its switch to assign portraits again.",
    detachFull: "Could not detach the images. The setting and images are unchanged.",
  },
};
export type ActionPolicyKey = keyof typeof copy.en;
export function actionPolicyText(locale: Locale, key: ActionPolicyKey, values: Record<string, string | number> = {}): string {
  return copy[locale][key].replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ""));
}
