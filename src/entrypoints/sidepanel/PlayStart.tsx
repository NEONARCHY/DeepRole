import { useEffect, useRef, type ReactNode } from "react";
import { ArrowUpRight, BookOpen, ChevronRight, Globe2, Plus, SlidersHorizontal, Upload } from "lucide-react";
import type { Locale, WorldProfile } from "../../core/types";
import { GameChatLink } from "../shared/GameChatLink";
import { menuText } from "../../core/menu-i18n";
import { storyAutomationText } from "../../core/story-automation-i18n";
import { savedMemoryText } from "../../core/saved-memory-continuation";

const ru = {
  openSite: "Откройте чат DeepSeek",
  offsite: "Здесь можно подготовить мир. Когда откроете DeepSeek, подключите его к чату.",
  goToSite: "Открыть DeepSeek",
  select: "Выберите мир для игры",
  firstWorld: "С чего начнётся история?",
  firstWorldHint: "Импортируйте готовый лор или создайте мир для своей истории.",
  selectHint: "Выбранный мир будет использоваться в открытом чате.",
  importWorld: "Импортировать мир",
  addWorld: "Создать мир",
  library: "Открыть библиотеку миров",
  chat: "Мир и сцена",
  play: "Пишите в DeepSeek как обычно. DeepRole подберёт лор к каждой реплике.",
  first: "Напишите первую реплику в DeepSeek.",
  queued: "Контекст подготовлен для первого сообщения в новом чате.",
  resume: "Продолжите сохранённую игру",
  resumeHint: "Игра продолжится с доступной памятью. Первую реплику отправишь сам.",
  elsewhere: "Игра продолжается в другом чате.",
  openActive: "Открыть активный чат",
  memory: "Память игры",
  waiting: "Ждёт первой сцены",
  recording: "Запись сцен включена",
  disabled: "Запись сцен выключена",
  notReady: "Память будет доступна в игровом чате",
  reviewCount: "На проверке ({count})",
};
const en: Record<keyof typeof ru, string> = {
  openSite: "Open a DeepSeek chat",
  offsite: "Prepare a world here, then open DeepSeek to connect it to your chat.",
  goToSite: "Open DeepSeek",
  select: "Choose a world to play",
  firstWorld: "Where does the story begin?",
  firstWorldHint: "Import existing lore or create a world for your story.",
  selectHint: "The selected world will be used in the open chat.",
  importWorld: "Import world",
  addWorld: "Create world",
  library: "Open world library",
  chat: "World and scene",
  play: "Write in DeepSeek as usual. DeepRole picks relevant lore for each turn.",
  first: "Write your first turn in DeepSeek.",
  queued: "Context is ready for the first message in the new chat.",
  resume: "Continue your saved game",
  resumeHint: "Continue with the available game memory. You send the first message.",
  elsewhere: "The game continues in another chat.",
  openActive: "Open active chat",
  memory: "Story memory",
  waiting: "Waiting for the first scene",
  recording: "Scene recording is active",
  disabled: "Scene recording is off",
  notReady: "Memory will be available in the game chat",
  reviewCount: "To review ({count})",
};
export const playStartText = (locale: Locale) => locale === "ru" ? ru : en;

export function PlayStart({ locale, world, hasWorlds, compatible, chatId, messageCount, pendingHandoff, savedMemoryQueued, savedTransfer, controls, onStart, onLibrary, onMemory }: {
  locale: Locale;
  world?: WorldProfile;
  hasWorlds: boolean;
  compatible: boolean;
  chatId: string | null;
  messageCount: number;
  pendingHandoff: boolean;
  savedMemoryQueued?: boolean;
  savedTransfer?: ReactNode;
  controls: ReactNode;
  onStart: (kind: "import" | "create") => void;
  onLibrary: () => void;
  onMemory: () => void;
}) {
  const t = playStartText(locale);
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
  const elsewhere = !ready && !!chatId && !!game && game.activeChatId !== chatId;
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
    : savedMemoryQueued ? savedMemoryText(locale).queued
    : savedTransfer ? t.resumeHint
    : world ? elsewhere ? t.elsewhere : pendingHandoff ? t.queued : messageCount ? t.play : t.first
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
        <a className="button primary" href="https://chat.deepseek.com/" target="_blank" rel="noreferrer">{t.goToSite}<ArrowUpRight size={16} aria-hidden="true"/></a>
        <button className="button secondary" type="button" onClick={onLibrary}>{t.library}</button>
      </div> : compatible && !world && !savedMemoryQueued ? <>
        {hasWorlds && controls}
        <div className="dr-play-actions">
          <button className={`button ${hasWorlds || savedTransfer ? "secondary" : "primary"}`} type="button" onClick={() => onStart("import")}><Upload size={17} aria-hidden="true"/>{t.importWorld}</button>
          <button className="button secondary" type="button" onClick={() => onStart("create")}><Plus size={17} aria-hidden="true"/>{t.addWorld}</button>
        </div>
      </> : elsewhere && game && <GameChatLink key={game.activeChatId} chatId={game.activeChatId} locale={locale}>{t.openActive}<ChevronRight size={16} aria-hidden="true"/></GameChatLink>}
    </div>
    {compatible && world && <>
      <button className="dr-play-memory" type="button" onClick={onMemory}>
        <BookOpen size={20} aria-hidden="true"/>
        <span><strong>{t.memory}</strong><span className="dr-play-memory-state" data-recording={recording && mode !== "off"}>{memory}</span>{reviews > 0 && <span className="dr-play-review-count">{t.reviewCount.replace("{count}", String(reviews))}</span>}</span>
        <ChevronRight size={16} aria-hidden="true"/>
      </button>
      <details className="dr-play-scene">
        <summary><SlidersHorizontal size={18} aria-hidden="true"/>{t.chat}<ChevronRight className="dr-play-chevron" size={16} aria-hidden="true"/></summary>
        <div>{controls}<button className="button secondary" type="button" onClick={onLibrary}>{menuText(locale, "browse")}</button></div>
      </details>
    </>}
  </section>;
}
