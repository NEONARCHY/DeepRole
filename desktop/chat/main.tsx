import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ArrowUp, BarChart3, BookOpen, BookOpenText, Check, ChevronLeft, ChevronRight, CircleAlert, Copy, Ellipsis, Gamepad2, KeyRound, MessageCircle, Moon, PanelLeft, PanelLeftClose, Pencil, Plus, RotateCcw, Square, Sun, X } from "lucide-react";
import content from "../../src/entrypoints/content";
import { getSettings } from "../../src/storage/settings";
import { storyReplyProse } from "../../src/core/story-update";
import { browser, desktop } from "../runtime/browser";
import { ProviderDialog, type ModelSettings } from "./ProviderDialog";
import { UsageDialog } from "./UsageDialog";
import { DialogueText } from "./DialogueText";
import { currencyName, type SpendingNotice } from "./SpendingSettings";
import { useComposerEffects } from "./message-effects";
import { activeChat, chatEndpoint, chatUrl, emptyChat, request, selectedLine, sendNative, type Chat, type ChatInfo, type Turn } from "./native";
import "./styles.css";
import "./play-tools.css";

const initialView = new URLSearchParams(location.search);
const worker = initialView.has("deeprole_cast_job") || initialView.has("deeprole_field_job");
const darkTheme = window.matchMedia("(prefers-color-scheme: dark)");
const wideHistory = window.matchMedia("(min-width: 751px)");
const historyPreference = "deeprole.desktop.historyCollapsed";
const gamePreference = "deeprole.desktop.gameCollapsed";
const ruErrors: Record<string, string> = {
  "model-unconfigured": "Настройте подключение текстовой модели.",
  "model-key-needed": "Добавьте ключ API в настройках модели.",
  "model-key-refused": "Провайдер отклонил ключ API.",
  "model-payment-required": "Провайдер просит пополнить баланс.",
  "model-limit": "Провайдер ограничил запросы. Черновик сохранён.",
  "model-context-limit": "Реплика и необходимые данные сцены не помещаются в окно модели. Черновик сохранён. Сократите реплику, уменьшите лимит ответа или выберите модель с большим окном.",
  "model-incomplete": "Ответ оборвался. Увеличьте лимит ответа или повторите ход.",
  "model-empty": "Модель не вернула текст ответа.",
  "chat-stale": "Чат изменился в другом окне. Откройте его заново.",
  "memory-blocked": "DeepRole приостановил отправку. Проверьте подсказку памяти.",
};
const enErrors: Record<string, string> = {
  "model-unconfigured": "Set up a text model connection.",
  "model-key-needed": "Add an API key in model settings.",
  "model-key-refused": "The provider rejected the API key.",
  "model-payment-required": "The provider requires additional credit.",
  "model-limit": "The provider limited requests. Your draft is still here.",
  "model-context-limit": "The turn and required scene data exceed the model window. Your draft is still here. Shorten it, lower the reply limit, or choose a larger model window.",
  "model-incomplete": "The reply was cut short. Increase the reply limit or try again.",
  "model-empty": "The model did not return reply text.",
  "chat-stale": "The chat changed in another window. Reopen it.",
  "memory-blocked": "DeepRole paused sending. Check the memory notice.",
};
const clipProse = (text: string) => storyReplyProse(text).replace(/<deeprole(?:_[a-z]*)?$/u, "");
const serviceDraft = (text: string) => text.trimStart().startsWith("[DeepRole Service]");

function Reply({ turn, partial, animate, service }: { turn: Turn; partial: boolean; animate: boolean; service: boolean }) {
  const text = partial ? clipProse(turn.text) : turn.text;
  return <>
    {!!turn.reasoning && <details className="ds-think-content desktop-reasoning"><summary>{document.documentElement.lang === "ru" ? "Размышления" : "Reasoning"}</summary><p>{turn.reasoning}</p></details>}
    <div className="ds-markdown desktop-story-text">{service ? text : <DialogueText text={text} animate={animate} protectTransport />}</div>
  </>;
}

function App() {
  const [locale, setLocale] = useState<"ru" | "en">(initialView.get("deeprole_cast_locale") === "en" || initialView.get("deeprole_field_locale") === "en" ? "en" : "ru");
  const ru = locale === "ru";
  const [chat, setChat] = useState(() => emptyChat(activeChat()));
  const [list, setList] = useState<ChatInfo[]>([]);
  const [loading, setLoading] = useState(!!activeChat());
  const [provider, setProvider] = useState<ModelSettings>();
  const [modelOpen, setModelOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [spending, setSpending] = useState<SpendingNotice[]>([]);
  const [libraryPhase, setLibraryPhase] = useState<"closed" | "open" | "closing">("closed");
  const [overlay, setOverlay] = useState<"history" | "game" | null>(null);
  const [historyDocked, setHistoryDocked] = useState(wideHistory.matches);
  const [gameDocked, setGameDocked] = useState(false);
  const [historyCollapsed, setHistoryCollapsed] = useState(() => localStorage.getItem(historyPreference) === "true");
  const [gameCollapsed, setGameCollapsed] = useState(() => localStorage.getItem(gamePreference) === "true");
  const [dark, setDark] = useState(darkTheme.matches);
  const [menu, setMenu] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [edit, setEdit] = useState<number>();
  const [pending, setPending] = useState<Turn[]>();
  const [copied, setCopied] = useState<number>();
  const composer = useRef<HTMLTextAreaElement>(null);
  const composerEffects = useComposerEffects(composer, !worker);
  const arrivingTurn = useRef<{ user: number; assistant: number } | undefined>(undefined);
  const viewport = useRef<HTMLDivElement>(null);
  const task = useRef<ReturnType<typeof sendNative> | undefined>(undefined);
  const follow = useRef(true);
  const box = useRef<HTMLFormElement>(null);
  const library = useRef<HTMLElement>(null);
  const libraryFrame = useRef<HTMLIFrameElement>(null);
  const chatFrame = useRef<HTMLElement>(null);
  const historyToggle = useRef<HTMLButtonElement>(null);
  const historyClose = useRef<HTMLButtonElement>(null);
  const panelsToggle = useRef<HTMLButtonElement>(null);
  const panelsClose = useRef<HTMLButtonElement>(null);
  const panelsShell = useRef<HTMLElement>(null);
  const libraryOpen = libraryPhase === "open";
  const setLibraryOpen = useCallback((open: boolean) => {
    if (open) setOverlay(null);
    setLibraryPhase(phase => open ? "open" : phase === "open" ? "closing" : phase);
  }, []);
  const overlayHistory = !historyDocked && overlay === "history";
  const overlayPanels = !gameDocked && overlay === "game";
  const historyOpen = worker || (historyDocked ? !historyCollapsed : overlayHistory);
  const panelsOpen = !worker && (gameDocked ? !gameCollapsed : overlayPanels);
  const historyLabel = historyOpen ? ru ? "Скрыть список чатов" : "Hide chats" : ru ? "Открыть список чатов" : "Open chats";
  const closeHistory = () => {
    if (historyDocked) setHistoryCollapsed(true);
    else setOverlay(null);
    setMenu(undefined);
    requestAnimationFrame(() => historyToggle.current?.focus());
  };
  const closePanels = useCallback(() => {
    if (gameDocked) setGameCollapsed(true);
    else setOverlay(null);
    panelsToggle.current?.focus();
  }, [gameDocked]);
  const providerNeeded = provider && !provider.hasKey && !provider.baseUrl.startsWith("http:");
  const line = selectedLine(chat);

  const refreshList = useCallback(async () => setList(await request<ChatInfo[]>("/__desktop/chats")), []);
  const refreshSpending = useCallback(() => {
    if (worker || document.visibilityState !== "visible") return;
    void request<SpendingNotice[]>("/__desktop/spending-notices", { method: "POST" }).then(notices => {
      if (notices.length) setSpending(previous => [...previous.filter(notice => !notices.some(next => next.type === notice.type)), ...notices]);
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (worker) return;
    refreshSpending();
    window.addEventListener("focus", refreshSpending);
    const timer = window.setInterval(refreshSpending, 60_000);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refreshSpending); };
  }, [refreshSpending]);
  const refreshSettings = useCallback(async () => {
    const settings = await getSettings();
    if (!worker) setLocale(settings.locale);
    document.documentElement.dataset.motion = settings.animationsEnabled === false ? "off" : "on";
  }, []);
  async function readChat(id?: string) {
    if (!id) { setChat(emptyChat()); return; }
    setChat(await request<Chat>(chatEndpoint("chat", id)));
  }
  useEffect(() => {
    void Promise.all([readChat(activeChat()), refreshList(), refreshSettings(), desktop.call<ModelSettings>("provider").then(setProvider)])
      .catch(() => setError("chat-unavailable")).finally(() => setLoading(false));
    const update = () => void refreshSettings().catch(() => undefined);
    const onMessage = (event: MessageEvent) => {
      if (event.source === libraryFrame.current?.contentWindow && event.origin === location.origin && event.data?.source === "deeprole-menu" && event.data?.type === "CLOSE") setLibraryOpen(false);
    };
    const onBridge = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.data?.source !== "deeprole-page-bridge") return;
      if (["PROMPT_LENGTH_BLOCKED", "CONTEXT_BLOCKED"].includes(event.data.type)) { task.current?.stop(); setError("memory-blocked"); }
    };
    browser.storage.onChanged.addListener(update);
    window.addEventListener("message", onMessage);
    window.addEventListener("message", onBridge);
    return () => { browser.storage.onChanged.removeListener(update); window.removeEventListener("message", onMessage); window.removeEventListener("message", onBridge); };
  }, [refreshList, refreshSettings, setLibraryOpen]);
  useEffect(() => {
    if (libraryPhase !== "closing") return;
    let cancelled = false;
    void Promise.allSettled(library.current?.getAnimations().map(animation => animation.finished) ?? []).then(() => {
      if (!cancelled) setLibraryPhase(phase => phase === "closing" ? "closed" : phase);
    });
    return () => { cancelled = true; };
  }, [libraryPhase]);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  useEffect(() => {
    const resize = () => setHistoryDocked(wideHistory.matches);
    const theme = () => setDark(darkTheme.matches);
    wideHistory.addEventListener("change", resize);
    darkTheme.addEventListener("change", theme);
    resize();
    theme();
    return () => {
      wideHistory.removeEventListener("change", resize);
      darkTheme.removeEventListener("change", theme);
    };
  }, []);
  useEffect(() => {
    if (!chatFrame.current || worker) return;
    // Leave about 620px for the chat even with the full game column.
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setGameDocked(entry.contentRect.width >= 904);
    });
    observer.observe(chatFrame.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setOverlay(current => (current === "history" && historyDocked) || (current === "game" && gameDocked) ? null : current);
  }, [historyDocked, gameDocked]);
  useEffect(() => { if (!worker) localStorage.setItem(historyPreference, String(historyCollapsed)); }, [historyCollapsed]);
  useEffect(() => { if (!worker) localStorage.setItem(gamePreference, String(gameCollapsed)); }, [gameCollapsed]);
  useEffect(() => { if (overlayHistory) historyClose.current?.focus(); }, [overlayHistory]);
  useEffect(() => {
    if (overlayPanels) panelsClose.current?.focus();
  }, [overlayPanels]);
  useEffect(() => {
    const panel = panelsShell.current;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) { event.stopPropagation(); closePanels(); }
    };
    panel?.addEventListener("keydown", escape);
    return () => panel?.removeEventListener("keydown", escape);
  }, [closePanels]);
  useEffect(() => {
    const openWorlds = () => setLibraryOpen(true);
    window.addEventListener("deeprole-desktop-open-library", openWorlds);
    return () => window.removeEventListener("deeprole-desktop-open-library", openWorlds);
  }, [setLibraryOpen]);
  useEffect(() => {
    if (!worker && !document.querySelector("deeprole-field-screen")) {
      document.title = chat.title ? `${chat.title} — DeepRole` : "DeepRole";
    }
  }, [chat.title]);
  useEffect(() => {
    if (follow.current && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [chat.head, pending, historyOpen, panelsOpen, libraryPhase, draft]);

  function updateDraft(value: string) {
    if (composer.current) {
      composer.current.value = value;
      composer.current.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
    setDraft(value);
  }

  function submit(text = composer.current?.value ?? "", edited = edit) {
    if (!text.trim() || task.current || loading) return;
    const id = chat.id || crypto.randomUUID();
    const original = chat.messages.find(message => message.id === edited);
    let frameTurns: Turn[] | undefined;
    let frameId = 0;
    const syncFrame = () => {
      frameId = 0;
      if (frameTurns) setPending(frameTurns.map(turn => ({ ...turn })));
    };
    setBusy(true); setError(""); follow.current = true;
    if (!activeChat()) {
      // Publish the empty local chat before the first request. The shared
      // controller can then bind the world and record the first turn at root.
      history.pushState(null, "", chatUrl(id));
      setChat(emptyChat(id));
    }
    const sent = sendNative(id, text, chat.head, edited, (name, payload) => {
      if (name === "ready" && payload.request_message_id && payload.response_message_id) {
        arrivingTurn.current = worker || serviceDraft(text) ? undefined : { user: payload.request_message_id, assistant: payload.response_message_id };
        frameTurns = [
          { id: payload.request_message_id, parent: original ? original.parent : chat.head, role: "user", text, visible: text },
          { id: payload.response_message_id, parent: payload.request_message_id, role: "assistant", text: "", visible: "", reasoning: "" },
        ];
        syncFrame();
      } else if (name === "delta" && frameTurns) {
        const reply = frameTurns[1]!;
        reply.text += payload.text ?? "";
        reply.reasoning += payload.reasoning ?? "";
        if (!frameId) frameId = requestAnimationFrame(syncFrame);
      }
    });
    task.current = sent;
    void sent.promise.then(async () => {
      await readChat(id);
      if (composer.current?.value === text) updateDraft("");
      setEdit(undefined);
      void refreshList().catch(() => undefined);
    }).catch(failure => {
      if (failure.message !== "model-stopped") setError(failure.message);
    }).finally(() => {
      if (frameId) cancelAnimationFrame(frameId);
      task.current = undefined;
      setPending(undefined); setBusy(false);
      refreshSpending();
    });
  }

  async function remove(id: string) {
    try {
      await request(chatEndpoint("chat", id), { method: "DELETE" });
      if (activeChat() === id) { history.replaceState(null, "", "/"); setChat(emptyChat()); updateDraft(""); }
      setConfirmDelete(undefined);
      await refreshList();
    } catch { setError("chat-unavailable"); }
  }
  async function choose(head: number) {
    try {
      setChat(await request<Chat>(chatEndpoint("select", chat.id), { method: "POST", body: JSON.stringify({ head }) }));
      setEdit(undefined); updateDraft("");
    } catch { setError("chat-unavailable"); }
  }
  function siblingReplies(turn: Turn) {
    const parent = chat.messages.find(message => message.id === turn.parent);
    const alternatives = new Set(chat.messages.filter(message => message.role === "user" && message.parent === parent?.parent && message.visible === parent?.visible).map(message => message.id));
    return chat.messages.filter(message => message.role === "assistant" && message.parent !== null && alternatives.has(message.parent));
  }
  const row = (turn: Turn, partial = false) => {
    const variants = !partial && turn.role === "assistant" ? siblingReplies(turn) : [];
    const position = variants.findIndex(message => message.id === turn.id);
    const previous = chat.messages.find(message => message.id === turn.parent && message.role === "user");
    const service = worker || serviceDraft(previous?.visible ?? pending?.[0]?.visible ?? "");
    return <article key={turn.id} data-role={turn.role} data-message-id={turn.id} data-streaming={partial || undefined} className={`desktop-message desktop-${turn.role}`}>
      {turn.role === "assistant" ? <>
        <div className="desktop-narrator"><span className="desktop-orb" />DeepRole</div>
        <Reply turn={turn} partial={partial} animate={arrivingTurn.current?.assistant === turn.id} service={service} />
      </> : <div className="desktop-message-bubble"><span className={arrivingTurn.current?.user === turn.id ? "desktop-text-reveal" : undefined}>{worker || serviceDraft(turn.visible) ? turn.visible : <DialogueText text={turn.visible} />}</span></div>}
      {!partial && <div className="desktop-message-actions" data-deeprole-ui>
        <button type="button" className="desktop-icon" aria-label={ru ? "Копировать" : "Copy"} onClick={() => void navigator.clipboard.writeText(turn.visible).then(() => setCopied(turn.id)).catch(() => undefined)}>{copied === turn.id ? <Check size={15} /> : <Copy size={15} />}</button>
        {turn.role === "user" && !serviceDraft(turn.visible) && <button type="button" className="desktop-icon" disabled={busy} aria-label={ru ? "Редактировать" : "Edit"} onClick={() => { setEdit(turn.id); updateDraft(turn.visible); composer.current?.focus(); }}><Pencil size={15} /></button>}
        {previous && !serviceDraft(previous.visible) && <button type="button" className="desktop-icon" disabled={busy} aria-label={ru ? "Другой ответ" : "Regenerate"} onClick={() => submit(previous.visible, previous.id)}><RotateCcw size={15} /></button>}
        {variants.length > 1 && <div className="desktop-variants">
          <button type="button" className="desktop-icon" aria-label={ru ? "Предыдущий ответ" : "Previous reply"} disabled={busy || position <= 0} onClick={() => void choose(variants[position - 1]!.id)}><ChevronLeft size={16} /></button>
          <span>{position + 1}/{variants.length}</span>
          <button type="button" className="desktop-icon" aria-label={ru ? "Следующий ответ" : "Next reply"} disabled={busy || position >= variants.length - 1} onClick={() => void choose(variants[position + 1]!.id)}><ChevronRight size={16} /></button>
        </div>}
      </div>}
    </article>;
  };
  const parent = pending?.[0]?.parent;
  const visibleLine = parent === undefined ? line : line.slice(0, line.findIndex(message => message.id === parent) + 1);
  return <div className={`desktop-app${worker ? " desktop-worker" : ""}`} data-library-open={libraryPhase !== "closed"}
    data-history-docked={historyDocked && historyOpen} data-overlay={overlayHistory ? "history" : overlayPanels ? "game" : undefined}>
    <div className="desktop-window-caption" aria-hidden="true">
      <span>{chat.title ? `${chat.title} — DeepRole` : "DeepRole"}</span>
    </div>
    {overlayHistory && <div className="desktop-panel-shade desktop-history-shade" aria-hidden="true" onClick={closeHistory} />}
    <aside id="desktop-chat-history" className="desktop-sidebar" hidden={!historyOpen} aria-label={ru ? "Чаты" : "Chats"} onKeyDown={event => {
      if (event.key === "Escape" && !event.defaultPrevented && !worker) { event.stopPropagation(); closeHistory(); }
    }}>
      <div className="desktop-brand">
        <span className="desktop-mark"><BookOpenText size={18} aria-hidden="true" /></span><strong>DeepRole</strong>
        {!worker && <button ref={historyClose} type="button" className="desktop-icon" aria-label={ru ? "Закрыть панель чатов" : "Close chat sidebar"} title={ru ? "Закрыть панель чатов" : "Close chat sidebar"} onClick={closeHistory}>
          {historyDocked ? <PanelLeftClose size={17} aria-hidden="true" /> : <X size={17} aria-hidden="true" />}
        </button>}
      </div>
      <nav aria-label={ru ? "История чатов" : "Chat history"}>
        <div className="desktop-history-heading">
          <h2>{ru ? "Чаты" : "Chats"}</h2>
          <a href="/" className="dr-round-action" aria-label={ru ? "Новый чат" : "New chat"} title={ru ? "Новый чат" : "New chat"} aria-disabled={busy || undefined} onClick={event => { if (busy) event.preventDefault(); }}><Plus size={17} aria-hidden="true" /></a>
        </div>
        {list.length === 0 && <p>{ru ? "Здесь появятся ваши истории" : "Your stories appear here"}</p>}
        {list.map(item => <div className="desktop-chat-link" key={item.id} data-current={item.id === activeChat()}>
          <a href={chatUrl(item.id)} aria-current={item.id === activeChat() ? "page" : undefined} onClick={event => { if (busy) event.preventDefault(); }}><MessageCircle size={15} /><span>{item.title}</span></a>
          <button type="button" className="desktop-icon" title={ru ? "Действия чата" : "Chat options"} aria-label={ru ? "Действия чата" : "Chat options"} aria-haspopup="menu" aria-expanded={menu === item.id} onClick={() => setMenu(menu === item.id ? undefined : item.id)}><Ellipsis size={17} /></button>
          {menu === item.id && <div role="menu" className="desktop-chat-menu"><button role="menuitem" type="button" disabled={busy} onClick={() => { setMenu(undefined); setConfirmDelete(item.id); }}>{ru ? "Удалить чат" : "Delete chat"}</button></div>}
        </div>)}
      </nav>
      <button type="button" className="desktop-sidebar-link" aria-haspopup="dialog" onClick={() => { setOverlay(null); setUsageOpen(true); }}><BarChart3 size={18} />{ru ? "Расходы" : "Usage"}</button>
      <button type="button" className="desktop-sidebar-link" aria-expanded={libraryOpen} onClick={() => setLibraryOpen(!libraryOpen)}><BookOpen size={18} />{ru ? "Библиотека и настройки" : "Library and settings"}</button>
    </aside>
    <main ref={chatFrame} className="desktop-main desktop-frame" data-game-docked={gameDocked} inert={overlayHistory}>
      <header className="desktop-header">
        {!worker && <button ref={historyToggle} type="button" className="desktop-icon desktop-panel-toggle" aria-expanded={historyOpen} aria-controls="desktop-chat-history"
          aria-label={historyLabel} title={historyLabel} onClick={() => {
            if (historyOpen) closeHistory();
            else if (historyDocked) setHistoryCollapsed(false);
            else { setLibraryOpen(false); setOverlay("history"); }
          }}><PanelLeft size={17} aria-hidden="true" /></button>}
        <h1>{chat.title || (ru ? "Новая история" : "New story")}</h1>
        <button type="button" className="desktop-model" disabled={!provider || busy} onClick={() => setModelOpen(true)}>{providerNeeded || !provider ? <KeyRound size={15} /> : <span className="desktop-model-dot" aria-hidden="true" />}<span>{providerNeeded || !provider ? ru ? "Подключить модель" : "Connect a model" : provider.model}</span></button>
        {!worker && <div className="desktop-header-tools">
          <button ref={panelsToggle} type="button" className="desktop-icon desktop-panel-toggle" aria-expanded={panelsOpen} aria-controls="desktop-play-tools" aria-label={ru ? "Игровые панели" : "Game panels"} title={ru ? "Игровые панели" : "Game panels"} onClick={() => {
            if (panelsOpen) closePanels();
            else if (gameDocked) setGameCollapsed(false);
            else {
              if (library.current && getComputedStyle(library.current).position === "fixed") setLibraryOpen(false);
              setOverlay("game");
            }
          }}><Gamepad2 size={17} aria-hidden="true" /></button>
          <button type="button" className="desktop-icon desktop-theme" aria-label={dark ? ru ? "Светлая тема" : "Light theme" : ru ? "Тёмная тема" : "Dark theme"} onClick={() => void desktop.call("setTheme", dark ? "light" : "dark").catch(() => undefined)}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
        </div>}
      </header>
      {overlayPanels && <div className="desktop-panel-shade desktop-game-shade" aria-hidden="true" onClick={closePanels} />}
      {!worker && <aside ref={panelsShell} id="desktop-play-tools" className="desktop-play-tools" aria-labelledby="desktop-play-tools-title" data-deeprole-ui hidden={!panelsOpen}>
        <header className="desktop-play-tools-heading">
          <h2 id="desktop-play-tools-title">{ru ? "Игра" : "Game"}</h2>
          <button ref={panelsClose} type="button" className="desktop-icon" aria-label={ru ? "Скрыть панель игры" : "Hide game panel"} onClick={closePanels}><X size={16} aria-hidden="true" /></button>
        </header>
        <div id="desktop-play-tools-content" />
        {chat.lastContext && <div className="desktop-context-reading">
          <strong>{ru ? "Последний запрос" : "Last request"}</strong>
          <span>{ru ? "Вход" : "Input"} {chat.lastContext.input === undefined ? "≈" : ""}{(chat.lastContext.input ?? chat.lastContext.estimatedInput).toLocaleString(locale)}
            {chat.lastContext.output !== undefined && ` · ${ru ? "Ответ" : "Reply"} ${chat.lastContext.output.toLocaleString(locale)}`}</span>
          <span>{ru ? "Окно" : "Window"} {chat.lastContext.windowSource === "fallback" ? "≈" : ""}{chat.lastContext.window.toLocaleString(locale)}</span>
          {chat.contextCheckpoint && <span>{ru ? "Слепок сохранён" : "Checkpoint saved"} · {new Date(chat.contextCheckpoint.at).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })}</span>}
        </div>}
      </aside>}
      <div className="desktop-viewport" ref={viewport} inert={overlayPanels} onScroll={event => {
        const view = event.currentTarget;
        follow.current = view.scrollHeight - view.scrollTop - view.clientHeight < 80;
      }}>
        <div className="desktop-transcript">
          {!line.length && !pending && !loading && <div className="desktop-empty">
            <span className="desktop-emblem"><BookOpenText size={30} strokeWidth={1.55} /></span>
            <h2>{ru ? "С чего начнётся история?" : "Where does the story begin?"}</h2>
            <p>{ru ? "Выберите мир в библиотеке или напишите первую реплику." : "Choose a world in the library or write your first turn."}</p>
            <button type="button" onClick={() => setLibraryOpen(true)}><BookOpen size={16} />{ru ? "Открыть библиотеку" : "Open library"}</button>
          </div>}
           {visibleLine.concat(pending ?? []).map((turn, index) => row(turn, index >= visibleLine.length))}
        </div>
      </div>
      <div className="desktop-composer-area" inert={overlayPanels}>
        {spending.map(notice => <div role="status" className="desktop-budget-notice dr-inline-feedback" data-tone="warning" key={notice.type}>
          <CircleAlert className="dr-feedback-icon" aria-hidden="true" />
          <span>{notice.type === "weekly"
            ? ru ? `Недельный бюджет: ${notice.estimated ? "≈" : ""}${notice.spent.toLocaleString(locale, { maximumFractionDigits: 8 })} из ${notice.threshold} USD.`
              : `Weekly budget: ${notice.estimated ? "≈" : ""}${notice.spent.toLocaleString(locale, { maximumFractionDigits: 8 })} of ${notice.threshold} USD.`
            : ru ? `Низкий баланс Venice: ${notice.amount.toLocaleString(locale)} ${currencyName(notice.currency, ru)}.`
              : `Low Venice balance: ${notice.amount.toLocaleString(locale)} ${currencyName(notice.currency, ru)}.`}</span>
          <button type="button" className="desktop-icon" aria-label={ru ? "Закрыть уведомление" : "Dismiss notice"}
            onClick={() => setSpending(previous => previous.filter(value => value.type !== notice.type))}><X size={15} /></button>
        </div>)}
        {error && <div role="alert" className="desktop-error dr-inline-feedback" data-tone="warning">
          <CircleAlert className="dr-feedback-icon" aria-hidden="true" />
          <span>{(ru ? ruErrors : enErrors)[error] ?? (ru ? "Не удалось завершить запрос. Черновик остался в поле." : "The request could not finish. Your draft is still here.")}</span>
          <button className="desktop-icon" type="button" aria-label={ru ? "Закрыть сообщение" : "Dismiss"} onClick={() => setError("")}><X size={16} aria-hidden="true" /></button>
        </div>}
        <form ref={box} className="desktop-composer" onSubmit={event => { event.preventDefault(); submit(); }}>
          {edit !== undefined && <div className="desktop-edit"><span>{ru ? "Редактирование хода" : "Editing turn"}</span><button className="desktop-icon" type="button" aria-label={ru ? "Отменить редактирование" : "Cancel edit"} onClick={() => { setEdit(undefined); updateDraft(""); }}><X size={15} /></button></div>}
           <div className="desktop-editor">
             <textarea ref={composer} rows={2} aria-label={ru ? "Ваша реплика" : "Your message"} placeholder={ru ? "Напишите реплику или действие…" : "Write dialogue or an action…"} onInput={event => setDraft(event.currentTarget.value)} onKeyDown={event => {
               if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); box.current?.requestSubmit(); }
             }} />
             {composerEffects}
           </div>
          <div className="desktop-composer-controls">
            <button type="button" className="desktop-icon" aria-label={ru ? "Открыть библиотеку" : "Open library"} onClick={() => setLibraryOpen(!libraryOpen)}><BookOpen size={17} /></button>
            <span className="desktop-composer-hint"><kbd>Shift</kbd> + <kbd>Enter</kbd> {ru ? "новая строка" : "new line"}</span>
            {busy ? <button className="desktop-send" type="button" data-testid="stop-generation" aria-label={ru ? "Остановить ответ" : "Stop generation"} onClick={() => task.current?.stop()}><Square size={15} /></button>
              : <button className="desktop-send desktop-primary" type="submit" aria-label={ru ? "Отправить" : "Send"} disabled={loading || !draft.trim()}><ArrowUp size={19} /></button>}
          </div>
        </form>
      </div>
    </main>
    {libraryPhase !== "closed" && <aside ref={library} className="desktop-library" data-state={libraryPhase} inert={!libraryOpen} aria-label={ru ? "Библиотека DeepRole" : "DeepRole library"}><iframe ref={libraryFrame} src="/sidepanel.html?embedded=1" title={ru ? "Библиотека DeepRole" : "DeepRole library"} /></aside>}
    {modelOpen && provider && <ProviderDialog locale={locale} value={provider} onClose={() => setModelOpen(false)} onSave={next => { setProvider(next); setModelOpen(false); setError(""); }} />}
    {usageOpen && <UsageDialog locale={locale} chatId={chat.id} onClose={() => setUsageOpen(false)} onSpendingChange={refreshSpending} />}
    {confirmDelete && <div className="desktop-backdrop"><section role="dialog" aria-modal="true" className="desktop-dialog">
      <header><h2>{ru ? "Удалить чат?" : "Delete chat?"}</h2></header><p>{ru ? "Переписка будет удалена с этого устройства. Лор мира сохранится." : "The conversation will be removed from this device. World lore stays saved."}</p>
      <footer><button type="button" onClick={() => setConfirmDelete(undefined)}>{ru ? "Отмена" : "Cancel"}</button><button type="button" className="desktop-danger" onClick={() => void remove(confirmDelete)}>{ru ? "Удалить чат" : "Delete chat"}</button></footer>
    </section></div>}
  </div>;
}

const root = createRoot(document.getElementById("root")!);
flushSync(() => root.render(<App />));
const listeners: Array<() => void> = [];
void content.main({ onInvalidated: (listener: () => void) => { listeners.push(listener); } } as unknown as NonNullable<Parameters<typeof content.main>[0]>);
window.addEventListener("pagehide", () => listeners.forEach(listener => listener()), { once: true });
