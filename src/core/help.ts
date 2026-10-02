import { translate, type MessageKey } from "./i18n";
import type { Locale } from "./types";
import { sceneHelp } from "./scene-i18n";

const explanations: Partial<Record<MessageKey, [string, string]>> = {
  welcomeTitle: ["DeepRole выбирает память локально. При отправке подходящие записи передаются DeepSeek вместе с вашим сообщением. Разработчику данные не отправляются.", "DeepRole selects memory locally and sends matching entries to DeepSeek with your message. No data is sent to the developer."],
  activeBook: ["Выберите книгу для текущего чата. Используется память этой книги и общие записи. Для нового чата сначала отправьте первое сообщение.", "Choose a book for this chat. Its entries and global memory are available. Send the first message before assigning a new chat."],
  contextEntries: ["Количество общих записей и записей активной книги. Это не количество записей, выбранных для следующего сообщения.", "Number of global entries and entries in the active book, not the number selected for your next message."],
  memoryBooks: ["Книги разделяют память разных миров и сюжетов. Создайте книгу, добавьте записи и выберите её для чата.", "Books separate memory for different worlds and stories. Create a book, add entries, and assign it to a chat."],
  snapshots: ["Сжатые состояния сюжета для продолжения в другом чате. Они сохраняются отдельно от обычной памяти.", "Compressed story states for continuing in another chat, stored separately from memory entries."],
  newMemory: ["Открывает редактор новой записи: название, факт, ключевые слова и режим подключения. Ничего не отправляет в DeepSeek.", "Opens a new entry editor for a title, fact, keywords, and activation mode. Nothing is sent to DeepSeek."],
  newBook: ["Создаёт пустую книгу для отдельного сюжета. Затем её можно выбрать в текущем чате.", "Creates an empty book for a separate story that you can assign to a chat."],
  analyze: ["Просит DeepSeek предложить изменения памяти по текущему диалогу. Запрос и ответ видны в чате. Вы выбираете записи и подтверждаете сохранение.", "Asks DeepSeek to suggest memory changes from this conversation. The request and reply stay visible in chat. You select entries and confirm what to save."],
  saveSnapshot: ["Просит DeepSeek сжать текущий сюжет: события, участников и незавершённые линии. Сохраняет результат для переноса; полный диалог не копируется.", "Asks DeepSeek to summarize events, participants, and unresolved plot threads. Saves the result for handoff without copying the full conversation."],
  continueChat: ["Создаёт состояние текущей истории и открывает новый чат. Перед продолжением вы сможете применить сохранённое состояние.", "Creates a story state and opens a new chat, where you can apply the saved state before continuing."],
  apply: ["Подключает это состояние к следующему сообщению. Само сообщение автоматически не отправляется.", "Attaches this story state to your next message without sending that message automatically."],
  context: ["Показывает память для следующего сообщения. Нажмите, чтобы убрать или добавить записи. Перетаскивайте плашку мышью; выбранное место сохраняется.", "Shows memory for your next message. Click to remove or add entries. Drag the indicator to move it; its position is saved."],
  title: ["Короткое понятное название для поиска и редактирования. Можно изменить в любое время.", "A short readable name for search and editing. You can rename it anytime."],
  description: ["Кратко опишите назначение книги: мир, сюжет или группу фактов.", "Briefly describe the book's purpose: a world, story, or group of facts."],
  content: ["Сам факт, который должен помнить DeepSeek. Пишите конкретно: кто, что произошло и что важно сохранить.", "The fact DeepSeek should remember. Be specific about who, what happened, and what matters."],
  keywords: ["Имена, места и фразы через запятую. Автоподбор ищет их в вашем сообщении и недавнем диалоге.", "Comma-separated names, places, and phrases. Automatic mode looks for them in your message and recent conversation."],
  book: ["Выберите книгу записи. Общая память доступна независимо от выбранной книги чата.", "Choose a book for this entry. Global memory is available regardless of the chat's assigned book."],
  priority: ["При ограниченном месте более высокий приоритет помогает записи попасть в контекст раньше других.", "Higher priority helps an entry fit into the context before other entries when space is limited."],
  activationAlways: ["Добавлять запись к каждому сообщению в пределах лимита памяти, когда её книга активна или запись общая.", "Include this entry with every message within the memory budget when its book is active or it is global."],
  activationSmart: ["Подключать при совпадении слов и фраз в черновике и недавних репликах. Подбор выполняется локально, без ИИ.", "Include when words or phrases match the draft and recent messages. Matching runs locally without AI."],
  activationManual: ["Автоматически не подключать. Добавляйте запись через индикатор контекста, когда она нужна.", "Never attach automatically. Use the context indicator to attach this entry when needed."],
  contextBudget: ["Ограничивает объём добавленной памяти, а не длину ответа DeepSeek. Токены — приблизительная оценка размера текста.", "Limits added memory, not DeepSeek's response length. Tokens are an approximate measure of text size."],
  sensitivity: ["«Больше записей» расширяет поиск; «Точнее» оставляет сильные совпадения. Влияет только на автоподбор.", "More entries broadens matching; More precise keeps stronger matches. Only affects Automatic mode."],
  reminderInterval: ["Через это число новых реплик DeepRole предложит анализ. DeepSeek не запускается без вашего нажатия.", "After this many new messages DeepRole suggests analysis. DeepSeek is only invoked when you choose to run it."],
  deletionProtection: ["Включено: перед удалением появляется подтверждение. Выключено: запись, книга или состояние удаляется сразу.", "On: deleting requires confirmation. Off: entries, books, or story states are deleted immediately."],
  exportData: ["Скачивает резервную копию данных. Обычный файл читается без пароля; защищённый файл требует выбранный пароль.", "Downloads a backup. Plain files can be read without a password; protected files require your chosen password."],
  plainJson: ["Скачивает читаемую резервную копию без шифрования. Храните её там, где другим нет доступа.", "Downloads a readable, unencrypted backup. Keep it somewhere private."],
  encryptedBackup: ["Скачивает зашифрованную копию с введённым паролем. Без этого пароля восстановить её нельзя.", "Downloads an encrypted backup using the entered password. It cannot be restored without that password."],
  importData: ["Восстанавливает резервную копию. Можно объединить записи или заменить текущие данные. Для защищённого файла нужен пароль.", "Restores a backup. You can merge entries or replace existing data. Protected files require a password."],
  enableVault: ["Шифрует память на устройстве. Для доступа потребуется пароль; восстановить забытый пароль невозможно. Сохраните резервную копию.", "Encrypts memory on your device. Access requires a password that cannot be recovered if forgotten. Keep a backup."],
  disableVault: ["Снимает локальное шифрование. Данные остаются на устройстве и хранятся в обычном виде.", "Removes local encryption. Data remains on your device in readable storage."],
  password: ["Используется для защищённых копий и локального сейфа. Храните пароль отдельно: DeepRole не может восстановить его.", "Used for protected backups and the local vault. Keep it safe: DeepRole cannot recover it."],
  language: ["Меняет язык интерфейса и подсказок. Язык вашего RP-диалога не меняется.", "Changes the interface and help language without changing your roleplay conversation."],
  russian: ["Переключает интерфейс и подсказки на русский.", "Switches the interface and help to Russian."],
  english: ["Переключает интерфейс и подсказки на английский.", "Switches the interface and help to English."],
  delete: ["Удаляет выбранный объект. Подтверждение зависит от настройки защиты. Удалённое можно восстановить из резервной копии.", "Deletes the selected item. Confirmation depends on deletion protection. Restore deleted data from a backup."],
  deleteAll: ["Удаляет все записи выбранного мира: из всех его книг и общей памяти, даже если в списке выбрана одна книга. Сам мир и книги сохраняются.", "Deletes every entry in the selected world, across all its books and general memory, even if one book is selected in the list. The world and books remain."],
  edit: ["Открывает редактор выбранного объекта. Изменения применяются после сохранения.", "Opens the selected item's editor. Changes apply after saving."],
  save: ["Сохраняет заполненные поля. В предложениях памяти сохраняются только отмеченные записи.", "Saves the entered fields. In memory suggestions, only checked entries are saved."],
  cancel: ["Закрывает редактор без сохранения внесённых изменений.", "Closes the editor without saving changes."],
  close: ["Закрывает это окно. Несохранённые правки не применяются.", "Closes this window without applying unsaved changes."],
  copy: ["Копирует текст в буфер обмена. Ничего не отправляет в чат.", "Copies text to the clipboard without sending it to the chat."],
  openTutorial: ["Открывает пример заполненного сюжета и памяти. Пример не подключается к вашим чатам.", "Opens a filled-in story and memory example that is not attached to your chats."],
  createEditableCopy: ["Добавляет отдельную копию примера в вашу библиотеку. Её можно менять и удалять; книга не подключается автоматически.", "Adds a separate copy of the example to your library. Edit or delete it freely; its book is not assigned automatically."],
  memory: ["Открывает записи, книги, поиск и редактор памяти.", "Opens entries, books, search, and memory editing."],
  overview: ["Показывает активную книгу, количество записей и быстрые действия для текущего чата.", "Shows the active book, entry counts, and quick actions for this chat."],
  handoff: ["Открывает сохранённые состояния истории и инструменты продолжения в новом чате.", "Opens saved story states and tools for continuing in a new chat."],
  settings: ["Открывает язык, подбор памяти, защиту удаления, резервные копии и сейф.", "Opens language, memory matching, deletion protection, backups, and vault settings."],
  search: ["Ищет по названиям, тексту и ключевым словам записей. Учитывает выбранный фильтр книги.", "Searches entry titles, content, and keywords within the selected book filter."],
  globalMemory: ["Показывает общие записи выбранного мира, вне конкретной книги. Они не переходят в другие миры.", "Shows the selected world's general entries outside any book. They do not cross into other worlds."],
  allMemories: ["Показывает записи из всех книг и общей области.", "Shows entries from every book and global memory."],
  unlock: ["Разблокирует локальную память введённым паролем для текущей сессии браузера.", "Unlocks local memory with your password for this browser session."],
  next: ["Переходит к следующему шагу знакомства с DeepRole.", "Moves to the next step of the DeepRole introduction."],
  skip: ["Завершает знакомство и открывает основной интерфейс. Библиотека остаётся пустой.", "Finishes the introduction and opens the main interface. Your library stays empty."],
  finish: ["Завершает знакомство и открывает DeepRole.", "Finishes the introduction and opens DeepRole."],
  openDeepRole: ["Открывает меню DeepRole поверх сайта. Закройте его крестиком или Escape. За пределами меню чат остаётся доступным.", "Opens DeepRole over the site. Close it with X or Escape. The chat remains usable outside the menu."],
  attachManually: ["Выберите запись для следующего контекста, даже если автоматический подбор её не выбрал.", "Choose an entry for the next context even if automatic matching did not select it."],
  copyContext: ["Копирует подготовленную память, чтобы вы могли добавить её в сообщение самостоятельно.", "Copies the prepared memory so you can paste it into your message yourself."],
  saveToDeepRole: ["Сохраняет выделенный текст как новую запись памяти.", "Saves the selected text as a new memory entry."],
};

export function getHelp(locale: Locale, label: string): string {
  const scene = sceneHelp(locale, label);
  if (scene) return scene;
  for (const [key, texts] of Object.entries(explanations)) {
    if (translate(locale, key as MessageKey) === label) return texts![locale === "ru" ? 0 : 1];
  }
  return locale === "ru"
    ? "Выберите этот элемент, чтобы открыть или изменить его. Изменения в редакторе применяются после сохранения."
    : "Select this item to open or change it. Editor changes apply after saving.";
}
