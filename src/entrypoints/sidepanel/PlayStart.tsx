import { IS_DESKTOP } from "../../core/chat-host";
import { CHAT_HOME } from "../../core/chat-host";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { ArrowUpRight, BookOpen, ChevronDown, ChevronRight, FileUp, Globe2, Plus, SlidersHorizontal } from "lucide-react";
import type { Locale, WorldProfile } from "../../core/types";
import { experienceText } from "../../core/experience-i18n";
import { GameChatLink } from "../shared/GameChatLink";
import { menuText } from "../../core/menu-i18n";
import { storyAutomationText } from "../../core/story-automation-i18n";
import { savedMemoryText } from "../../core/saved-memory-continuation";

const ru = {
  openSite: (IS_DESKTOP ? "Откройте чат" : "Откройте чат DeepSeek"),
  offsite: (IS_DESKTOP ? "Подготовьте мир здесь, затем подключите его к игровой переписке." : "Здесь можно подготовить мир. Когда откроете DeepSeek, подключите его к чату."),
  goToSite: (IS_DESKTOP ? "Открыть чат" : "Открыть DeepSeek"),
  select: "Выберите мир для игры",
  firstWorld: "Добавьте мир для игры",
  firstWorldHint: "Мир хранит персонажей, места и правила, которые модель учитывает в игре.",
  selectHint: "Выберите мир из списка, чтобы подключить его к этому чату.",
  importWorld: experienceText("ru", "import"),
  importHint: "Выберите файл JSON и проверьте содержимое перед импортом.",
  addWorld: experienceText("ru", "create"),
  createHint: "Откроется редактор, где можно задать название и описание.",
  library: "Открыть библиотеку миров",
  chat: "Настроить мир и сцену",
  sceneHint: "Выбрать мир и персонажей для этого чата.",
  play: "Продолжайте историю в чате. Сведения о мире добавятся к реплике автоматически.",
  first: "Напишите первую реплику в чате.",
  queued: "Контекст подготовлен для первого сообщения в новом чате.",
  resume: "Продолжите сохранённую игру",
  resumeHint: "Подключите сохранённую игру, затем напишите первую реплику в чате.",
  unavailableHint: "Если переписка не открывается, игру можно продолжить из сохранённой памяти.",
  elsewhere: "Игра продолжается в другом чате.",
  openActive: "Открыть активный чат",
  memory: "Открыть память игры",
  saveMode: "Сохранение фактов",
  waiting: "Ждёт первой сцены",
  recording: "Запись сцен включена",
  disabled: "Запись сцен выключена",
  notReady: "Память будет доступна в игровом чате",
  reviewCount: "На проверке ({count})",
};
const en: Record<keyof typeof ru, string> = {
  openSite: (IS_DESKTOP ? "Open a chat" : "Open a DeepSeek chat"),
  offsite: (IS_DESKTOP ? "Prepare a world here, then connect it to a game chat." : "Prepare a world here, then open DeepSeek to connect it to your chat."),
  goToSite: (IS_DESKTOP ? "Open the chat" : "Open DeepSeek"),
  select: "Choose a world to play",
  firstWorld: "Add a world to play",
  firstWorldHint: "A world holds the characters, places and rules the model uses in your story.",
  selectHint: "Select a world from the list to connect it to this chat.",
  importWorld: experienceText("en", "import"),
  importHint: "Choose a JSON file and review its contents before importing.",
  addWorld: experienceText("en", "create"),
  createHint: "Open the editor to give your world a name and description.",
  library: "Open world library",
  chat: "Set up world and scene",
  sceneHint: "Choose the world and characters for this chat.",
  play: "Continue your story in the chat. DeepRole adds relevant world details to your message automatically.",
  first: "Write your first turn in the chat.",
  queued: "Context is ready for the first message in the new chat.",
  resume: "Continue your saved game",
  resumeHint: "Continue with the available game memory. You send the first message.",
  unavailableHint: "If the conversation won’t open, you can continue from saved game memory.",
  elsewhere: "The game continues in another chat.",
  openActive: "Open active chat",
  memory: "Open story memory",
  saveMode: "Saving facts",
  waiting: "Waiting for the first scene",
  recording: "Scene recording is active",
  disabled: "Scene recording is off",
  notReady: "Memory will be available in the game chat",
  reviewCount: "To review ({count})",
};
export const playStartText = (locale: Locale) => locale === "ru" ? ru : en;

export function PlayStart({ locale, world, hasWorlds, compatible, chatId, messageCount, pendingHandoff, savedMemoryQueued, savedMemoryAttempt, savedTransfer, controls, onStart, onLibrary, onMemory }: {
  locale: Locale;
  world?: WorldProfile;
  hasWorlds: boolean;
  compatible: boolean;
  chatId: string | null;
  messageCount: number;
  pendingHandoff: boolean;
  savedMemoryQueued?: boolean;
  savedMemoryAttempt?: import("../../core/saved-memory-continuation").SavedMemoryAttempt;
  savedTransfer?: ReactNode;
  controls: ReactNode;
  onStart: (kind: "import" | "create") => void;
  onLibrary: () => void;
  onMemory: () => void;
}) {
  const t = playStartText(locale);
  const actionId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const previousWorld = useRef(world?.id);
  useEffect(() => {
    if (world?.id && previousWorld.current !== world.id && document.activeElement === document.body) heading.current?.focus();
    previousWorld.current = world?.id;
  }, [world?.id]);
  useEffect(() => {
    if (savedMemoryQueued && document.activeElement === document.body) heading.current?.focus({ preventScroll: true });
  }, [savedMemoryQueued]);
  const automation = storyAutomationText(locale);
  const game = world?.sharedGame;
  const ready = pendingHandoff || savedMemoryQueued;
  const elsewhere = (!ready || savedMemoryAttempt === "movedGame") && !!chatId && !!game && game.activeChatId !== chatId;
  const recording = !!chatId && !!game?.managed && game.activeChatId === chatId;
  const mode = world?.storyAutomation?.mode;
  const waiting = !!mode && mode !== "off" && messageCount === 0;
  const reviews = chatId && game?.activeChatId === chatId ? game.pendingReviewIds?.length ?? 0 : 0;
  let memory = t.disabled;
  if (elsewhere) memory = t.elsewhere;
  else if (mode === "off") memory = automation.off;
  else if (!chatId) memory = waiting ? t.waiting : t.notReady;
  else if (recording) memory = mode ? automation[mode] : t.recording;
  else if (waiting) memory = t.waiting;

  const offsite = !compatible && !savedTransfer && !savedMemoryQueued;
  const title = offsite ? t.openSite : world?.name ?? (savedTransfer || savedMemoryQueued ? t.resume : hasWorlds ? t.select : t.firstWorld);
  const next = offsite ? t.offsite
    : savedMemoryAttempt ? savedMemoryText(locale)[savedMemoryAttempt]
    : savedMemoryQueued ? savedMemoryText(locale).queued
    : savedTransfer ? compatible ? t.resumeHint : t.unavailableHint
    : world ? elsewhere ? t.elsewhere : pendingHandoff ? t.queued : messageCount || recording ? t.play : t.first
    : hasWorlds ? t.selectHint : t.firstWorldHint;

  return <section className="play-world-card dr-play-start" data-dr-guide="play-world">
    <div className="dr-play-main">
      <header className="dr-play-heading">
        <span className="dr-play-symbol"><Globe2 size={22} aria-hidden="true"/></span>
        <div>
          <h2 ref={heading} tabIndex={-1}>{title}</h2>
          {compatible && world && chatId && !ready && !elsewhere && <p className="dr-play-connected">{menuText(locale, "attached")}</p>}
        </div>
      </header>
      <p role={savedMemoryQueued ? "status" : undefined}>{next}</p>
      {savedTransfer}
      {offsite ? <div className="dr-play-actions">
          <a className="button primary" href={CHAT_HOME} target="_blank" rel="noreferrer">{t.goToSite}<ArrowUpRight size={16} aria-hidden="true"/></a>
        <button className="button secondary" type="button" onClick={onLibrary}>{t.library}</button>
      </div> : compatible && !world && !savedMemoryQueued ? <>
        {hasWorlds && controls}
        <div className="dr-play-choices">
          {(["import", "create"] as const).map(kind => {
            const importing = kind === "import", Icon = importing ? FileUp : Plus;
            const label = `${actionId}-${kind}`;
            return <button key={kind} className="dr-play-choice" type="button" data-primary={importing && !hasWorlds && !savedTransfer}
              aria-labelledby={label} aria-describedby={label + "-hint"} onClick={() => onStart(kind)}>
              <Icon aria-hidden="true"/>
              <span className="dr-play-copy"><strong id={label}>{importing ? t.importWorld : t.addWorld}</strong>
                <small id={label + "-hint"}>{importing ? t.importHint : t.createHint}</small></span>
              <ChevronRight aria-hidden="true"/>
            </button>;
          })}
        </div>
      </> : elsewhere && game && <GameChatLink key={game.activeChatId} chatId={game.activeChatId} locale={locale}>{t.openActive}<ChevronRight size={16} aria-hidden="true"/></GameChatLink>}
    </div>
    {compatible && world && <>
      <button className="dr-play-memory" type="button" onClick={onMemory}>
        <BookOpen size={20} aria-hidden="true"/>
        <span className="dr-play-copy"><strong>{t.memory}</strong><small className="dr-play-memory-state" data-recording={recording && mode !== "off"}>{!elsewhere && (mode === "off" || recording && mode) && <>{t.saveMode}{": "}</>}<span>{memory}</span></small>{reviews > 0 && <span className="dr-play-review-count">{t.reviewCount.replace("{count}", String(reviews))}</span>}</span>
        <ChevronRight size={16} aria-hidden="true"/>
      </button>
      <details className="dr-play-scene">
        <summary><SlidersHorizontal aria-hidden="true"/><span className="dr-play-copy"><strong>{t.chat}</strong><small>{t.sceneHint}</small></span><ChevronDown className="dr-play-chevron" aria-hidden="true"/></summary>
        <div>{controls}<button className="button secondary" type="button" onClick={onLibrary}>{t.library}</button></div>
      </details>
    </>}
  </section>;
}
