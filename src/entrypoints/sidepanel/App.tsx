import { Select } from "../shared/Select";
import { ImageSettings } from "./ImageSettings";
import { PortraitUploadSettings } from "../shared/PortraitUploadSettings";
import { portraitUploadText } from "../../core/portrait-upload-i18n";
import { imageText } from "../../core/image-i18n";
import { requestImagePermission } from "../../storage/image-permissions";
import { useCallback, useEffect, useRef, useState } from "react";
import { PanelWidthControl } from "../shared/PanelWidthControl";
import { CharacterSettings } from "../shared/CharacterSheets";
import { detachDefaultEmotionImages, saveWorldEmotionList } from "../../storage/emotion-settings";
import { MemoryGuide } from "../shared/MemoryGuide";
import { characterText } from "../../core/characters";
import { sceneChoiceText } from "../../core/scene-choices";
import { adaptiveText } from "../../core/adaptive-layout";
import {
  ArchiveRestore,
  BrainCircuit,
  Check,
  ChevronRight,
  CircleHelp,
  Download,
  Edit3,
  Eye,
  FileKey2,
  Globe2,
  Languages,
  LayoutDashboard,
  LockKeyhole,
  MemoryStick,
  MessageSquareMore,
  Plus,
  Pin,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  UnlockKeyhole,
  Upload,
  X,
} from "lucide-react";
import { browser } from "wxt/browser";
import { continuationText } from "../../core/continuation-i18n";
import { chatCapacity } from "../../core/context-capacity";
import { BOOK_COLORS, DEFAULT_SETTINGS } from "../../core/defaults";
import { replyRecoveryText } from "../../core/reply-recovery";
import { createId } from "../../core/id";
import { importFileTooLarge } from "../../core/import-limits";
import { translate, type MessageKey } from "../../core/i18n";
import { buildTutorialPresetCopy, getTutorialPreset, repairLegacyTutorialCopy } from "../../core/tutorial-preset";
import type { DeepRoleMessage } from "../../core/messages";
import type {
  ActivationMode,
  ChatBinding,
  DeepRoleSettings,
  HandoffSnapshot,
  MemoryBook,
  MemoryEntry,
  MemoryPriority,
  ServiceRequest,
  BackupPayload,
} from "../../core/types";
import { parseBackup, restoreBackup } from "../../storage/backup";
import { BackupRestore } from "../shared/BackupRestore";
import { Modal } from "../shared/Modal";
import { ExportDialog } from "./ExportDialog";
import { exportText } from "../../core/export-i18n";
import { repository, VaultLockedError } from "../../storage/repository";
import { libraryRecords } from "../../core/memory-workspace";
import { menuText } from "../../core/menu-i18n";
import { assistantText } from "../../core/assistant-i18n";
import { applyMemoryProposals, discardMemoryProposals, undoLoreChange } from "../../storage/memory-proposals";
import { MemoryReview, MemoryUse } from "../shared/MemoryAssistant";
import { MemoryModeControl } from "../shared/MemoryModeControl";
import { MemorySelectionSettings } from "./MemorySelectionSettings";
import { uiText } from "../../core/ui-i18n";
import { experienceText } from "../../core/experience-i18n";
import { startupDeadline } from "../../core/startup";
import type { ServiceActivity } from "../../core/memory-experience";
import { MemoryStatus, ServiceProgress } from "../shared/MemoryStatus";
import { TooltipButton } from "../shared/TooltipButton";
import { getSettings, getVaultConfig, saveSettings } from "../../storage/settings";
import { saveEditorRecord } from "../../storage/editing";
import { InvalidEncryptedPayloadError } from "../../storage/crypto";
import { removeBook } from "../../storage/worlds";

import { HelpButton, HelpSection, HelpLocale } from "../shared/Help";
import { DeferredWorldsView as WorldsView } from "./DeferredWorldsView";
import { SceneControls } from "../shared/SceneControls";
import { EMPTY_SCENE, memoryWorld } from "../../core/scene";
import { sceneText } from "../../core/scene-i18n";
import { suggestEntryLinks } from "../../core/entry-links";
import type { WorldProfile, SceneEntity, SceneState, StoryTemplate, ContextSelection, MemoryOverrides, MemoryProposalBatch, LoreChange } from "../../core/types";
import "../shared/scene.css";
import "../shared/memory-assistant.css";
import "./worlds.css";
import "./lore-map.css";

type Tab = "overview" | "settings" | "worlds";

interface PageState {
  pendingHandoff?: string;
  activity?: ServiceActivity | null;
  generating?: boolean;
  warning?: string;
  selection?: ContextSelection;
  overrides?: MemoryOverrides;
  chatId: string | null;
  chatUrl: string;
  messageCount: number;
  compatible: boolean;
  scene?: SceneState;
}

const EMPTY_PAGE: PageState = { chatId: null, chatUrl: "", messageCount: 0, compatible: false };

export function App() {
  const [settings, setSettingsState] = useState<DeepRoleSettings>(DEFAULT_SETTINGS);
  const [books, setBooks] = useState<MemoryBook[]>([]);
  const [worlds, setWorlds] = useState<WorldProfile[]>([]);
  const [entities, setEntities] = useState<SceneEntity[]>([]);
  const [templates, setTemplates] = useState<StoryTemplate[]>([]);
  const [libraryWorld, setLibraryWorld] = useState<string | null>(null);
  const libraryChosen = useRef(false);
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [bindings, setBindings] = useState<ChatBinding[]>([]);
  const [snapshots, setSnapshots] = useState<HandoffSnapshot[]>([]);
  const [proposals, setProposals] = useState<MemoryProposalBatch[]>([]);
  const [changes, setChanges] = useState<LoreChange[]>([]);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const refreshGeneration = useRef(0);
  const pageGeneration = useRef(0);
  const [page, setPage] = useState<PageState>(EMPTY_PAGE);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [openMapWorldId, setOpenMapWorldId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [toast, setToast] = useState("");
  const [exportRequest, setExportRequest] = useState<{ worldId?: string | null } | null>(null);
  const [bookEditor, setBookEditor] = useState<MemoryBook | "new" | null>(null);
  const [entryEditor, setEntryEditor] = useState<MemoryEntry | "new" | null>(null);
  const [entryBase, setEntryBase] = useState<MemoryEntry | null>(null);
  const [editorWorld, setEditorWorld] = useState<string | null>(null);
  function openEntry(value: MemoryEntry | "new", targetWorld = libraryWorld) {
    setEntryBase(value !== "new" && entries.some((e) => e.id === value.id) ? value : null);
    setEditorWorld(value !== "new" ? memoryWorld(value, books) : targetWorld);
    setEntryEditor(value);
  }
  const [filterBookId, setFilterBookId] = useState<string | "all" | "global">("all");
  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(settings.locale, key, vars),
    [settings.locale],
  );
  const embeddedMenu = new URLSearchParams(window.location.search).get("embedded") === "1";

  const clearPrivateState = useCallback(() => {
    ++pageGeneration.current;
    setLocked(true);
    setBooks([]); setEntries([]); setSnapshots([]); setWorlds([]); setEntities([]); setTemplates([]);
    setBindings([]); setProposals([]); setChanges([]); setReviewId(null);
    setBookEditor(null); setEntryEditor(null); setEntryBase(null); setEditorWorld(null);
    setExportRequest(null);
    setPage(EMPTY_PAGE); setToast("");
  }, []);

  useEffect(() => {
    if (!embeddedMenu) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.querySelector(".dr-loremap")) return;
      if (document.querySelector('[role="dialog"], dialog[open]')) return;
      event.preventDefault();
      event.stopPropagation();
      window.parent.postMessage({ source: "deeprole-menu", type: "CLOSE" }, "*");
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [embeddedMenu]);

  const refresh = useCallback(async (propagateFailure = false) => {
    const generation = ++refreshGeneration.current;
    try {
      const nextSettings = await startupDeadline(getSettings());
      if (generation !== refreshGeneration.current) return;
      setSettingsState(nextSettings);
      const isLocked = await startupDeadline(repository.isLocked());
      if (generation !== refreshGeneration.current) return;
      setLocked(isLocked);
      if (isLocked) {
        clearPrivateState();
        setLoadError(false);
        setLoading(false);
        return;
      }
      await startupDeadline(browser.runtime.sendMessage({ type: "DR_MIGRATE_LEGACY" } satisfies DeepRoleMessage), 2000).catch(() => undefined);
      const records = await startupDeadline(repository.rawRecords());
      if (generation !== refreshGeneration.current) return;
      setLoadError(false);
      setBooks(libraryRecords<MemoryBook>(records, "book")); setEntries(libraryRecords<MemoryEntry>(records, "entry"));
      setWorlds(libraryRecords<WorldProfile>(records, "world")); setEntities(libraryRecords<SceneEntity>(records, "entity")); setTemplates(libraryRecords<StoryTemplate>(records, "template"));
      setBindings(libraryRecords<ChatBinding>(records, "binding")); setSnapshots(libraryRecords<HandoffSnapshot>(records, "snapshot"));
      setProposals(libraryRecords<MemoryProposalBatch>(records, "proposal")); setChanges(libraryRecords<LoreChange>(records, "change"));
    } catch (error) {
      if (generation !== refreshGeneration.current) return;
      // Import has its own saved-but-not-refreshed recovery dialog. Do not
      // swallow its refresh failure or unmount it as a startup error.
      if (propagateFailure) {
        if (error instanceof VaultLockedError) clearPrivateState();
        throw error;
      }
      if (error instanceof VaultLockedError) { clearPrivateState(); setLoadError(false); }
      else {
        clearPrivateState();
        setLoadError(true);
        console.error("[DeepRole] Failed to load data", error);
      }
    } finally {
      if (generation === refreshGeneration.current) setLoading(false);
    }
  }, [clearPrivateState]);

  const openMenuTab = async () => {
    try {
      const url = browser.runtime.getURL("/sidepanel.html");
      const tabs = await startupDeadline(browser.tabs.query({ currentWindow: true }));
      const existing = tabs.find(tab => tab.url === url);
      if (existing?.id !== undefined) await browser.tabs.update(existing.id, { active: true });
      else await browser.tabs.create({ url, active: true });
    } catch { setToast(experienceText(settings.locale, "menuLoadError")); }
  };

  const refreshPage = useCallback(async () => {
    const generation = ++pageGeneration.current;
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (generation !== pageGeneration.current) return;
      if (!tab?.id) return setPage(EMPTY_PAGE);
      const response = (await browser.tabs.sendMessage(tab.id, { type: "DR_GET_PAGE_STATE" } satisfies DeepRoleMessage)) as
        | Extract<DeepRoleMessage, { type: "DR_PAGE_STATE" }>
        | undefined;
      const isLocked = await repository.isLocked();
      if (generation !== pageGeneration.current) return;
      if (isLocked) return setPage(EMPTY_PAGE);
      if (response?.type === "DR_PAGE_STATE") {
        setPage({
          chatId: response.chatId,
          chatUrl: response.chatUrl,
          messageCount: response.messageCount,
          compatible: response.status.compatible,
          scene: response.scene,
          selection: response.selection, overrides: response.overrides,
          activity: response.activity, generating: response.generating, warning: response.warning, pendingHandoff: response.pendingHandoff,
        });
      } else setPage(EMPTY_PAGE);
    } catch {
      if (generation === pageGeneration.current) setPage(EMPTY_PAGE);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void refreshPage();
    const listener = (message: DeepRoleMessage) => {
      if (["DR_DATA_CHANGED", "DR_PENDING_SUGGESTIONS"].includes(message.type)) { void refresh(); void refreshPage(); }
      if (message.type === "DR_CONTEXT_CHANGED") void refreshPage();
      if (message.type === "DR_SERVICE_RESULT" && message.outcome === "no-changes") setToast(assistantText(settings.locale, "noChanges"));
    };
    browser.runtime.onMessage.addListener(listener);
    const storageListener = () => { void refresh(); void refreshPage(); };
    browser.storage.onChanged.addListener(storageListener);
    const tabListener = () => { void refreshPage(); };
    const navigationListener = (_id: number, change: { url?: string; status?: string }) => { if (change.url || change.status === "complete") void refreshPage(); };
    browser.tabs.onActivated?.addListener(tabListener);
    browser.tabs.onUpdated?.addListener(navigationListener);
    return () => {
      browser.runtime.onMessage.removeListener(listener);
      browser.storage.onChanged.removeListener(storageListener);
      browser.tabs.onActivated?.removeListener(tabListener);
      browser.tabs.onUpdated?.removeListener(navigationListener);
    };
  }, [refresh, refreshPage, settings.locale]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeBinding = page.chatId ? bindings.find((binding) => binding.chatId === page.chatId) : undefined;
  const scene = page.scene ?? (activeBinding ? { worldId: activeBinding.worldId ?? null, focusIds: activeBinding.focusIds ?? [], bookId: activeBinding.bookId } : EMPTY_SCENE);
  const activeBookId = scene.bookId;
  const libraryBooks = books.filter((b) => (b.worldId ?? null) === libraryWorld);
  const libraryEntries = entries.filter((e) => memoryWorld(e, books) === libraryWorld);
  const st = (key: Parameters<typeof sceneText>[1]) => sceneText(settings.locale, key);
  const mt = (key: Parameters<typeof menuText>[1]) => menuText(settings.locale, key);
  const at = (key: Parameters<typeof assistantText>[1]) => assistantText(settings.locale, key);
  const activeReview = proposals.find((batch) => batch.id === reviewId);
  const relevantProposals = proposals.filter((batch) => batch.worldId === (activeTab === "worlds" ? libraryWorld : scene.worldId));
  const lastChange = changes.find((change) => change.worldId === scene.worldId && !change.undoneAt);
  async function overrideMemory(id: string, action: "include" | "exclude" | "reset") {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("offsite");
    const result = await browser.tabs.sendMessage(tab.id, { type: "DR_MEMORY_OVERRIDE", id, action } satisfies DeepRoleMessage);
    if (!result?.ok) throw new Error(result?.error ?? "failed");
    await refreshPage();
  }
  const chooseLibraryWorld = (id: string | null) => { libraryChosen.current = true; setLibraryWorld(id); setFilterBookId("all"); setReviewId(null); };
  useEffect(() => {
    if (!libraryChosen.current && !loading) setLibraryWorld(scene.worldId ?? (worlds.length === 1 ? worlds[0]!.id : null));
  }, [scene.worldId, worlds, loading]);
  async function changeScene(next: SceneState) {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error();
      const result = await browser.tabs.sendMessage(tab.id, { type: "DR_SET_SCENE", scene: next } satisfies DeepRoleMessage);
      if (!result?.ok) throw new Error();
      setPage((p) => ({ ...p, scene: next }));
      await refresh(); await refreshPage();
      return true;
    } catch { setToast(st("offsite")); return false; }
  }
  async function applyTemplate(templateId: string) {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error();
      const result = await browser.tabs.sendMessage(tab.id, { type: "DR_APPLY_TEMPLATE", templateId } satisfies DeepRoleMessage);
      setToast(st(result?.ok ? "templateReady" : "emptyChatRequired"));
      await refreshPage();
    } catch { setToast(st("offsite")); }
  }

  async function persistSettings(next: DeepRoleSettings) {
    setSettingsState(next);
    await saveSettings(next);
  }


  async function runService(type: ServiceRequest["type"]) {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("No active tab");
      const request: ServiceRequest = {
        id: createId("service"),
        type,
        bookId: activeBookId,
        worldId: scene.worldId,
        focusIds: scene.focusIds,
        createdAt: Date.now(),
      };
      const result = type === "continue-handoff" ? await browser.tabs.sendMessage(tab.id, { type: "DR_CONTINUE_STORY" } satisfies DeepRoleMessage) : await browser.tabs.sendMessage(tab.id, {
        type: "DR_RUN_SERVICE",
        request,
      } satisfies DeepRoleMessage);
      if (result?.error === "empty-chat") {
        setToast(t("emptyChatAction"));
        return;
      }
      if (result?.error === "draft-not-empty") { setToast(st("draftProtected")); return; }
      if (result?.error === "busy") { setToast(at("busy")); return; }
      if (result?.error === "continuation-world-too-large") { setToast(continuationText(settings.locale, "tooLarge")); return; }
      if (result?.error === "scene-changed") { setToast(at("sceneChanged")); return; }
      if (!result?.ok) { setToast(type === "continue-handoff" ? continuationText(settings.locale, "failed") : at("serviceFailed")); return; }
      await refreshPage();
      setToast(type === "continue-handoff" ? continuationText(settings.locale, "analysis") : t("serviceQueued"));
    } catch {
      setToast(t("notOnDeepSeek"));
    }
  }

  async function applySnapshot(snapshotId: string) {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("No active tab");
      const result = await browser.tabs.sendMessage(tab.id, { type: "DR_APPLY_SNAPSHOT", snapshotId } satisfies DeepRoleMessage);
      if (!result?.ok) { setToast(at("handoffUnavailable")); return; }
      setToast(t("contextReady"));
    } catch {
      setToast(t("notOnDeepSeek"));
    }
  }

  const memoryList = (<MemoryView
            t={t}
            locale={settings.locale}
            books={libraryBooks}
            entries={libraryEntries}
            selection={page.selection} overrides={page.overrides} onMemoryUse={scene.worldId === libraryWorld && page.compatible ? overrideMemory : undefined}
            filterBookId={filterBookId}
            onFilter={setFilterBookId}
            onNewBook={() => setBookEditor("new")}
            onEditBook={setBookEditor}
            onNewEntry={() => openEntry("new")}
            onEditEntry={openEntry}
            onDeleteEntry={async (entry) => {
              if (settings.confirmDeletions && !window.confirm(t("confirmDelete"))) return;
              await repository.delete("entry", entry.id);
              await notifyDataChanged();
              await refresh();
            }}
            onDeleteBook={async (book) => {
              if (settings.confirmDeletions && !window.confirm(t("confirmDelete"))) return;
              await removeBook(book.id);
              await notifyDataChanged();
              await refresh();
            }}
            onClearEntries={async () => {
              if (settings.confirmDeletions && !window.confirm(t("confirmDeleteAll"))) return;
              await repository.changeRecords([], libraryEntries.map((entry) => ({ kind: "entry", id: entry.id })));
              await notifyDataChanged();
              await refresh();
            }}
            onCopyTutorial={async () => {
              const stored = await repository.rawRecords();
              const existingBooks = libraryRecords<MemoryBook>(stored, "book");
              const existingEntries = libraryRecords<MemoryEntry>(stored, "entry");
              const repaired = existingBooks.map((book) => repairLegacyTutorialCopy(book, existingEntries)).find((value) => value !== null);
              const copy = repaired ?? buildTutorialPresetCopy(settings.locale);
              await repository.mergeRecords([
                { kind: "world", id: copy.world.id, data: copy.world },
                { kind: "book", id: copy.book.id, data: copy.book },
                ...copy.entries.map((entry) => ({ kind: "entry" as const, id: entry.id, data: entry })),
              ]);
              chooseLibraryWorld(copy.world.id);
              setFilterBookId(copy.book.id);
              setOpenMapWorldId(copy.world.id);
              setToast(t(repaired ? "tutorialCopyRepaired" : "tutorialCopyCreated"));
              await notifyDataChanged();
              await refresh();
            }}
          />);

  if (loadError) return <main className="center-screen" role="alert">
    <h1>DeepRole</h1>
    <p>{experienceText(settings.locale, "menuLoadError")}</p>
    {embeddedMenu && <HelpButton className="button primary" onClick={() => void openMenuTab()}>{experienceText(settings.locale, "openMenuTab")}</HelpButton>}
    {toast && <p role="status">{toast}</p>}
    <HelpButton className="button" onClick={() => void refresh()}>{experienceText(settings.locale, "retryMenu")}</HelpButton>
    <a className="button" href={browser.runtime.getURL("/recovery.html")} target="_blank" rel="noreferrer">{experienceText(settings.locale, "checkExtension")}</a>
  </main>;
  if (loading) return <LoadingScreen />;

  if (locked) {
    return (
      <HelpLocale.Provider value={settings.locale}><VaultUnlock
        onUnlocked={() => { void notifyDataChanged(); void refresh(); }}
        onClose={embeddedMenu ? () => window.parent.postMessage({ source: "deeprole-menu", type: "CLOSE" }, "*") : undefined}
        t={t}
      /></HelpLocale.Provider>
    );
  }

  if (!settings.onboardingComplete) {
    return (
      <HelpLocale.Provider value={settings.locale}><Onboarding
        t={t}
        onFinish={async () => {
          await persistSettings({ ...settings, onboardingComplete: true });
        }}
      /></HelpLocale.Provider>
    );
  }

  return (
    <HelpLocale.Provider value={settings.locale}><div className="app-shell" data-embedded-menu={embeddedMenu ? "true" : "false"} data-motion={settings.animationsEnabled ? "on" : "off"}>
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true"><span /></div>
        <div>
          <strong>DeepRole</strong>
          <small>{t("privacyNote")}</small>
        </div>
        {embeddedMenu
          ? <button className="menu-close" type="button" aria-label={t("close")} title={t("close")} onClick={() => window.parent.postMessage({ source: "deeprole-menu", type: "CLOSE" }, "*")}><X /></button>
          : <div className={`site-status ${page.compatible ? "is-online" : ""}`} title={page.compatible ? t("siteConnected") : t("siteDisconnected")}><span /></div>}
      </header>

      <main className="app-main">
        {relevantProposals.length > 0 && <section className="dr-assistant"><header><strong>{at("proposals")}</strong></header>{relevantProposals.map((batch) => <button key={batch.id} onClick={() => setReviewId(batch.id)}>{at("review")} · {batch.items.length + Number(!!batch.profileChange)}</button>)}</section>}
        {activeReview && <MemoryReview key={activeReview.id} locale={settings.locale} batch={activeReview} onClose={() => setReviewId(null)} onDiscard={async () => { await discardMemoryProposals(activeReview.id); await refresh(); }} onSave={async (items, profileChoice) => { await applyMemoryProposals(activeReview.id, items, undefined, profileChoice); const count = items.filter((item) => item.selected && !item.issue).length + Number(!!profileChoice); setToast(at("memoryUpdated").replace("{count}", String(count))); await refresh(); await refreshPage(); }} />}
        {activeTab === "overview" && lastChange && <div className="button-row"><button className="button secondary small" onClick={() => void undoLoreChange(lastChange.id).then(() => refresh()).catch(() => setToast(at("conflict")))}>{at("undo")}</button></div>}
        {activeTab === "worlds" && <WorldsView defaultEmotions={settings.characterEmotions} onExport={id => setExportRequest({ worldId: id })} locale={settings.locale} worlds={worlds} entities={entities} templates={templates} books={books} entries={entries} selectedWorld={libraryWorld} activeWorldId={scene.worldId} scene={scene} onScene={changeScene} connected={page.compatible} memoryList={memoryList} onUseWorld={(id) => changeScene({ worldId: id, focusIds: [], bookId: null })} onWorld={chooseLibraryWorld} onEntry={openEntry} onBook={setBookEditor} selection={page.selection} overrides={page.overrides} onMemoryUse={page.compatible ? overrideMemory : undefined} confirmDeletions={settings.confirmDeletions} onChanged={async () => { await notifyDataChanged(); await refresh(true); await refreshPage(); }} onTemplate={applyTemplate} openMapWorldId={openMapWorldId} onMapOpened={() => setOpenMapWorldId(null)} />}
        {activeTab === "overview" && (
          <Overview
            t={t}
            locale={settings.locale}
            worldName={worlds.find((w) => w.id === scene.worldId)?.name}
            controls={<SceneControls locale={settings.locale} worlds={worlds} entities={entities} books={books} scene={scene} onChange={changeScene} />}
            books={books.filter((b) => (b.worldId ?? null) === scene.worldId)}
            entries={entries.filter((e) => memoryWorld(e, books) === scene.worldId)}
            snapshots={snapshots.filter((s) => memoryWorld(s, books) === scene.worldId)}
            page={page}
            activeBookId={activeBookId}
            worldId={scene.worldId}
            onSetActiveBook={(bookId) => void changeScene({ ...scene, bookId })}
            onNewMemory={() => { chooseLibraryWorld(scene.worldId); openEntry("new", scene.worldId); }}
            onAnalyze={() => void runService("memory-analysis")}
            onHandoff={() => void runService("handoff")}
            onOpenMemory={() => { chooseLibraryWorld(scene.worldId ?? (worlds.length === 1 ? worlds[0]!.id : libraryWorld)); setActiveTab("worlds"); }}
          />
        )}

        {activeTab === "overview" && <div className="dr-story-continuation"><div className="dr-story-help"><MemoryGuide locale={settings.locale} topic="story" /></div><details className="play-continuation"><summary>{mt("continue")}</summary>
          <HandoffView
            t={t}
            locale={settings.locale}
            snapshots={snapshots.filter((s) => memoryWorld(s, books) === scene.worldId)}
            disabled={!page.chatId || !page.messageCount || !page.compatible || page.generating || page.activity?.phase === "preparing" || page.activity?.phase === "waiting"}
            onCreate={() => void runService("handoff")}
            onContinue={() => void runService("continue-handoff")}
            onApply={(id) => void applySnapshot(id)}
            onDelete={async (id) => {
              if (settings.confirmDeletions && !window.confirm(t("confirmDelete"))) return;
              await repository.delete("snapshot", id);
              await notifyDataChanged();
              await refresh();
            }}
          />
        </details></div>}

        {activeTab === "settings" && (
          <SettingsView
            onExport={() => setExportRequest({ worldId: scene.worldId ?? libraryWorld })}
            t={t}
            settings={settings}
            world={worlds.find((world) => world.id === scene.worldId)}
            onSettings={persistSettings}
            onRefresh={() => { void notifyDataChanged(); void refresh(); }}
            onToast={setToast}
          />
        )}
      </main>

      {exportRequest && <ExportDialog locale={settings.locale} worlds={worlds} worldId={exportRequest.worldId} onClose={() => setExportRequest(null)} />}
      <nav className="bottom-nav" aria-label={t("navigation")}>
        <NavButton active={activeTab === "overview"} label={mt("play")} icon={<LayoutDashboard />} onClick={() => setActiveTab("overview")} />
        <NavButton active={activeTab === "worlds"} label={mt("lore")} icon={<Globe2 />} onClick={() => setActiveTab("worlds")} />
        <NavButton active={activeTab === "settings"} label={t("settings")} icon={<Settings2 />} onClick={() => setActiveTab("settings")} />
      </nav>

      {bookEditor && (
        <BookEditor
          t={t}
          locale={settings.locale}
          book={bookEditor === "new" ? null : bookEditor}
          onClose={() => setBookEditor(null)}
          onSave={async (book) => {
            await saveEditorRecord("book", { ...book, worldId: bookEditor === "new" ? libraryWorld : bookEditor.worldId ?? null }, bookEditor === "new" ? null : bookEditor);
            setBookEditor(null);
            await notifyDataChanged();
            await refresh();
          }}
        />
      )}

      {entryEditor && (
        <EntryEditor
          t={t}
          books={books.filter((b) => (b.worldId ?? null) === editorWorld)}
          entities={entities.filter((e) => e.worldId === editorWorld)}
          entries={entries.filter((e) => memoryWorld(e, books) === editorWorld)}
          locale={settings.locale}
          worldId={editorWorld}
          entry={entryEditor === "new" ? null : entryEditor}
          defaultBookId={books.some((b) => b.id === filterBookId && (b.worldId ?? null) === editorWorld) ? filterBookId : books.some((b) => b.id === activeBookId && (b.worldId ?? null) === editorWorld) ? activeBookId : null}
          onClose={() => setEntryEditor(null)}
          onSave={async (entry) => {
            await saveEditorRecord("entry", entry, entryBase);
            setEntryEditor(null);
            await notifyDataChanged();
            await refresh();
          }}
        />
      )}

      {toast && <div className="toast" role="status"><Check size={15} />{toast}</div>}
    </div></HelpLocale.Provider>
  );
}

function Overview(props: {
  locale: DeepRoleSettings["locale"];
  worldName?: string;
  controls: React.ReactNode;
  t: ReturnType<typeof useTranslator>;
  books: MemoryBook[];
  entries: MemoryEntry[];
  snapshots: HandoffSnapshot[];
  page: PageState;
  activeBookId: string | null;
  worldId: string | null;
  onSetActiveBook: (id: string | null) => void;
  onNewMemory: () => void;
  onAnalyze: () => void;
  onHandoff: () => void;
  onOpenMemory: () => void;
}) {
  const mt = (key: Parameters<typeof menuText>[1]) => menuText(props.locale, key);
  const x = (key: Parameters<typeof experienceText>[1]) => experienceText(props.locale, key);
  const busy = props.page.activity?.phase === "preparing" || props.page.activity?.phase === "waiting";
  const blocked = busy || props.page.generating || !props.page.chatId || !props.page.messageCount || !props.page.compatible;
  const enabledEntries = props.entries.filter((entry) => entry.enabled && (!entry.bookId || props.books.some((book) => book.id === entry.bookId && book.active))).length;
  return <div className="view-stack play-view">
    <div className="view-title"><div><h1>{mt("play")}</h1><p className="view-subtitle">{x("memoryCycle")}</p></div></div>
    <section className="play-world-card">
      <div className="eyebrow"><Globe2 size={13} />{props.worldName ? mt("attached") : mt("start")}</div>
      {props.page.compatible && props.controls}
      {!props.worldName && <p>{mt("startHint")}</p>}
      <button className={`button ${props.worldName ? "secondary" : "primary"} small`} onClick={props.onOpenMemory}>{mt("browse")}<ChevronRight /></button>
    </section>
    <ServiceProgress locale={props.locale} activity={props.page.activity} />
    <MemoryStatus key={props.page.chatUrl + props.worldId} locale={props.locale} connected={props.page.compatible} warning={props.page.warning} selection={props.page.selection} pendingHandoff={props.page.pendingHandoff} available={enabledEntries} onAdd={props.onNewMemory} />
    {!!props.page.selection?.omittedCount && <p className="dr-inline-note">{assistantText(props.locale, "omitted")}: {props.page.selection.omittedCount}</p>}
    {!!props.page.selection?.overBudgetTokens && <p className="dr-inline-note">{assistantText(props.locale, "overflow")}</p>}
    <section className="quick-actions">
      <button className="action-card" aria-label={mt("addFact")} onClick={props.onNewMemory}><Plus /><span><strong>{mt("addFact")}</strong><small>{mt("addFactHint")}</small></span><ChevronRight /></button>
      <button className="action-card" aria-label={mt("update")} onClick={props.onAnalyze} disabled={blocked}><BrainCircuit /><span><strong>{mt("update")}</strong><small>{x(busy ? "waiting" : props.page.generating ? "generating" : !props.page.messageCount ? "startChat" : "requestsVisible")}</small></span><ChevronRight /></button>
    </section>
  </div>;
}

function MemoryView(props: {
  selection?: ContextSelection;
  overrides?: MemoryOverrides;
  onMemoryUse?: (id: string, action: "include" | "exclude" | "reset") => Promise<void>;
  t: ReturnType<typeof useTranslator>;
  locale: DeepRoleSettings["locale"];
  books: MemoryBook[];
  entries: MemoryEntry[];
  filterBookId: string | "all" | "global";
  onFilter: (id: string | "all" | "global") => void;
  onNewBook: () => void;
  onEditBook: (book: MemoryBook) => void;
  onNewEntry: () => void;
  onEditEntry: (entry: MemoryEntry) => void;
  onDeleteEntry: (entry: MemoryEntry) => void;
  onDeleteBook: (book: MemoryBook) => void;
  onClearEntries: () => void;
  onCopyTutorial: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const normalized = query.trim().toLocaleLowerCase();
  const filtered = props.entries.filter((entry) => {
    if (props.filterBookId === "global" && entry.bookId) return false;
    if (props.filterBookId !== "all" && props.filterBookId !== "global" && entry.bookId !== props.filterBookId) return false;
    return !normalized || `${entry.title} ${entry.content} ${entry.keywords.join(" ")}`.toLocaleLowerCase().includes(normalized);
  });
  return (
    <div className="view-stack">
      <div className="view-title"><div><h2>{props.t("allMemories")}</h2></div><div className="button-row compact">
        {props.entries.length > 0 && <button className="button danger-button small" onClick={props.onClearEntries} title={props.t("deleteAllHint")}><Trash2 />{props.t("deleteAll")}</button>}
        <HelpButton className="button primary" onClick={props.onNewEntry} aria-label={props.t("newMemory")}><Plus />{props.t("newMemory")}</HelpButton>
      </div></div>
      <div className="search-field"><Search /><input aria-label={props.t("search")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={props.t("search")} /></div>
      <Select aria-label={props.t("book")} value={props.filterBookId} onChange={(e) => props.onFilter(e.target.value)}><option value="all">{props.t("allMemories")}</option><option value="global">{props.t("global")}</option>{props.books.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
      <details className="lore-list-options"><summary>{menuText(props.locale, "libraryTools")}</summary>
      <HelpSection className="tutorial-card">
        <div className="tutorial-icon"><CircleHelp /></div>
        <div><span>{props.t("tutorialBadge")}</span><strong>{props.t("tutorialPreset")}</strong><p>{props.t("tutorialPresetHint")}</p></div>
        <HelpButton className="button secondary small" onClick={() => setTutorialOpen(true)}>{props.t("openTutorial")}</HelpButton>
      </HelpSection>

      <HelpSection className="books-block">
        <div className="list-heading"><strong>{props.t("memoryBooks")}</strong><HelpButton onClick={props.onNewBook}><Plus />{props.t("newBook")}</HelpButton></div>
        <div className="book-list">
          {props.books.map((book) => (
            <div className="book-row" key={book.id}>
              <i style={{ background: book.color }} />
              <HelpButton className="book-main" onClick={() => props.onFilter(book.id)}><strong>{book.name}</strong><small>{props.t("recordsCount", { count: props.entries.filter((entry) => entry.bookId === book.id).length })}</small></HelpButton>
              <HelpButton className="row-action" onClick={() => props.onEditBook(book)} aria-label={props.t("edit")}><Edit3 /></HelpButton>
              <HelpButton className="row-action danger" onClick={() => props.onDeleteBook(book)} aria-label={props.t("delete")}><Trash2 /></HelpButton>
            </div>
          ))}
        </div>
      </HelpSection>
      </details>

      <HelpSection className="memory-list">
        {filtered.length === 0 && <EmptyState icon={<MemoryStick />} text={query || props.filterBookId !== "all" ? uiText(props.locale, "emptyResults") : props.t("emptyMemories")} action={!query ? props.t("newMemory") : undefined} onAction={props.onNewEntry} />}
        {filtered.map((entry) => (
          <article className="memory-card" key={entry.id}>
            <div className="memory-card-top">
              <TooltipButton className={`mode-badge mode-${entry.activation}`} aria-label={uiText(props.locale, entry.activation)} tooltip={uiText(props.locale, `${entry.activation}Hint`)} onClick={() => props.onEditEntry(entry)}>{uiText(props.locale, entry.activation)}</TooltipButton>
              <div className="memory-actions"><HelpButton onClick={() => props.onEditEntry(entry)} aria-label={props.t("edit")}><Edit3 /></HelpButton></div>
            </div>
            <h3>{entry.title}</h3>
            <p className="memory-preview">{entry.content}</p>
            {props.onMemoryUse && <MemoryUse compact locale={props.locale} id={entry.id} selection={props.selection} overrides={props.overrides} onChange={props.onMemoryUse} />}
            <details className="memory-detail"><summary>{uiText(props.locale, "recordActions")}</summary>
              {entry.keywords.length > 0 && <div className="keyword-list">{entry.keywords.slice(0, 6).map((keyword) => <span key={keyword}>{keyword}</span>)}</div>}
              <button className="button secondary small danger" aria-label={props.t("delete")} onClick={() => props.onDeleteEntry(entry)}><Trash2 />{props.t("delete")}</button>
            </details>
          </article>
        ))}
      </HelpSection>
      {tutorialOpen && <TutorialPresetModal t={props.t} locale={props.locale} onClose={() => setTutorialOpen(false)} onCopy={async () => { await props.onCopyTutorial(); setTutorialOpen(false); }} />}
    </div>
  );
}

function TutorialPresetModal(props: { t: ReturnType<typeof useTranslator>; locale: DeepRoleSettings["locale"]; onClose: () => void; onCopy: () => Promise<void> }) {
  const preset = getTutorialPreset(props.locale);
  return (
    <div className="modal-backdrop" role="presentation">
      <HelpSection className="modal tutorial-modal" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
        <header><div><small>{props.t("tutorialBadge")}</small><h2 id="tutorial-title">{props.t("tutorialPreset")}</h2></div><HelpButton className="icon-button" onClick={props.onClose} aria-label={props.t("close")}><X /></HelpButton></header>
        <div className="modal-body">
          <div className="tutorial-section"><span>{props.t("exampleProfile")}</span><strong>{preset.profileName}</strong><p>{preset.profileDescription}</p></div>
          <div className="tutorial-section"><span>{props.t("examplePlot")}</span><strong>{preset.plotTitle}</strong><p>{preset.plotDescription}</p></div>
          <div className="tutorial-section"><span>{props.t("includedMemory")}</span><div className="tutorial-memory-list">{preset.memories.map((memory) => <article key={memory.title}><div><strong>{memory.title}</strong><span className={`mode-badge mode-${memory.activation}`}>{props.t(memory.activation === "always" ? "activationAlways" : memory.activation === "smart" ? "activationSmart" : "activationManual")}</span></div><p>{memory.content}</p><small>{memory.keywords.join(" · ")}</small></article>)}</div></div>
          <div className="modal-actions"><HelpButton className="button secondary" onClick={props.onClose}>{props.t("close")}</HelpButton><HelpButton className="button primary" onClick={() => void props.onCopy()}>{props.t("createEditableCopy")}</HelpButton></div>
        </div>
      </HelpSection>
    </div>
  );
}

function HandoffView(props: {
  t: ReturnType<typeof useTranslator>;
  locale: DeepRoleSettings["locale"];
  snapshots: HandoffSnapshot[];
  disabled?: boolean;
  onCreate: () => void;
  onContinue: () => void;
  onApply: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="view-stack">
      <div className="view-title"><div><small>{props.t("handoff")}</small><h1>{props.t("snapshots")}</h1></div></div>
      <HelpSection className="handoff-hero">
        <MessageSquareMore />
        <h2>{props.t("saveSnapshot")}</h2>
        <p>{continuationText(props.locale, "hint")}</p>
        <p>{continuationText(props.locale, "detail")}</p>
        <HelpButton className="button primary" disabled={props.disabled} onClick={props.onContinue}>{props.t("continueChat")}</HelpButton>
        <details className="memory-detail"><summary>{continuationText(props.locale, "recap")}</summary><p>{uiText(props.locale, "handoffHint")}</p><HelpButton className="button secondary" disabled={props.disabled} onClick={props.onCreate}>{props.t("saveSnapshot")}</HelpButton></details>
      </HelpSection>
      {props.snapshots.length === 0 && <EmptyState icon={<ArchiveRestore />} text={props.t("noSnapshots")} />}
      {props.snapshots.map((snapshot) => (
        <article className="snapshot-card" key={snapshot.id}>
          <div><small>{new Intl.DateTimeFormat(props.locale, { dateStyle: "medium", timeStyle: "short" }).format(snapshot.createdAt)}</small><h3>{snapshot.title}</h3></div>
          <p>{snapshot.summary}</p>
          {snapshot.continuation && <p className="setting-copy">{continuationText(props.locale, snapshot.continuation.partial ? "partial" : snapshot.continuation.source)}</p>}
          {/^https:\/\/chat\.deepseek\.com\/(?:a\/)?chat\/(?:s\/)?[\w-]+(?:[?#].*)?$/u.test(snapshot.sourceChatUrl) && <a className="button secondary small" href={snapshot.sourceChatUrl} target="_blank" rel="noreferrer">{continuationText(props.locale, "source")}</a>}
          <div className="button-row"><HelpButton className="button primary small" onClick={() => props.onApply(snapshot.id)}>{props.t("apply")}</HelpButton><HelpButton className="icon-button" onClick={() => navigator.clipboard.writeText(snapshot.summary)} aria-label={props.t("copy")}><Download /></HelpButton><HelpButton className="icon-button danger" onClick={() => props.onDelete(snapshot.id)} aria-label={props.t("delete")}><Trash2 /></HelpButton></div>
        </article>
      ))}
    </div>
  );
}

function SettingsView(props: {
  onExport: () => void;
  t: ReturnType<typeof useTranslator>;
  settings: DeepRoleSettings;
  world?: WorldProfile;
  onSettings: (settings: DeepRoleSettings) => Promise<void>;
  onRefresh: () => void;
  onToast: (message: string) => void;
}) {
  const [section, setSection] = useState<"memory" | "data" | "characters" | "app" | "images" | "appearance">("memory");
  const [capacityDraft, setCapacityDraft] = useState(String(chatCapacity(props.settings.chatContextCapacity)));
  useEffect(() => setCapacityDraft(String(chatCapacity(props.settings.chatContextCapacity))), [props.settings.chatContextCapacity]);
  const [reminderDraft, setReminderDraft] = useState(String(props.settings.suggestionInterval));
  useEffect(() => setReminderDraft(String(props.settings.suggestionInterval)), [props.settings.suggestionInterval]);
  const x = (key: Parameters<typeof experienceText>[1]) => experienceText(props.settings.locale, key);
  const [password, setPassword] = useState("");
  const [vaultPassword, setVaultPassword] = useState("");
  const u = (key: Parameters<typeof uiText>[1]) => uiText(props.settings.locale, key);
  const [vaultEnabled, setVaultEnabled] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [restore, setRestore] = useState<{ fileName: string; payload: BackupPayload } | null>(null);
  const mounted = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    mounted.current = true;
    void getVaultConfig().then((config) => { if (mounted.current) setVaultEnabled(config.enabled); });
    return () => { mounted.current = false; };
  }, []);
  async function canFinish() { return mounted.current && !await repository.isLocked() && mounted.current; }

  async function importBackup(file: File) {
    if (backupBusy) return;
    setBackupBusy(true);
    let encrypted = false;
    try {
      if (importFileTooLarge(file.size, "backup")) throw new Error("backupTooLarge");
      const text = await file.text();
      const parsedHeader = JSON.parse(text.replace(/^\uFEFF/, "")) as { format?: string } | null;
      encrypted = parsedHeader?.format === "deeprole-encrypted";
      const importPassword = encrypted ? password || window.prompt(props.t("password")) : undefined;
      if (importPassword === null) return;
      const payload = await parseBackup(text, importPassword);
      if (!await canFinish()) return;
      setRestore({ fileName: file.name, payload });
    } catch (error) {
      if (mounted.current) props.onToast(error instanceof Error && error.message === "backupTooLarge" ? props.t("backupTooLarge") : encrypted && !(error instanceof InvalidEncryptedPayloadError) ? props.t("wrongPassword") : props.t("invalidBackup"));
    } finally { setBackupBusy(false); }
  }

  async function toggleVault() {
    if (!vaultEnabled && !vaultPassword || backupBusy) return;
    setBackupBusy(true);
    try {
      if (vaultEnabled) await repository.disableVault();
      else await repository.enableVault(vaultPassword);
      setVaultEnabled(!vaultEnabled);
      setVaultPassword("");
      props.onRefresh();
    } catch {
      if (mounted.current) props.onToast(props.t("vaultFailed"));
    } finally { setBackupBusy(false); }
  }

  async function lockVault() {
    if (backupBusy) return;
    setBackupBusy(true);
    try { await repository.lockVault(); props.onRefresh(); }
    catch { if (mounted.current) props.onToast(props.t("vaultFailed")); }
    finally { setBackupBusy(false); }
  }

  return (
    <div className="view-stack">
      <div className="view-title"><div><small>DeepRole</small><h1>{props.t("settings")}</h1></div></div>
      <nav className="dr-settings-nav" aria-label={x("settingsLabel")}>{(["memory", "characters", "images", "appearance", "app", "data"] as const).map((id) => <button key={id} type="button" aria-pressed={section === id} onClick={() => setSection(id)}>{id === "images" ? imageText(props.settings.locale, "title") : id === "characters" ? characterText(props.settings.locale, "title") : x(id === "appearance" ? "settingsAppearance" : id === "memory" ? "settingsMemory" : id === "data" ? "settingsData" : "settingsPreferences")}</button>)}</nav>
      <div className="dr-settings-page" hidden={section !== "appearance"}>
        <SettingsCard icon={<Eye />} title={portraitUploadText(props.settings.locale, "title")}>
          <PortraitUploadSettings settings={props.settings} onSettings={props.onSettings} />
        </SettingsCard>
        <SettingsCard icon={<Eye />} title={x("reasoningTitle")}>
          <label className="toggle-row"><span>{x("reasoningShow")}</span><input type="checkbox" checked={props.settings.showDeepSeekReasoning === true} onChange={event => void props.onSettings({ ...props.settings, showDeepSeekReasoning: event.target.checked })} /></label>
          <p className="setting-copy">{x("reasoningHint")}</p>
        </SettingsCard>
      </div>
      <div className="dr-settings-page" hidden={section !== "images"}><ImageSettings locale={props.settings.locale} onPermission={profile => requestImagePermission(profile.baseUrl)} onModels={async profile => { const result = await browser.runtime.sendMessage({ type: "DR_IMAGE_MODELS", profile } satisfies DeepRoleMessage); if (!result?.ok) throw Object.assign(new Error(result?.error ?? "failed"), { code: result?.error ?? "failed", diagnostic: result?.diagnostic, headers: result?.headers }); return result.models; }} /></div>
      <div className="dr-settings-page" hidden={section !== "memory"}>
      <SettingsCard icon={<BrainCircuit />} title={u("memorySettings")}>
        <MemorySelectionSettings key={props.world?.id ?? "global"} locale={props.settings.locale} world={props.world} settings={props.settings} onSave={async (values, expected) => {
          if (expected) { const next = { ...expected, ...values, updatedAt: Date.now() }; await repository.putIfUnchanged("world", next, expected); props.onRefresh(); return next; }
          else await props.onSettings({ ...props.settings, ...values });
        }} />
      </SettingsCard>
      </div>
      <div className="dr-settings-page" hidden={section !== "characters"}>
      <SettingsCard icon={<BrainCircuit />} title={characterText(props.settings.locale, "title")}>
        {props.world && <p className="setting-copy">{exportText(props.settings.locale, "emotionScope").replace("{name}", props.world.name)}</p>}
        <CharacterSettings key={props.world?.id ?? "global"} settings={props.settings} worldEmotions={props.world?.characterEmotions} onSettings={props.onSettings} onEmotions={async emotions => {
          if (props.world) await saveWorldEmotionList(props.world, emotions);
          else { await detachDefaultEmotionImages(props.settings.characterEmotions ?? DEFAULT_SETTINGS.characterEmotions!, emotions); await props.onSettings({ ...props.settings, characterEmotions: emotions }); }
          props.onRefresh();
        }} />
      </SettingsCard>
      </div><div className="dr-settings-page" hidden={section !== "app"}>
      <SettingsCard icon={<Pin />} title={props.settings.locale === "ru" ? "Панели и сцена" : "Panels and scene"}>
        <PanelWidthControl locale={props.settings.locale} value={props.settings.floatingPanelWidth} onSave={async width => { await props.onSettings({ ...props.settings, floatingPanelWidth: width }); }} />
        <label className="toggle-row"><span>{adaptiveText(props.settings.locale).title}</span><input type="checkbox" checked={props.settings.adaptiveLayout !== false} onChange={event => void props.onSettings({ ...props.settings, adaptiveLayout: event.target.checked })} /></label>
        <p className="setting-copy">{adaptiveText(props.settings.locale).hint}</p>
        <p className="setting-copy">{props.settings.locale === "ru" ? "Эти настройки действуют во всех чатах. Перетаскивание портретов остаётся доступным, когда закрепление выключено." : "These settings apply across chats. You can still drag portraits when pinning is off."}</p>
        <label className="toggle-row"><span>{sceneChoiceText(props.settings.locale, "pinChoices")}</span><input type="checkbox" checked={!!props.settings.pinSceneChoices} onChange={event => void props.onSettings({ ...props.settings, pinSceneChoices: event.target.checked })} /></label>
        <label className="toggle-row"><span>{sceneChoiceText(props.settings.locale, "pinPortraits")}</span><input type="checkbox" checked={!!(props.settings.pinPortraitLeft || props.settings.pinPortraitRight)} onChange={event => void props.onSettings({ ...props.settings, pinPortraitLeft: event.target.checked, pinPortraitRight: event.target.checked })} /></label>
      </SettingsCard>
      <SettingsCard icon={<ShieldCheck />} title={replyRecoveryText(props.settings.locale).title}>
        <label className="toggle-row"><span>{replyRecoveryText(props.settings.locale).toggle}</span><input type="checkbox" checked={props.settings.replyRecoveryEnabled !== false} onChange={event => void props.onSettings({ ...props.settings, replyRecoveryEnabled: event.target.checked })} /></label>
        <p className="setting-copy">{replyRecoveryText(props.settings.locale).hint}</p>
      </SettingsCard>
      <SettingsCard icon={<Languages />} title={props.t("language")}>
        <div className="segmented"><HelpButton className={props.settings.locale === "ru" ? "active" : ""} onClick={() => props.onSettings({ ...props.settings, locale: "ru" })}>{props.t("russian")}</HelpButton><HelpButton className={props.settings.locale === "en" ? "active" : ""} onClick={() => props.onSettings({ ...props.settings, locale: "en" })}>{props.t("english")}</HelpButton></div>
      </SettingsCard>
      <SettingsCard icon={<Eye />} title={x("contextIndicatorsTitle")}>
        <p className="setting-copy">{x("contextIndicatorsHint")}</p>
        <label className="toggle-row"><span>{x("chatContextIndicator")}</span><input type="checkbox" checked={props.settings.showChatContextMeter} onChange={(event) => void props.onSettings({ ...props.settings, showChatContextMeter: event.target.checked })} /></label>
        <label className="toggle-row"><span>{x("memoryContextIndicator")}</span><input type="checkbox" checked={props.settings.showMemoryContextIndicator} onChange={(event) => void props.onSettings({ ...props.settings, showMemoryContextIndicator: event.target.checked })} /></label>
        <label className="toggle-row"><span>{continuationText(props.settings.locale, "warnings")}</span><input type="checkbox" checked={props.settings.contextWarningsEnabled !== false} onChange={event => void props.onSettings({ ...props.settings, contextWarningsEnabled: event.target.checked })} /></label>
        <p className="setting-copy">{continuationText(props.settings.locale, "warningHint")}</p>
        <label className="field-label"><span>{continuationText(props.settings.locale, "capacity")}</span><input type="number" min="8000" max="2000000" step="1000" value={capacityDraft} onChange={event => setCapacityDraft(event.target.value)} onBlur={() => {
          const number = Number(capacityDraft), value = capacityDraft.trim() && Number.isFinite(number) ? Math.min(2_000_000, Math.max(8000, Math.round(number))) : chatCapacity(props.settings.chatContextCapacity);
          setCapacityDraft(String(value)); if (value !== props.settings.chatContextCapacity) void props.onSettings({ ...props.settings, chatContextCapacity: value });
        }} /></label>
        <p className="setting-copy">{continuationText(props.settings.locale, "capacityHint")}</p>
      </SettingsCard>
      </div>
      <div className="dr-settings-page" hidden={section !== "data"}>
      <SettingsCard icon={<FileKey2 />} title={u("backup")}>
        <p className="setting-copy">{u("backupHint")}</p>
        <label className="field-label"><span className="help-field-title">{u("backupPassword")}</span><input className="input" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <div className="button-grid"><HelpButton className="button secondary" disabled={backupBusy} onClick={props.onExport}><Download />{exportText(props.settings.locale, "title")}</HelpButton><HelpButton className="button secondary" disabled={backupBusy} onClick={() => fileInput.current?.click()}><Upload />{props.t("importData")}</HelpButton></div>
        <input ref={fileInput} hidden type="file" accept=".json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackup(file); event.target.value = ""; }} />
      </SettingsCard>
      </div>
      {restore && <BackupRestore t={props.t} fileName={restore.fileName} payload={restore.payload} onClose={() => setRestore(null)} onRestore={async (mode) => { await restoreBackup(restore.payload, mode); setRestore(null); props.onToast(props.t("importSuccess")); props.onRefresh(); }} />}
      <div className="dr-settings-page" hidden={section !== "app"}>
      <SettingsCard icon={<BrainCircuit />} title={u("reminders")}>
        <p className="setting-copy">{u("remindersHint")}</p>
        <label className="toggle-row"><span>{u("remind")}</span><input type="checkbox" checked={props.settings.suggestionsEnabled} onChange={(event) => void props.onSettings({ ...props.settings, suggestionsEnabled: event.target.checked })} /></label>
        <label className="field-label"><span className="help-field-title">{u("interval")}</span><input type="number" min="4" max="100" value={reminderDraft} disabled={!props.settings.suggestionsEnabled} onChange={(event) => setReminderDraft(event.target.value)} onBlur={() => { const number = Number(reminderDraft); const value = reminderDraft.trim() && Number.isFinite(number) ? Math.min(100, Math.max(4, Math.round(number))) : props.settings.suggestionInterval; setReminderDraft(String(value)); if (value !== props.settings.suggestionInterval) void props.onSettings({ ...props.settings, suggestionInterval: value }); }} /></label>
      </SettingsCard></div>
      <div className="dr-settings-page" hidden={section !== "data"}><SettingsCard icon={<CircleHelp />} title={props.t("deletionProtection")}>
        <p className="setting-copy">{props.t("deletionProtectionHint")}</p>
        <label className="toggle-row"><span className="help-field-title">{props.t("deletionProtection")}</span><input type="checkbox" checked={props.settings.confirmDeletions} onChange={(event) => props.onSettings({ ...props.settings, confirmDeletions: event.target.checked })} /></label>
      </SettingsCard><SettingsCard icon={<ShieldCheck />} title={u("vault")}>
        <p className="setting-copy">{u("vaultHint")}</p>
        {!vaultEnabled && <label className="field-label">{u("vaultPassword")}<input className="input" type="password" autoComplete="new-password" value={vaultPassword} onChange={(event) => setVaultPassword(event.target.value)} /></label>}
        {vaultEnabled && <><button className="button secondary" disabled={backupBusy} onClick={() => void lockVault()}><LockKeyhole />{props.t("lockVault")}</button><p className="setting-copy">{props.t("lockVaultHint")}</p></>}
        <HelpButton className={`button ${vaultEnabled ? "danger-button" : "secondary"}`} disabled={!vaultEnabled && !vaultPassword || backupBusy} onClick={() => void toggleVault()}>{vaultEnabled ? <UnlockKeyhole /> : <LockKeyhole />}{vaultEnabled ? props.t("disableVault") : props.t("enableVault")}</HelpButton>
      </SettingsCard>
      </div>
      <small className="build-info">DeepRole 0.1.0 · {import.meta.env.VITE_BUILD_TIME ? uiText(props.settings.locale, "build", { date: new Intl.DateTimeFormat(props.settings.locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(import.meta.env.VITE_BUILD_TIME)) }) : u("preview")}</small>
    </div>
  );
}

function BookEditor(props: { t: ReturnType<typeof useTranslator>; locale: DeepRoleSettings["locale"]; book: MemoryBook | null; onClose: () => void; onSave: (book: MemoryBook) => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<"conflict" | "failed" | null>(null);
  const [name, setName] = useState(props.book?.name ?? "");
  const [description, setDescription] = useState(props.book?.description ?? "");
  const [color, setColor] = useState(props.book?.color ?? BOOK_COLORS[0]!);
  return <Modal title={props.book ? props.t("memoryBooks") : props.t("newBook")} closeLabel={props.t("close")} onClose={props.onClose}>
    <label className="field-label"><span className="help-field-title">{props.t("title")}</span><input autoFocus className="input" value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label className="field-label"><span className="help-field-title">{props.t("description")}</span><textarea className="textarea" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    <div className="color-picker">{BOOK_COLORS.map((item) => <HelpButton key={item} className={item === color ? "active" : ""} style={{ background: item }} onClick={() => setColor(item)} aria-label={item} />)}</div>
    {error && <p className="error-text" role="alert">{error === "conflict" ? sceneText(props.locale, "editorConflict") : assistantText(props.locale, "failed")}</p>}
    <div className="modal-actions"><HelpButton className="button secondary" disabled={busy} onClick={props.onClose}>{props.t("cancel")}</HelpButton><HelpButton className="button primary" disabled={busy || !name.trim()} onClick={() => { const now = Date.now(); setBusy(true); setError(null); void props.onSave({ ...props.book, id: props.book?.id ?? createId("book"), name: name.trim(), description: description.trim(), color, active: props.book?.active ?? true, createdAt: props.book?.createdAt ?? now, updatedAt: now }).catch((error) => setError(error instanceof Error && error.message === "memory-conflict" ? "conflict" : "failed")).finally(() => setBusy(false)); }}>{props.t("save")}</HelpButton></div>
  </Modal>;
}

function EntryEditor(props: { t: ReturnType<typeof useTranslator>; books: MemoryBook[]; entities: SceneEntity[]; entries: MemoryEntry[]; locale: DeepRoleSettings["locale"]; worldId: string | null; entry: MemoryEntry | null; defaultBookId: string | null; onClose: () => void; onSave: (entry: MemoryEntry) => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<"conflict" | "failed" | null>(null);
  const [title, setTitle] = useState(props.entry?.title ?? "");
  const [content, setContent] = useState(props.entry?.content ?? "");
  const [keywords, setKeywords] = useState(props.entry?.keywords.join(", ") ?? "");
  const [bookId, setBookId] = useState<string>(props.entry?.bookId ?? props.defaultBookId ?? "");
  const [activation, setActivation] = useState<ActivationMode>(props.entry?.activation ?? "smart");
  const [priority, setPriority] = useState<MemoryPriority>(props.entry?.priority ?? "normal");
  const [entityIds, setEntityIds] = useState(props.entry?.entityIds ?? []);
  const [links, setLinks] = useState(props.entry?.links ?? []);
  const [linkQuery, setLinkQuery] = useState("");
  const linkSuggestions = suggestEntryLinks({ id: props.entry?.id ?? "", content, links }, props.entries);
  return <Modal title={props.entry ? props.t("editMemory") : props.t("newMemory")} closeLabel={props.t("close")} onClose={props.onClose} wide>
    <label className="field-label"><span className="help-field-title">{props.t("title")}</span><input aria-label={props.t("title")} autoFocus className="input" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label className="field-label"><span className="help-field-title">{props.t("content")}</span><textarea aria-label={props.t("content")} className="textarea tall" value={content} onChange={(event) => setContent(event.target.value)} /></label>
    <MemoryModeControl locale={props.locale} value={activation} onChange={setActivation} disabled={busy} example />
    <details className="rp-entry-links"><summary>{uiText(props.locale, "organize")}</summary><label className="field-label"><span className="help-field-title">{props.t("keywords")}</span><input className="input" value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder={props.t("keywordsHint")} /></label>
    <div className="form-grid"><label className="field-label"><span className="help-field-title">{props.t("book")}</span><Select value={bookId} onChange={(event) => setBookId(event.target.value)}><option value="">{props.t("global")}</option>{props.books.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}</Select></label><label className="field-label"><span className="help-field-title">{props.t("priority")}</span><Select value={priority} onChange={(event) => setPriority(event.target.value as MemoryPriority)}><option value="low">{props.t("priorityLow")}</option><option value="normal">{props.t("priorityNormal")}</option><option value="high">{props.t("priorityHigh")}</option></Select></label></div>
    </details>
    {props.entities.length > 0 && <details><summary>{uiText(props.locale, "profiles")}</summary><div className="rp-link-list">{props.entities.map((entity) => <label className="rp-check" key={entity.id}><input type="checkbox" checked={entityIds.includes(entity.id)} onChange={(e) => setEntityIds(e.target.checked ? [...entityIds, entity.id] : entityIds.filter((id) => id !== entity.id))} />{entity.name}</label>)}</div></details>}
    <details className="rp-entry-links"><summary>{sceneText(props.locale, "entryLinks")} · {links.length}</summary><p className="rp-hint">{sceneText(props.locale, "linkHint")}</p><input className="input" aria-label={sceneText(props.locale, "search")} placeholder={sceneText(props.locale, "search")} value={linkQuery} onChange={(e) => setLinkQuery(e.target.value)} /><div className="rp-link-list">{props.entries.filter((entry) => entry.id !== props.entry?.id && (links.some((link) => link.targetId === entry.id) || entry.title.toLocaleLowerCase().includes(linkQuery.toLocaleLowerCase()))).map((entry) => { const link = links.find((v) => v.targetId === entry.id); return <div key={entry.id}><label className="rp-check"><input type="checkbox" checked={Boolean(link)} disabled={!link && links.length >= 100} onChange={(e) => setLinks(e.target.checked ? [...links, { targetId: entry.id, label: "", mode: "context" }] : links.filter((v) => v.targetId !== entry.id))} />{entry.title}</label>{link && <div className="rp-link-options"><input className="input" maxLength={160} aria-label={`${sceneText(props.locale, "linkLabel")}: ${entry.title}`} placeholder={sceneText(props.locale, "linkLabel")} value={link.label} onChange={(e) => setLinks(links.map((v) => v.targetId === entry.id ? { ...v, label: e.target.value } : v))} /><Select aria-label={`${sceneText(props.locale, "entryLinks")}: ${entry.title}`} value={link.mode} onChange={(e) => setLinks(links.map((v) => v.targetId === entry.id ? { ...v, mode: e.target.value as "context" | "reference" } : v))}><option value="context">{sceneText(props.locale, "linkContext")}</option><option value="reference">{sceneText(props.locale, "linkReference")}</option></Select></div>}</div>; })}</div></details>
    {linkSuggestions.length > 0 && <details><summary>{sceneText(props.locale, "proposedLinks")} · {linkSuggestions.length}</summary><p className="rp-hint">{sceneText(props.locale, "linkSuggestionHint")}</p>{linkSuggestions.map((entry) => <HelpButton key={entry.id} className="button secondary small" disabled={links.length >= 100} onClick={() => setLinks([...links, { targetId: entry.id, label: sceneText(props.locale, "linkMention"), mode: "reference" }])}>＋ {entry.title}</HelpButton>)}</details>}
    {error && <p className="error-text" role="alert">{error === "conflict" ? sceneText(props.locale, "editorConflict") : assistantText(props.locale, "failed")}</p>}
    <div className="modal-actions"><HelpButton className="button secondary" disabled={busy} onClick={props.onClose}>{props.t("cancel")}</HelpButton><HelpButton className="button primary" disabled={busy || !title.trim() || !content.trim()} onClick={() => { const now = Date.now(); setBusy(true); setError(null); void props.onSave({ ...props.entry, worldId: props.worldId, entityIds, links, id: props.entry?.id ?? createId("memory"), bookId: bookId || null, title, content, keywords: [...new Set(keywords.split(",").map((item) => item.trim()).filter(Boolean))], activation, priority, enabled: props.entry?.enabled ?? true, source: props.entry?.source ?? { type: "manual" }, createdAt: props.entry?.createdAt ?? now, updatedAt: now }).catch((error) => setError(error instanceof Error && error.message === "memory-conflict" ? "conflict" : "failed")).finally(() => setBusy(false)); }}>{props.t("save")}</HelpButton></div>
  </Modal>;
}

function VaultUnlock(props: { onUnlocked: () => void; onClose?: () => void; t: ReturnType<typeof useTranslator> }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  return <main className="center-screen" aria-busy={busy}>{props.onClose && <button className="menu-close vault-close" type="button" aria-label={props.t("close")} onClick={props.onClose}><X /></button>}<div className="vault-orb" aria-hidden="true"><LockKeyhole /></div><h1>DeepRole</h1><p>{props.t("vaultLocked")}</p><input className="input" type="password" aria-label={props.t("password")} autoComplete="current-password" value={password} disabled={busy} onChange={(event) => { setPassword(event.target.value); setError(null); }} onKeyDown={(event) => { if (event.key === "Enter") void unlock(); }} placeholder={props.t("password")} />{error && <small className="error-text" role="alert">{props.t(error)}</small>}<HelpButton className="button primary full" disabled={!password || busy} onClick={() => void unlock()}>{props.t("unlock")}</HelpButton></main>;
  async function unlock() {
    if (busy || !password) return;
    setBusy(true); setError(null);
    try { await repository.unlockVault(password); props.onUnlocked(); }
    catch (cause) { setError(cause instanceof DOMException && cause.name === "OperationError" ? "wrongPassword" : "vaultFailed"); }
    finally { setBusy(false); }
  }
}

function Onboarding(props: { t: ReturnType<typeof useTranslator>; onFinish: () => void }) {
  return <div className="onboarding"><div className="onboarding-brand"><div className="brand-mark large"><span /></div><strong>DeepRole</strong></div><div className="onboarding-visual"><Globe2 /></div><h1>{props.t("welcomeTitle")}</h1><p>{props.t("welcomeText")}</p><div className="onboarding-actions"><HelpButton className="button primary" onClick={props.onFinish}>{props.t("finish")}<ChevronRight /></HelpButton></div></div>;
}


function SettingsCard(props: { icon: React.ReactNode; title: string; children: React.ReactNode }) { return <HelpSection className="settings-card"><header>{props.icon}<h2>{props.title}</h2></header><div>{props.children}</div></HelpSection>; }
function EmptyState(props: { icon: React.ReactNode; text: string; action?: string; onAction?: () => void }) { return <div className="empty-state"><div>{props.icon}</div><p>{props.text}</p>{props.action && <HelpButton className="button secondary" onClick={props.onAction}>{props.action}</HelpButton>}</div>; }
function NavButton(props: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void }) { return <HelpButton className={props.active ? "active" : ""} onClick={props.onClick}>{props.icon}<span>{props.label}</span></HelpButton>; }
function LoadingScreen() { return <div className="center-screen"><div className="brand-mark large pulse"><span /></div></div>; }
function useTranslator() { return (key: MessageKey, vars?: Record<string, string | number>) => translate("en", key, vars); }

async function notifyDataChanged() { try { await browser.runtime.sendMessage({ type: "DR_DATA_CHANGED" } satisfies DeepRoleMessage); } catch { /* no active listeners */ } }
