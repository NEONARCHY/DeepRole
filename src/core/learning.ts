import { IS_DESKTOP } from "./chat-host";
import type { Locale } from './types';

type Copy = { ru: string; en: string };
const copy = (ru: string, en: string): Copy => ({ ru, en });
export const learningCopy = {
  guide: copy('Знакомство с DeepRole', 'Your DeepRole guide'),
  intro: copy('Выберите короткий маршрут. Вы сами нажимаете настоящие кнопки, а подсказки объясняют следующий шаг.', 'Choose a short tour. You click the real controls; the guide explains each next step.'),
  resume: copy('Продолжить обучение', 'Resume tour'),
  restart: copy('Пройти заново', 'Take again'),
  start: copy('Начать маршрут', 'Start tour'),
  close: copy('Закрыть руководство', 'Close guide'),
  pause: copy('Позже', 'Pause'),
  next: copy('Понятно, дальше', 'Got it, next'),
  back: copy('Назад', 'Back'),
  finish: copy('Завершить маршрут', 'Finish tour'),
  skip: copy('Пропустить шаг', 'Skip step'),
  waiting: copy('Нажмите выделенную кнопку в интерфейсе. Переход подтвердится сам.', 'Click the highlighted control in the app. The guide will notice when it opens.'),
  directory: copy('Сначала нажмите выделенную кнопку возврата к оглавлению. Затем подсказка покажет нужный раздел.', 'First click the highlighted button to return to the directory. The guide will then show the right section.'),
  unavailable: copy("Этот элемент пока недоступен. Возможно, сначала нужно открыть чат и подключить мир. Можно пропустить шаг и вернуться позже.", (IS_DESKTOP ? "This control is not available yet. You may need to open a chat and connect a world first. You can skip this step and return later." : 'This control is not available yet. You may need to open a DeepSeek chat and connect a world first. You can skip this step and return later.')),
  blocked: copy('Сначала закройте открытый редактор или диалог. Обучение не закрывает их и не меняет ваши черновики.', 'Close the open editor or dialog first. The guide will not close it or change your drafts.'),
  collapse: copy('Свернуть подсказку', 'Minimize hint'),
  expand: copy('Развернуть подсказку', 'Expand hint'),
  reveal: copy('Показать кнопку', 'Show control'),
  savedError: copy('Прогресс обучения не сохранён. Можно продолжить; после открытия меню этот шаг может повториться.', 'Tour progress was not saved. You can continue, but this step may repeat when you reopen the menu.'),
  done: copy('Пройдено', 'Completed'),
  progress: copy('Шаг {step} из {total}', 'Step {step} of {total}'),
  welcomeTitle: copy("Ваш мир в DeepRole", "Your world in DeepRole"),
  welcomeLead: copy("Создайте мир или загрузите свой лор, подключите его к чату и пишите в чате как обычно.", "Create a world or import your lore, connect it to a chat, and write in the chat as usual."),
  welcomeMemory: copy('В новом мире память включена по умолчанию. Подтверждённые факты сохраняются автоматически, спорные остаются на проверке.', 'New worlds use automatic memory by default. Confirmed facts are saved automatically, and uncertain details wait for review.'),
  limits: copy("DeepRole не увеличивает окно модели и не обещает безошибочную память: передаётся только подходящая часть данных. Модель может ошибаться.", "DeepRole does not enlarge the model’s context window or guarantee perfect memory: only a relevant portion is sent. The model can still make mistakes."),
  privacy: copy("Лор хранится на этом устройстве. Подключённые сведения отправляются модели; иллюстрации — выбранному API. Сохраняйте резервные копии.", "Lore stays on this device. Included details are sent to the model; illustrations go to your chosen API. Keep backups."),
  guided: copy('Показать интерфейс', 'Show me around'),
  self: copy('Открыть «Игру»', 'Open Play'),
  later: copy('Руководство можно открыть кнопкой с книгой вверху меню.', 'Reopen the guide with the book button at the top of the menu.'),
  saving: copy('Сохраняем…', 'Saving…'),
  welcomeError: copy('Не удалось сохранить выбор. Попробуйте ещё раз.', 'Your choice could not be saved. Please try again.'),
} satisfies Record<string, Copy>;
export type LearningKey = keyof typeof learningCopy;
export function learningText(locale: Locale, key: LearningKey) { return learningCopy[key][locale]; }

export interface LearningStep {
  title: Copy;
  text: Copy;
  target: string;
  /** Presence of a visible destination confirms the real navigation, not a click alone. */
  arrived?: string;
}
const anchor = (id: string) => `[data-dr-guide="${id}"]`;
const step = (title: Copy, text: Copy, target: string, arrived?: string): LearningStep => ({ title, text, target: anchor(target), arrived: arrived ? anchor(arrived) : undefined });
const open = (tab: 'worlds' | 'overview' | 'story' | 'settings', title: Copy, text: Copy) => step(title, text, `nav-${tab}`, `page-${tab}`);

export const learningChapters = [
  { id: 'first-play', title: copy('Первый мир и начало игры', 'Your first world and game'), steps: [
    open('worlds', copy('Откройте «Миры»', 'Open Worlds'), copy('Здесь хранится библиотека лора. Нажмите «Миры» внизу меню.', 'This is your lore library. Click Worlds at the bottom of the menu.')),
    step(copy('Создать или импортировать', 'Create or import'), copy('Выберите «Создать свой мир», чтобы начать с названия и описания. Если у вас есть файл JSON, выберите «Загрузить мир из файла» и проверьте его содержимое.', 'Choose “Create your world” to start with a name and description. If you have a JSON file, choose “Load a world from a file” to preview its contents.'), 'world-start'),
    step(copy('Подключите мир к чату', 'Connect your world to the chat'), copy('Если выбрали «Импортировать и подключить», можно сразу вернуться в «Игру». Для мира из библиотеки выберите его здесь и нажмите «Использовать в этом чате».', 'If you chose Import and connect, you can return to Play. For a world already in your library, select it here and choose Use in this chat.'), 'world-picker'),
    open('overview', copy('Вернитесь в «Игру»', 'Return to Play'), copy('Нажмите «Игра» внизу: здесь проверяется мир текущего чата.', 'Click Play at the bottom to check the current chat’s world.')),
    step(copy('Проверьте подключение перед первой репликой', 'Check the connection before your first turn'), copy((IS_DESKTOP ? "Откройте «Игра → Сцена», выберите мир и напишите первую реплику." : 'Откройте чат на chat.deepseek.com и выберите свой мир в блоке текущей сцены. После подключения пишите в DeepSeek как обычно. Обучение не выбирает мир за вас.'), (IS_DESKTOP ? "Go to Game → Scene, choose a world and write your first turn." : 'Open a chat at chat.deepseek.com and select your world in the current-scene section. Once connected, write in DeepSeek as usual. The guide does not select a world for you.')), 'play-world'),
  ]},
  { id: 'lore-characters', title: copy('Карта, персонажи и палочки', 'Map, characters and magic wands'), steps: [
    open('worlds', copy('Откройте библиотеку миров', 'Open your world library'), copy('Нажмите «Миры», затем выберите нужный мир в библиотеке.', 'Click Worlds, then select the world you want in the library.')),
    step(copy('Карта связывает части лора', 'The map connects your lore'), copy('На карте можно открывать и связывать записи, персонажей и ветви. Открытие карты ничего не генерирует. Во вкладке «Список записей» доступны записи без карты.', 'Use the map to open and connect entries, characters and branches. Opening it does not generate anything. Memory list offers the entries without the map.'), 'world-views'),
    step(copy('Откройте «Мир и профили»', 'Open World & profiles'), copy('Нажмите «Мир и профили», чтобы увидеть сам мир и его персонажей.', 'Click World & profiles to see the world itself and its characters.'), 'world-manage', 'world-profiles'),
    step(copy('Сохранённая анкета — опора для модели', 'Saved profiles guide the model'), copy('Добавляйте персонажей вручную или готовьте их из лора. Внутри анкеты палочки заполняют отдельные поля. Сгенерированное можно поправить до сохранения; ваши сохранённые данные используются дальше.', 'Add characters manually or prepare them from lore. Wands inside a profile fill individual fields. Edit generated suggestions before saving; your saved version is used afterwards.'), 'world-profiles'),
    step(copy('Служебное окно — отдельная работа', 'A service window does a separate job'), copy('Генерация открывает служебное окно, не засоряя игровой чат. Окно можно свернуть до окончания, но не закрывать. Сохранение и замена уже заполненных полей требуют вашего выбора.', 'Generation opens a service window without cluttering the game chat. You can minimize it until it finishes, but do not close it. Saving or replacing filled fields requires your choice.'), 'world-profiles'),
  ]},
  { id: 'story-memory', title: copy('Память событий и обещаний', 'Events and promises'), steps: [
    open('story', copy('Откройте «Память игры»', 'Open Story memory'), copy('Нажмите «Память игры» внизу. Лор мира и события прохождения хранятся отдельно.', 'Click Story memory at the bottom. World lore and playthrough events are stored separately.')),
    step(copy('Очередь и режим сохранения', 'Review queue and saving mode'), copy('В «Обзоре» сначала видны предложения к проверке. Чтобы сменить режим, раскройте «Как сохранять новые сведения».', 'Overview shows the review queue first. To change the mode, open How to save new details.'), 'page-story'),
    step(copy('Откройте «Дела»', 'Open Tasks'), copy('Нажмите «Дела» в этой панели. Здесь удобно проверять обещания, незавершённые задачи и их условия.', 'Click Tasks in this workspace to inspect promises, unfinished tasks and their conditions.'), 'story-tasks', 'story-tasks-content'),
    step(copy('Обещание — не выполненное действие', 'A promise is not a completed action'), copy('Например: «починю лифт после возвращения механика». Память должна сохранить и обещание, и условие. Просматривайте спорные предложения; при смене варианта ответа учитывается выбранная история, а не все версии сразу.', 'For example: “I will fix the lift after the mechanic returns.” Memory should preserve both the promise and its condition. Review disputed suggestions; switching reply variants follows the selected story, not every version at once.'), 'story-tasks-content'),
  ]},
  { id: 'context', title: copy('Контекст и продолжение долгой игры', 'Context and continuing a long game'), steps: [
    open('overview', copy('Откройте «Игру»', 'Open Play'), copy('Здесь видно, что подключено к текущему чату.', 'Here you can see what is connected to the current chat.')),
    step(copy('Память подбирается, а не отправляется целиком', 'Memory is selected, not sent in full'), copy("DeepRole подбирает подходящие сведения в пределах бюджета. В подробностях «Что получает модель» можно посмотреть подключённую память и ограничения. Это не подтверждение, что модель поняла каждый факт.", "DeepRole selects relevant details within a budget. What the model receives shows included memory and limits. This does not prove the model understood every fact."), 'page-overview'),
    step(copy('Откройте «Продолжение истории»', 'Open Continue your story'), copy('Нажмите «Продолжение истории» ниже. Пока это только раскрытие раздела, а не запуск переноса.', 'Open Continue your story below. This only expands the section; it does not start a transfer.'), 'continuation-toggle', 'continuation-content'),
    step(copy('Новый чат вместо бесконечно растущей переписки', 'A new chat instead of an ever-growing thread'), copy("Когда переписка становится слишком длинной, создайте продолжение с подготовленной сводкой. Проверьте её перед переносом. Старый чат сохраняется; окно контекста модели не становится безлимитным.", "When a thread grows too long, create a continuation with a prepared summary. Review it before moving on. The old chat stays; the model’s context window is not made unlimited."), 'continuation-content'),
  ]},
  { id: 'ooc', title: copy('Вне игры и варианты ответа', 'Out of character and reply variants'), steps: [
    open('overview', copy('Откройте «Игру»', 'Open Play'), copy('Обычные действия и вопросы по умолчанию остаются игровыми.', 'Ordinary actions and questions are in-game by default.')),
    step(copy('Отделяйте пояснения от событий', 'Keep explanations separate from events'), copy('Для вопроса без изменения сцены используйте «Вне игры:» или OOC:. В мире можно отдельно включить правило: всё сообщение в [скобках] — вне игры, а скобки внутри хода — только пояснение.', 'For a question without scene changes, use “OOC:”. Each world can also enable a rule: a whole message in [brackets] is out of character, while brackets inside a turn are just a note.'), 'play-world'),
    step(copy("Выбирайте историю в чате", "Choose the story in the chat"), copy("Переключайте варианты ответа штатными стрелками под ответом. Подтверждённый внеигровой ответ не должен менять сцену или предлагать игровые варианты. Сохранённые ручные правки не становятся догадкой модели.", "Use the arrows below the reply to switch reply variants. A confirmed out-of-character reply should not change the scene or offer game choices. Saved manual edits are not model guesses."), 'page-overview'),
  ]},
  { id: 'images', title: copy('Иллюстрации — по желанию', 'Optional illustrations'), steps: [
    open('settings', copy('Откройте «Настройки»', 'Open Settings'), copy('Иллюстрации не нужны для работы памяти. Подключение настраивается отдельно.', 'Illustrations are not required for memory. Their connection is configured separately.')),
    step(copy('Откройте «Генерация изображений»', 'Open Image generation'), copy('Нажмите раздел «Генерация изображений». Не вводите ключ, если пока не планируете генерацию.', 'Click Image generation. You do not need to enter a key if you are not planning to generate images yet.'), 'settings-images', 'settings-images-content'),
    step(copy('Ваш API и его ограничения', 'Your API and its limits'), copy('Выберите сервис, модель и ключ. Генерация может быть платной по правилам сервиса. «Создать иллюстрацию» в чате готовит кадр; референсы помогают сохранить внешность. Ключ не нужен для обычной игры.', 'Choose a service, model and key. Generation may incur charges under the service’s rules. Create illustration in chat prepares a shot; references help preserve appearance. Ordinary play does not need this key.'), 'settings-images-content'),
  ]},
  { id: 'backups', title: copy('Резервные копии и защита данных', 'Backups and data protection'), steps: [
    open('settings', copy('Откройте «Настройки»', 'Open Settings'), copy(IS_DESKTOP ? 'Данные хранятся на этом устройстве. Сделайте резервную копию перед переносом.' : 'Данные хранятся в профиле браузера. Перед переустановкой или переносом нужна резервная копия.', IS_DESKTOP ? 'Data stays on this device. Make a backup before moving it.' : 'Data lives in the browser profile. Make a backup before reinstalling or moving it.')),
    step(copy('Откройте «Резервные копии и защита»', 'Open Backups and protection'), copy('Нажмите «Резервные копии и защита». Если сейчас открыт другой раздел, сначала вернитесь к оглавлению настроек.', 'Click Backups and protection. If another section is open, return to the settings directory first.'), 'settings-data', 'settings-data-content'),
    step(copy('Экспорт мира и полная копия — разные задачи', 'World export and full backup have different uses'), copy('Экспорт мира удобен для обмена лором. Полная резервная копия нужна для восстановления своих данных; её можно защитить паролем. Обучение не экспортирует, не восстанавливает и не удаляет данные за вас.', 'World export is useful for sharing lore. A full backup is for restoring your own data and can be password-protected. The guide does not export, restore or delete anything for you.'), 'settings-data-content'),
  ]},
  { id: 'advanced', title: copy('Удобство и редкие настройки', 'Comfort and occasional settings'), steps: [
    open('settings', copy('Откройте «Настройки»', 'Open Settings'), copy('Начните с удобства: внешний вид, панели, язык. Точный подбор памяти и диагностика нужны не каждому.', 'Start with comfort: appearance, panels and language. Not everyone needs retrieval tuning or diagnostics.')),
    step(copy('Сначала — обычные настройки', 'Start with everyday settings'), copy('Панели и портреты настраиваются под ваше окно. В дополнительных возможностях — персонажи и изображения. В защите отправки доступны правила безопасной отправки. Ни один раздел не запускает запрос сам по себе.', 'Adjust panels and portraits to fit your window. Optional features include characters and images. Sending protection contains safeguards. Opening a section does not send a request.'), 'settings-directory'),
    step(copy('Откройте расширенные настройки', 'Open advanced settings'), copy('Нажмите «Расширенные настройки». Они отделены от обычной игры намеренно: сначала попробуйте стандартный подбор памяти.', 'Expand Advanced settings. They are intentionally separate from ordinary play: try the default memory selection first.'), 'settings-advanced-toggle', 'settings-memory'),
    step(copy('Менять только при необходимости', 'Change only when needed'), copy('Точный подбор памяти меняет её отбор, но не размер окна модели. Диагностика помогает описать сбой; просмотр отчёта не повторяет запрос. Сброс игры и полная перестройка мира требуют отдельных подтверждений — не используйте их для обычного продолжения.', 'Retrieval tuning changes selection, not the model’s context size. Diagnostics help describe a failure; viewing a report does not retry it. Restarting play and rebuilding a world require separate confirmations—neither is for ordinary continuation.'), 'settings-memory'),
  ]},
] as const;
export type ChapterId = typeof learningChapters[number]['id'];
export interface LearningRun { chapter: ChapterId; step: number }
export interface LearningProgress { version: 1; welcomeStep: number; run: LearningRun | null; completed: ChapterId[] }
export const initialLearning = (): LearningProgress => ({ version: 1, welcomeStep: 0, run: null, completed: [] });
export function normalizeLearning(value: unknown): LearningProgress {
  const empty = initialLearning();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return empty;
  const input = value as Partial<LearningProgress>;
  if (input.version !== 1) return empty;
  const chapter = learningChapters.find(c => c.id === input.run?.chapter);
  return { version: 1, welcomeStep: Number.isInteger(input.welcomeStep) ? Math.max(0, Math.min(2, input.welcomeStep!)) : 0,
    run: chapter && Number.isInteger(input.run?.step) && input.run!.step >= 0 && input.run!.step < chapter.steps.length ? { chapter: chapter.id, step: input.run!.step } : null,
    completed: Array.isArray(input.completed) ? learningChapters.filter(c => input.completed!.includes(c.id)).map(c => c.id) : [] };
}
