import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ArrowDown, ArrowUp, BarChart3, BookOpen, BookOpenText, Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Copy, Ellipsis, Gamepad2, KeyRound, LoaderCircle, Moon, PanelLeft, Pencil, Plus, RotateCcw, Settings2, Square, Sun, X } from "lucide-react";
import content from "../../src/entrypoints/content";
import { getSettings } from "../../src/storage/settings";
import { storyReplyProse } from "../../src/core/story-update";
import { browser, desktop } from "../runtime/browser";
import { ProviderDialog, type ModelSettings } from "./ProviderDialog";
import { UsageDialog } from "./UsageDialog";
import { DialogueText, replyFormatting } from "./DialogueText";
import { currencyName, type SpendingNotice } from "./SpendingSettings";
import { useComposerEffects } from "./message-effects";
import { animateDock, useNativeDialog } from "./motion";
import { activeChat, chatEndpoint, chatUrl, emptyChat, request, chatTranscript, sendNative, type Chat, type ChatInfo, type Turn } from "./native";
import "./styles.css";
import "./play-tools.css";

const initialView = new URLSearchParams(location.search);
const worker = initialView.has("deeprole_cast_job") || initialView.has("deeprole_field_job");
const darkTheme = window.matchMedia("(prefers-color-scheme: dark)");
const wideHistory = window.matchMedia("(min-width: 751px)");
const readingWidth = 720;
// The reading column stays centered. A panel uses its side only if the gutter
// can fit its minimum width and the space next to the reading column.
function panelRoom(frameWidth: number) {
  const gutter = (frameWidth - readingWidth) / 2;
  return { game: gutter >= 224, library: gutter >= 336 };
}

function firstVisibleTurn(transcript: HTMLElement, top: number) {
  const turns = transcript.children;
  let start = 0;
  let end = turns.length;
  while (start < end) {
    const middle = Math.floor((start + end) / 2);
    if (turns[middle]!.getBoundingClientRect().bottom <= top + 1) start = middle + 1;
    else end = middle;
  }
  return turns.item(start);
}
const historyPreference = "deeprole.desktop.historyCollapsed";
const gamePreference = "deeprole.desktop.gameCollapsed";
const requestDuration = (ms: number, locale: string) => ms < 1000
  ? ms.toLocaleString(locale, { style: "unit", unit: "millisecond" })
  : (ms / 1000).toLocaleString(locale, { style: "unit", unit: "second", maximumFractionDigits: 2 });
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
const distanceToLatest = (view: HTMLElement) => view.scrollHeight - view.scrollTop - view.clientHeight;
const followDistance = 80;
type ComposerDraft = { text: string; edited?: number; errorCode?: string };
type ComposerEdit = { turnId: number; nextDraft: string };
const messageActions = {
  ru: { copy: "Копировать", copied: "Скопировано", copyFailed: "Не удалось скопировать", edit: "Редактировать", regenerate: "Другой ответ", previous: "Предыдущий ответ", next: "Следующий ответ" },
  en: { copy: "Copy", copied: "Copied", copyFailed: "Could not copy", edit: "Edit", regenerate: "Regenerate", previous: "Previous reply", next: "Next reply" },
};
const replyStatusText = {
  ru: { waiting: "Ждём ответ", reasoning: "Модель размышляет", receiving: "Получаем ответ", stopping: "Останавливаем ответ", stop: "Остановить ответ" },
  en: { waiting: "Waiting for reply", reasoning: "Model is reasoning", receiving: "Receiving reply", stopping: "Stopping reply", stop: "Stop generation" },
};

function Reply({ turn, partial, animate, service, formatting }: {
  turn: Turn; partial: boolean; animate: boolean; service: boolean; formatting: ReturnType<typeof replyFormatting>;
}) {
  const text = partial ? clipProse(turn.text) : turn.text;
  return <>
    {!!turn.reasoning && <details className="ds-think-content desktop-reasoning"><summary>{document.documentElement.lang === "ru" ? "Размышления" : "Reasoning"}</summary><p>{turn.reasoning}</p></details>}
    <div className="ds-markdown desktop-story-text">{service ? text : <DialogueText text={text} animate={animate} story formatting={formatting} />}</div>
  </>;
}

function DeleteChatDialog({ ru, onCancel, onDelete }: { ru: boolean; onCancel: () => void; onDelete: () => Promise<boolean> }) {
  const { modal, dismiss } = useNativeDialog();
  const [deleting, setDeleting] = useState(false);
  const cancel = () => { if (!deleting) dismiss(onCancel); };
  async function confirm() {
    setDeleting(true);
    if (await onDelete()) dismiss(onCancel);
    else setDeleting(false);
  }
  return <dialog ref={modal} className="desktop-dialog" data-window-motion aria-labelledby="desktop-delete-title"
    onCancel={event => { event.preventDefault(); cancel(); }}>
    <header><h2 id="desktop-delete-title">{ru ? "Удалить чат?" : "Delete chat?"}</h2></header>
    <p>{ru ? "Переписка будет удалена с этого устройства. Лор мира сохранится." : "The conversation will be removed from this device. World lore stays saved."}</p>
    <footer><button type="button" disabled={deleting} onClick={cancel}>{ru ? "Отмена" : "Cancel"}</button><button type="button" disabled={deleting} className="desktop-danger" onClick={() => void confirm()}>{ru ? "Удалить чат" : "Delete chat"}</button></footer>
  </dialog>;
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
  const [libraryEntry, setLibraryEntry] = useState<"library" | "settings" | "worlds">("library");
  const [overlay, setOverlay] = useState<"history" | "game" | null>(null);
  const [historyDocked, setHistoryDocked] = useState(wideHistory.matches);
  const [sidePanels, setSidePanels] = useState(() => panelRoom(0));
  const { game: gameDocked, library: libraryDocked } = sidePanels;
  const [historyCollapsed, setHistoryCollapsed] = useState(() => localStorage.getItem(historyPreference) === "true");
  const [gameCollapsed, setGameCollapsed] = useState(() => localStorage.getItem(gamePreference) === "true");
  const [dark, setDark] = useState(darkTheme.matches);
  const [menu, setMenu] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState<string>();
  const [error, setError] = useState("");
  const [requestKind, setRequestKind] = useState<"story" | "service">();
  const [stopping, setStopping] = useState(false);
  const busy = requestKind !== undefined;
  const [draft, setDraft] = useState("");
  const [edit, setEdit] = useState<ComposerEdit>();
  const [pending, setPending] = useState<Turn[]>();
  const [outgoingText, setOutgoingText] = useState("");
  const [unsent, setUnsent] = useState<ComposerDraft[]>([]);
  const [copyFeedback, setCopyFeedback] = useState<{ chatId: string; turnId: number; result: "copied" | "copyFailed" }>();
  const [readingHistory, setReadingHistory] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const modelOpener = useRef<HTMLElement | null>(null);
  const composerEffects = useComposerEffects(composer, !worker);
  const arrivingTurn = useRef<{ user: number; assistant: number } | undefined>(undefined);
  const viewport = useRef<HTMLDivElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const task = useRef<ReturnType<typeof sendNative> | undefined>(undefined);
  const selectingReply = useRef(false);
  const follow = useRef(true);
  const box = useRef<HTMLFormElement>(null);
  const library = useRef<HTMLElement>(null);
  const libraryFrame = useRef<HTMLIFrameElement>(null);
  const libraryOpener = useRef<HTMLButtonElement>(null);
  const libraryIntent = useRef<{ open: boolean; entry: "library" | "settings" | "worlds" }>({ open: false, entry: "library" });
  const chatFrame = useRef<HTMLElement>(null);
  const historyToggle = useRef<HTMLButtonElement>(null);
  const historyClose = useRef<HTMLButtonElement>(null);
  const chatMenuTrigger = useRef<HTMLButtonElement>(null);
  const panelsToggle = useRef<HTMLButtonElement>(null);
  const panelsClose = useRef<HTMLButtonElement>(null);
  const panelsShell = useRef<HTMLElement>(null);
  const measureSidePanels = useCallback((width: number) => {
    const next = panelRoom(width);
    setSidePanels(old => old.game === next.game && old.library === next.library ? old : next);
  }, []);
  const changeDock = useCallback((update: () => void) => animateDock(() => {
    const view = viewport.current;
    const top = view?.getBoundingClientRect().top ?? 0;
    const anchor = !follow.current && view && transcript.current
      ? firstVisibleTurn(transcript.current, top) : undefined;
    const before = anchor?.getBoundingClientRect().top;
    flushSync(update);
    const frame = chatFrame.current;
    if (frame && !worker) flushSync(() => measureSidePanels(frame.clientWidth));
    if (view && follow.current) view.scrollTop = view.scrollHeight;
    else if (view && anchor?.isConnected && before !== undefined) view.scrollTop += anchor.getBoundingClientRect().top - before;
  }), [measureSidePanels]);
  const libraryOpen = libraryPhase === "open";
  const libraryOverlay = libraryOpen && !libraryDocked;
  const setLibraryOpen = useCallback((open: boolean, entry = libraryIntent.current.entry) => {
    libraryIntent.current = { open, entry };
    if (open) {
      setOverlay(null);
      setLibraryEntry(entry);
    }
    setLibraryPhase(phase => open ? "open" : phase === "open" ? "closing" : phase);
  }, []);
  const closeLibrary = useCallback(() => {
    setLibraryOpen(false);
    requestAnimationFrame(() => {
      const opener = libraryOpener.current;
      if (opener?.getClientRects().length && !opener.closest("[inert]")) opener.focus({ preventScroll: true });
      else if (opener?.closest("#desktop-play-tools")) panelsToggle.current?.focus({ preventScroll: true });
      else historyToggle.current?.focus({ preventScroll: true });
    });
  }, [setLibraryOpen]);
  function openLibrary(entry: "library" | "settings", opener: HTMLButtonElement) {
    const { open, entry: target } = libraryIntent.current;
    if (open && (target === "settings") === (entry === "settings")) { closeLibrary(); return; }
    libraryOpener.current = opener;
    setLibraryOpen(true, entry);
  }
  const overlayHistory = !historyDocked && overlay === "history";
  const overlayPanels = !gameDocked && overlay === "game";
  const historyOpen = worker || (historyDocked ? !historyCollapsed : overlayHistory);
  const panelsOpen = !worker && (gameDocked ? !gameCollapsed : overlayPanels);
  useEffect(() => {
    window.dispatchEvent(new Event("deeprole-layout-change"));
  }, [panelsOpen, gameDocked, libraryOpen, libraryDocked]);
  const historyLabel = historyOpen ? ru ? "Скрыть список чатов" : "Hide chats" : ru ? "Открыть список чатов" : "Open chats";
  const closeHistory = () => {
    if (historyDocked) changeDock(() => setHistoryCollapsed(true));
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
  const modelConfigured = !!provider && !providerNeeded;
  const style = provider?.replyStyle ?? "";
  const formatting = useMemo(() => replyFormatting(style), [style]);
  const { line, byId, variants: replyVariants } = useMemo(() => chatTranscript(chat), [chat]);
  const actions = messageActions[locale];
  const currentCopy = copyFeedback?.chatId === chat.id ? copyFeedback : undefined;
  const setFollowing = useCallback((next: boolean) => {
    if (follow.current === next) return;
    follow.current = next;
    setReadingHistory(!next);
  }, []);

  function jumpToLatest() {
    setFollowing(true);
    const view = viewport.current;
    if (view && distanceToLatest(view) > 1) view.scrollTop = view.scrollHeight;
  }

  function openModel(opener: HTMLElement | null) {
    if (!provider || busy) return;
    modelOpener.current = opener;
    setModelOpen(true);
  }

  function closeModel(saved?: ModelSettings) {
    if (saved) {
      setProvider(saved);
      setError("");
    }
    setModelOpen(false);
    requestAnimationFrame(() => {
      const opener = modelOpener.current;
      const focus = saved && providerNeeded ? composer.current : opener?.isConnected ? opener : composer.current;
      focus?.focus({ preventScroll: true });
    });
  }

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
      if (event.source !== libraryFrame.current?.contentWindow || event.origin !== location.origin || event.data?.source !== "deeprole-menu") return;
      if (event.data.type === "CLOSE") closeLibrary();
      if (event.data.type === "MODEL_SETTINGS") {
        modelOpener.current = libraryFrame.current;
        setModelOpen(true);
      }
      if (event.data.type === "USAGE") setUsageOpen(true);
    };
    const onBridge = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.data?.source !== "deeprole-page-bridge") return;
      if (["PROMPT_LENGTH_BLOCKED", "CONTEXT_BLOCKED"].includes(event.data.type)) { task.current?.stop(); setError("memory-blocked"); }
    };
    browser.storage.onChanged.addListener(update);
    window.addEventListener("message", onMessage);
    window.addEventListener("message", onBridge);
    return () => { browser.storage.onChanged.removeListener(update); window.removeEventListener("message", onMessage); window.removeEventListener("message", onBridge); };
  }, [refreshList, refreshSettings, closeLibrary]);
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
    const observer = new ResizeObserver(([entry]) => {
      if (entry) measureSidePanels(entry.contentRect.width);
    });
    observer.observe(chatFrame.current);
    return () => observer.disconnect();
  }, [measureSidePanels]);
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
    const openWorlds = (event: Event) => {
      libraryOpener.current = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
      setLibraryOpen(true, event instanceof CustomEvent && event.detail === "worlds" ? "worlds" : "library");
    };
    window.addEventListener("deeprole-desktop-open-library", openWorlds);
    return () => window.removeEventListener("deeprole-desktop-open-library", openWorlds);
  }, [setLibraryOpen]);
  useEffect(() => {
    if (!worker && !document.querySelector("deeprole-field-screen")) {
      document.title = chat.title ? `${chat.title} — DeepRole` : "DeepRole";
    }
  }, [chat.title]);
  useEffect(() => {
    const view = viewport.current;
    const text = transcript.current;
    if (!view || !text) return;
    const update = () => {
      const distance = distanceToLatest(view);
      if (follow.current && distance > 1) view.scrollTop = view.scrollHeight;
      else if (distance < followDistance) setFollowing(true);
    };
    const observer = new ResizeObserver(update);
    observer.observe(view);
    observer.observe(text);
    update();
    return () => observer.disconnect();
  }, [setFollowing]);
  useEffect(() => {
    if (!copyFeedback) return;
    const timeout = window.setTimeout(() => setCopyFeedback(undefined), 2200);
    return () => window.clearTimeout(timeout);
  }, [copyFeedback]);

  function updateDraft(value: string) {
    if (composer.current) {
      composer.current.value = value;
      composer.current.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
    setDraft(value);
  }

  function beginEdit(turn: Turn) {
    if (selectingReply.current || task.current) return;
    if (edit?.turnId !== turn.id) {
      const current = composer.current?.value ?? draft;
      if (edit && current.trim() && current !== byId.get(edit.turnId)?.visible) {
        setUnsent(previous => [...previous, { text: current, edited: edit.turnId }]);
      }
      setEdit({ turnId: turn.id, nextDraft: edit?.nextDraft ?? current });
      updateDraft(turn.visible);
    }
    composer.current?.focus();
  }

  function cancelEdit() {
    if (!edit || selectingReply.current) return;
    setEdit(undefined);
    updateDraft(edit.nextDraft);
    composer.current?.focus();
  }

  const queuedDraft = unsent[0];
  const canRestoreDraft = !busy && (!draft || (!edit && queuedDraft?.edited !== undefined));
  function recoverDraft(queued: ComposerDraft) {
    if (selectingReply.current) return;
    if (!canRestoreDraft) {
      void navigator.clipboard.writeText(queued.text).catch(() => undefined);
      return;
    }
    setEdit(queued.edited === undefined ? undefined : { turnId: queued.edited, nextDraft: composer.current?.value ?? draft });
    updateDraft(queued.text);
    setUnsent(previous => previous.slice(1));
    if (queued.errorCode) setError(current => current === queued.errorCode ? "" : current);
    composer.current?.focus();
  }

  function submit(text: string, edited: number | undefined, fromComposer = false) {
    if (!text.trim() || task.current || selectingReply.current || loading) return;
    const service = worker || serviceDraft(text);
    if (!service && !modelConfigured) {
      openModel(fromComposer ? composer.current : document.activeElement as HTMLElement | null);
      return;
    }
    const id = chat.id || crypto.randomUUID();
    const original = edited === undefined ? undefined : byId.get(edited);
    let frameTurns: Turn[] | undefined;
    let frameId = 0;
    const syncFrame = () => {
      frameId = 0;
      if (frameTurns) setPending(frameTurns.map(turn => ({ ...turn })));
    };
    setRequestKind(service ? "service" : "story");
    setError(""); jumpToLatest();
    if (fromComposer) {
      updateDraft(edit?.nextDraft ?? "");
      setEdit(undefined);
      if (!service) setOutgoingText(text.length > 2000 ? text.slice(0, 2000) + "…" : text);
    }
    if (!activeChat()) {
      // Publish the empty local chat before the first request. The shared
      // controller can then bind the world and record the first turn at root.
      history.pushState(null, "", chatUrl(id));
      setChat(emptyChat(id));
    }
    const sent = sendNative(id, text, chat.head, edited, (name, payload) => {
      if (name === "ready" && payload.request_message_id && payload.response_message_id) {
        arrivingTurn.current = service ? undefined : { user: payload.request_message_id, assistant: payload.response_message_id };
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
      try {
        const saved = await request<Chat>(chatEndpoint("chat", id));
        setChat(saved);
        const summary = { id: saved.id, title: saved.title, updatedAt: saved.updatedAt };
        setList(previous => [summary, ...previous.filter(item => item.id !== id)].sort((a, b) => b.updatedAt - a.updatedAt));
      } catch { setError("chat-unavailable"); }
    }, failure => {
      const errorCode = failure.message === "model-stopped" ? undefined : failure.message;
      if (fromComposer) {
        if (composer.current?.value) setUnsent(previous => [...previous, { text, edited, errorCode }]);
        else {
          setEdit(edited === undefined ? undefined : { turnId: edited, nextDraft: "" });
          updateDraft(text);
        }
      }
      if (errorCode) setError(errorCode);
    }).finally(() => {
      if (frameId) cancelAnimationFrame(frameId);
      task.current = undefined;
      setPending(undefined); setOutgoingText(""); setRequestKind(undefined);
      setStopping(false);
      refreshSpending();
    });
  }

  async function remove(id: string) {
    try {
      await request(chatEndpoint("chat", id), { method: "DELETE" });
      if (activeChat() === id) {
        history.replaceState(null, "", "/");
        setChat(emptyChat());
        setEdit(undefined);
        setUnsent([]);
        updateDraft("");
      }
      await refreshList().catch(() => setError("chat-unavailable"));
      return true;
    } catch { setError("chat-unavailable"); return false; }
  }
  async function copyTurn(turn: Turn) {
    let result: "copied" | "copyFailed" = "copied";
    try { await navigator.clipboard.writeText(turn.visible); }
    catch { result = "copyFailed"; }
    setCopyFeedback({ chatId: chat.id, turnId: turn.id, result });
  }

  async function choose(head: number, trigger: HTMLButtonElement) {
    if (selectingReply.current || task.current) return;
    selectingReply.current = true;
    try {
      const selected = await request<Chat>(chatEndpoint("select", chat.id), { method: "POST", body: JSON.stringify({ head }) });
      if (activeChat() !== selected.id) return;
      const showVersion = () => {
        setChat(selected);
        if (edit && !chatTranscript(selected).line.some(turn => turn.id === edit.turnId)) {
          const current = composer.current?.value ?? draft;
          const changed = current.trim().length > 0 && current !== byId.get(edit.turnId)?.visible;
          if (changed && edit.nextDraft) setUnsent(previous => [...previous, { text: current, edited: edit.turnId }]);
          updateDraft(edit.nextDraft || (changed ? current : ""));
          setEdit(undefined);
        }
      };
      if (document.activeElement !== trigger) {
        showVersion();
        return;
      }
      flushSync(showVersion);
      const group = viewport.current?.querySelector(`article[data-message-id="${head}"] .desktop-variants`);
      const direction = group?.querySelector<HTMLButtonElement>(`[data-reply-step="${trigger.dataset.replyStep}"]:not(:disabled)`);
      (direction ?? group?.querySelector<HTMLButtonElement>("button:not(:disabled)"))?.focus({ preventScroll: true });
    } catch { setError("chat-unavailable"); }
    finally { selectingReply.current = false; }
  }
  const row = (turn: Turn, partial = false) => {
    const variants = !partial && turn.role === "assistant" ? replyVariants.get(turn.id) ?? [] : [];
    const position = variants.findIndex(message => message.id === turn.id);
    const previous = turn.parent === null ? undefined : byId.get(turn.parent);
    const service = worker || serviceDraft(previous?.visible ?? pending?.[0]?.visible ?? "");
    const copyResult = currentCopy?.turnId === turn.id ? currentCopy.result : undefined;
    return <article key={turn.id} data-role={turn.role} data-message-id={turn.id} data-streaming={partial || undefined} className={`desktop-message desktop-${turn.role}`}>
      {turn.role === "assistant" ? <>
        <div className="desktop-narrator"><span className="desktop-orb" />DeepRole</div>
        <Reply turn={turn} partial={partial} animate={arrivingTurn.current?.assistant === turn.id} service={service} formatting={formatting} />
      </> : <div className="desktop-message-bubble"><div className={arrivingTurn.current?.user === turn.id ? "desktop-text-reveal" : undefined}>{worker || serviceDraft(turn.visible) ? turn.visible : <DialogueText text={turn.visible} />}</div></div>}
      {!partial && <div className="desktop-message-actions" data-deeprole-ui>
        <button type="button" className="desktop-icon" aria-label={actions.copy} title={actions[copyResult ?? "copy"]} data-copy-result={copyResult} onClick={() => void copyTurn(turn)}>
          {copyResult === "copied" ? <Check aria-hidden="true" /> : copyResult === "copyFailed" ? <CircleAlert aria-hidden="true" /> : <Copy aria-hidden="true" />}
        </button>
        {turn.role === "user" && !serviceDraft(turn.visible) && <button type="button" className="desktop-icon" disabled={busy} aria-label={actions.edit} title={actions.edit} onClick={() => beginEdit(turn)}><Pencil aria-hidden="true" /></button>}
        {previous && !serviceDraft(previous.visible) && <button type="button" className="desktop-icon" disabled={busy} aria-label={actions.regenerate} title={actions.regenerate} onClick={() => submit(previous.visible, previous.id)}><RotateCcw aria-hidden="true" /></button>}
        {variants.length > 1 && <div className="desktop-variants" role="group" aria-label={ru ? `Ответ ${position + 1} из ${variants.length}` : `Reply ${position + 1} of ${variants.length}`}>
          <button type="button" className="desktop-icon" aria-label={actions.previous} title={actions.previous} data-reply-step="previous" disabled={busy || position <= 0} onClick={event => void choose(variants[position - 1]!.id, event.currentTarget)}><ChevronLeft aria-hidden="true" /></button>
          <span aria-hidden="true">{position + 1} / {variants.length}</span>
          <button type="button" className="desktop-icon" aria-label={actions.next} title={actions.next} data-reply-step="next" disabled={busy || position >= variants.length - 1} onClick={event => void choose(variants[position + 1]!.id, event.currentTarget)}><ChevronRight aria-hidden="true" /></button>
        </div>}
      </div>}
    </article>;
  };
  const parent = pending?.[0]?.parent;
  const visibleLine = parent === undefined ? line : line.slice(0, line.findIndex(message => message.id === parent) + 1);
  const storyTitle = chat.title || (ru ? "Новая история" : "New story");
  const showEmpty = !line.length && !busy && !loading && (!!provider || worker);
  const setupOnStart = !worker && showEmpty && !!providerNeeded;
  const connectModel = ru ? "Подключить модель" : "Connect a model";
  const modelLabel = provider && modelConfigured ? provider.model : connectModel;
  const themeLabel = dark ? ru ? "Светлая тема" : "Light theme" : ru ? "Тёмная тема" : "Dark theme";
  const cancelEditLabel = ru ? "Отменить редактирование" : "Cancel edit";
  const needsModelToSend = !worker && !!providerNeeded;
  const sendLabel = needsModelToSend ? ru ? "Настроить отправку" : "Set up sending"
    : edit ? ru ? "Отправить правку" : "Send edit" : ru ? "Отправить" : "Send";
  const latestLabel = ru ? "К последнему сообщению" : "Go to latest message";
  const response = pending?.[1];
  const statusText = replyStatusText[locale];
  const responseLabel = requestKind === "story"
    ? statusText[stopping ? "stopping" : response?.text ? "receiving" : response?.reasoning ? "reasoning" : "waiting"]
    : "";

  return <div className={`desktop-app${worker ? " desktop-worker" : ""}`}
    data-history-docked={historyDocked && historyOpen} data-overlay={overlayHistory ? "history" : overlayPanels ? "game" : libraryOverlay ? "library" : undefined}>
    <div className="desktop-window-caption" aria-hidden="true">
      <span>DeepRole</span>
    </div>
    <span className="desktop-copy-status" role="status">{currentCopy ? actions[currentCopy.result] : ""}</span>
    {!worker && <div className="desktop-panel-shade desktop-history-shade" data-open={overlayHistory} aria-hidden="true" onClick={closeHistory} />}
    <aside id="desktop-chat-history" className="desktop-sidebar" data-open={historyOpen} inert={!historyOpen} aria-label={ru ? "Чаты" : "Chats"} onKeyDown={event => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (menu) {
        event.stopPropagation();
        setMenu(undefined);
        chatMenuTrigger.current?.focus();
      } else if (!worker) {
        event.stopPropagation();
        closeHistory();
      }
    }}>
      <div className="desktop-brand">
        <BookOpenText size={16} strokeWidth={1.5} aria-hidden="true" /><span>DeepRole</span>
        {!historyDocked && !worker && <button ref={historyClose} type="button" className="desktop-icon" aria-label={ru ? "Закрыть панель чатов" : "Close chat sidebar"} title={ru ? "Закрыть панель чатов" : "Close chat sidebar"} onClick={closeHistory}>
          <X size={17} aria-hidden="true" />
        </button>}
      </div>
      <a href="/" className="desktop-new-chat" aria-disabled={busy || undefined} onClick={event => { if (busy) event.preventDefault(); }}>
        <Plus size={16} strokeWidth={1.5} aria-hidden="true" />{ru ? "Новый чат" : "New chat"}
      </a>
      <nav className="desktop-history" aria-label={ru ? "История чатов" : "Chat history"}>
        <h2>{ru ? "Чаты" : "Chats"}</h2>
        <div className="desktop-chat-list">
          {list.length === 0 && <p>{ru ? "Чаты появятся после первого хода" : "Chats appear after your first turn"}</p>}
          {list.map(item => <div className="desktop-chat-link" key={item.id} data-current={item.id === activeChat()}>
            <a href={chatUrl(item.id)} title={item.title} aria-current={item.id === activeChat() ? "page" : undefined} onClick={event => { if (busy) event.preventDefault(); }}><span>{item.title}</span></a>
            <button type="button" className="desktop-icon" title={ru ? "Действия чата" : "Chat options"} aria-label={ru ? "Действия чата" : "Chat options"} aria-haspopup="menu" aria-expanded={menu === item.id} onClick={event => {
              chatMenuTrigger.current = event.currentTarget;
              setMenu(menu === item.id ? undefined : item.id);
            }}><Ellipsis size={16} strokeWidth={1.5} aria-hidden="true" /></button>
            {menu === item.id && <div role="menu" className="desktop-chat-menu"><button role="menuitem" type="button" autoFocus disabled={busy} onClick={() => { setMenu(undefined); setConfirmDelete(item.id); }}>{ru ? "Удалить чат" : "Delete chat"}</button></div>}
          </div>)}
        </div>
      </nav>
      <div className="desktop-sidebar-tools">
        <button type="button" className="desktop-sidebar-link" aria-haspopup="dialog" onClick={() => { setOverlay(null); setUsageOpen(true); }}><BarChart3 size={16} strokeWidth={1.5} aria-hidden="true" />{ru ? "Расходы" : "Usage"}</button>
        <button type="button" className="desktop-sidebar-link" aria-expanded={libraryOpen && libraryEntry !== "settings"} aria-controls="desktop-library" onClick={event => openLibrary("library", event.currentTarget)}><BookOpen size={16} strokeWidth={1.5} aria-hidden="true" />{ru ? "Библиотека" : "Library"}</button>
      </div>
    </aside>
    <main ref={chatFrame} className="desktop-main desktop-frame" data-game-docked={gameDocked} inert={overlayHistory}>
      <header className="desktop-header">
        {!worker && <button ref={historyToggle} type="button" className="desktop-icon desktop-panel-toggle desktop-history-toggle" aria-expanded={historyOpen} aria-controls="desktop-chat-history"
          aria-label={historyLabel} title={historyLabel} onClick={() => {
            if (historyDocked) { setMenu(undefined); changeDock(() => setHistoryCollapsed(collapsed => !collapsed)); }
            else if (historyOpen) closeHistory();
            else { setLibraryOpen(false); setOverlay("history"); }
          }}><PanelLeft size={16} strokeWidth={1.5} aria-hidden="true" /></button>}
        <h1 title={storyTitle} data-has-story={!!chat.title}>{storyTitle}</h1>
        {!setupOnStart && <button type="button" className="desktop-model" data-configured={modelConfigured} aria-haspopup="dialog" title={modelLabel}
          disabled={!provider || busy} onClick={event => openModel(event.currentTarget)}>
          {modelConfigured ? <span className="desktop-model-dot" aria-hidden="true" /> : <KeyRound size={16} strokeWidth={1.5} aria-hidden="true" />}
          <span>{modelLabel}</span>
        </button>}
        {!worker && <div className="desktop-header-tools">
          <button ref={panelsToggle} type="button" className="desktop-icon desktop-panel-toggle desktop-game-toggle" aria-expanded={panelsOpen} aria-controls="desktop-play-tools" aria-label={ru ? "Игровые панели" : "Game panels"} title={ru ? "Игровые панели" : "Game panels"} onClick={() => {
            if (gameDocked) setGameCollapsed(collapsed => !collapsed);
            else if (panelsOpen) closePanels();
            else {
              if (libraryOverlay) setLibraryOpen(false);
              setOverlay("game");
            }
          }}><Gamepad2 size={16} strokeWidth={1.5} aria-hidden="true" /><span>{ru ? "Игра" : "Game"}</span></button>
          <button type="button" className="desktop-icon desktop-settings-toggle" aria-expanded={libraryOpen && libraryEntry === "settings"} aria-controls="desktop-library"
            aria-label={ru ? "Настройки" : "Settings"} title={ru ? "Настройки" : "Settings"} onClick={event => openLibrary("settings", event.currentTarget)}>
            <Settings2 size={16} strokeWidth={1.5} aria-hidden="true" /><span>{ru ? "Настройки" : "Settings"}</span>
          </button>
          <button type="button" className="desktop-icon desktop-theme" aria-label={themeLabel} title={themeLabel} onClick={() => void desktop.call("setTheme", dark ? "light" : "dark").catch(() => undefined)}>
            {dark ? <Sun size={16} strokeWidth={1.5} aria-hidden="true" /> : <Moon size={16} strokeWidth={1.5} aria-hidden="true" />}
          </button>
        </div>}
      </header>
      {!worker && <div className="desktop-panel-shade desktop-game-shade" data-open={overlayPanels} aria-hidden="true" onClick={closePanels} />}
      {!worker && <aside ref={panelsShell} id="desktop-play-tools" className="desktop-play-tools" aria-labelledby="desktop-play-tools-title" data-deeprole-ui data-open={panelsOpen} inert={!panelsOpen}>
        <header className="desktop-play-tools-heading">
          <h2 id="desktop-play-tools-title"><Gamepad2 size={20} strokeWidth={1.6} aria-hidden="true" />{ru ? "Игра" : "Game"}</h2>
          <button ref={panelsClose} type="button" className="desktop-icon" aria-label={ru ? "Скрыть панель игры" : "Hide game panel"} onClick={closePanels}><X size={16} aria-hidden="true" /></button>
        </header>
        <div className="desktop-play-tools-scroll">
          <div id="desktop-play-tools-content" />
          {chat.lastContext && <details key={chat.id} className="desktop-context-reading">
            <summary>{ru ? "Последний запрос" : "Last request"}<ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" /></summary>
            <dl>
              <dt>{ru ? "Вход" : "Input"}</dt>
              <dd>{chat.lastContext.input === undefined ? "≈" : ""}{(chat.lastContext.input ?? chat.lastContext.estimatedInput).toLocaleString(locale)}</dd>
              {chat.lastContext.output !== undefined && <><dt>{ru ? "Ответ" : "Reply"}</dt><dd>{chat.lastContext.output.toLocaleString(locale)}</dd></>}
              <dt>{ru ? "Окно модели" : "Model window"}</dt>
              <dd>{chat.lastContext.windowSource === "fallback" ? "≈" : ""}{chat.lastContext.window.toLocaleString(locale)}</dd>
              {chat.lastContext.timings && <>
                {chat.lastContext.timings.preparationMs !== undefined && <>
                  <dt>{ru ? "До отправки" : "Before sending"}</dt><dd>{requestDuration(chat.lastContext.timings.preparationMs, locale)}</dd>
                </>}
                <dt>{ru ? "Первый текст от API" : "First text from API"}</dt><dd>{requestDuration(chat.lastContext.timings.firstTextMs, locale)}</dd>
                <dt>{ru ? "Весь ответ от API" : "Full reply from API"}</dt><dd>{requestDuration(chat.lastContext.timings.totalMs, locale)}</dd>
              </>}
              {chat.contextCheckpoint && <><dt>{ru ? "Снимок контекста" : "Context checkpoint"}</dt><dd>{new Date(chat.contextCheckpoint.at).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })}</dd></>}
            </dl>
          </details>}
        </div>
      </aside>}
      <div className="desktop-viewport" id="desktop-chat-viewport" ref={viewport} inert={overlayPanels || libraryOverlay}
        role="region" aria-label={ru ? "Переписка" : "Conversation"} tabIndex={-1}
        onScroll={event => setFollowing(distanceToLatest(event.currentTarget) < followDistance)}>
        <div className="desktop-transcript" ref={transcript}>
           {showEmpty && <div className="desktop-empty">
            <h2>{setupOnStart ? ru ? "Начните историю" : "Start a story" : ru ? "Ваш первый ход" : "Your first turn"}</h2>
            {setupOnStart ? <>
              <p>{ru ? "Для ответа нужна текстовая модель. Реплику можно написать заранее." : "Connect a text model to get a reply. You can draft your turn now."}</p>
              <button className="desktop-primary" type="button" aria-haspopup="dialog" onClick={event => openModel(event.currentTarget)}>
                <KeyRound size={16} aria-hidden="true" />{connectModel}
              </button>
            </> : <p>{ru ? "Мир можно подключить в панели «Игра»." : "You can connect a world from the Game panel."}</p>}
          </div>}
            {visibleLine.concat(pending ?? []).map((turn, index) => row(turn, index >= visibleLine.length))}
            {!pending && outgoingText && <div className="desktop-message desktop-user" data-deeprole-ui>
              <div className="desktop-message-bubble"><DialogueText text={outgoingText} /></div>
            </div>}
        </div>
      </div>
      <div className="desktop-composer-area" inert={overlayPanels || libraryOverlay}>
        {!worker && <div data-deeprole-portrait-anchor aria-hidden="true" />}
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
          <span>{(ru ? ruErrors : enErrors)[error] ?? (ru ? "Не удалось завершить запрос." : "The request could not finish.")}</span>
          <button className="desktop-icon" type="button" aria-label={ru ? "Закрыть сообщение" : "Dismiss"} onClick={() => setError("")}><X size={16} aria-hidden="true" /></button>
        </div>}
        {queuedDraft && <div className="desktop-unsent" role="status">
          <span>{queuedDraft.edited !== undefined
            ? ru ? "Неотправленная правка" : "Unsent edit"
            : ru ? "Неотправленная реплика" : "Unsent message"}{unsent.length > 1 ? ` · ${unsent.length}` : ""}</span>
          <button type="button" onClick={() => recoverDraft(queuedDraft)}>{canRestoreDraft
            ? queuedDraft.edited !== undefined ? ru ? "Вернуть правку" : "Restore edit" : ru ? "Вернуть в поле" : "Restore draft"
            : ru ? "Скопировать реплику" : "Copy draft"}</button>
        </div>}
        <form ref={box} className="desktop-composer" onSubmit={event => { event.preventDefault(); submit(composer.current?.value ?? "", edit?.turnId, true); }}>
          {edit && <div className="desktop-edit">
            <Pencil size={16} aria-hidden="true" />
            <div id="desktop-edit-description">
              <span>{ru ? "Редактирование хода" : "Editing turn"}</span>
              {edit.nextDraft && <small>{ru ? "Черновик вернётся в поле" : "Your draft will return"}</small>}
            </div>
            <button className="desktop-icon" type="button" aria-label={cancelEditLabel} title={cancelEditLabel} onClick={cancelEdit}><X size={16} aria-hidden="true" /></button>
          </div>}
           <div className="desktop-editor">
             <textarea ref={composer} rows={2} aria-label={ru ? "Ваша реплика" : "Your message"} aria-describedby={edit ? "desktop-edit-description" : undefined} placeholder={ru ? "Напишите реплику или действие…" : "Write dialogue or an action…"} onInput={event => setDraft(event.currentTarget.value)} onKeyDown={event => {
               if (event.nativeEvent.isComposing) return;
               if (edit && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelEdit(); }
               else if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); box.current?.requestSubmit(); }
             }} />
             <span className="desktop-editor-placeholder" aria-hidden="true">{ru ? "Напишите реплику или действие…" : "Write dialogue or an action…"}</span>
             {composerEffects}
           </div>
          <div className="desktop-composer-controls">
            <button type="button" className="desktop-icon" aria-label={ru ? "Открыть библиотеку" : "Open library"} onClick={event => openLibrary("library", event.currentTarget)}><BookOpen size={17} /></button>
            {!worker && <div id="desktop-composer-lore" data-deeprole-ui />}
            {!worker && readingHistory ? <div className="desktop-jump-anchor" data-deeprole-ui>
              <button className="desktop-icon desktop-jump-latest" type="button"
                aria-label={latestLabel} title={latestLabel} aria-controls="desktop-chat-viewport" onClick={() => {
                  viewport.current?.focus({ preventScroll: true });
                  jumpToLatest();
                }}><ArrowDown aria-hidden="true" /></button>
            </div> : !responseLabel && <span className="desktop-composer-hint"><kbd>Shift</kbd> + <kbd>Enter</kbd> {ru ? "новая строка" : "new line"}</span>}
            <span id="desktop-response-status" className="desktop-response-status" role="status"
              data-visible={!!responseLabel && !readingHistory}>
              {responseLabel && <><LoaderCircle size={14} aria-hidden="true" />{responseLabel}</>}
            </span>
            {busy ? <button className="desktop-send desktop-stop" type="button" data-testid="stop-generation"
              aria-label={statusText.stop} title={statusText.stop}
              aria-describedby={responseLabel ? "desktop-response-status" : undefined}
              disabled={stopping} onClick={() => { setStopping(true); task.current?.stop(); }}><Square size={15} fill="currentColor" aria-hidden="true" /></button>
              : <button className={needsModelToSend ? "desktop-send" : "desktop-send desktop-primary"} type="submit" aria-label={sendLabel} title={sendLabel}
                disabled={loading || !draft.trim() || (!worker && !provider)}>
                {needsModelToSend ? <KeyRound size={17} aria-hidden="true" /> : <ArrowUp size={19} aria-hidden="true" />}
              </button>}
          </div>
        </form>
      </div>
    </main>
    {!worker && <div className="desktop-panel-shade desktop-library-shade" data-open={libraryOverlay} aria-hidden="true" onClick={closeLibrary} />}
    {libraryPhase !== "closed" && <aside ref={library} id="desktop-library" className="desktop-library" data-state={libraryPhase} data-docked={libraryDocked} inert={!libraryOpen} aria-label={ru ? "Панель DeepRole" : "DeepRole panel"}>
      <iframe ref={libraryFrame} src={`/sidepanel.html?embedded=1${libraryEntry === "library" ? "" : `&view=${libraryEntry}`}`} title={ru ? "Панель DeepRole" : "DeepRole panel"} />
    </aside>}
    {modelOpen && provider && <ProviderDialog locale={locale} value={provider} onClose={() => closeModel()} onSave={closeModel} />}
    {usageOpen && <UsageDialog locale={locale} chatId={chat.id} onClose={() => setUsageOpen(false)} onSpendingChange={refreshSpending} />}
    {confirmDelete && <DeleteChatDialog ru={ru} onCancel={() => {
      setConfirmDelete(undefined);
      requestAnimationFrame(() => {
        const trigger = chatMenuTrigger.current;
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
        else historyToggle.current?.focus({ preventScroll: true });
      });
    }} onDelete={() => remove(confirmDelete)} />}
  </div>;
}

const root = createRoot(document.getElementById("root")!);
flushSync(() => root.render(<App />));
const listeners: Array<() => void> = [];
void content.main({ onInvalidated: (listener: () => void) => { listeners.push(listener); } } as unknown as NonNullable<Parameters<typeof content.main>[0]>);
window.addEventListener("pagehide", () => listeners.forEach(listener => listener()), { once: true });
