import type { Locale } from "./types";

const copy = {
  ru: {
    title: "Доступные эмоции", count: "Доступно {count} из {total}",
    hint: "Правило персонажа для всех чатов этого мира. DeepSeek получает разрешённый список; DeepRole не применяет запрещённые эмоции.",
    customize: "Настроить список", search: "Найти эмоцию", allow: "Разрешить эмоцию: {emotion}",
    all: "Разрешить все", neutralOnly: "Только спокойствие", neutral: "Всегда доступно для безопасного возврата.",
    safety: "Если модель вернёт запрещённую эмоцию, останется прежняя допустимая или «Спокойствие». Остальные поля обновятся. Это не гарантирует запрет в сюжетном тексте.",
    images: "Выключение снимает все изображения с этой эмоции. Они остаются в библиотеке или в других назначенных эмоциях. Повторное включение не возвращает старые привязки.",
    future: "Новые эмоции мира доступны автоматически. Настройка сохранится после нажатия «Сохранить».",
    retired: "Вне списка мира", retiredHint: "Эти запреты сохранены. Если название вернётся в список мира, запрет продолжит действовать. Включите переключатель, чтобы снять его.",
    empty: "Ничего не найдено. Попробуйте другое название.", limit: "Сохранено слишком много прежних запретов. Разрешите ненужные эмоции в разделе «Вне списка мира» и повторите.",
    manage: "Настроить доступные эмоции", unavailable: "Эмоция выключена: изображения отвязаны. Включите её переключателем, чтобы снова назначать портреты.",
    detachFull: "Не удалось отвязать изображения. Настройка и изображения не изменены.",
  },
  en: {
    title: "Available emotions", count: "{count} of {total} available",
    hint: "A character rule shared by all chats in this world. DeepSeek receives the allowed list; DeepRole rejects blocked emotions.",
    customize: "Customize list", search: "Find an emotion", allow: "Allow emotion: {emotion}",
    all: "Allow all", neutralOnly: "Calm only", neutral: "Always available as a safe fallback.",
    safety: "If the model returns a blocked emotion, the previous allowed mood stays, or Calm is used. Other fields still update. This cannot guarantee a ban in story text.",
    images: "Turning an emotion off detaches all its images. They stay in the library or their other assigned emotions. Turning it back on does not restore old assignments.",
    future: "New world emotions are allowed automatically. Your changes apply after you press Save.",
    retired: "Outside the world list", retiredHint: "These restrictions are retained. Re-adding the same name keeps it blocked. Turn on its switch to remove the restriction.",
    empty: "No matches. Try another name.", limit: "Too many retained restrictions. Allow unused emotions under Outside the world list, then try again.",
    manage: "Manage available emotions", unavailable: "Emotion disabled: its images are detached. Turn on its switch to assign portraits again.",
    detachFull: "Could not detach the images. The setting and images are unchanged.",
  },
};
export type EmotionPolicyKey = keyof typeof copy.en;
export function emotionPolicyText(locale: Locale, key: EmotionPolicyKey, values: Record<string, string | number> = {}): string {
  return copy[locale][key].replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ""));
}
