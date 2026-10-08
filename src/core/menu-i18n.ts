import type { Locale } from "./types";

const copy = {
  ru: {
    play: "Игра", lore: "Лор", guide: "Как это работает", next: "В следующем сообщении",
    playGuide: "DeepRole передаёт выбранную память с вашим следующим сообщением. «Обновить лор» предлагает изменения — вы решаете, что сохранить.",
    loreGuide: "Карта и список — два вида одной памяти. Чтобы DeepSeek использовал мир, подключите его к чату.",
    contextGuide: "Это память для следующего запроса, а не вся библиотека. Можно прикрепить запись вручную или исключить её для текущего чата. После смены мира ручной выбор сбрасывается.",
    modesGuide: "Всегда — правила для каждого сообщения. Автоподбор — совпадения слов, имён и сцены. Вручную — заметки, которые вы прикрепляете сами. Связи между записями учитываются тем же подбором и в карте, и в списке.",
    settingsGuide: "Язык и резервные копии находятся здесь. Подбор памяти, файлы и приложение разделены по вкладкам. Расширение не отправляет данные разработчику.",
    attached: "Подключён к этому чату", libraryOnly: "Только в библиотеке", useWorld: "Использовать в этом чате",
    attachImport: "Использовать в открытом чате", attachHint: "После импорта этот мир заменит выбранный мир чата. Сообщение не отправится.",
    savedNotAttached: "Мир сохранён. Подключить его не удалось — откройте DeepSeek и нажмите «Использовать в этом чате».",
    noSite: "Откройте DeepSeek, чтобы подключить лор к чату.", noContext: "Пока ничего не выбрано. Напишите реплику или прикрепите запись.",
    available: "В мире", selected: "Выбрано", browse: "Открыть лор", start: "Подключите свой мир",
    startHint: "Импортируйте JSON из Better Deepseek (BDS) или DeepRole, либо создайте мир и запишите свои правила.",
    addFact: "Запомнить", addFactHint: "Записать факт или правило для этого мира", update: "Обновить лор", updateHint: "Предложения по последним репликам — с вашим подтверждением",
    continue: "Продолжение истории", more: "Дополнительно", libraryTools: "Книги и учебный пример", list: "Список записей", worldOptions: "Мир и профили", advanced: "Подбор и защита",
    importHelp: "Better Deepseek (BDS), экспорт мира DeepRole или JSON со списком записей: название и текст, необязательно ключи и режим. Перед сохранением проверьте содержимое. Полная резервная копия распознаётся здесь и в настройках: добавьте недостающее или явно подтвердите полную замену.",
    example: "Нужен пример?", quickGuide: "Запись появится и в списке, и на карте. Выберите ниже, когда передавать её в чат.",
  },
  en: {
    play: "Play", lore: "Lore", guide: "How it works", next: "In your next message",
    playGuide: "DeepRole sends selected memory with your next message. Update lore suggests changes — you decide what to save.",
    loreGuide: "Map and list show the same memory. Connect a world to the chat for DeepSeek to use it.",
    contextGuide: "This is memory for the next request, not the whole library. Attach a record manually or exclude it for this chat. Switching worlds resets these overrides.",
    modesGuide: "Always — rules for every message. Automatic — matches words, names and the scene. Manual — notes you attach yourself. Record connections use the same selection logic in the map and list.",
    settingsGuide: "Language and backups live here. Use the tabs for memory, files and app preferences. No data is sent to the developer.",
    attached: "Connected to this chat", libraryOnly: "In library only", useWorld: "Use in this chat",
    attachImport: "Use in the open chat", attachHint: "After import, this world replaces the chat's selected world. No message is sent.",
    savedNotAttached: "World saved, but not connected. Open DeepSeek and choose Use in this chat.",
    noSite: "Open DeepSeek to connect lore to a chat.", noContext: "Nothing selected yet. Write a message or attach a record.",
    available: "In this world", selected: "Selected", browse: "Open lore", start: "Connect your world",
    startHint: "Import JSON from Better Deepseek (BDS) or DeepRole, or create a world and write your own rules.",
    addFact: "Remember", addFactHint: "Save a fact or rule for this world", update: "Update lore", updateHint: "Suggestions from recent messages — with your approval",
    continue: "Continue your story", more: "More options", libraryTools: "Books & tutorial", list: "Memory list", worldOptions: "World & profiles", advanced: "Selection & protection",
    importHelp: "Use Better Deepseek (BDS), a DeepRole world export, or JSON entries with a title and text, optionally keywords and mode. Preview before saving. Full backups are recognized here and in Settings: add missing data or explicitly confirm full replacement.",
    example: "Want an example?", quickGuide: "This record will appear in both the list and the map. Choose below when to send it to the chat.",
  },
} as const;
export function menuText(locale: Locale, key: keyof typeof copy.en): string { return copy[locale][key]; }
export function formatRecordCount(locale: Locale, count: number): string {
  const form = new Intl.PluralRules(locale).select(count);
  const noun = locale === "en" ? form === "one" ? "record" : "records" : form === "one" ? "запись" : form === "few" ? "записи" : "записей";
  return `${count} ${noun}`;
}
