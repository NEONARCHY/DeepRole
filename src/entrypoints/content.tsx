import { startCastWorker } from "../adapters/cast-worker";
import { characterFieldPrompt, characterFieldResult, validCharacterTextRequest, type CharacterTextRequest } from "../core/character-text";
import { createRoot, type Root } from "react-dom/client";
import { WIDGET_LAYOUT_KEY, parseWidgetLayout } from "./content/WidgetDeck";
import { browser } from "wxt/browser";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { injectScript } from "wxt/utils/inject-script";
import { DeepSeekDomAdapter } from "../adapters/deepseek-dom";
import { ReasoningPresentation } from "../adapters/reasoning-presentation";
import { DeepSeekReplyRecovery, recoveredReplyContext } from "../adapters/deepseek-reply-recovery";
import { pendingRecoveredReply, replyRecoveryText } from "../core/reply-recovery";
import type { RecoveredReplyEdit } from "../storage/recovered-replies";
import { nativeMessageIdentity, nativeMessageRows, isUserMessage } from "../adapters/deepseek-message-dom";
import { dismissSceneChoiceCards, latestSceneChoiceTarget, syncSceneChoiceCards, type ChoicePin } from "../adapters/deepseek-choices-dom";
import { hideCharacterTextServices, plainCharacterReplyText, findServiceReplyRows, findServiceResponseElements, findVirtualizedServiceReply, findVirtualizedServiceResponseElements, markServiceReplyRow, presentMemoryAnalysis, serviceReplyText, removeServicePreloader, replaceArchivedMemoryPayloads, replaceServicePayloadWithSummary, restoreServiceTurns } from "../adapters/deepseek-service-dom";
import { experienceText } from "../core/experience-i18n";
import { DEFAULT_SETTINGS } from "../core/defaults";
import { validStoryContinuation, withLatestVisibleStory } from "../core/story-continuation";
import { visibleStoryHistory } from "../adapters/story-history-dom";
import { clearSelfieImageCache, isSelfieRequest, SELFIE_DELAY } from "../core/selfies";
import { ScenePhotosPresenter } from "../adapters/scene-photos-dom";
import { imagePlanRoster, parseImageScenePlan } from "../core/image-plan";
import { IllustrationsPresenter, illustrationSceneText } from "../adapters/illustrations-dom";
import { getImageSettings, IMAGE_SETTINGS_KEY } from "../storage/image-settings";
import { DEFAULT_IMAGE_SETTINGS, MAX_IMAGE_PLAN_TEXT, type Illustration, type ImageSettings } from "../core/image-generation";
import { imageText, imageErrorKey } from "../core/image-i18n";
import { closePortraitViewer } from "../adapters/portrait-viewer";
import { presentHiddenHandoffs } from "../adapters/deepseek-handoff-dom";
import { continuationKey, continuationScopeMatches, recentSceneReference, type ContinuationFlow } from "../core/continuation-flow";
import { boundStory } from "../core/story-continuation";
import { chatCapacity, contextWarningLevel } from "../core/context-capacity";
import { continuationText } from "../core/continuation-i18n";
import type { StoryContinuation } from "../core/types";
import { startupDeadline } from "../core/startup";
import { formatMemoryContext } from "../core/context";
import { parseSceneChoices, sceneChoiceInstruction, sceneChoiceRecoveryPrompt, sceneChoiceText, type SceneChoice } from "../core/scene-choices";
import { createId } from "../core/id";
import { translate, type MessageKey } from "../core/i18n";
import {
  CONTEXT_INDICATOR_POSITION_KEY,
  type DeepRoleMessage,
  type TabSessionState,
  type TabSessionGuard,
} from "../core/messages";
import { changeMemoryOverride, compileMemoryWorkspace, EMPTY_OVERRIDES, libraryRecords, scopedMemories } from "../core/memory-workspace";
import { characterFactFingerprint, memoryFingerprint, prepareMemoryProposals } from "../core/memory-proposals";
import { assistantText } from "../core/assistant-i18n";
import {
  createSnapshot,
  characterFactPrompt,
  handoffPrompt,
  sceneHandoffPrompt,
  memoryAnalysisPrompt,
  loreDraftPrompt,
  parseServiceData,
  SERVICE_START,
} from "../core/service-protocol";
import { deriveKeywords, estimateTokens } from "../core/text";
import type {
  ChatBinding,
  ContextSelection,
  ConversationEstimate,
  DeepRoleSettings,
  HandoffSnapshot,
  MemoryBook,
  MemoryEntry,
  ServiceRequest,
  MemoryOverrides, MemoryProposalBatch, LoreChange,
} from "../core/types";
import { PageWidget, type WidgetState } from "./content/PageWidget";
import { pendingActivity, serviceActivity, SERVICE_TIMEOUT_MS, type ServiceActivity } from "../core/memory-experience";
import "./content/page-widget.css";
import "./shared/help.css";
import { contentRepository as repository } from "../storage/content-repository";
import { getSettings, updateSettings, storageKeys } from "../storage/settings";
import { LIBRARY_CHANGE_KEY } from "../storage/changes";
import { EMPTY_SCENE, isMemoryInScene, memoryWorld } from "../core/scene";
import type { SceneState, WorldProfile, SceneEntity, StoryTemplate } from "../core/types";
import { sceneText } from "../core/scene-i18n";
import { bindCharacterTurn, characterInstruction, characterRevision, characterTurnKey, emotionsFor, type CharacterCopyKey, type CharacterRequestReceipt } from "../core/characters";
import { foldCharacterPayload, latestCharacterResponse, syncChoicePortraits } from "../adapters/deepseek-characters-dom";
import type { CharacterEdit } from "../storage/characters";
import { relationshipLoreBrief } from "../core/relationship-setup";
import { handoffCharacterScene, withHandoffCharacters } from "../core/relationship-handoff";
import "./shared/scene.css";
import "./shared/memory-assistant.css";

export default defineContentScript({
  matches: ["https://chat.deepseek.com/*"],
  runAt: "document_start",
  cssInjectionMode: "ui",
  async main(ctx) {
    await injectScript("/injected.js", { keepInDom: true });
    if (await startCastWorker()) return;
    const controller = new PageController();
    const ui = await createShadowRootUi(ctx, {
      name: "deeprole-page-widget",
      position: "inline",
      anchor: "html",
      append: "last",
      isolateEvents: true,
      onMount(container) {
        const mount = document.createElement("div");
        container.append(mount);
        controller.mountWidget(mount);
        return mount;
      },
      onRemove() {
        controller.unmountWidget();
      },
    });
    ui.mount();
    await controller.start();
  },
});

interface PageScope { url: string; chatId: string | null }
interface ContextDelivery {
  recoveredReply?: RecoveredReplyEdit;
  targetChatId?: string;
  characterRequest?: CharacterRequestReceipt;
  scope: PageScope;
  scopeKey: string;
  snapshot: HandoffSnapshot | null;
  snapshotToken: string | null;
  createdAt: number;
}

class PageController {
  private transferring = false;
  private handoffNavigationQueued: string | null = null;
  private storyRead: { id: string; chatId: string; resolve: (story: StoryContinuation | null) => void } | null = null;
  private seenContextWarnings: NonNullable<TabSessionState["contextWarnings"]> = [];
  private characterReceipt: CharacterRequestReceipt | null = null;
  private characterReceiptTask: Promise<unknown> = Promise.resolve();
  private recoveryReceiptTask: Promise<unknown> = Promise.resolve();
  private characterScan: { scope: string; key: string; since: number; done: boolean } | null = null;
  private characterSaving = false;
  private characterScanTask: Promise<void> | null = null;
  private characterStatus: CharacterCopyKey = "idle";
  private readonly adapter = new DeepSeekDomAdapter();
  private readonly reasoningPresentation = new ReasoningPresentation();
  private readonly replyRecovery = new DeepSeekReplyRecovery(async edit => {
    if (this.state.vaultLocked || this.settings.replyRecoveryEnabled === false || this.adapter.getChatId() !== edit.chatId) throw new Error("reply-scope");
    await repository.saveRecoveredReply(edit);
  }, () => this.showToast(replyRecoveryText(this.state.locale).saveFailed));
  private root: Root | null = null;
  private illustrations: Illustration[] = [];
  private imageSettings: ImageSettings = structuredClone(DEFAULT_IMAGE_SETTINGS);
  private settings: DeepRoleSettings = { ...DEFAULT_SETTINGS };
  private entries: MemoryEntry[] = [];
  private books: MemoryBook[] = [];
  private worlds: WorldProfile[] = [];
  private entities: SceneEntity[] = [];
  private draftScene: SceneState = { ...EMPTY_SCENE };
  private previousChatId: string | null = null;
  private sceneQueue = Promise.resolve();
  private navigationTask = Promise.resolve();
  private bindings: ChatBinding[] = [];
  private snapshots: HandoffSnapshot[] = [];
  private proposals: MemoryProposalBatch[] = [];
  private changes: LoreChange[] = [];
  private documents: MemoryEntry[] = [];
  private reloadGeneration = 0;
  private reloadTask: Promise<boolean> = Promise.resolve(false);
  private publishedState = "";
  private draftOverrides: MemoryOverrides = { ...EMPTY_OVERRIDES };
  private dismissedAt = new Map<string, number>();
  private selection: ContextSelection = { entries: [], estimatedTokens: 0, omittedCount: 0 };
  private appliedSnapshot: HandoffSnapshot | null = null;
  private snapshotToken: string | null = null;
  private readonly deliveries = new Map<string, ContextDelivery>();
  private readonly malformedServiceReplies = new Map<string, { text: string; stableSince: number }>();
  private readonly failedServiceIds = new Set<string>();
  private pickedSceneChoice: { signature: string; text: string } | null = null;
  private readonly pageChatEstimates = new Map<string, ConversationEstimate>();
  private historyEstimate: { chatId: string; value: ConversationEstimate } | null = null;
  private historyRequest: { chatId: string; id: string } | null = null;
  private historyRetryAt = 0;
  private historyRefreshTimer = 0;
  private historyWasGenerating = false;
  private characterTextTurns: { requestId: string; chatId: string; replyIdentity: string }[] = [];
  private characterTextWaiter: { id: string; url: string; worldId: string | null; resolve: (text: string) => void; reject: (error: Error) => void; timer: number } | null = null;
  private pendingService: ServiceRequest | null = null;
  private preparingService = false;
  private autoContinuePending = false;
  private autoContinueAttempted = false;
  private autoContinueTimer = 0;
  private autoContinueUntil = 0;
  private autoContinueSnapshotId: string | null = null;
  private autoContinueSnapshotToken: string | null = null;
  private serviceFeedback: ServiceActivity | null = null;
  private publishedActivity = "";
  private state: WidgetState = {
    pageReady: false,
    vaultLocked: true,
    reviewProposalId: null,
    locale: "en",
    selection: this.selection,
    warning: "",
    contextText: "",
    selectionText: "",
    selectionPosition: null,
    contextPosition: null,
    canAnalyzeChat: false,
    analysisSuggested: false,
    handoffOffer: null,
    toast: "",
    availableEntries: [],
  };
  private lastUrl = location.href;
  private scanTimer = 0;
  private serviceRetryTimer = 0;
  private updateTimer = 0;
  private processingService = false;
  private contextIndicatorPosition: { xRatio: number; yRatio: number } | null = null;
  private anchorRenderFrame = 0;

  async start() {
    window.addEventListener("message", (event) => this.handleBridgeMessage(event));
    this.observePage();
    try {
      this.settings = await startupDeadline(getSettings());
      this.reasoningPresentation.configure(this.settings.showDeepSeekReasoning === true, this.settings.locale);
      this.state.locale = this.settings.locale;
      this.draftScene = (await startupDeadline(browser.runtime.sendMessage({ type: "DR_GET_DRAFT_SCENE" } satisfies DeepRoleMessage))) ?? { ...EMPTY_SCENE };
      this.previousChatId = this.adapter.getChatId();
      const savedPosition = await startupDeadline(browser.storage.local.get([CONTEXT_INDICATOR_POSITION_KEY, WIDGET_LAYOUT_KEY]));
      this.contextIndicatorPosition = parseSavedIndicatorPosition(savedPosition[CONTEXT_INDICATOR_POSITION_KEY]);
      this.state.widgetLayout = parseWidgetLayout(savedPosition[WIDGET_LAYOUT_KEY]);
      await startupDeadline(this.reload());
      restoreServiceTurns();
      this.cleanArchivedMemoryPayloads();
    } catch {
      // A failed/aborted worker must not leave the launcher hidden forever.
      // Invalidate late library reads and expose no memory until a fresh load.
      this.reloadGeneration++;
      this.clearPrivateState();
      this.publishContext("");
      this.state.startupError = true;
    }
    document.addEventListener("input", () => this.scheduleUpdate(), true);
    document.addEventListener("selectionchange", () => this.readSelection());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) void this.updateContext();
    }, true);
    window.addEventListener("scroll", this.scheduleAnchorRender, true);
    window.addEventListener("resize", this.scheduleAnchorRender);
    window.addEventListener("deeprole-native-layout", this.scheduleAnchorRender);
    browser.runtime.onMessage.addListener((message: DeepRoleMessage) => this.handleRuntimeMessage(message));
    browser.storage.onChanged.addListener((changes) => {
      if (WIDGET_LAYOUT_KEY in changes) { this.state.widgetLayout = parseWidgetLayout(changes[WIDGET_LAYOUT_KEY]?.newValue); this.render(); }
      if ([LIBRARY_CHANGE_KEY, IMAGE_SETTINGS_KEY, ...Object.values(storageKeys)].some((key) => key in changes)) void this.reload().catch(() => { this.publishContext(""); });
    });
    window.setInterval(() => {
      if (location.href !== this.lastUrl) {
        this.navigate();
      }
      // Empty/stopped streams may never mutate the DOM again.
      if (this.pendingService) this.scheduleScan();
    }, 1000);
    this.state.pageReady = true;
    this.render();
    this.scheduleScan();
  }

  private observePage() {
    const observer = new MutationObserver((changes) => {
      if (location.href !== this.lastUrl) this.navigate();
      if (this.pendingService?.type === "character-text" || this.characterTextTurns.length) this.syncCharacterTextServices();
      this.replyRecovery.process(changes);
      presentHiddenHandoffs();
      this.syncScenePhotos();
      // Run before the next paint when DeepSeek streams a transport marker;
      // the normal 350 ms scan can otherwise expose raw JSON for a frame.
      if (changes.some(change => [...change.addedNodes, change.type === "characterData" ? change.target : null]
        .some(node => node?.textContent && /<deeprole_(?:characters|choices)/u.test(node.textContent)
          && !(node instanceof Element && node.matches("[data-deeprole-choices-payload], [data-deeprole-choices-loading], [data-deeprole-choices-host]"))))) this.syncSceneChoices();
      const request = this.pendingService;
      if (request && ["memory-analysis", "continue-handoff"].includes(request.type) && request.chatId === this.adapter.getChatId()) this.updateMemoryPreloader(request);
      else if (!request && changes.some(change => [...change.addedNodes].some(node => node.textContent?.includes(SERVICE_START))
        || change.type === "characterData" && change.target.parentElement?.textContent?.includes(SERVICE_START))) this.cleanArchivedMemoryPayloads();
      this.scheduleScan();
    });
    observer.observe(document.documentElement, { childList: true, characterData: true, characterDataOldValue: true, subtree: true });
  }

  mountWidget(mount: HTMLElement) {
    this.root = createRoot(mount);
    this.render();
  }

  unmountWidget() {
    this.reasoningPresentation.dispose();
    this.root?.unmount();
    this.root = null;
  }

  private reload(): Promise<boolean> {
    const task = this.load(++this.reloadGeneration);
    this.reloadTask = task;
    return task;
  }

  private async load(generation: number): Promise<boolean> {
    const settings = await getSettings();
    this.imageSettings = await getImageSettings().catch(() => structuredClone(DEFAULT_IMAGE_SETTINGS));
    const locked = await repository.isLocked();
    if (generation !== this.reloadGeneration) return false;
    this.state.startupError = false;
    this.settings = settings;
    this.reasoningPresentation.configure(settings.showDeepSeekReasoning === true, settings.locale);
    this.state.locale = this.settings.locale;
    this.state.showChatContextMeter = this.settings.showChatContextMeter;
    this.state.showMemoryContextIndicator = this.settings.showMemoryContextIndicator;
    this.state.characterSpritesEnabled = this.settings.characterSpritesEnabled;
    this.state.adaptiveLayout = this.settings.adaptiveLayout !== false;
    this.state.floatingPanelWidth = this.settings.floatingPanelWidth;
    this.state.chatContextCapacity = chatCapacity(this.settings.chatContextCapacity);
    if (this.settings.contextWarningsEnabled === false) this.state.contextCapacityWarning = null;
    if (locked) {
      this.clearPrivateState();
      await this.updateContext();
      return true;
    }
    const loaded = await Promise.all([
      repository.rawRecords(),
      browser.runtime.sendMessage({ type: "DR_GET_TAB_STATE" } satisfies DeepRoleMessage) as Promise<TabSessionState | undefined>,
    ]).catch(async (error) => {
      // A lock can occur between the initial check and the authoritative read.
      if (await repository.isLocked()) return null;
      throw error;
    });
    if (generation !== this.reloadGeneration) return false;
    if (!loaded) { this.clearPrivateState(); await this.updateContext(); return true; }
    const [records, pending] = loaded;
    this.illustrations = libraryRecords<Illustration>(records, "illustration");
    for (const record of pending?.contextWarnings ?? (pending?.contextWarning ? [pending.contextWarning] : [])) {
      const seen = this.seenContextWarnings.find(v => v.chatId === record.chatId && v.capacity === record.capacity);
      if (!seen) this.seenContextWarnings.push(record); else seen.level = Math.max(seen.level, record.level);
    }
    this.seenContextWarnings = this.seenContextWarnings.slice(-50);
    this.characterReceipt = pending?.characterRequest ?? null;
    this.state.vaultLocked = false;
    this.entries = libraryRecords<MemoryEntry>(records, "entry"); this.books = libraryRecords<MemoryBook>(records, "book");
    this.bindings = libraryRecords<ChatBinding>(records, "binding"); this.snapshots = libraryRecords<HandoffSnapshot>(records, "snapshot");
    this.replyRecovery.configure(this.adapter.getChatId(), location.href, this.settings.replyRecoveryEnabled !== false && !this.adapter.isAuthenticationPage(), this.state.locale, this.currentBinding()?.recoveredReplies);
    this.worlds = libraryRecords<WorldProfile>(records, "world"); this.entities = libraryRecords<SceneEntity>(records, "entity");
    this.proposals = libraryRecords<MemoryProposalBatch>(records, "proposal"); this.changes = libraryRecords<LoreChange>(records, "change");
    this.draftOverrides = pending?.overrides ?? this.draftOverrides;
    this.pendingService = pending?.service ?? null;
    this.characterTextTurns = pending?.characterTextTurns ?? this.characterTextTurns;
    this.state.continuation = pending?.continuation ?? null;
    if (this.state.continuation?.phase === "review") this.state.reviewProposalId = this.state.continuation.proposalId ?? null;
    if (this.pendingService && this.failedServiceIds.has(this.pendingService.id)) this.pendingService = null;
    const pendingSnapshotId = pending?.snapshotId;
    this.appliedSnapshot = pendingSnapshotId ? this.snapshots.find((item) => item.id === pendingSnapshotId) ?? null : null;
    this.snapshotToken = this.appliedSnapshot ? pending?.snapshotToken ?? null : null;
    const continuationTarget = location.origin === "https://chat.deepseek.com" && location.pathname === "/" && !this.adapter.getChatId();
    const continuationValid = Boolean(pending?.continueOnFreshChat && pending.continueUntil && pending.continueUntil > Date.now() && continuationTarget && this.appliedSnapshot && this.snapshotToken);
    this.autoContinuePending = continuationValid && !this.autoContinueAttempted;
    this.autoContinueUntil = continuationValid ? pending?.continueUntil ?? 0 : 0;
    this.autoContinueSnapshotId = pending?.continueOnFreshChat ? pending.snapshotId ?? null : null;
    this.autoContinueSnapshotToken = pending?.continueOnFreshChat ? pending.snapshotToken ?? null : null;
    const waitingAtSource = this.appliedSnapshot?.sourceChatId === this.adapter.getChatId() && !!pending?.continueUntil && pending.continueUntil > Date.now();
    if (pending?.continueOnFreshChat && !continuationValid && !waitingAtSource) await this.disarmAutoContinue(Boolean(this.adapter.getChatId()) || !continuationTarget);
    if (!this.adapter.getChatId() && this.appliedSnapshot) {
      this.draftScene = { worldId: memoryWorld(this.appliedSnapshot, this.books), focusIds: this.appliedSnapshot.focusIds ?? [], bookId: this.appliedSnapshot.bookId };
      this.draftOverrides = this.appliedSnapshot.memoryOverrides ?? this.draftOverrides;
    }
    await this.updateContext();
    this.updateSuggestions();
    this.requestHistoryEstimate();
    this.syncSceneChoices();
    if (this.pendingService) this.scheduleScan();
    this.scheduleScan();
    return true;
  }

  private readonly scenePhotos = new ScenePhotosPresenter();
  private readonly imagePresenter = new IllustrationsPresenter();
  private syncIllustrations() {
    const call = async (message: import("../core/image-messages").ImageMessage) => { const result = await browser.runtime.sendMessage(message); if (!result?.ok) throw Object.assign(new Error("image-request-failed"), { code: result?.error ?? "failed", diagnostic: result?.diagnostic, headers: result?.headers, ticketId: result?.ticketId }); return result; };
    this.imagePresenter.sync({ enabled: this.imageSettings.enabled && !this.state.vaultLocked, generating: this.adapter.isGenerating(), worldId: this.currentScene().worldId, chatId: this.adapter.getChatId(), chatUrl: location.href, records: this.illustrations, attempts: this.currentBinding()?.illustrationAttempts ?? [], entities: this.entities, settings: this.imageSettings, locale: this.state.locale, actions: {
      onCreate: async (target, text) => this.generateIllustration(target, text),
      onRepeat: async (target, id, attempt) => { await call({ type: "DR_IMAGE_REPEAT", target, id, attempt }); await this.reload(); },
      onRemove: async (target, id) => { await call({ type: "DR_IMAGE_REMOVE", target, id }); },
      onDownload: async ticketId => { await call({ type: "DR_IMAGE_OPEN_DOWNLOAD", ticketId }); },
    } });
  }
  private async generateIllustration(target: import("../core/image-messages").ImageTarget, text: string): Promise<void> {
    if (this.state.vaultLocked || this.adapter.isAuthenticationPage() || this.adapter.getChatId() !== target.chatId || this.currentScene().worldId !== target.worldId) throw { code: "changed" };
    if (this.adapter.isGenerating() || this.pendingService || this.preparingService || this.characterTextWaiter) throw { code: "busy" };
    if (this.adapter.getDraft().trim()) throw { code: "draftBusyImage" };
    const call = async (message: import("../core/image-messages").ImageMessage) => { const result = await browser.runtime.sendMessage(message); if (!result?.ok) throw { code: result?.error ?? "failed", diagnostic: result?.diagnostic, headers: result?.headers, ticketId: result?.ticketId }; return result; };
    const selectedLevel = this.imageSettings.contentLevel;
    const referenceBudget = this.imageSettings.profiles.find(p => p.id === this.imageSettings.profileByLevel[selectedLevel])?.maxReferences ?? 1;
    const { attempt } = await call({ type: "DR_IMAGE_START", target });
    let phase: "plan" | undefined = "plan";
    try {
      const value = await this.generateCharacterText({ field: { key: "image-plan", label: imageText(this.state.locale, "prompt"), scope: "scene", maxLength: MAX_IMAGE_PLAN_TEXT }, currentText: "", reference: { name: "Scene illustration", completedScene: text, roster: imagePlanRoster(this.entities.filter(e => e.worldId === target.worldId)), referenceBudget, contentLevel: this.imageSettings.contentLevel } }, attempt);
      if (this.adapter.getChatId() !== target.chatId || this.currentScene().worldId !== target.worldId || this.state.vaultLocked || this.imageSettings.contentLevel !== selectedLevel) throw { code: "changed" };
      const row = nativeMessageRows(document).find(row => nativeMessageIdentity(row) === target.messageKey);
      if (row && illustrationSceneText(row) !== text) throw { code: "changed" };
      const plan = parseImageScenePlan(value);
      phase = undefined;
      await call({ type: "DR_IMAGE_RENDER", target, id: attempt.id, plan });
    } catch (error) {
      const code = error instanceof Error && error.message === "invalidPlan" ? "invalidPlan" : imageErrorKey(error);
      // The background keeps the original request after a provider failure.
      await browser.runtime.sendMessage({ type: "DR_IMAGE_FAIL", target, id: attempt.id, error: code, phase } satisfies import("../core/image-messages").ImageMessage).catch(() => undefined);
      throw Object.assign(new Error(code), typeof error === "object" && error !== null ? error : {}, { code, ...(phase ? { diagnostic: { source: "deepseek", phase } } : {}) });
    } finally { await this.reload(); }
  }
  private readonly selfieJobs = new Set<string>();
  private selfieScanTimer = 0;
  private syncScenePhotos() {
    const binding = this.currentBinding(), worldId = this.currentScene().worldId, chatId = this.adapter.getChatId();
    const enabled = !this.state.vaultLocked && this.settings.characterSheetsEnabled === true;
    const run = async (photo: import("../core/types").ScenePhoto, retry = false) => {
      if (!worldId || !chatId || !enabled || !this.imageSettings.enabled) return;
      const key = [worldId, chatId, photo.imageKey].join(":");
      if (this.selfieJobs.has(key)) return;
      this.selfieJobs.add(key);
      try {
        const target = { worldId, chatId, chatUrl: location.href, messageKey: photo.messageKey };
        const savedImage = this.illustrations.find(i => i.id === photo.generation?.illustrationId);
        const result = retry && savedImage?.request ? await browser.runtime.sendMessage({ type: "DR_IMAGE_REPEAT", target, id: savedImage.id } satisfies import("../core/image-messages").ImageMessage) : await browser.runtime.sendMessage({ type: "DR_IMAGE_SELFIE", target: { worldId, chatId, chatUrl: location.href, messageKey: photo.messageKey }, entityId: photo.entityId, turnKey: photo.turnKey, retry } satisfies import("../core/image-messages").ImageMessage);
        if (retry && !result?.ok) this.showToast(imageText(this.state.locale, result?.error ?? "failed"));
      } finally { this.selfieJobs.delete(key); void this.reload(); }
    };
    this.scenePhotos.sync(binding, worldId, this.entities, this.state.locale, enabled, { illustrations: this.illustrations, generationEnabled: this.imageSettings.enabled, onRetry: photo => run(photo, true), onRemove: async photo => { if (!worldId || !chatId || !photo.generation?.illustrationId) return; await browser.runtime.sendMessage({ type: "DR_IMAGE_REMOVE", target: { worldId, chatId, chatUrl: location.href, messageKey: photo.messageKey }, id: photo.generation.illustrationId } satisfies import("../core/image-messages").ImageMessage); await this.reload(); }, onDownload: async ticketId => { const result = await browser.runtime.sendMessage({ type: "DR_IMAGE_OPEN_DOWNLOAD", ticketId } satisfies import("../core/image-messages").ImageMessage); if (!result?.ok) this.showToast(imageText(this.state.locale, result?.error ?? "failed")); } });
    if (!enabled || !this.imageSettings.enabled || this.adapter.isGenerating()) return;
    const pending = binding?.scenePhotos?.filter(photo => photo.worldId === worldId && photo.generation && ["queued", "working"].includes(photo.generation.status)) ?? [];
    const queued = pending.find(photo => photo.createdAt + SELFIE_DELAY <= Date.now() && !this.selfieJobs.size);
    if (queued) void run(queued).catch(() => undefined);
    if (pending.length && !this.selfieScanTimer) this.selfieScanTimer = window.setTimeout(() => { this.selfieScanTimer = 0; this.scheduleScan(); }, 2000);
    if (!pending.length) { window.clearTimeout(this.selfieScanTimer); this.selfieScanTimer = 0; }
  }
  private clearPrivateState() {
    if (this.characterTextWaiter) this.settleCharacterText(this.characterTextWaiter.id, undefined, "vault-locked");
    window.clearTimeout(this.selfieScanTimer); this.selfieScanTimer = 0;
    this.scenePhotos.clear(); this.imagePresenter.clear(); this.illustrations = []; closePortraitViewer(); clearSelfieImageCache();
    this.replyRecovery.reset();
    this.state.contextCapacityWarning = null;
    this.storyRead?.resolve(null); this.storyRead = null;
    window.clearTimeout(this.historyRefreshTimer);
    this.historyRefreshTimer = 0;
    if (this.pendingService?.type === "memory-analysis") {
      removeServicePreloader(this.pendingService.id, findServiceReplyRows(this.pendingService.id));
    }
    if (this.autoContinueTimer) window.clearTimeout(this.autoContinueTimer);
    this.autoContinueTimer = 0;
    this.autoContinuePending = false;
    this.autoContinueAttempted = false;
    this.autoContinueSnapshotId = null;
    this.autoContinueSnapshotToken = null;
    this.state.vaultLocked = true;
    this.state.sceneChoicesEnabled = false;
    this.state.characters = undefined;
    this.characterScan = null;
    this.characterStatus = "idle";
    this.pickedSceneChoice = null;
    this.historyEstimate = null;
    this.historyRequest = null;
    this.historyRetryAt = 0;
    this.pageChatEstimates.clear();
    syncSceneChoiceCards(false, false, this.state.locale, async () => false);
    this.entries = []; this.books = []; this.bindings = []; this.snapshots = [];
    this.worlds = []; this.entities = []; this.documents = []; this.appliedSnapshot = null; this.snapshotToken = null;
    this.deliveries.clear(); this.proposals = []; this.changes = []; this.pendingService = null;
    this.serviceFeedback = null;
    this.state.pendingHandoff = undefined;
    this.state.handoffOffer = null; this.state.analysisSuggested = false; this.state.warning = ""; this.state.toast = "";
    this.state.selectionText = ""; this.state.selectionPosition = null;
  }

  private overrides(): MemoryOverrides { return this.adapter.getChatId() ? this.currentBinding()?.memoryOverrides ?? EMPTY_OVERRIDES : this.draftOverrides; }

  private async overrideMemory(id: string, action: "include" | "exclude" | "reset") {
    const scope = this.pageScope();
    const task = this.sceneQueue.catch(() => undefined).then(async () => {
      await this.reload();
      this.assertScope(scope);
      const scene = this.currentScene();
      if (!this.documents.some((entry) => entry.id === id && memoryWorld(entry, this.books) === scene.worldId)) throw new Error("out-of-scope");
      const overrides = changeMemoryOverride(this.overrides(), id, action);
      const existing = this.currentBinding();
      if (this.adapter.getChatId()) {
        const now = Date.now();
        const binding: ChatBinding = { ...existing, id: existing?.id ?? `binding:${this.adapter.getChatId()}`, chatId: this.adapter.getChatId()!, chatUrl: location.href, ...this.currentScene(), memoryOverrides: overrides, messageCountAtAnalysis: existing?.messageCountAtAnalysis ?? 0, createdAt: existing?.createdAt ?? now, updatedAt: now };
        await repository.putIfUnchanged("binding", binding, existing ?? null);
        this.bindings = [...this.bindings.filter((b) => b.chatId !== binding.chatId), binding];
      } else { this.draftOverrides = overrides; await this.saveTabState({ overrides }); }
      await this.updateContext();
    });
    this.sceneQueue = task; return task;
  }

  private currentBinding(): ChatBinding | undefined {
    const chatId = this.adapter.getChatId();
    return chatId ? this.bindings.find((binding) => binding.chatId === chatId) : undefined;
  }

  private currentScene(): SceneState {
    const binding = this.currentBinding();
    const raw: SceneState = this.adapter.getChatId() ? binding ? { worldId: binding.worldId ?? null, focusIds: binding.focusIds ?? [], bookId: binding.bookId } : { ...EMPTY_SCENE } : this.draftScene;
    const worldId = this.worlds.some((w) => w.id === raw.worldId) ? raw.worldId : null;
    return { worldId, focusIds: raw.focusIds.filter((id) => this.entities.some((e) => e.id === id && e.worldId === worldId)), bookId: this.books.some((b) => b.id === raw.bookId && (b.worldId ?? null) === worldId && b.active) ? raw.bookId : null };
  }

  private setScene(scene: SceneState): Promise<void> {
    const scope = this.pageScope();
    const task = this.sceneQueue.catch(() => undefined).then(() => this.persistScene(scene, scope));
    this.sceneQueue = task;
    return task;
  }

  private pageScope(): PageScope { return { url: location.href, chatId: this.adapter.getChatId() }; }
  private assertScope(scope: PageScope) {
    if (location.href !== scope.url || this.adapter.getChatId() !== scope.chatId) throw new Error("scene-changed");
  }
  private contextScopeKey(): string {
    return JSON.stringify([this.currentScene(), this.overrides(), this.appliedSnapshot?.id ?? null, this.snapshotToken, this.settings.sceneChoicesEnabled ?? true]);
  }

  private async persistScene(scene: SceneState, scope: PageScope, carry?: HandoffSnapshot) {
    this.assertScope(scope);
    if (await repository.isLocked()) throw new Error("vault-locked");
    this.assertScope(scope);
    if (scene.worldId && !this.worlds.some((w) => w.id === scene.worldId)) throw new Error("unknown-world");
    if (scene.bookId && !this.books.some((b) => b.id === scene.bookId && (b.worldId ?? null) === scene.worldId && b.active)) throw new Error("unknown-book");
    scene = { ...scene, focusIds: [...new Set(scene.focusIds)].filter((id) => this.entities.some((e) => e.id === id && e.worldId === scene.worldId)) };
    const changedWorld = scene.worldId !== this.currentScene().worldId;
    const chatId = scope.chatId;
    if (chatId) {
      const existing = this.currentBinding();
      const binding: ChatBinding = withHandoffCharacters({ ...existing, memoryOverrides: changedWorld ? EMPTY_OVERRIDES : this.overrides(), id: existing?.id ?? `binding:${chatId}`, chatId, chatUrl: location.href, messageCountAtAnalysis: existing?.messageCountAtAnalysis ?? 0, createdAt: existing?.createdAt ?? Date.now(), ...scene, updatedAt: Date.now() }, carry ?? this.appliedSnapshot);
      await repository.putIfUnchanged("binding", binding, existing ?? null);
      this.bindings = [...this.bindings.filter((b) => b.chatId !== chatId), binding];
    } else {
      this.draftScene = scene;
      await browser.runtime.sendMessage({ type: "DR_SAVE_DRAFT_SCENE", scene } satisfies DeepRoleMessage).catch(() => undefined);
    }
    this.assertScope(scope);
    if (changedWorld) {
      this.pickedSceneChoice = null;
      this.serviceFeedback = null;
      this.draftOverrides = { ...EMPTY_OVERRIDES }; await this.saveTabState({ overrides: this.draftOverrides });
      this.appliedSnapshot = null;
      this.snapshotToken = null;
      await this.saveTabState({ snapshotId: null, snapshotToken: null });
      this.state.handoffOffer = null;
    }
    await this.updateContext(); this.updateSuggestions(); this.syncSceneChoices();
    void browser.runtime.sendMessage({ type: "DR_DATA_CHANGED" } satisfies DeepRoleMessage).catch(() => undefined);
  }

  private async updateContext(draft = this.adapter.getDraft(), characterRequestId?: string, requestChatId?: string) {
    const scene = this.currentScene();
    const world = this.worlds.find((w) => w.id === scene.worldId);
    const chatId = this.adapter.getChatId();
    const characterEntities = this.entities.filter(e => e.worldId === scene.worldId && e.kind === "character");
    const characterScene = world ? this.currentBinding()?.characterScenes?.[world.id] ?? handoffCharacterScene(this.appliedSnapshot, world.id) : undefined;
    const profilesEnabled = !!(world && this.settings.characterSheetsEnabled && !this.state.vaultLocked);
    const sheetsEnabled = profilesEnabled && !!chatId;
    const characterContext = profilesEnabled ? characterInstruction(world!.id, chatId ?? requestChatId ?? "", characterEntities, characterScene, emotionsFor(world?.characterEmotions ?? this.settings.characterEmotions), scene.focusIds, [draft, ...this.adapter.getRecentMessages(2)].join("\n"), characterRequestId, this.settings.relationshipsEnabled !== false && world?.relationshipsEnabled !== false, !!this.pendingService, this.imageSettings.enabled && isSelfieRequest(draft)) : "";
    const characterScope = `${scene.worldId}:${chatId}`;
    if (this.characterScan && this.characterScan.scope !== characterScope) { this.characterScan = null; this.characterStatus = "idle"; }
    this.state.characters = sheetsEnabled ? { relationshipsEnabled: this.settings.relationshipsEnabled !== false && world?.relationshipsEnabled !== false, relationshipDisplay: this.settings.relationshipDisplay, worldId: world!.id, chatId: chatId!, base: characterRevision(characterEntities, characterScene), entities: characterEntities, scene: characterScene, emotions: emotionsFor(world?.characterEmotions ?? this.settings.characterEmotions), status: this.characterStatus, openId: this.state.characters?.openId } : undefined;
    const overrides = this.overrides();
    const compiled = compileMemoryWorkspace({
      draft,
      recentMessages: this.adapter.getRecentMessages(this.settings.recentMessageCount),
      entries: this.entries,
      activeBookId: scene.bookId,
      scene, books: this.books, entities: this.entities, worlds: this.worlds,
      manualIds: overrides.includedIds,
      excludedIds: overrides.excludedIds,
      settings: { ...(world ?? this.settings), contextBudget: Math.max(0, (world ?? this.settings).contextBudget - estimateTokens(characterContext)) },
    });
    this.selection = compiled.selection; this.documents = compiled.documents;
    const snapshot = this.appliedSnapshot && memoryWorld(this.appliedSnapshot, this.books) === scene.worldId ? this.appliedSnapshot : null;
    this.state.pendingHandoff = snapshot?.title;
    const memoryText = formatMemoryContext(this.selection, snapshot);
    const choicesEnabled = Boolean(world && (this.settings.sceneChoicesEnabled ?? true));
    const contextText = [memoryText, characterContext, choicesEnabled && !this.pendingService ? sceneChoiceInstruction() : ""].filter(Boolean).join("\n\n");
    this.state.sceneChoicesEnabled = choicesEnabled;
    this.selection.estimatedTokens = (memoryText ? estimateTokens(memoryText) : 0) + (characterContext ? estimateTokens(characterContext) : 0);
    this.selection.overBudgetTokens = Math.max(0, this.selection.estimatedTokens - (world ?? this.settings).contextBudget);
    this.state.proposals = this.proposals.filter((p) => p.worldId === scene.worldId);
    this.state.lastChange = this.changes.find((c) => c.worldId === scene.worldId && !c.undoneAt) ?? null;
    this.state.overrides = overrides;
    this.state.worlds = this.worlds; this.state.entities = this.entities; this.state.books = this.books; this.state.scene = scene;
    this.state.selection = this.selection;
    const selectedIds = new Set(this.selection.entries.map((item) => item.entry.id));
    this.state.availableEntries = this.documents.filter((entry) =>
      entry.enabled &&
      isMemoryInScene(entry, scene, this.books) &&
      !selectedIds.has(entry.id),
    );
    this.state.contextText = memoryText;
    this.publishContext(contextText);
    const signature = JSON.stringify([scene, overrides, contextText, this.selection.omittedCount]);
    if (signature !== this.publishedState) {
      this.publishedState = signature;
      void browser.runtime.sendMessage({ type: "DR_CONTEXT_CHANGED" } satisfies DeepRoleMessage).catch(() => undefined);
    }
    this.render();
    return contextText;
  }

  private updateSuggestions() {
    const binding = this.currentBinding();
    const messageCount = this.adapter.getMessageCount();
    const chatId = this.adapter.getChatId();
    if (this.state.vaultLocked || !chatId) this.state.conversationEstimate = null;
    else {
      const onPage = this.adapter.getConversationEstimate(500);
      const previous = this.pageChatEstimates.get(chatId);
      const page: ConversationEstimate = {
        estimatedTokens: Math.max(onPage.estimatedTokens, previous?.estimatedTokens ?? 0),
        messageCount: Math.max(onPage.messageCount, previous?.messageCount ?? 0),
        atLeast: onPage.atLeast || previous?.atLeast === true,
        source: "page",
      };
      this.pageChatEstimates.set(chatId, page);
      if (this.pageChatEstimates.size > 50) {
        const oldest = [...this.pageChatEstimates.keys()].find((id) => id !== chatId);
        if (oldest) this.pageChatEstimates.delete(oldest);
      }
      const history = this.historyEstimate?.chatId === chatId ? this.historyEstimate.value : null;
      this.state.conversationEstimate = history ? {
        estimatedTokens: Math.max(history.estimatedTokens, page.estimatedTokens),
        messageCount: Math.max(history.messageCount, page.messageCount),
        atLeast: history.atLeast || page.estimatedTokens > history.estimatedTokens,
        source: "history",
      } : page;
    }
    this.state.analysisSuggested = Boolean(
      !this.state.vaultLocked && this.settings.suggestionsEnabled &&
      messageCount > 0 &&
      messageCount - Math.max(binding?.messageCountAtAnalysis ?? 0, this.dismissedAt.get(this.adapter.getChatId() ?? "draft") ?? 0) >= this.settings.suggestionInterval,
    );
    const noChatId = !this.adapter.getChatId();
    this.state.canAnalyzeChat = Boolean(!noChatId && (messageCount > 0 || nativeMessageRows(document).length > 0 || this.state.conversationEstimate && this.state.conversationEstimate.messageCount > 0));
    this.state.handoffOffer = noChatId && !this.appliedSnapshot ? this.snapshots.find((s) => memoryWorld(s, this.books) === this.currentScene().worldId) ?? null : null;
    this.render();
    this.queueAutoContinue();
  }

  private queueAutoContinue() {
    if (!this.autoContinuePending || this.autoContinueAttempted || this.autoContinueTimer) return;
    this.autoContinueTimer = window.setTimeout(() => {
      this.autoContinueTimer = 0;
      void this.tryAutoContinue();
    }, 250);
  }

  private async disarmAutoContinue(clearSnapshot: boolean) {
    if (this.autoContinueTimer) window.clearTimeout(this.autoContinueTimer);
    this.autoContinueTimer = 0;
    const wasPending = this.autoContinuePending;
    this.autoContinuePending = false;
    this.autoContinueAttempted = true;
    const snapshotId = this.autoContinueSnapshotId;
    const snapshotToken = this.autoContinueSnapshotToken;
    const state: TabSessionState = { continueOnFreshChat: false, continueUntil: null };
    const expected: TabSessionGuard = {};
    if (wasPending || !snapshotId || !snapshotToken) expected.continueOnFreshChat = true;
    if (snapshotId) expected.snapshotId = snapshotId;
    if (snapshotToken) expected.snapshotToken = snapshotToken;
    if (clearSnapshot) { state.snapshotId = null; state.snapshotToken = null; }
    await this.saveTabState(state, expected);
    if (clearSnapshot && this.appliedSnapshot?.id === snapshotId && this.snapshotToken === snapshotToken) {
      this.appliedSnapshot = null; this.snapshotToken = null;
      if (!this.adapter.getChatId()) {
        this.draftScene = { ...EMPTY_SCENE };
        await browser.runtime.sendMessage({ type: "DR_SAVE_DRAFT_SCENE", scene: this.draftScene } satisfies DeepRoleMessage).catch(() => undefined);
      }
      await this.updateContext();
    }
    this.autoContinueSnapshotId = null;
    this.autoContinueSnapshotToken = null;
  }

  private async tryAutoContinue() {
    if (!this.autoContinuePending || this.autoContinueAttempted) return;
    const snapshot = this.appliedSnapshot;
    const snapshotId = this.autoContinueSnapshotId;
    const snapshotToken = this.autoContinueSnapshotToken;
    const isFreshHome = () => location.origin === "https://chat.deepseek.com" && location.pathname === "/" && !this.adapter.getChatId();
    if (!isFreshHome()) { await this.disarmAutoContinue(true); return; }
    if (!snapshot || snapshot.id !== snapshotId || !snapshotToken || this.snapshotToken !== snapshotToken) { await this.disarmAutoContinue(true); return; }
    if (snapshot.worldId && !this.worlds.some(w => w.id === snapshot.worldId) || snapshot.bookId && !this.books.some(b => b.id === snapshot.bookId && b.active)) {
      await this.disarmAutoContinue(true); this.showToast(continuationText(this.state.locale, "failed")); return;
    }
    if (this.adapter.isGenerating()) { this.queueAutoContinue(); return; }
    if (this.adapter.getDraft().trim()) { await this.disarmAutoContinue(false); return; }
    const prompt = continuationText(this.state.locale, "continuePrompt");
    if (!this.adapter.setDraft(prompt)) { this.queueAutoContinue(); return; }
    this.autoContinuePending = false;
    this.autoContinueAttempted = true;
    if (Date.now() > this.autoContinueUntil) {
      await this.saveTabState({ continueOnFreshChat: false, continueUntil: null }, { continueOnFreshChat: true, snapshotId, snapshotToken });
      this.showToast(assistantText(this.state.locale, "handoffPromptReady"));
      return;
    }
    const cleared = await this.saveTabState({ continueOnFreshChat: false, continueUntil: null }, { continueOnFreshChat: true, snapshotId, snapshotToken });
    if (!cleared) { this.showToast(assistantText(this.state.locale, "handoffPromptReady")); return; }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 150));
    if (!isFreshHome()) { await this.disarmAutoContinue(true); return; }
    if (this.state.vaultLocked || this.appliedSnapshot?.id !== snapshotId || this.snapshotToken !== snapshotToken) {
      if (this.adapter.getDraft() === prompt) this.adapter.setDraft("");
      return;
    }
    if (this.adapter.isGenerating() || this.adapter.getDraft() !== prompt) return;
    if (!this.adapter.submitDraft()) { this.showToast(assistantText(this.state.locale, "handoffPromptReady")); return; }
    this.showToast(assistantText(this.state.locale, "handoffContinuing"));
  }

  private scheduleAnchorRender = () => {
    if (this.anchorRenderFrame) return;
    this.anchorRenderFrame = window.requestAnimationFrame(() => {
      this.anchorRenderFrame = 0;
      this.render();
    });
  };

  private render() {
    this.state.activity = this.currentActivity();
    this.state.generating = this.adapter.isGenerating();
    const activitySignature = JSON.stringify([this.state.activity, this.state.generating, this.state.warning]);
    if (activitySignature !== this.publishedActivity) {
      this.publishedActivity = activitySignature;
      void browser.runtime.sendMessage({ type: "DR_CONTEXT_CHANGED" } satisfies DeepRoleMessage).catch(() => undefined);
    }
    this.state.contextPosition = this.resolveContextIndicatorPosition();
    this.root?.render(<PageWidget
      state={{ ...this.state, selection: this.selection }}
      onContinueStory={() => void this.continueStory().then(result => { if (!result.ok) this.showToast(continuationText(this.state.locale, result.error === "draft-not-empty" ? "ready" : result.error === "busy" ? "waiting" : result.error === "continuation-world-too-large" ? "tooLarge" : "failed")); })}
      onDismissCapacityWarning={() => void this.dismissCapacityWarning()}
      onDisableCapacityWarnings={() => void updateSettings({ contextWarningsEnabled: false }).then(() => this.reload())}
      onPanelWidthChange={async width => { await updateSettings({ floatingPanelWidth: width }); await this.reload(); }}
      onAddCharacterEmotion={async (worldId, name) => {
        const cast = this.state.characters;
        if (!cast || cast.worldId !== worldId) throw new Error("character-scope");
        const next = await repository.addCharacterEmotion({ worldId, chatId: cast.chatId, chatUrl: location.href, base: cast.base }, name);
        await this.reload(); return next;
      }}
      onAskSelfie={id => this.askSelfie(id)}
      onSaveCharacter={(edit) => this.saveCharacter(edit)}
      onGenerateCharacterText={draft => this.generateCharacterText(draft)}
      onRequestCharacterFact={async (targetEntityId, brief) => { const result = await this.runService({ id: createId("service"), type: "memory-analysis", targetEntityId, brief, bookId: this.currentScene().bookId, createdAt: Date.now() }); if (!result.ok) throw new Error(result.error); }}
      onRetryCharacters={() => { this.characterScan = null; void this.scanCharacters(); }}
      onCharacterOpened={() => { if (this.state.characters) this.state.characters.openId = null; }}
      authenticationPage={this.adapter.isAuthenticationPage()}
      composerActionPosition={this.adapter.getComposerAttachmentActionPosition()}
      onToggleEntry={(entry, included) => {
        void this.overrideMemory(entry.id, included ? "reset" : "exclude").catch(() => this.showToast(sceneText(this.state.locale, "failed")));
      }}
      onAttachEntry={(entry) => {
        void this.overrideMemory(entry.id, "include").catch(() => this.showToast(sceneText(this.state.locale, "failed")));
      }}
      onResetEntry={(id) => void this.overrideMemory(id, "reset").catch(() => this.showToast(sceneText(this.state.locale, "failed")))}
      onQuickSave={(content, activation, title) => this.saveSelection(content, activation, title)}
      onDraftLore={async (brief) => { const result = await this.runService({ id: createId("service"), type: "lore-draft", brief, bookId: this.currentScene().bookId, createdAt: Date.now() }); if (!result.ok) throw new Error(result.error); }}
      onReview={async (batch, items, profileChoice) => { const result = await browser.runtime.sendMessage({ type: "DR_REVIEW_MEMORY", operation: "apply", batchId: batch.id, items, profileChoice } satisfies DeepRoleMessage); if (!result?.ok) throw new Error("memory-conflict"); const count = items.filter((item) => item.selected && !item.issue).length + Number(!!profileChoice); this.showToast(assistantText(this.state.locale, "memoryUpdated").replace("{count}", String(count))); this.state.reviewProposalId = null; await this.reload(); }}
      onDiscard={async (id) => { if (this.state.continuation?.proposalId === id) await this.cancelContinuation(); const result = await browser.runtime.sendMessage({ type: "DR_REVIEW_MEMORY", operation: "discard", id } satisfies DeepRoleMessage); if (!result?.ok) throw new Error("memory-conflict"); this.state.reviewProposalId = null; await this.reload(); }}
      onReviewClose={() => { this.state.reviewProposalId = null; }}
      onUndo={async (id) => { const result = await browser.runtime.sendMessage({ type: "DR_REVIEW_MEMORY", operation: "undo", id } satisfies DeepRoleMessage); if (!result?.ok) throw new Error("memory-conflict"); await this.reload(); }}
      onCopyContext={() => { void navigator.clipboard.writeText(this.state.contextText); this.showToast(this.t("contextCopied")); }}
      onAnalyze={() => void this.runService({ id: createId("service"), type: "memory-analysis", bookId: this.currentScene().bookId, createdAt: Date.now() }).then((result) => { if (!result.ok) this.showToast(assistantText(this.state.locale, result.error === "empty-chat" ? "emptyChat" : result.error === "draft-not-empty" ? "draftProtected" : result.error === "busy" ? "busy" : result.error === "scene-changed" ? "sceneChanged" : "serviceFailed")); })}
      onDismissSuggestion={() => { this.dismissedAt.set(this.adapter.getChatId() ?? "draft", this.adapter.getMessageCount()); this.state.analysisSuggested = false; this.render(); }}
      onSaveSelection={() => void this.saveSelection(this.state.selectionText)}
      onApplyHandoff={() => { const snapshot = this.state.handoffOffer; if (snapshot) void this.applySnapshot(snapshot.id).catch(() => this.showToast(sceneText(this.state.locale, "failed"))); }}
      onDismissHandoff={() => { this.state.handoffOffer = null; this.render(); }}
      onKeepContinuationMemory={() => this.keepContinuationMemory()}
      onCancelContinuation={() => void this.cancelContinuation().catch(() => this.showToast(continuationText(this.state.locale, "failed")))}
      onContextPositionChange={(position) => void this.saveContextIndicatorPosition(position)}
      onWidgetLayoutChange={async layout => { await browser.storage.local.set({ [WIDGET_LAYOUT_KEY]: layout }); this.state.widgetLayout = layout; this.render(); }}
      onToggleAdaptiveLayout={() => { void this.toggleAdaptiveLayout(); }}
      onSceneChange={(scene) => this.setScene(scene).then(() => true, () => { this.showToast(sceneText(this.state.locale, "failed")); return false; })}
      onSceneChoicesToggle={() => void this.toggleSceneChoices()}
      onTogglePortraits={() => void this.togglePortraits()}
      menuUrl={`${browser.runtime.getURL("/sidepanel.html")}?embedded=1`}
    />);
  }

  private resolveContextIndicatorPosition(): { x: number; y: number } {
    if (this.contextIndicatorPosition) {
      return {
        x: Math.round(this.contextIndicatorPosition.xRatio * window.innerWidth),
        y: Math.round(this.contextIndicatorPosition.yRatio * window.innerHeight),
      };
    }
    if (this.adapter.getChatId()) return this.adapter.getChatTitleAnchor() ?? defaultContextIndicatorPosition();
    return defaultContextIndicatorPosition();
  }

  private async saveContextIndicatorPosition(position: { x: number; y: number }) {
    this.contextIndicatorPosition = {
      xRatio: position.x / Math.max(1, window.innerWidth),
      yRatio: position.y / Math.max(1, window.innerHeight),
    };
    this.state.contextPosition = position;
    await browser.storage.local.set({ [CONTEXT_INDICATOR_POSITION_KEY]: this.contextIndicatorPosition });
  }

  private scheduleUpdate() {
    window.clearTimeout(this.updateTimer);
    this.updateTimer = window.setTimeout(() => void this.updateContext(), 180);
  }

  private scheduleScan() {
    if (this.scanTimer) return;
    this.scanTimer = window.setTimeout(() => {
      this.scanTimer = 0;
      this.replyRecovery.scan();
      presentHiddenHandoffs();
      this.syncScenePhotos();
      this.syncIllustrations();
      void this.syncContinuation();
      void this.scanServiceResponses();
      const generating = this.adapter.isGenerating();
      if (generating) this.historyWasGenerating = true;
      else if (this.historyWasGenerating) {
        this.historyWasGenerating = false;
        this.scheduleHistoryRefresh(1800);
      }
      this.updateSuggestions();
      this.syncSceneChoices();
      void this.scanCharacters();
    }, 350);
  }

  private scheduleHistoryRefresh(delay: number) {
    window.clearTimeout(this.historyRefreshTimer);
    this.historyRefreshTimer = window.setTimeout(() => {
      this.historyRefreshTimer = 0;
      this.requestHistoryEstimate(true);
    }, delay);
  }

  private requestHistoryEstimate(force = false) {
    const chatId = this.adapter.getChatId();
    if (this.state.vaultLocked || !chatId || this.historyRequest?.chatId === chatId) return;
    if (Date.now() < this.historyRetryAt) {
      this.scheduleHistoryRefresh(this.historyRetryAt - Date.now() + 50);
      return;
    }
    if (!force && this.historyEstimate?.chatId === chatId) return;
    const id = crypto.randomUUID();
    this.historyRequest = { chatId, id };
    window.postMessage({ source: "deeprole-extension", type: "CHAT_HISTORY_ESTIMATE_REQUEST", requestId: id, chatId }, location.origin);
    window.setTimeout(() => {
      if (this.historyRequest?.id !== id) return;
      this.historyRequest = null;
      this.historyRetryAt = Date.now() + 60_000;
      this.scheduleHistoryRefresh(60_000);
    }, 18_000);
  }

  private syncSceneChoices() {
    const busy = this.preparingService || pendingActivity(this.pendingService, this.adapter.getChatId(), this.adapter.isGenerating())?.phase === "waiting";
    // Existing reply options are read-only UI, not a world-bound memory update.
    // New recovery requests still require the connected-world feature flag.
    syncSceneChoiceCards((this.settings.sceneChoicesEnabled ?? true) && !this.state.vaultLocked, this.adapter.isGenerating() || busy, this.state.locale, (choice, signature) => this.pickSceneChoice(choice, signature), document, this.state.sceneChoicesEnabled ? {
      busy, loading: !busy || this.pendingService?.type === "scene-choices" || this.serviceFeedback?.type === "scene-choices", requestSignature: this.pendingService?.type === "scene-choices" ? this.pendingService.sceneSignature : undefined, onRequest: (signature) => this.requestSceneChoices(signature),
    } : undefined, { adaptiveLayout: this.settings.adaptiveLayout !== false, pinSceneChoices: !!this.settings.pinSceneChoices, pinPortraits: !!(this.settings.pinPortraitLeft || this.settings.pinPortraitRight), onToggle: key => this.toggleChoicePin(key) });
    const characters = this.state.characters;
    const worldId = characters?.worldId; const chatId = characters?.chatId; const chatUrl = location.href;
    const resetAt = this.settings.portraitLayoutResetAt ?? 0;
    syncChoicePortraits(!!characters && this.settings.characterSpritesEnabled !== false && !this.state.vaultLocked, characters?.entities ?? [], characters?.scene, this.state.locale, id => { if (this.state.characters) { this.state.characters.openId = id; this.render(); } }, document, worldId && chatId ? {
      scope: JSON.stringify([worldId, chatId]), layout: this.currentBinding()?.portraitLayouts?.[worldId], resetAt,
      pinSceneChoices: !!this.settings.pinSceneChoices, pinLeft: !!(this.settings.pinPortraitLeft || this.settings.pinPortraitRight), pinRight: !!(this.settings.pinPortraitLeft || this.settings.pinPortraitRight),
      adaptiveLayout: this.settings.adaptiveLayout !== false,
      onSave: async (entityId, pose) => {
        if (this.state.vaultLocked || chatId !== this.adapter.getChatId() || worldId !== this.currentScene().worldId) throw new Error("character-scope");
        await repository.savePortraitLayout({ worldId, chatId, chatUrl, resetAt, entityId, pose });
        if (chatId === this.adapter.getChatId() && worldId === this.currentScene().worldId) { await this.reload(); this.syncSceneChoices(); }
      },
    } : undefined);
  }

  private async saveCharacter(edit: Omit<CharacterEdit, "chatUrl">) {
    if (this.state.vaultLocked || !this.settings.characterSheetsEnabled || edit.chatId !== this.adapter.getChatId() || edit.worldId !== this.currentScene().worldId) throw new Error("character-scope");
    const url = location.href;
    const saved = await repository.saveCharacter({ ...edit, chatUrl: url });
    if (location.href !== url) return saved;
    this.characterStatus = "saved";
    // A failed refresh must not turn a committed save into a failed create/retry.
    await this.reload().catch(() => this.publishContext(""));
    this.syncSceneChoices();
    return saved;
  }

  private scanCharacters(): Promise<void> {
    if (this.characterScanTask) return this.characterScanTask;
    const task = this.scanCharacterTurn().finally(() => { if (this.characterScanTask === task) this.characterScanTask = null; });
    this.characterScanTask = task;
    return task;
  }

  private async scanCharacterTurn() {
    await this.characterReceiptTask;
    const characters = this.state.characters;
    if (!characters || this.characterSaving || this.state.vaultLocked || this.adapter.isGenerating() || this.preparingService || this.currentActivity()?.phase === "waiting") return;
    const response = latestCharacterResponse();
    if (!response) return;
    const scope = `${characters.worldId}:${characters.chatId}`;
    const key = response.turn ? characterTurnKey(response.turn) : response.signature;
    if (this.characterScan?.scope === scope && this.characterScan.key === key && this.characterScan.done) return;
    if (this.characterScan?.scope !== scope || this.characterScan.key !== key) this.characterScan = { scope, key, since: Date.now(), done: false };
    if (Date.now() - this.characterScan.since < 1200) { window.setTimeout(() => this.scheduleScan(), 1250); return; }
    this.characterScan.done = true;
    const rawTurn = response.turn;
    if (rawTurn?.request) this.characterReceipt = (await browser.runtime.sendMessage({ type: "DR_GET_TAB_STATE" } satisfies DeepRoleMessage) as TabSessionState | undefined)?.characterRequest ?? null;
    const turn = rawTurn?.request ? bindCharacterTurn(rawTurn, this.characterReceipt, characters) : rawTurn;
    let status: CharacterCopyKey = "missing";
    if (rawTurn && characters.scene?.lastReply === key) status = "updated";
    else if (rawTurn?.request && !turn) status = this.characterReceipt?.id !== rawTurn.request ? "unbound" : this.characterReceipt.worldId !== characters.worldId ? "otherWorld" : this.characterReceipt.chatId !== characters.chatId ? "otherChat" : "stale";
    else if (turn) {
      if (turn.world !== characters.worldId) status = "otherWorld";
      else if (turn.chat !== characters.chatId) status = "otherChat";
      else if (turn.base !== characters.base) status = "stale";
      else {
        const url = location.href;
        this.characterSaving = true;
        try {
          await repository.applyCharacterTurn({ worldId: characters.worldId, chatId: characters.chatId, base: characters.base, chatUrl: url, replyText: response.text, replyIdentity: nativeMessageIdentity(response.row) ?? "turn:" + key, replyCompletedAt: this.characterScan.since }, turn);
          if (location.href !== url || this.currentScene().worldId !== characters.worldId) return;
          status = "updated";
          await this.reload();
        } catch (error) {
          const reason = error instanceof Error ? error.message : "";
          status = reason === "character-conflict" ? "stale" : reason === "character-scope" ? "otherChat" : reason === "character-unknown" ? "unknown" : reason === "character-invalid" ? "invalidUpdate" : reason === "character-limit" ? "limit" : "autoFailed";
        }
        finally { this.characterSaving = false; }
      }
    }
    if (!this.state.characters || `${this.state.characters.worldId}:${this.state.characters.chatId}` !== scope) return;
    this.characterStatus = status; this.state.characters.status = status;
    if (rawTurn) foldCharacterPayload(response.row, this.state.locale, status);
    this.syncSceneChoices(); this.render();
  }

  private async requestSceneChoices(signature: string): Promise<boolean> {
    if (this.state.vaultLocked || !this.state.sceneChoicesEnabled) return false;
    const result = await this.runService({ id: createId("service"), type: "scene-choices", sceneSignature: signature, bookId: this.currentScene().bookId, createdAt: Date.now() });
    if (!result.ok) this.showToast(sceneChoiceText(this.state.locale,
      result.error === "draft-not-empty" ? "draftBusy" : result.error === "scene-changed" ? "changed" : result.error === "busy" ? "busy" : "unavailable"));
    this.syncSceneChoices();
    return result.ok;
  }

  private async toggleSceneChoices() {
    try {
      await updateSettings({ sceneChoicesEnabled: !(this.settings.sceneChoicesEnabled ?? true) });
      await this.reload();
      this.syncSceneChoices();
    } catch { this.showToast(sceneChoiceText(this.state.locale, "unavailable")); }
  }

  private async togglePortraits() {
    try {
      await updateSettings({ characterSpritesEnabled: this.settings.characterSpritesEnabled === false });
      await this.reload();
      this.syncSceneChoices();
    } catch { this.showToast(this.state.locale === "ru" ? "Не удалось изменить видимость портретов." : "Couldn’t change portrait visibility."); }
  }

  private async toggleChoicePin(key: ChoicePin) {
    try {
      // Keep existing backup fields compatible; one control now owns both sides.
      await updateSettings(key === "pinPortraits" ? { pinPortraitLeft: !(this.settings.pinPortraitLeft || this.settings.pinPortraitRight), pinPortraitRight: !(this.settings.pinPortraitLeft || this.settings.pinPortraitRight) } : { pinSceneChoices: !this.settings.pinSceneChoices });
      await this.reload(); this.syncSceneChoices();
    } catch { this.showToast(sceneChoiceText(this.state.locale, "unavailable")); }
  }

  private async toggleAdaptiveLayout() {
    try {
      await updateSettings({ adaptiveLayout: this.settings.adaptiveLayout === false });
      await this.reload(); this.syncSceneChoices();
    } catch { this.state.toast = this.state.locale === "ru" ? "Не удалось сохранить настройку." : "Couldn’t save this setting."; this.render(); }
  }

  private async pickSceneChoice(choice: SceneChoice, signature: string): Promise<boolean> {
    if (this.state.vaultLocked || this.settings.sceneChoicesEnabled === false || this.adapter.isGenerating() || this.preparingService || this.currentActivity()?.phase === "waiting") {
      this.showToast(sceneChoiceText(this.state.locale, "unavailable")); return false;
    }
    const draft = this.adapter.getDraft();
    if (draft.trim() && (this.pickedSceneChoice?.signature !== signature || this.pickedSceneChoice.text !== draft)) {
      this.showToast(sceneChoiceText(this.state.locale, "draftBusy")); return false;
    }
    if (!this.adapter.setDraft(choice.text)) { this.showToast(sceneChoiceText(this.state.locale, "unavailable")); return false; }
    this.pickedSceneChoice = { signature, text: choice.text };
    return true;
  }

  private scheduleServiceRetryScan(delay = 1200) {
    window.clearTimeout(this.serviceRetryTimer);
    this.serviceRetryTimer = window.setTimeout(() => this.scheduleScan(), delay);
  }

  private updateMemoryPreloader(request: ServiceRequest) {
    if (!["memory-analysis", "continue-handoff"].includes(request.type)) return;
    const label = request.type === "continue-handoff" ? continuationText(this.state.locale, "summary") : experienceText(this.state.locale, "memoryPreloader");
    this.rememberServiceReply(request);
    presentMemoryAnalysis(request.id, label, undefined, document, request.replyIdentity);
  }

  private rememberServiceReply(request: ServiceRequest) {
    if (this.pendingService?.id !== request.id) return;
    const row = findServiceReplyRows(request.id, document, request.type === "scene-choices" ? "<deeprole_choices>" : SERVICE_START)[0];
    const identity = row && nativeMessageIdentity(row);
    if (!identity || identity === request.replyIdentity) return;
    request.replyIdentity = identity;
    // The guard prevents this late metadata write resurrecting a completed request.
    if (request.type === "character-text" && request.chatId) this.characterTextTurns = [...this.characterTextTurns.filter(item => item.requestId !== request.id), { requestId: request.id, chatId: request.chatId, replyIdentity: identity }];
    void this.saveTabState({ service: { ...request }, ...(request.type === "character-text" ? { characterTextTurns: this.characterTextTurns } : {}) }, { serviceId: request.id }).catch(() => undefined);
  }

  private cleanArchivedMemoryPayloads() {
    this.syncCharacterTextServices();
    replaceArchivedMemoryPayloads(experienceText(this.state.locale, "memoryResultArchived"), this.pendingService?.id, continuationText(this.state.locale, "summaryArchived"));
  }

  private readSelection() {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    if (this.state.vaultLocked || text.length < 3 || text.length > 5000 || selection?.anchorNode?.parentElement?.closest("deeprole-page-widget")) {
      this.state.selectionText = "";
      this.state.selectionPosition = null;
      this.render();
      return;
    }
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const rect = range?.getBoundingClientRect();
    this.state.selectionText = text;
    this.state.selectionPosition = rect ? { x: rect.left + rect.width / 2, y: rect.top - 4 } : null;
    this.render();
  }

  private async saveSelection(text: string, activation: MemoryEntry["activation"] = "smart", suppliedTitle?: string) {
    if (!text.trim()) return;
    const now = Date.now();
    if (text.length > 30000) throw new Error("too-long");
    const title = suppliedTitle?.trim().slice(0, 240) || text.trim().split(/[.!?\n]/)[0]?.slice(0, 70) || this.t("savedFragment");
    await repository.put("entry", {
      id: createId("memory"),
      bookId: this.currentScene().bookId,
      worldId: this.currentScene().worldId,
      entityIds: this.currentScene().focusIds,
      title,
      content: text.trim(),
      keywords: deriveKeywords(title, text),
      activation,
      priority: "normal",
      enabled: true,
      source: { type: suppliedTitle === undefined && activation === "smart" ? "selection" : "manual", chatId: this.adapter.getChatId() ?? undefined },
      createdAt: now,
      updatedAt: now,
    } satisfies MemoryEntry);
    this.state.selectionText = "";
    this.state.selectionPosition = null;
    this.showToast(this.t("selectionSavedShort"));
    await this.reload();
    void browser.runtime.sendMessage({ type: "DR_DATA_CHANGED" } satisfies DeepRoleMessage).catch(() => undefined);
  }

  private settleCharacterText(id: string, text?: string, error?: string) {
    const waiter = this.characterTextWaiter; if (!waiter || waiter.id !== id) return;
    window.clearTimeout(waiter.timer); this.characterTextWaiter = null;
    if (error) waiter.reject(new Error(error)); else waiter.resolve(text ?? "");
  }
  private async askSelfie(entityId: string): Promise<void> {
    const cast = this.state.characters, person = cast?.entities.find(e => e.id === entityId);
    if (!person || person.characterSheet?.protagonist || this.state.vaultLocked || this.adapter.isAuthenticationPage()) throw new Error("scene-changed");
    if (this.adapter.isGenerating() || this.pendingService || this.preparingService) throw new Error("busy");
    if (this.adapter.getDraft().trim()) throw new Error("draft-not-empty");
    const available = this.imageSettings.enabled || (person.characterSheet?.selfieCategories?.some(c => c.images.length) ?? false) || Object.keys(person.characterSheet?.sprites ?? {}).some(k => /^(?:selfie|селфи)/iu.test(k));
    if (!available) { this.showToast(imageText(this.state.locale, "disabled")); throw new Error("image-disabled"); }
    const url = location.href, worldId = cast!.worldId;
    const prompt = this.state.locale === "ru" ? person.name + ", пришли мне селфи, если тебе комфортно. Как ты сейчас выглядишь и где находишься?" : person.name + ", could you send me a selfie if you feel comfortable? What do you look like and where are you now?";
    await this.updateContext(prompt);
    if (location.href !== url || this.currentScene().worldId !== worldId) throw new Error("scene-changed");
    if (this.adapter.getDraft().trim()) throw new Error("draft-not-empty");
    if (!this.adapter.setDraft(prompt)) throw new Error("unavailable");
    if (!this.adapter.submitDraft()) throw new Error("unavailable");
  }
  private generateCharacterText(draft: CharacterTextRequest, imageAttempt?: import("../core/image-plan").ImageAttempt): Promise<string> {
    if (!validCharacterTextRequest(draft)) return Promise.reject(new Error("invalid-brief"));
    if (this.characterTextWaiter) return Promise.reject(new Error("busy"));
    const request: ServiceRequest = { id: createId("service"), type: "character-text", characterText: draft, ...(imageAttempt ? { imageAttemptId: imageAttempt.id, imageMessageKey: imageAttempt.messageKey } : {}), bookId: this.currentScene().bookId, createdAt: Date.now() };
    const url = location.href, worldId = this.currentScene().worldId;
    const promise = new Promise<string>((resolve, reject) => {
      const timer = window.setTimeout(() => { this.settleCharacterText(request.id, undefined, "service-failed"); if (this.pendingService?.id === request.id) void this.endUnusableService(this.pendingService); }, SERVICE_TIMEOUT_MS + 1000);
      this.characterTextWaiter = { id: request.id, url, worldId, resolve, reject, timer };
    });
    void this.runService(request).then(result => { if (!result.ok) this.settleCharacterText(request.id, undefined, result.error ?? "service-failed"); }).catch(() => this.settleCharacterText(request.id, undefined, "service-failed"));
    return promise;
  }
  private syncCharacterTextServices() {
    return hideCharacterTextServices(document, this.characterTextTurns.filter(item => item.chatId === this.adapter.getChatId()));
  }
  private async scanCharacterTextService(request: ServiceRequest, rows: HTMLElement[]) {
    this.syncCharacterTextServices();
    if (this.adapter.isGenerating()) return;
    const raw = rows.map(row => plainCharacterReplyText(row)).join("\n").trim();
    const previous = this.malformedServiceReplies.get(request.id), now = Date.now();
    const stableSince = previous?.text === raw ? previous.stableSince : now;
    this.malformedServiceReplies.set(request.id, { text: raw, stableSince });
    if (!raw) { await this.handleUnusableServiceReply(request, rows); this.scheduleServiceRetryScan(); return; }
    if (now - stableSince < 1200) { this.scheduleServiceRetryScan(); return; }
    this.processingService = true;
    try {
      let result: string | undefined, error: string | undefined;
      try { result = request.imagePlan ? JSON.stringify(parseImageScenePlan(raw)) : characterFieldResult(raw, request.characterTextLimit ?? 1200); } catch (cause) { error = cause instanceof Error ? cause.message : "invalid-result"; }
      const found = this.syncCharacterTextServices().map(item => ({ ...item, chatId: request.chatId! }));
      const turns = [...this.characterTextTurns.filter(old => !found.some(item => item.requestId === old.requestId)), ...found];
      if (!await this.saveTabState({ service: null, characterTextTurns: turns }, { serviceId: request.id })) return;
      this.characterTextTurns = turns;
      if (this.pendingService?.id === request.id) this.pendingService = null;
      this.malformedServiceReplies.delete(request.id); this.setServiceResult(request, null);
      const waiter = this.characterTextWaiter;
      if (await repository.isLocked()) error = "vault-locked";
      else if (waiter && (location.href !== waiter.url || this.currentScene().worldId !== waiter.worldId)) error = "scene-changed";
      if (request.imagePlan && !waiter && request.imageAttemptId && request.imageMessageKey && request.worldId && request.chatId) await browser.runtime.sendMessage({ type: "DR_IMAGE_FAIL", target: { worldId: request.worldId, chatId: request.chatId, chatUrl: request.chatUrl!, messageKey: request.imageMessageKey }, id: request.imageAttemptId, error: "expired" } satisfies import("../core/image-messages").ImageMessage).catch(() => undefined);
      this.settleCharacterText(request.id, result, error);
      await this.reload();
    } catch { this.settleCharacterText(request.id, undefined, "service-failed"); await this.endUnusableService(request).catch(() => undefined); }
    finally { this.processingService = false; }
  }

  private async runService(request: ServiceRequest): Promise<{ ok: boolean; error?: string }> {
    // Reject at the time of the click, rather than queueing a command behind I/O.
    if (this.preparingService) return { ok: false, error: "busy" };
    const initialUrl = location.href;
    const sceneKey = () => JSON.stringify({ ...this.currentScene(), focusIds: [...this.currentScene().focusIds].sort() });
    const initialScene = sceneKey();
    const guard = (ownRequest = false): string | undefined => {
      if (location.href !== initialUrl || sceneKey() !== initialScene) return "scene-changed";
      if (request.continuationId && (this.state.continuation?.id !== request.continuationId || !this.flowInScope(this.state.continuation))) return "scene-changed";
      if (request.type === "scene-choices" && (!this.state.sceneChoicesEnabled || !request.sceneSignature || latestSceneChoiceTarget()?.signature !== request.sceneSignature)) return "scene-changed";
      if (this.adapter.isGenerating() || (this.pendingService && this.pendingService.chatId === this.adapter.getChatId() && (!ownRequest || this.pendingService.id !== request.id) && Date.now() - this.pendingService.createdAt < 10 * 60 * 1000)) return "busy";
      if (this.adapter.getDraft().trim()) return "draft-not-empty";
      if (request.type !== "lore-draft" && (!this.adapter.getChatId() || this.adapter.getMessageCount() === 0)) return "empty-chat";
      return undefined;
    };
    const initialError = guard();
    if (initialError) return { ok: false, error: initialError };
    if (request.type === "character-text" && !validCharacterTextRequest(request.characterText)) return { ok: false, error: "invalid-brief" };
    if ((request.type === "lore-draft" || request.targetEntityId) && (!request.brief?.trim() || request.brief.length > 6000)) return { ok: false, error: "invalid-brief" };
    if (request.targetEntityId && request.type !== "memory-analysis") return { ok: false, error: "invalid-brief" };
    this.preparingService = true;
    this.serviceFeedback = serviceActivity(request, "preparing");
    this.render();
    let stored = false;
    const cancel = async (error: string) => {
      if (location.href === initialUrl && sceneKey() === initialScene && error !== "vault-locked") this.serviceFeedback = serviceActivity(request, "error");
      if (stored) {
        if (request.type === "memory-analysis") removeServicePreloader(request.id, findServiceReplyRows(request.id));
        if (this.pendingService?.id === request.id) this.pendingService = null;
        this.malformedServiceReplies.delete(request.id);
        await this.saveTabState({ service: null }, { serviceId: request.id });
        stored = false;
        await this.updateContext();
      }
      return { ok: false, error };
    };
    try {
      await this.reload();
      if (await repository.isLocked()) return { ok: false, error: "vault-locked" };
      const reloadedError = guard();
      if (reloadedError) return { ok: false, error: reloadedError };
      request = { ...request, ...this.currentScene(), chatId: this.adapter.getChatId() ?? undefined, chatUrl: initialUrl, startedMessageCount: this.adapter.getMessageCount() };
      const priorReply = nativeMessageRows(document).filter(row => !isUserMessage(row)).at(-1);
      request.priorReplyIdentity = priorReply ? nativeMessageIdentity(priorReply) : undefined;
      delete request.replyIdentity;
      // Previous service results must not become suggestions in a different world.
      const book = this.books.find((item) => item.id === request.bookId);
      // Bound the service request; omitted records must not be silently updated.
      const scope = scopedMemories(this.entries, this.books, request.worldId ?? null);
      const target = request.targetEntityId ? this.entities.find((entity) => entity.id === request.targetEntityId && entity.worldId === request.worldId && entity.kind === "character") : undefined;
      if (request.targetEntityId && !target) return { ok: false, error: "character-unavailable" };
      const selected = new Set(this.selection.entries.map((item) => item.entry.id));
      let characters = 0;
      const existing = request.targetEntityId || request.continuationId ? scope : [...scope].sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)) || b.updatedAt - a.updatedAt).filter((entry) => {
        characters += entry.title.length + entry.content.length + 120; return characters <= 24000;
      }).slice(0, 80);
      // A correction must inspect the complete world. Never claim a partial
      // model prompt covered old mentions that were omitted by a size cap.
      if (target && (existing.length > 100 || existing.reduce((sum, entry) => sum + entry.title.length + entry.content.length + 120, 0) > 60000)) return { ok: false, error: "character-world-too-large" };
      if (request.continuationId && (scope.length > 1000 || scope.reduce((sum, entry) => sum + entry.title.length + entry.content.length + 120, 0) > 220000)) return { ok: false, error: "continuation-world-too-large" };
      if (request.type !== "scene-choices") request.baseVersions = Object.fromEntries(await Promise.all(existing.map(async (entry) => [entry.id, await memoryFingerprint(entry)])));
      if (target) request.baseEntityVersion = await characterFactFingerprint(target);
      const basePrompt = request.type === "character-text" ? characterFieldPrompt(request.characterText!, existing, this.state.locale) : target ? characterFactPrompt(target, request.brief!, existing, this.state.locale) : request.type === "scene-choices" ? sceneChoiceRecoveryPrompt(this.state.locale) : request.type === "memory-analysis" ? memoryAnalysisPrompt(book?.name, existing, this.state.locale) : request.type === "lore-draft" ? loreDraftPrompt(request.brief!, this.state.locale, this.settings.relationshipsEnabled !== false && this.worlds.find(w => w.id === request.worldId)?.relationshipsEnabled !== false ? relationshipLoreBrief(this.entities.filter(e => e.worldId === request.worldId)) : "") : request.type === "continue-handoff" && request.continuationId ? sceneHandoffPrompt(request.brief ?? "{}", existing, this.state.locale) : handoffPrompt();
      // Service bodies deliberately bypass the injection bridge. Attach bounded,
      // read-only reference here; never create a character-update receipt for them.
      const serviceWorld = this.worlds.find(w => w.id === request.worldId);
      const serviceCharacters = this.entities.filter(e => e.worldId === request.worldId && e.kind === "character");
      const serviceScene = serviceWorld ? this.currentBinding()?.characterScenes?.[serviceWorld.id] ?? handoffCharacterScene(this.appliedSnapshot, serviceWorld.id) : undefined;
      const reference = serviceWorld && this.settings.characterSheetsEnabled ? characterInstruction(serviceWorld.id, request.chatId ?? "", serviceCharacters, serviceScene, emotionsFor(serviceWorld.characterEmotions ?? this.settings.characterEmotions), request.focusIds ?? [], this.adapter.getRecentMessages(2).join("\n"), undefined, this.settings.relationshipsEnabled !== false && serviceWorld.relationshipsEnabled !== false, true) : "";
      const selectedMemory = ["scene-choices", "handoff", "continue-handoff"].includes(request.type) ? formatMemoryContext(this.selection, null) : "";
      const prompt = [basePrompt.replace("[DeepRole Service]\n", `[DeepRole Service]\n[Request ID: ${request.id}]\n`), reference, selectedMemory].filter(Boolean).join("\n\n");
      // Keep only correlation metadata in session storage, not the user's lore brief.
      delete request.brief;
      if (request.type === "character-text") { request.characterTextLimit = request.characterText!.field.maxLength; request.imagePlan = request.characterText!.field.key === "image-plan"; }
      delete request.characterText;
      const preparedError = guard();
      if (preparedError) return { ok: false, error: preparedError };
      this.state.warning = "";
      this.publishContext("");
      this.pendingService = request;
      stored = true;
      await this.saveTabState({ service: request });
      if (await repository.isLocked()) return await cancel("vault-locked");
      // A user can type, navigate or start an answer while fingerprints/storage await.
      const submitError = guard(true);
      if (submitError) return await cancel(submitError);
      // Submit a dedicated service turn, never a replacement for the user's
      // draft. Memory analysis is presented as one plaque, not technical text.
      if (!this.adapter.setDraft(prompt) || !this.adapter.submitDraft()) {
        if (this.adapter.getDraft() === prompt) this.adapter.setDraft("");
        return await cancel("composer-not-found");
      }
      this.state.analysisSuggested = false;
      if (!["scene-choices", "character-text"].includes(request.type)) this.showToast(this.t("deepseekAnalyzing"));
      return { ok: true };
    } catch {
      await cancel("service-failed").catch(() => undefined);
      return { ok: false, error: "service-failed" };
    } finally {
      this.preparingService = false;
      if (this.serviceFeedback?.phase === "preparing") this.serviceFeedback = null;
      this.render();
    }
  }

  private async markAnalyzed(request: ServiceRequest) {
    const chatId = request.chatId;
    if (!chatId) return;
    const existing = (await repository.list<ChatBinding>("binding")).find((binding) => binding.chatId === chatId);
    const now = Date.now();
    const binding: ChatBinding = existing
      ? { ...existing, messageCountAtAnalysis: request.startedMessageCount ?? this.adapter.getMessageCount(), updatedAt: now }
      : { id: `binding:${chatId}`, chatId, bookId: request.bookId, worldId: request.worldId, focusIds: request.focusIds, chatUrl: request.chatUrl ?? location.href, messageCountAtAnalysis: request.startedMessageCount ?? this.adapter.getMessageCount(), createdAt: now, updatedAt: now };
    await repository.putIfUnchanged("binding", binding, existing ?? null);
  }

  private async scanServiceResponses() {
    if (this.processingService || !this.pendingService || this.pendingService.chatId !== this.adapter.getChatId()) return;
    const request = this.pendingService;
    this.rememberServiceReply(request);
    const replyRows = findServiceReplyRows(request.id, document, request.type === "scene-choices" ? "<deeprole_choices>" : SERVICE_START, request.replyIdentity);
    const virtualizedReply = request.type !== "scene-choices" && !replyRows.length
      ? findVirtualizedServiceReply(request.id, request.priorReplyIdentity) : null;
    if (virtualizedReply) replyRows.push(virtualizedReply);
    if (request.type === "character-text") { await this.scanCharacterTextService(request, replyRows); return; }
    if (request.type === "scene-choices") {
      replyRows.forEach((row) => { row.dataset.deeproleSceneChoicesReply = "true"; });
      const completed = replyRows.some((row) => parseSceneChoices(row.textContent ?? ""));
      if (completed && !this.adapter.isGenerating()) {
        this.processingService = true;
        try {
          if (!await this.saveTabState({ service: null }, { serviceId: request.id })) return;
          if (this.pendingService?.id === request.id) this.pendingService = null;
          this.malformedServiceReplies.delete(request.id);
          this.setServiceResult(request, null);
          await this.reload();
        } finally { this.processingService = false; }
      } else if (!completed) await this.handleUnusableServiceReply(request, replyRows);
      return;
    }
    const candidates = virtualizedReply
      ? findVirtualizedServiceResponseElements(virtualizedReply)
      : findServiceResponseElements(request.id, document, request.replyIdentity);
    if (["memory-analysis", "continue-handoff"].includes(request.type)) this.updateMemoryPreloader(request);
    for (const element of candidates) {
      const parsed = parseServiceData(element.textContent || element.innerText || "");
      if (!parsed) continue;
      if (this.pendingService?.id !== request.id) return;
      if (request.continuationId && (this.state.continuation?.id !== request.continuationId || !this.flowInScope(this.state.continuation))) { await this.cancelContinuation(); return; }
      if (request.continuationId && this.adapter.isGenerating()) return;
      this.malformedServiceReplies.delete(request.id);
      if ((parsed.type === "memory-suggestions") !== ["memory-analysis", "lore-draft"].includes(request.type)) continue;
      if (request.targetEntityId && parsed.type === "memory-suggestions" && !parsed.profile) continue;
      this.processingService = true;
      try {
        if (parsed.type === "memory-suggestions") {
          const records = await repository.rawRecords();
          const target = request.targetEntityId ? libraryRecords<SceneEntity>(records, "entity").find((entity) => entity.id === request.targetEntityId) : undefined;
          const batch = await prepareMemoryProposals(parsed.items, scopedMemories(libraryRecords<MemoryEntry>(records, "entry"), libraryRecords<MemoryBook>(records, "book"), request.worldId ?? null), request, parsed.profile, target);
          const changeCount = batch.items.length + Number(!!batch.profileChange);
          if (changeCount) await repository.put("proposal", batch);
          // A stale reminder counter must not turn an already saved batch into a retry.
          if (request.type === "memory-analysis") await this.markAnalyzed(request).catch(() => undefined);
          if (changeCount) this.state.reviewProposalId = batch.id;
          if (request.continuationId && this.state.continuation?.id === request.continuationId) await this.setContinuation({ ...this.state.continuation, phase: changeCount ? "review" : "ready", ...(changeCount ? { proposalId: batch.id } : {}) });
          this.setServiceResult(request, changeCount ? null : "empty");
          this.showToast(changeCount ? this.t("suggestionsReady") : assistantText(this.state.locale, "noChanges"));
          const summary = changeCount
            ? experienceText(this.state.locale, "resultReview")
            : assistantText(this.state.locale, "analysisNoChanges");
          presentMemoryAnalysis(request.id, experienceText(this.state.locale, "memoryPreloader"), summary, document, request.replyIdentity);
          if (!changeCount) void browser.runtime.sendMessage({ type: "DR_SERVICE_RESULT", outcome: "no-changes" } satisfies DeepRoleMessage).catch(() => undefined);
        } else {
          const scope = this.pageScope();
          const snapshot = request.continuationId
            ? await repository.captureContinuation({ chatId: request.chatId!, chatUrl: request.chatUrl!, scene: { worldId: request.worldId ?? null, focusIds: request.focusIds ?? [], bookId: request.bookId }, story: boundStory([], "history"), recap: parsed, overrides: this.overrides() })
            : createSnapshot(parsed, request.chatId ?? "unknown", request.chatUrl ?? scope.url, request.bookId);
          if (!request.continuationId) {
            snapshot.worldId = request.worldId ?? null; snapshot.focusIds = request.focusIds ?? [];
            const sourceScene = request.worldId && this.currentBinding()?.characterScenes?.[request.worldId];
            if (sourceScene) snapshot.characterScene = structuredClone(sourceScene);
            await repository.put("snapshot", snapshot);
          }
          if (request.continuationId) presentMemoryAnalysis(request.id, continuationText(this.state.locale, "summary"), continuationText(this.state.locale, "summaryDone"), document, request.replyIdentity);
          else replaceServicePayloadWithSummary(element, assistantText(this.state.locale, "handoffSaved"));
          this.showToast(assistantText(this.state.locale, "handoffSaved"));
          if (request.type === "continue-handoff") {
            if (request.continuationId && this.state.continuation?.id === request.continuationId) await this.setContinuation({ ...this.state.continuation, phase: "opening", snapshotId: snapshot.id });
            this.scheduleHandoffNavigation(snapshot, scope, request.continuationId);
          }
        }
        if (this.pendingService?.id === request.id) this.pendingService = null;
        await this.saveTabState({ service: null }, { serviceId: request.id }); await this.reload();
      } catch { await this.endUnusableService(request).catch(() => undefined); }
      finally { this.processingService = false; }
      return;
    }
    await this.handleUnusableServiceReply(request, replyRows);
  }

  private async handleUnusableServiceReply(request: ServiceRequest, replyRows: HTMLElement[]) {
    if (this.pendingService?.id !== request.id) return;
    const expired = Date.now() - request.createdAt >= SERVICE_TIMEOUT_MS;
    if (!replyRows.length && !expired) return;
    const text = replyRows.map(serviceReplyText).join("\n").trim();
    // A thinking-only or empty assistant placeholder is not an invalid final answer.
    if (!text && !expired) { this.scheduleServiceRetryScan(); return; }
    replyRows.forEach((row) => markServiceReplyRow(row, request.id));
    const failedByDeepSeek = /message is generating.{0,80}try again later|сообщение генерируется.{0,80}повторите попытку позже/iu.test(text);
    const previous = this.malformedServiceReplies.get(request.id);
    const now = Date.now();
    const stableSince = previous?.text === text ? previous.stableSince : now;
    this.malformedServiceReplies.set(request.id, { text, stableSince });
    if (expired || failedByDeepSeek || (!this.adapter.isGenerating() && now - stableSince >= 12_000 && now - request.createdAt >= 12_000)) {
      await this.endUnusableService(request);
      return;
    }
    if (!this.adapter.isGenerating()) this.scheduleServiceRetryScan();
  }

  private async endUnusableService(request: ServiceRequest) {
    if (this.pendingService?.id !== request.id) return;
    try {
      if (!await this.saveTabState({ service: null }, { serviceId: request.id })) return;
    } catch {
      // Even an unavailable background/session store must not keep the page
      // spinning. A newer request is never cleared without its guarded write.
    }
    this.settleCharacterText(request.id, undefined, "service-failed");
    this.failedServiceIds.add(request.id);
    if (request.continuationId && this.state.continuation?.id === request.continuationId) await this.setContinuation(null);
    if (request.type === "memory-analysis") presentMemoryAnalysis(request.id,
      experienceText(this.state.locale, "memoryPreloader"), experienceText(this.state.locale, "memoryAnalysisFailed"), document, request.replyIdentity);
    else if (request.type === "continue-handoff") presentMemoryAnalysis(request.id, continuationText(this.state.locale, "summary"), continuationText(this.state.locale, "summaryFailed"), document, request.replyIdentity);
    else removeServicePreloader(request.id, findServiceReplyRows(request.id));
    if (this.pendingService?.id === request.id) this.pendingService = null;
    this.setServiceResult(request, "error");
    this.malformedServiceReplies.delete(request.id);
    await this.updateContext(); this.syncSceneChoices(); this.render();
    if (!request.imagePlan) this.showToast(request.type === "scene-choices" ? sceneChoiceText(this.state.locale, "failedHint") : assistantText(this.state.locale, /handoff/.test(request.type) ? "invalidHandoffResult" : "invalidServiceResult"));
  }

  private scheduleHandoffNavigation(snapshot: HandoffSnapshot, scope: PageScope, continuationId?: string) {
    if (this.handoffNavigationQueued === snapshot.id) return;
    this.handoffNavigationQueued = snapshot.id;
    this.autoContinueAttempted = false;
    const sceneKey = JSON.stringify(this.currentScene());
    const safeToLeave = (ownToken?: string) => (!continuationId || this.state.continuation?.id === continuationId && this.flowInScope(this.state.continuation)) && location.href === scope.url && this.adapter.getChatId() === scope.chatId && JSON.stringify(this.currentScene()) === sceneKey && !this.adapter.getDraft().trim() && !this.adapter.isGenerating() && (!this.appliedSnapshot || this.appliedSnapshot.id === snapshot.id && this.snapshotToken === ownToken);
    window.setTimeout(() => {
      void (async () => {
        if (!safeToLeave(this.snapshotToken ?? undefined)) { if (continuationId && this.state.continuation?.id === continuationId) await this.setContinuation(null); this.showToast(assistantText(this.state.locale, "handoffSaved")); return; }
        const token = this.appliedSnapshot?.id === snapshot.id && this.snapshotToken || createId("handoff");
        if (this.appliedSnapshot?.id !== snapshot.id && !await this.saveTabState({ snapshotId: snapshot.id, snapshotToken: token, continueOnFreshChat: true, continueUntil: Date.now() + 90_000 }, { snapshotId: null, ...(continuationId ? { continuationKey: continuationKey(this.state.continuation) } : {}) })) { if (continuationId && this.state.continuation?.id === continuationId) await this.setContinuation(null); return; }
        if (!safeToLeave(token)) {
          await this.saveTabState({ snapshotId: null, snapshotToken: null }, { snapshotId: snapshot.id, snapshotToken: token });
          this.showToast(assistantText(this.state.locale, "handoffSaved")); return;
        }
        if (continuationId) await this.setContinuation(null);
        location.href = "https://chat.deepseek.com/";
      })().catch(() => this.showToast(assistantText(this.state.locale, "handoffSaved"))).finally(() => { this.handoffNavigationQueued = null; });
    }, 650);
  }

  private async readStory(scope: PageScope): Promise<StoryContinuation | null> {
    if (!scope.chatId) return null;
    const latestId = nativeMessageRows(document).at(-1)?.getAttribute("data-message-id") ?? undefined;
    return new Promise(resolve => {
      const id = createId("history");
      const timer = window.setTimeout(() => finish(null), 6500);
      const finish = (story: StoryContinuation | null) => {
        window.clearTimeout(timer);
        if (this.storyRead?.id === id) this.storyRead = null;
        resolve(story);
      };
      this.storyRead = { id, chatId: scope.chatId!, resolve: finish };
      window.postMessage({ source: "deeprole-extension", type: "STORY_HISTORY_REQUEST", requestId: id, chatId: scope.chatId, latestId }, location.origin);
    });
  }

  private flowInScope(flow: ContinuationFlow): boolean {
    return !this.state.vaultLocked && continuationScopeMatches(flow, this.adapter.getChatId(), location.href, this.currentScene());
  }

  private async setContinuation(next: ContinuationFlow | null): Promise<void> {
    const previous = this.state.continuation ?? null;
    if (!await this.saveTabState({ continuation: next }, { continuationKey: continuationKey(previous) })) throw new Error("continuation-conflict");
    this.state.continuation = next; this.render();
  }

  private async cancelContinuation(): Promise<void> {
    const flow = this.state.continuation;
    if (!flow) return;
    await this.setContinuation(null);
    if (flow.snapshotId) {
      const pending = await browser.runtime.sendMessage({ type: "DR_GET_TAB_STATE" } satisfies DeepRoleMessage) as TabSessionState;
      if (pending.snapshotId === flow.snapshotId) {
        await this.saveTabState({ snapshotId: null, snapshotToken: null, continueOnFreshChat: false, continueUntil: null }, { snapshotId: flow.snapshotId, snapshotToken: pending.snapshotToken });
        if (this.appliedSnapshot?.id === flow.snapshotId) { this.appliedSnapshot = null; this.snapshotToken = null; await this.updateContext(); }
      }
    }
    const request = this.pendingService;
    if (request?.continuationId === flow.id) {
      await this.saveTabState({ service: null }, { serviceId: request.id });
      if (this.pendingService?.id === request.id) this.pendingService = null;
      presentMemoryAnalysis(request.id, continuationText(this.state.locale, "summary"), continuationText(this.state.locale, "cancelled"), document, request.replyIdentity);
      await this.updateContext();
    }
    if (this.state.reviewProposalId === flow.proposalId) this.state.reviewProposalId = null;
    this.render();
  }

  private async keepContinuationMemory(): Promise<void> {
    const flow = this.state.continuation;
    if (!flow || flow.phase !== "review" || !flow.proposalId || !this.flowInScope(flow)) throw new Error("scene-changed");
    this.transferring = true;
    try {
      // Explicit approval to carry unchanged memory, including rejected suggestions.
      await this.setContinuation({ ...flow, phase: "approved" });
      const result = await browser.runtime.sendMessage({ type: "DR_REVIEW_MEMORY", operation: "discard", id: flow.proposalId } satisfies DeepRoleMessage);
      if (!result?.ok) { await this.setContinuation(flow); throw new Error("memory-conflict"); }
      this.state.reviewProposalId = null; await this.reload();
    } finally { this.transferring = false; this.scheduleScan(); }
  }

  private async syncContinuation(): Promise<void> {
    const flow = this.state.continuation;
    if (!flow || this.transferring || this.preparingService || this.processingService) return;
    try {
      if (!this.flowInScope(flow)) { await this.cancelContinuation(); return; }
      if (flow.phase === "review" && !this.proposals.some(p => p.id === flow.proposalId)) {
        if (this.changes.some(change => change.proposalId === flow.proposalId && !change.undoneAt)) {
          await this.setContinuation({ ...flow, phase: "approved" });
          this.scheduleScan();
        } else await this.cancelContinuation();
      } else if (flow.phase === "approved" && !this.adapter.isGenerating() && !this.pendingService) {
        const result = await this.advanceContinuation();
        if (!result.ok) this.showToast(continuationText(this.state.locale, result.error === "draft-not-empty" ? "ready" : "failed"));
      } else if (flow.phase === "opening") {
        const snapshot = this.snapshots.find(item => item.id === flow.snapshotId && item.sourceChatId === flow.chatId);
        if (snapshot) this.scheduleHandoffNavigation(snapshot, { chatId: flow.chatId, url: flow.chatUrl }, flow.id);
        else await this.cancelContinuation();
      } else if (["analysis", "summary"].includes(flow.phase) && !this.pendingService) {
        await this.cancelContinuation();
      }
    } catch { this.showToast(continuationText(this.state.locale, "failed")); }
  }

  private async continueStory(): Promise<{ ok: boolean; error?: string }> {
    const flow = this.state.continuation;
    if (flow && this.flowInScope(flow) && flow.phase === "review") {
      this.state.reviewProposalId = flow.proposalId ?? null; this.render(); return { ok: true };
    }
    if (flow && this.flowInScope(flow) && ["ready", "approved"].includes(flow.phase)) return this.advanceContinuation();
    if (this.transferring || this.adapter.isGenerating() || this.pendingService || this.preparingService || flow) return { ok: false, error: "busy" };
    if (this.adapter.getDraft().trim()) return { ok: false, error: "draft-not-empty" };
    const scope = this.pageScope();
    if (!scope.chatId || !this.adapter.getMessageCount()) return { ok: false, error: "empty-chat" };
    this.transferring = true; this.state.transferring = true; this.render();
    let id: string | undefined;
    try {
      await this.sceneQueue.catch(() => undefined); await this.reload(); this.assertScope(scope);
      if (await repository.isLocked()) throw new Error("vault-locked");
      const requestId = createId("service"); id = createId("continuation");
      await this.setContinuation({ id, chatId: scope.chatId, chatUrl: scope.url, scene: structuredClone(this.currentScene()), phase: "analysis", requestId, createdAt: Date.now() });
      const result = await this.runService({ id: requestId, continuationId: id, type: "memory-analysis", bookId: this.currentScene().bookId, createdAt: Date.now() });
      if (!result.ok && this.state.continuation?.id === id) await this.cancelContinuation();
      return result;
    } catch (error) {
      if (id && this.state.continuation?.id === id) await this.cancelContinuation().catch(() => undefined);
      return { ok: false, error: error instanceof Error ? error.message : "handoff-failed" };
    } finally { this.transferring = false; this.state.transferring = false; this.render(); }
  }

  private async advanceContinuation(): Promise<{ ok: boolean; error?: string }> {
    const flow = this.state.continuation;
    if (!flow || !this.flowInScope(flow)) return { ok: false, error: "scene-changed" };
    if (this.transferring || this.adapter.isGenerating() || this.pendingService || this.preparingService) return { ok: false, error: "busy" };
    if (this.adapter.getDraft().trim()) return { ok: false, error: "draft-not-empty" };
    this.transferring = true; this.state.transferring = true; this.render();
    const guard = () => {
      if (this.state.continuation?.id !== flow.id || !this.flowInScope(flow)) throw new Error("scene-changed");
      if (this.adapter.getDraft().trim()) throw new Error("draft-not-empty");
      if (this.adapter.isGenerating() || this.pendingService) throw new Error("busy");
    };
    try {
      await this.characterReceiptTask; await this.scanCharacters(); await this.reload(); guard();
      const history = await this.readStory({ chatId: flow.chatId, url: flow.chatUrl }); guard();
      await this.scanCharacters();
      if (this.characterScan && !this.characterScan.done) {
        await new Promise<void>(resolve => window.setTimeout(resolve, Math.max(0, 1250 - (Date.now() - this.characterScan!.since))));
        guard(); await this.scanCharacters();
      }
      const story = withLatestVisibleStory(history, visibleStoryHistory());
      if (!story.turns.length) throw new Error("history-unavailable");
      guard();
      const requestId = createId("service");
      await this.setContinuation({ ...flow, phase: "summary", requestId });
      const result = await this.runService({ id: requestId, continuationId: flow.id, type: "continue-handoff", bookId: flow.scene.bookId, brief: recentSceneReference(story), createdAt: Date.now() });
      if (!result.ok && this.state.continuation?.id === flow.id) await this.setContinuation({ ...flow, phase: "ready" });
      return result;
    } catch (error) {
      if (this.state.continuation?.id === flow.id && this.flowInScope(flow)) await this.setContinuation({ ...flow, phase: "ready" }).catch(() => undefined);
      return { ok: false, error: error instanceof Error ? error.message : "handoff-failed" };
    } finally { this.transferring = false; this.state.transferring = false; this.render(); }
  }

  private maybeWarnContext() {
    const chatId = this.adapter.getChatId(), capacity = chatCapacity(this.settings.chatContextCapacity);
    const level = contextWarningLevel(this.state.conversationEstimate, capacity);
    if (this.state.vaultLocked || this.settings.contextWarningsEnabled === false || !chatId || !level) return;
    const seen = this.seenContextWarnings.find(v => v.chatId === chatId && v.capacity === capacity);
    if (seen && seen.level >= level) return;
    if (seen) seen.level = level; else this.seenContextWarnings.push({ chatId, capacity, level });
    this.seenContextWarnings = this.seenContextWarnings.slice(-50);
    void this.saveTabState({ contextWarnings: this.seenContextWarnings });
    this.state.contextCapacityWarning = { level, percent: Math.round((this.state.conversationEstimate?.estimatedTokens ?? 0) / capacity * 100) };
    this.render();
  }
  private async dismissCapacityWarning() {
    this.state.contextCapacityWarning = null; this.render();
  }

  private async applySnapshot(snapshotId: string) {
    const scope = this.pageScope();
    const task = this.sceneQueue.catch(() => undefined).then(async () => {
      const snapshot = await repository.get<HandoffSnapshot>("snapshot", snapshotId);
      this.assertScope(scope);
      if (!snapshot) throw new Error("missing-snapshot");
      await this.persistScene({ worldId: memoryWorld(snapshot, this.books), focusIds: snapshot.focusIds ?? [], bookId: snapshot.bookId }, scope, snapshot);
      this.assertScope(scope);
      const token = createId("handoff");
      if (!await this.saveTabState({ snapshotId: snapshot.id, snapshotToken: token })) throw new Error("storage-unavailable");
      this.assertScope(scope);
      this.appliedSnapshot = snapshot; this.snapshotToken = token;
      await this.updateContext();
      this.state.handoffOffer = null;
      this.showToast(this.t("snapshotQueued"));
    });
    this.sceneQueue = task; return task;
  }

  private async handleNavigation() {
    if (this.autoContinuePending && !(location.origin === "https://chat.deepseek.com" && location.pathname === "/" && !this.adapter.getChatId())) {
      await this.disarmAutoContinue(true);
    }
    const chatId = this.adapter.getChatId();
    const promoteDraft = !this.previousChatId && !!chatId;
    const nextScene = this.draftScene;
    const nextOverrides = this.draftOverrides;
    if (promoteDraft && this.pendingService && !this.pendingService.chatId) {
      this.pendingService = { ...this.pendingService, chatId: chatId! }; await this.saveTabState({ service: this.pendingService });
    }
    if (!chatId && this.previousChatId) {
      this.draftScene = { ...EMPTY_SCENE };
      this.draftOverrides = { ...EMPTY_OVERRIDES }; await this.saveTabState({ overrides: this.draftOverrides });
      await browser.runtime.sendMessage({ type: "DR_SAVE_DRAFT_SCENE", scene: this.draftScene } satisfies DeepRoleMessage).catch(() => undefined);
    }
    this.previousChatId = chatId;
    await this.reload();
    if (!this.pendingService) this.cleanArchivedMemoryPayloads();
    if (promoteDraft && !this.currentBinding()) {
      await this.setScene(nextScene);
      const binding = this.currentBinding();
      if (binding) await repository.putIfUnchanged("binding", { ...binding, memoryOverrides: nextOverrides }, binding);
      await this.reload();
    }
  }

  private navigate() {
    if (this.characterTextWaiter) this.settleCharacterText(this.characterTextWaiter.id, undefined, "scene-changed");
    this.scenePhotos.clear(); this.imagePresenter.clear(); closePortraitViewer();
    this.replyRecovery.reset();
    this.state.contextCapacityWarning = null;
    this.pickedSceneChoice = null;
    dismissSceneChoiceCards(document, false);
    window.clearTimeout(this.historyRefreshTimer);
    this.historyRequest = null;
    this.historyRetryAt = 0;
    this.historyWasGenerating = false;
    this.serviceFeedback = null;
    this.state.warning = "";
    this.lastUrl = location.href;
    this.navigationTask = this.navigationTask.catch(() => undefined).then(() => this.handleNavigation());
    void this.navigationTask.catch(() => { this.publishContext(""); });
  }

  private handleBridgeMessage(event: MessageEvent) {
    if (event.source !== window || event.data?.source !== "deeprole-page-bridge") return;
    if (event.data.type === "STORY_HISTORY_RESULT") {
      const pending = this.storyRead;
      if (pending && event.data.requestId === pending.id && event.data.chatId === pending.chatId && pending.chatId === this.adapter.getChatId()) pending.resolve(validStoryContinuation(event.data.estimate) ? event.data.estimate : null);
      return;
    }
    if (event.data.type === "CHAT_HISTORY_ESTIMATE") {
      const request = this.historyRequest;
      if (!request || event.data.requestId !== request.id || event.data.chatId !== request.chatId || request.chatId !== this.adapter.getChatId()) return;
      this.historyRequest = null;
      const value = event.data.estimate as ConversationEstimate | null;
      if (value && Number.isFinite(value.estimatedTokens) && value.estimatedTokens >= 0 && value.estimatedTokens < 100_000_000 && Number.isInteger(value.messageCount) && value.messageCount >= 0 && value.messageCount < 100_000) {
        this.historyRetryAt = 0;
        const previous = this.historyEstimate?.chatId === request.chatId ? this.historyEstimate.value : null;
        this.historyEstimate = { chatId: request.chatId, value: {
          estimatedTokens: Math.max(value.estimatedTokens, previous?.estimatedTokens ?? 0),
          messageCount: Math.max(value.messageCount, previous?.messageCount ?? 0),
          atLeast: value.atLeast === true || Boolean(previous && previous.estimatedTokens > value.estimatedTokens),
          source: "history",
        } };
      } else {
        this.historyRetryAt = Date.now() + 60_000;
        this.scheduleHistoryRefresh(60_000);
      }
      this.updateSuggestions();
      return;
    }
    if (event.data.type === "SERVICE_REQUEST_FAILED" && typeof event.data.id === "string") {
      void this.failedService(event.data.id).catch(() => undefined); return;
    }
    if (event.data.type === "REQUEST_CONTEXT" && typeof event.data.id === "string" && typeof event.data.draft === "string" && event.data.draft.length <= 100000) {
      this.pickedSceneChoice = null;
      this.scheduleHistoryRefresh(12_000);
      dismissSceneChoiceCards();
      const { id, draft } = event.data; const url = location.href;
      const requestChatId = typeof event.data.chatId === "string" && /^[\w-]{1,120}$/u.test(event.data.chatId) ? event.data.chatId : undefined;
      const parentMessageId = typeof event.data.parentMessageId === "string" && /^[\w-]{1,120}$/u.test(event.data.parentMessageId) ? event.data.parentMessageId : undefined;
      void (async () => {
        try {
          if (this.adapter.getChatId() !== this.previousChatId) this.navigate();
          await this.navigationTask;
          await this.sceneQueue.catch(() => undefined);
          await this.replyRecovery.flush();
          await this.recoveryReceiptTask;
          let task = this.reload();
          let loaded = await task;
          // Follow the newest in-flight snapshot instead of starting competing reads.
          for (let attempt = 0; attempt < 5 && (!loaded || task !== this.reloadTask); attempt++) {
            task = this.reloadTask; loaded = await task;
          }
          if (!loaded || location.href !== url) throw new Error("context-changed");
          const generation = this.reloadGeneration;
          const sceneKey = this.contextScopeKey();
          const scene = this.currentScene();
          const currentChatId = this.adapter.getChatId();
          // An API request to another existing chat must not receive this page's lore.
          if (requestChatId && currentChatId && requestChatId !== currentChatId) throw new Error("context-changed");
          const characterChatId = currentChatId ?? (location.pathname === "/" ? requestChatId : undefined);
          const delivery: ContextDelivery = {
            targetChatId: characterChatId,
            scope: this.pageScope(), scopeKey: sceneKey,
            snapshot: this.appliedSnapshot && memoryWorld(this.appliedSnapshot, this.books) === scene.worldId ? this.appliedSnapshot : null,
            snapshotToken: this.snapshotToken, createdAt: Date.now(),
          };
          // Capture this request's result, not the shared preview which another
          // draft can replace while the final vault check is awaiting storage.
          const normalContext = await this.updateContext(draft, id, characterChatId);
          const reply = this.settings.replyRecoveryEnabled !== false && !this.adapter.isAuthenticationPage() && currentChatId && requestChatId === currentChatId
            ? pendingRecoveredReply(this.currentBinding()?.recoveredReplies ?? [], parentMessageId) : undefined;
          const recoveryContext = reply ? recoveredReplyContext(reply) : "";
          const context = [normalContext, recoveryContext].filter(Boolean).join("\n\n");
          if (reply && recoveryContext) delivery.recoveredReply = { chatId: currentChatId!, chatUrl: url, reply };
          if (await repository.isLocked()) { this.publishContext(""); throw new Error("vault-locked"); }
          this.assertScope(delivery.scope);
          if (generation !== this.reloadGeneration || sceneKey !== this.contextScopeKey()) throw new Error("context-changed");
          if (scene.worldId && characterChatId && this.settings.characterSheetsEnabled && !this.state.vaultLocked) {
            const entities = this.entities.filter(e => e.worldId === scene.worldId && e.kind === "character");
            const characterScene = this.currentBinding()?.characterScenes?.[scene.worldId] ?? handoffCharacterScene(this.appliedSnapshot, scene.worldId);
            delivery.characterRequest = { id, worldId: scene.worldId, chatId: characterChatId, base: characterRevision(entities, characterScene), createdAt: Date.now(), accepted: false, generatedSelfiesEnabled: !this.pendingService && this.imageSettings.enabled && isSelfieRequest(draft), relationshipsEnabled: !this.pendingService && this.settings.relationshipsEnabled !== false && this.worlds.find(w => w.id === scene.worldId)?.relationshipsEnabled !== false };
            if (!await this.saveTabState({ characterRequest: delivery.characterRequest })) throw new Error("context-changed");
          }
          this.assertScope(delivery.scope);
          if (generation !== this.reloadGeneration || sceneKey !== this.contextScopeKey()) throw new Error("context-changed");
          for (const [key, value] of this.deliveries) if (Date.now() - value.createdAt > 10 * 60 * 1000 || this.deliveries.size >= 64) this.deliveries.delete(key);
          this.deliveries.set(id, delivery);
          window.postMessage({ source: "deeprole-extension", type: "CONTEXT_READY", id, ok: true, context }, "*");
          this.maybeWarnContext();
        } catch { window.postMessage({ source: "deeprole-extension", type: "CONTEXT_READY", id, ok: false }, "*"); }
      })();
      return;
    }
    if (event.data.type !== "INJECTION_STATUS") return;
    const delivery = this.deliveries.get(event.data.id);
    this.deliveries.delete(event.data.id);
    if (event.data.ok && delivery) {
      if (delivery.recoveredReply) {
        const edit = delivery.recoveredReply;
        this.recoveryReceiptTask = this.recoveryReceiptTask.then(() => repository.acknowledgeRecoveredReply(edit))
          .then(async () => { if (delivery.scope.url === location.href) await this.reload(); }).catch(() => undefined);
      }
      if (delivery.characterRequest) {
        const receipt = { ...delivery.characterRequest, accepted: true };
        this.characterReceiptTask = this.saveTabState({ characterRequest: receipt }, { characterRequestId: delivery.characterRequest.id }).then(ok => { if (ok) { this.characterReceipt = receipt; this.characterScan = null; this.scheduleScan(); } }).catch(() => undefined);
      }
      if (delivery.scope.url === location.href && delivery.scopeKey === this.contextScopeKey()) this.state.warning = "";
      void this.acknowledgeDelivery(delivery).catch(() => undefined);
    } else if (!event.data.ok && event.data.url === location.href && (this.selection.entries.length > 0 || this.appliedSnapshot)) {
      this.state.warning = this.t("incompatible");
    }
    this.render();
  }

  private async failedService(id: string) {
    const request = this.pendingService;
    // Once a complete valid result is being saved, a late abort must not report
    // failure for that already received result or disturb its storage operation.
    if (!request || request.id !== id || this.processingService) return;
    await this.endUnusableService(request);
    if (!request.imagePlan) this.showToast(request.type === "scene-choices" ? sceneChoiceText(this.state.locale, "failedHint") : assistantText(this.state.locale, "networkFailed"));
  }

  private async acknowledgeDelivery(delivery: ContextDelivery) {
    const snapshot = delivery.snapshot;
    if (!snapshot) return;
    const targetChatId = delivery.targetChatId ?? this.adapter.getChatId();
    if (!targetChatId) return; // Never discard exact progress before a target branch exists.
    const cleared = await repository.completeContinuation(snapshot, delivery.snapshotToken, targetChatId);
    if (cleared && this.appliedSnapshot?.id === snapshot.id && this.snapshotToken === delivery.snapshotToken) {
      // Load the committed target before removing its in-memory handoff fallback.
      this.bindings = await repository.list<ChatBinding>("binding");
      this.appliedSnapshot = null; this.snapshotToken = null;
      await this.updateContext();
    }
  }

  private async handleRuntimeMessage(message: DeepRoleMessage): Promise<unknown> {
    if (message.type === "DR_GET_PAGE_STATE") {
      return {
        type: "DR_PAGE_STATE",
        chatId: this.adapter.getChatId(),
        chatUrl: location.href,
        messageCount: this.adapter.getMessageCount(),
        status: this.adapter.getStatus(),
        scene: this.currentScene(),
        selection: this.selection, overrides: this.overrides(),
        pendingHandoff: this.state.pendingHandoff,
        activity: this.currentActivity(), generating: this.adapter.isGenerating(), warning: this.state.warning,
      } satisfies DeepRoleMessage;
    }
    if (message.type === "DR_RUN_SERVICE") return this.runService(message.request);
    if (message.type === "DR_CONTINUE_STORY") return this.continueStory();
    if (message.type === "DR_MEMORY_OVERRIDE") { try { await this.overrideMemory(message.id, message.action); return { ok: true }; } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "failed" }; } }
    if (message.type === "DR_SET_SCENE") { try { await this.setScene(message.scene); return { ok: true }; } catch { return { ok: false }; } }
    if (message.type === "DR_APPLY_TEMPLATE") {
      const scope = this.pageScope();
      const usable = () => location.href === scope.url && !this.adapter.getChatId() && !this.adapter.getDraft().trim() && !this.adapter.isGenerating();
      if (!usable()) return { ok: false };
      try {
        const template = await repository.get<StoryTemplate>("template", message.templateId);
        if (!template || !usable()) return { ok: false };
        await this.setScene({ worldId: template.worldId, focusIds: template.focusIds, bookId: null });
        if (!usable() || await repository.isLocked() || !usable()) return { ok: false };
        const ok = this.adapter.setDraft([template.opening, template.initialState].filter(Boolean).join("\n\n"));
        await this.updateContext();
        return { ok };
      } catch { return { ok: false }; }
    }
    if (message.type === "DR_APPLY_SNAPSHOT") { try { await this.applySnapshot(message.snapshotId); return { ok: true }; } catch { return { ok: false }; } }
    if (message.type === "DR_SAVE_SELECTION") { await this.saveSelection(message.text); return { ok: true }; }
    if (message.type === "DR_DATA_CHANGED") { await this.reload(); return { ok: true }; }
    return undefined;
  }

  private showToast(message: string) {
    this.state.toast = message;
    this.render();
    window.setTimeout(() => { if (this.state.toast === message) { this.state.toast = ""; this.render(); } }, 2400);
  }

  private currentActivity(): ServiceActivity | null {
    if (this.state.vaultLocked) return null;
    if (this.preparingService) return this.serviceFeedback;
    const pending = pendingActivity(this.pendingService, this.adapter.getChatId(), this.adapter.isGenerating());
    if (pending) return pending;
    return this.serviceFeedback;
  }

  private setServiceResult(request: ServiceRequest, phase: "empty" | "error" | null) {
    if ((request.chatId ?? null) !== this.adapter.getChatId() || (request.worldId ?? null) !== this.currentScene().worldId) return;
    this.serviceFeedback = phase ? serviceActivity(request, phase) : null;
  }

  private async saveTabState(state: TabSessionState, expected?: TabSessionGuard): Promise<boolean> {
    const result = await browser.runtime.sendMessage({ type: "DR_SAVE_TAB_STATE", state, expected } satisfies DeepRoleMessage);
    return result?.ok === true;
  }

  private publishContext(context: string): void {
    // Preview/compatibility state only. Actual sends await a fresh library snapshot.
    document.documentElement.dataset.deeproleContext = context;
    window.postMessage({ source: "deeprole-extension", type: "SET_CONTEXT", context }, "*");
  }

  private t(key: MessageKey, vars?: Record<string, string | number>): string {
    return translate(this.state.locale, key, vars);
  }
}

function defaultContextIndicatorPosition(): { x: number; y: number } {
  return { x: window.innerWidth <= 720 ? 10 : 208, y: 52 };
}

function parseSavedIndicatorPosition(value: unknown): { xRatio: number; yRatio: number } | null {
  if (!value || typeof value !== "object") return null;
  const position = value as Record<string, unknown>;
  if (typeof position.xRatio !== "number" || typeof position.yRatio !== "number") return null;
  if (!Number.isFinite(position.xRatio) || !Number.isFinite(position.yRatio)) return null;
  return {
    xRatio: Math.max(0, Math.min(1, position.xRatio)),
    yRatio: Math.max(0, Math.min(1, position.yRatio)),
  };
}
