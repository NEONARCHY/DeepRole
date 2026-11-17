import { startCastWorker } from "../adapters/cast-worker";
import { savedMemoryBinding, type SavedMemoryRequest, type SavedMemoryTransferState } from "../core/saved-memory-continuation";
import { isDeepSeekFirstChatRoute, isDeepSeekHome } from "../core/chat-scope";
import { reportMemoryPreparationFailure, type MemoryPreparationStage } from "../core/memory-preparation-diagnostic";
import { startIsolatedFieldWorker } from "../adapters/isolated-field-worker";
import { bootstrapCastServiceScreen, bootstrapFieldServiceScreen } from "../adapters/field-service-screen";
import { IsolatedFieldClient } from "../adapters/isolated-field-client";
import { requestFieldHistory, fieldHistoryAnchor } from "../adapters/field-history-client";
import { profileRelatedNames, visibleFieldHistory } from "../core/field-history";
import { fieldSceneReference, type CharacterTextOutcome, type IsolatedFieldInput } from "../core/isolated-character-text";
import { StoryDiagnosticsClient } from "../adapters/story-diagnostics-client";
import { StoryDispatchCaptureClient } from "../adapters/story-dispatch-capture-client";
import { validStoryDispatchCapture } from "../core/story-dispatch-capture";
import { StoryDispatchReplyClient } from "../adapters/story-dispatch-reply-client";
import { StoryGameClient } from "../adapters/story-game-client";
import { worldGameBinding, worldGamePeople, type WorldGameActivation } from "../core/world-game";
import type { StoryFact } from "../core/story-update";
import { compileGameContext } from "../core/game-context";
import { readTaskArchive, type TaskArchive } from "../core/story-task-archive";
import { GameSearchIndex } from "../core/game-search-index";
import { memoryDeliveryView } from "../core/memory-delivery-view";
import { storyUpdateText } from "../core/story-update-i18n";
import { StoryRepairClient } from "../adapters/story-repair-client";
import { CharacterDiscoveryClient } from "../adapters/character-discovery-client";
import { runDiscoveryProfileQueue } from "../adapters/discovery-profile-queue";
import { validDiscoveryQueueInput, type DiscoveryQueueInput } from "../core/discovery-profile-queue";
import { validCharacterDiscoveryInput, validDiscoveryProfileInput, type CharacterDiscoveryInput, type DiscoveryProfileInput } from "../core/story-character-discovery";
import { validSupplementInput, currentStoryProfileEntities, storyProfileRecords, type SupplementInput } from "../core/profile-supplements";
import { storyReviewError, storyReviewText } from "../core/story-review-i18n";
import { relationshipNarrative } from "../core/relationships";
import { observePhotoImages } from "../adapters/photo-loader";
import { setPortraitPhotoStorage } from "./shared/portrait-file";
import { characterFieldPrompt, characterFieldResult, validCharacterTextRequest, type CharacterTextRequest, type CharacterTextRunOptions } from "../core/character-text";
import { fieldCancellation } from "../core/character-text-queue";
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
import { StoryReviewReminderPresenter } from "../adapters/story-review-reminder-dom";
import { storyReviewReminderReply } from "../core/story-review-reminder";
import { explicitOutOfCharacter } from "../core/story-message-mode";
import { storyReplyPurpose, storyReplyProofChanged } from "../core/story-reply-purpose";
import { dismissSceneChoiceCards, latestSceneChoiceTarget, syncSceneChoiceCards, type ChoicePin } from "../adapters/deepseek-choices-dom";
import { hideCharacterTextServices, plainCharacterReplyText, findServiceReplyRows, findServiceResponseElements, findVirtualizedServiceReply, findVirtualizedServiceResponseElements, markServiceReplyRow, presentMemoryAnalysis, serviceReplyText, removeServicePreloader, replaceArchivedMemoryPayloads, replaceServicePayloadWithSummary, restoreServiceTurns } from "../adapters/deepseek-service-dom";
import { experienceText } from "../core/experience-i18n";
import { DEFAULT_SETTINGS } from "../core/defaults";
import { validStoryContinuation, withLatestVisibleStory } from "../core/story-continuation";
import { visibleStoryHistory } from "../adapters/story-history-dom";
import { validStoryTransportIdentity, type StoryTransportIdentity } from "../core/story-transport";
import { validNativeStoryRequestLink } from "../core/story-exchange";
import { clearSelfieImageCache, isSelfieRequest, SELFIE_DELAY } from "../core/selfies";
import { ScenePhotosPresenter } from "../adapters/scene-photos-dom";
import { imagePlanRoster, imagePlanPromptComposition, parseImageScenePlan, type ImagePlanReview, type ImageScenePlan } from "../core/image-plan";
import { imagePlanCast, imageReviewContextKey, sameImagePlanCast, type ImageReferenceOverrides } from "../core/image-references";
import { IllustrationsPresenter, illustrationSceneText } from "../adapters/illustrations-dom";
import { getImageSettings, IMAGE_SETTINGS_KEY } from "../storage/image-settings";
import { DEFAULT_IMAGE_SETTINGS, MAX_IMAGE_PLAN_TEXT, type Illustration, type ImageSettings } from "../core/image-generation";
import { imageText, imageErrorKey } from "../core/image-i18n";
import { closePortraitViewer } from "../adapters/portrait-viewer";
import { oldChatNotice, oldChatNoticePrompt, type OldChatNoticeEdit } from "../core/old-chat-notice";
import { presentHiddenHandoffs } from "../adapters/deepseek-handoff-dom";
import { continuationKey, continuationScopeMatches, recentSceneReference, matchingContinuationReceipt, matchesContinuationTarget, matchesProvisionalContinuationTarget, type ContinuationTarget, type ProvisionalContinuationTarget, type ContinuationFlow, type ContinuationReceipt } from "../core/continuation-flow";
import { boundStory } from "../core/story-continuation";
import { chatCapacity, contextWarningLevel } from "../core/context-capacity";
import { continuationText } from "../core/continuation-i18n";
import type { StoryContinuation } from "../core/types";
import { startupBudget } from "../core/startup";
import { formatMemoryContext } from "../core/context";
import { parseSceneChoices, sceneChoiceRecoveryPrompt, sceneChoiceText, type SceneChoice } from "../core/scene-choices";
import { createId } from "../core/id";
import { translate, type MessageKey } from "../core/i18n";
import {
  CONTEXT_INDICATOR_POSITION_KEY,
  type DeepRoleMessage,
  type TabSessionState,
  type TabSessionGuard,
} from "../core/messages";
import { changeMemoryOverride, EMPTY_OVERRIDES, libraryRecords, scopedMemories } from "../core/memory-workspace";
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
import { deriveKeywords } from "../core/text";
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
import { DEEPSEEK_PROMPT_CHAR_LIMIT, assembledPromptLength } from "../core/request-injection";
import { pendingActivity, serviceActivity, SERVICE_TIMEOUT_MS, type ServiceActivity } from "../core/memory-experience";
import "./content/page-widget.css";
import "./shared/help.css";
import "./shared/settings-help.css";
import { contentRepository as repository } from "../storage/content-repository";
import { getSettings, updateSettings, storageKeys } from "../storage/settings";
import { LIBRARY_CHANGE_KEY } from "../storage/changes";
import { EMPTY_SCENE, isMemoryInScene, memoryWorld } from "../core/scene";
import type { SceneState, WorldProfile, SceneEntity, StoryTemplate } from "../core/types";
import { sceneText } from "../core/scene-i18n";
import { bindCharacterTurn, characterInstruction, characterRevision, characterTurnKey, actionsFor, characterInChat, type CharacterCopyKey, type CharacterRequestReceipt } from "../core/characters";
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
    bootstrapFieldServiceScreen();
    bootstrapCastServiceScreen();
    const stopPhotos = observePhotoImages(document, id => repository.readPhoto(id), (id, size) => repository.readPhotoPreview(id, size));
    ctx.onInvalidated(stopPhotos);
    ctx.onInvalidated(setPortraitPhotoStorage(image => repository.storePhoto(image), id => repository.readPhoto(id)));
    await injectScript("/injected.js", { keepInDom: true });
    if (await startIsolatedFieldWorker() || await startCastWorker()) return;
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
  oldChatNotice?: OldChatNoticeEdit;
  recoveredReply?: RecoveredReplyEdit;
  targetChatId?: string;
  storyIdentity?: StoryTransportIdentity;
  characterRequest?: CharacterRequestReceipt;
  scope: PageScope;
  scopeKey: string;
  snapshot: HandoffSnapshot | null;
  snapshotToken: string | null;
  originalDraft?: string;
  createdAt: number;
}

class PageController {
  private readonly isolatedFields = new IsolatedFieldClient();
  private fieldPreparing = false;
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
  private characterRescanQueued = false;
  private characterStatus: CharacterCopyKey = "idle";
  private readonly adapter = new DeepSeekDomAdapter();
  private readonly storyDiagnostics = new StoryDiagnosticsClient(window, () => ({ chatId: this.adapter.getChatId(), url: location.href, generating: this.adapter.isGenerating(), locked: this.state.vaultLocked }));
  private readonly dispatchReplies = new StoryDispatchReplyClient(window, () => ({ chatId: this.adapter.getChatId(), worldId: this.currentScene().worldId, url: location.href, locked: this.state.vaultLocked }), repository);
  private readonly storyGame = new StoryGameClient(window, () => {
    const worldId = this.currentScene().worldId;
    return { chatId: this.adapter.getChatId(), worldId, managed: this.sharedGameActive() && this.trackedBindings.has(this.currentBinding()?.id ?? ""), base: characterRevision(this.entities.filter(e => e.worldId === worldId && e.kind === "character" && characterInChat(e, this.adapter.getChatId())), worldId ? this.currentBinding()?.characterScenes?.[worldId] : undefined), url: location.href, locked: this.state.vaultLocked, generating: this.adapter.isGenerating(), replySignature: latestCharacterResponse()?.text };
  }, repository);
  private storyGameScanKey: string | null = null;
  private trackedBindings = new Set<string>();
  private trackedHistory = new Map<string, string[]>();
  private trackedBranches = new Map<string, string>();
  private taskArchives = new Map<string, TaskArchive>();
  private trackedFacts = new Map<string, StoryFact[]>();
  private knownUserPrefixes = new Map<string, string[]>();
  private storyScanRetries = new Map<string, number>();
  private storyGameWarning: string | null = null;
  private readonly storyRepairClient = new StoryRepairClient();
  private readonly characterDiscoveryClient = new CharacterDiscoveryClient();
  private characterDiscoveryTask: Promise<unknown> | null = null;
  private lastMemoryBatchAt = 0;
  private memoryBatchTimer = 0;
  private memoryBatchRunning = false;
  private characterDiscoveryAbort: AbortController | null = null;
  private metadataRepairTask: Promise<void> | null = null;
  private metadataRepairAbort: AbortController | null = null;
  private pendingMetadataRevision: string | null = null;
  private lastMetadataRepairAt = 0;
  private metadataRepairTimer = 0;
  private readonly dispatchCaptures = new StoryDispatchCaptureClient(window, () => ({ chatId: this.adapter.getChatId(), worldId: this.currentScene().worldId, url: location.href, locked: this.state.vaultLocked }), repository, query => { void this.dispatchReplies.read(query); }, id => { void this.refreshMemoryDelivery(id); });
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
  private storyRecords: import("../core/story-records").StoryRecord[] = [];
  private draftScene: SceneState = { ...EMPTY_SCENE };
  private previousChatId: string | null = null;
  private sceneQueue = Promise.resolve();
  private navigationTask = Promise.resolve();
  private bindings: ChatBinding[] = [];
  private snapshots: HandoffSnapshot[] = [];
  private readonly reviewReminder = new StoryReviewReminderPresenter();
  private reviewReminderTarget?: { chatId: string; worldId: string; key: string };
  private proposals: MemoryProposalBatch[] = [];
  private changes: LoreChange[] = [];
  private documents: MemoryEntry[] = [];
  private reloadGeneration = 0;
  private reloadTask: Promise<boolean> = Promise.resolve(false);
  private publishedState = "";
  private draftOverrides: MemoryOverrides = { ...EMPTY_OVERRIDES };
  private dismissedAt = new Map<string, number>();
  private selection: ContextSelection = { entries: [], estimatedTokens: 0, omittedCount: 0 };
  private memoryDispatchRecords: unknown[] = [];
  private memoryReceiptGeneration = 0;
  private appliedSnapshot: HandoffSnapshot | null = null;
  private snapshotToken: string | null = null;
  private provisionalContinuationTarget: ProvisionalContinuationTarget | null = null;
  private retryContinuationTarget: ContinuationTarget | null = null;
  private pendingContinuationCommit: ContinuationReceipt | null = null;
  private attemptedContinuationCommit: string | null = null;
  private readonly deliveries = new Map<string, ContextDelivery>();
  private readonly searchIndex = new GameSearchIndex();
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
  private automaticRecordingTask: Promise<boolean> | null = null;
  private lastRecordingAttempt: string | null = null;
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
  private oldChatNoticeReceiptTask: Promise<void> = Promise.resolve();
  private contextIndicatorPosition: { xRatio: number; yRatio: number } | null = null;
  private anchorRenderFrame = 0;

  async start() {
    window.addEventListener("message", (event) => this.handleBridgeMessage(event));
    this.observePage();
    try {
      await startupBudget(async active => {
        const [settings, draftScene, savedPosition] = await Promise.all([
          getSettings(),
          browser.runtime.sendMessage({ type: "DR_GET_DRAFT_SCENE" } satisfies DeepRoleMessage) as Promise<SceneState | undefined>,
          browser.storage.local.get([CONTEXT_INDICATOR_POSITION_KEY, WIDGET_LAYOUT_KEY]),
        ]);
        if (!active()) return;
        this.settings = settings;
        this.reasoningPresentation.configure(this.settings.showDeepSeekReasoning === true, this.settings.locale);
        this.state.locale = this.settings.locale;
        this.draftScene = draftScene ?? { ...EMPTY_SCENE };
        this.previousChatId = this.adapter.getChatId();
        this.contextIndicatorPosition = parseSavedIndicatorPosition(savedPosition[CONTEXT_INDICATOR_POSITION_KEY]);
        this.state.widgetLayout = parseWidgetLayout(savedPosition[WIDGET_LAYOUT_KEY]);
        await this.reload();
        if (!active()) return;
        restoreServiceTurns();
        this.cleanArchivedMemoryPayloads();
      });
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
          && !((node instanceof Element ? node : node.parentElement)?.closest("[data-deeprole-characters-result], [data-deeprole-payload-view], [data-deeprole-choices-loading], [data-deeprole-choices-host]"))))) this.syncSceneChoices();
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
    this.reviewReminder.clear();
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
    const imageSettings = await getImageSettings().catch(() => structuredClone(DEFAULT_IMAGE_SETTINGS));
    const locked = await repository.isLocked();
    if (generation !== this.reloadGeneration) return false;
    this.imageSettings = imageSettings;
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
    let [records, pending] = loaded;
    const current = libraryRecords<ChatBinding>(records, "binding").find(b => b.chatId === this.adapter.getChatId());
    const currentWorld = libraryRecords<WorldProfile>(records, "world").find(w => w.id === current?.worldId);
    if (current && currentWorld && !currentWorld.sharedGame && !pending?.service) {
      try { await repository.activateWorldGame({ chatId: current.chatId, chatUrl: location.href, worldId: currentWorld.id, expectedRevision: null, mode: "initialize" }); } catch (error) { if (!(error instanceof Error && error.message === "story-game-stale")) throw error; }
      records = await repository.rawRecords();
      if (generation !== this.reloadGeneration) return false;
    }
    this.illustrations = libraryRecords<Illustration>(records, "illustration");
    this.memoryDispatchRecords = records.filter(r => r.kind === "dispatch").map(r => r.data);
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
    this.storyRecords = storyProfileRecords(records);
    const gameBranches = new Set(records.flatMap(r => r.kind === "story" && (r.data as import("../core/story-records").StoryRecord).type === "branch" && (r.data as import("../core/story-records").StoryBranch).gameManaged ? [r.id] : []));
    this.trackedBindings = new Set(records.flatMap(r => r.kind === "story" && (r.data as import("../core/story-records").StoryRecord).type === "baseline" && gameBranches.has((r.data as import("../core/story-records").StoryBaseline).branchId) ? [(r.data as import("../core/story-records").StoryBaseline).origin.bindingId] : []));
    const revisions = new Map(records.flatMap(r => r.kind === "story" && (r.data as import("../core/story-records").StoryRecord).type === "revision" ? [[r.id, r.data as import("../core/story-records").StoryRevision] as const] : []));
    this.trackedHistory = new Map(records.flatMap(r => {
      if (r.kind !== "story" || (r.data as import("../core/story-records").StoryRecord).type !== "projection") return [];
      const value = r.data as import("../core/story-records").StoryProjection;
      return this.trackedBindings.has(value.bindingId) ? [[value.bindingId, value.revisionIds.map(id => revisions.get(id)).filter((v): v is import("../core/story-records").StoryRevision => !!v && v.storyPurpose !== "out-of-character").map(v => v.role === "assistant" ? relationshipNarrative(v.content) : v.content)] as [string, string[]]] : [];
    }));
    const facts = new Map(records.flatMap(r => r.kind === "story" && (r.data as import("../core/story-records").StoryRecord).type === "event" && (r.data as import("../core/story-records").StoryEvent).memory ? [[r.id, (r.data as import("../core/story-records").StoryEvent).memory!] as const] : []));
    this.trackedFacts.clear(); this.trackedBranches.clear();
    for (const row of records) if (row.kind === "story" && (row.data as import("../core/story-records").StoryRecord).type === "projection") {
      const projection = row.data as import("../core/story-records").StoryProjection;
      if (!this.trackedBindings.has(projection.bindingId)) continue;
      this.trackedBranches.set(projection.bindingId, projection.branchId);
      this.trackedFacts.set(projection.bindingId, projection.appliedEventIds.flatMap(id => facts.get(id) ? [facts.get(id)!] : []));
    }
    this.taskArchives.clear();
    const archiveRecords = records.filter(r => r.kind === "story").map(r => r.data as import("../core/story-records").StoryRecord);
    const reviewBinding = this.currentBinding();
    const reviewWorld = this.worlds.find(world => world.id === reviewBinding?.worldId);
    const reminderKey = storyReviewReminderReply(archiveRecords, reviewWorld?.sharedGame, reviewBinding);
    this.reviewReminderTarget = reminderKey && reviewBinding && reviewWorld ? { chatId: reviewBinding.chatId, worldId: reviewWorld.id, key: reminderKey } : undefined;
    for (const world of this.worlds) {
      const branchId = this.trackedBranches.get(world.sharedGame?.activeBindingId ?? "");
      if (!branchId) continue;
      const archive = readTaskArchive(archiveRecords, world, branchId);
      if (archive) this.taskArchives.set(branchId, archive);
    }
    this.knownUserPrefixes.clear();
    for (const row of records) if (row.kind === "dispatch") {
      const capture = row.data as import("../core/story-dispatch-capture").StoryDispatchCapture;
      if (capture.injection !== "context" || capture.delivery?.status !== "accepted" || !capture.wire.link) continue;
      const key = JSON.stringify([capture.bindingId, capture.wire.link.userMessageKey]);
      this.knownUserPrefixes.set(key, [...this.knownUserPrefixes.get(key) ?? [], capture.proposedContext + "\n\n[User message]\n"]);
    }
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
    this.retryContinuationTarget = this.appliedSnapshot?.savedMemory ? pending?.retryContinuationTarget ?? null : null;
    const chatId = this.adapter.getChatId(), home = isDeepSeekHome(location.href);
    const receiptScope = [this.appliedSnapshot?.id, this.snapshotToken, chatId, home] as const;
    const savedReceipt = matchingContinuationReceipt(pending?.continuationReceipt, ...receiptScope);
    this.pendingContinuationCommit = savedReceipt ?? matchingContinuationReceipt(this.pendingContinuationCommit, ...receiptScope);
    this.state.continuationCommitPending = !!this.pendingContinuationCommit;
    const retry = this.retryContinuationTarget;
    if (!this.pendingContinuationCommit && retry?.returnHomeAfterLengthBlock && isDeepSeekHome(location.href) && !this.adapter.getChatId()
      && matchesContinuationTarget(retry, this.appliedSnapshot?.id, this.snapshotToken, this.appliedSnapshot?.sourceChatId,
        retry.targetChatId, this.bindings.some(binding => binding.chatId === retry.targetChatId))) {
      // A locally blocked first turn can leave an empty native chat behind.
      // On the home page keep the snapshot and release only that unused ID.
      const restored = await this.saveTabState({ retryContinuationTarget: null }, {
        snapshotId: retry.snapshotId, snapshotToken: retry.snapshotToken, retryContinuationTarget: retry, continuationReceipt: null,
      });
      if (generation !== this.reloadGeneration || !restored) return false;
      this.retryContinuationTarget = null;
    }
    const continuationTarget = location.origin === "https://chat.deepseek.com" && location.pathname === "/" && !this.adapter.getChatId();
    if (this.appliedSnapshot?.savedMemory && !this.pendingContinuationCommit && !this.savedMemoryTarget()) {
      const { id } = this.appliedSnapshot;
      await this.saveTabState({ snapshotId: null, snapshotToken: null, retryContinuationTarget: null }, { snapshotId: id, snapshotToken: this.snapshotToken });
      this.appliedSnapshot = null;
      this.snapshotToken = null;
      this.retryContinuationTarget = null;
    }
    const continuationValid = Boolean(!this.pendingContinuationCommit && pending?.continueOnFreshChat && pending.continueUntil && pending.continueUntil > Date.now() && continuationTarget && this.appliedSnapshot && this.snapshotToken);
    this.autoContinuePending = continuationValid && !this.autoContinueAttempted;
    this.autoContinueUntil = continuationValid ? pending?.continueUntil ?? 0 : 0;
    this.autoContinueSnapshotId = pending?.continueOnFreshChat ? pending.snapshotId ?? null : null;
    this.autoContinueSnapshotToken = pending?.continueOnFreshChat ? pending.snapshotToken ?? null : null;
    const waitingAtSource = this.appliedSnapshot?.sourceChatId === this.adapter.getChatId() && !!pending?.continueUntil && pending.continueUntil > Date.now();
    if (pending?.continueOnFreshChat && !continuationValid && !waitingAtSource) await this.disarmAutoContinue(Boolean(this.adapter.getChatId()) || !continuationTarget);
    if (this.appliedSnapshot && (!this.adapter.getChatId() || this.pendingContinuationCommit)) {
      this.draftScene = { worldId: memoryWorld(this.appliedSnapshot, this.books), focusIds: this.appliedSnapshot.focusIds ?? [], bookId: this.appliedSnapshot.bookId };
      this.draftOverrides = this.appliedSnapshot.memoryOverrides ?? this.draftOverrides;
    }
    await this.updateContext();
    this.updateSuggestions();
    this.syncReviewReminder();
    this.requestHistoryEstimate();
    void this.dispatchReplies.recover();
    this.syncSceneChoices();
    if (this.pendingService) this.scheduleScan();
    this.scheduleScan();
    if (generation === this.reloadGeneration && savedReceipt && savedReceipt.targetChatId === chatId) void this.retryContinuationCommit(savedReceipt);
    return true;
  }

  private readonly scenePhotos = new ScenePhotosPresenter();
  private readonly imagePresenter = new IllustrationsPresenter();
  private syncIllustrations() {
    const call = async (message: import("../core/image-messages").ImageMessage) => { const result = await browser.runtime.sendMessage(message); if (!result?.ok) throw Object.assign(new Error("image-request-failed"), { code: result?.error ?? "failed", diagnostic: result?.diagnostic, headers: result?.headers, ticketId: result?.ticketId }); return result; };
    this.imagePresenter.sync({ enabled: this.imageSettings.enabled && !this.state.vaultLocked, generating: this.adapter.isGenerating(), worldId: this.currentScene().worldId, chatId: this.adapter.getChatId(), chatUrl: location.href, records: this.illustrations, attempts: this.currentBinding()?.illustrationAttempts ?? [], entities: this.entities, settings: this.imageSettings, locale: this.state.locale, actions: {
      onCreate: async (target, text, review) => this.generateIllustration(target, text, review),
      onConfirmReferences: async (target, id, overrides) => this.confirmIllustrationReferences(target, id, overrides),
      onCancelReferences: async (target, id) => { await call({ type: "DR_IMAGE_REVIEW_CANCEL", target, id }); await this.reload(); },
      onRepeat: async (target, id, attempt) => { await call({ type: "DR_IMAGE_REPEAT", target, id, attempt }); await this.reload(); },
      onRemove: async (target, id) => { await call({ type: "DR_IMAGE_REMOVE", target, id }); },
      onDownload: async ticketId => { await call({ type: "DR_IMAGE_OPEN_DOWNLOAD", ticketId }); },
    } });
  }
  private async imageCall(message: import("../core/image-messages").ImageMessage) {
    const result = await browser.runtime.sendMessage(message);
    if (!result?.ok) throw { code: result?.error ?? "failed", diagnostic: result?.diagnostic, headers: result?.headers, ticketId: result?.ticketId };
    return result;
  }
  private checkIllustrationScope(target: import("../core/image-messages").ImageTarget, text?: string) {
    if (this.state.vaultLocked || this.adapter.isAuthenticationPage() || this.adapter.getChatId() !== target.chatId || this.currentScene().worldId !== target.worldId) throw { code: "changed" };
    if (this.adapter.isGenerating() || this.pendingService || this.preparingService || this.characterTextWaiter) throw { code: "busy" };
    const row = nativeMessageRows(document).find(row => nativeMessageIdentity(row) === target.messageKey);
    if (text !== undefined && row && illustrationSceneText(row) !== text) throw { code: "changed" };
  }
  private async generateIllustration(target: import("../core/image-messages").ImageTarget, text: string, forceReview = false): Promise<void> {
    this.checkIllustrationScope(target, text);
    const settings = this.imageSettings, entities = this.entities.filter(e => e.worldId === target.worldId);
    const referenceBudget = settings.profiles.find(p => p.id === settings.profileByLevel[settings.contentLevel])?.maxReferences ?? 1;
    const { attempt } = await this.imageCall({ type: "DR_IMAGE_START", target });
    let phase: "plan" | undefined = "plan";
    try {
      const {limits:promptBudget}=await this.imageCall({type:'DR_IMAGE_BUDGET',target,id:attempt.id});this.checkIllustrationScope(target,text);
      const value = await this.generateCharacterText({ field: { key: "image-plan", label: imageText(this.state.locale, "prompt"), scope: "scene", maxLength: MAX_IMAGE_PLAN_TEXT }, currentText: "", reference: { name: "Scene illustration", completedScene: text, roster: imagePlanRoster(entities), referenceBudget, promptBudget, promptComposition: imagePlanPromptComposition(entities,settings), contentLevel: settings.contentLevel, interfaceLocale: this.state.locale } }, attempt);
      this.checkIllustrationScope(target, text);
      const parsed = parseImageScenePlan(value);
      const plan: ImageScenePlan = { ...parsed, characters: imagePlanCast(parsed, target.worldId, entities).map(c => ({ ...c.chosen, id: c.person.id })) };
      const contextKey = imageReviewContextKey(plan, target.worldId, entities, settings);
      if (contextKey !== imageReviewContextKey(plan, target.worldId, this.entities, this.imageSettings)) throw { code: "changed" };
      if (forceReview || settings.reviewBeforeGeneration) {
        await this.imageCall({ type: "DR_IMAGE_REVIEW", target, id: attempt.id, review: { plan, sceneText: text, contextKey } });
      } else {
        phase = undefined;
        await this.imageCall({ type: "DR_IMAGE_RENDER", target, id: attempt.id, plan });
      }
    } catch (error) {
      await this.failIllustration(target, attempt.id, error, phase);
    } finally { await this.reload(); }
  }
  private async confirmIllustrationReferences(target: import("../core/image-messages").ImageTarget, id: string, overrides: ImageReferenceOverrides): Promise<void> {
    this.checkIllustrationScope(target);
    let claimed = false, phase: "plan" | undefined = "plan";
    try {
      const result = await this.imageCall({ type: "DR_IMAGE_REVIEW_CLAIM", target, id, overrides });
      const review = result.review as ImagePlanReview;
      claimed = true;
      this.checkIllustrationScope(target, review.sceneText);
      let plan = review.plan;
      const entities = this.entities.filter(e => e.worldId === target.worldId), settings = this.imageSettings;
      const changed = Object.entries(overrides).some(([entityId, policy]) => policy !== (entities.find(e => e.id === entityId)?.characterSheet?.imageGeneration?.referencePolicy ?? "auto"));
      if (changed) {
        const attempt = { ...target, id, status: "preparing" as const, createdAt: Date.now(), updatedAt: Date.now() };
        const referenceBudget = settings.profiles.find(p => p.id === settings.profileByLevel[settings.contentLevel])?.maxReferences ?? 1;
        const {limits:promptBudget}=await this.imageCall({type:'DR_IMAGE_BUDGET',target,id});this.checkIllustrationScope(target,review.sceneText);
        const value = await this.generateCharacterText({ field: { key: "image-plan", label: imageText(this.state.locale, "prompt"), scope: "scene", maxLength: MAX_IMAGE_PLAN_TEXT }, currentText: "", reference: { name: "Reviewed scene illustration", completedScene: review.sceneText, previousPlan: review.plan, referenceOverrides: overrides, roster: imagePlanRoster(entities), referenceBudget, promptBudget, promptComposition: imagePlanPromptComposition(entities,settings), contentLevel: settings.contentLevel, interfaceLocale: this.state.locale } }, attempt);
        plan = parseImageScenePlan(value);
        if (!sameImagePlanCast(review.plan, plan)) throw new Error("invalidPlan");
      }
      this.checkIllustrationScope(target, review.sceneText);
      if (imageReviewContextKey(review.plan, target.worldId, this.entities, this.imageSettings) !== review.contextKey) throw { code: "changed" };
      phase = undefined;
      await this.imageCall({ type: "DR_IMAGE_RENDER", target, id, plan });
    } catch (error) {
      if (claimed) await this.failIllustration(target, id, error, phase);
      throw error;
    } finally { await this.reload(); }
  }
  private async failIllustration(target: import("../core/image-messages").ImageTarget, id: string, error: unknown, phase?: "plan"): Promise<never> {
    const code = error instanceof Error && error.message === "invalidPlan" ? "invalidPlan" : imageErrorKey(error);
    // Preserve the frozen provider request for exact retry after a provider failure.
    await browser.runtime.sendMessage({ type: "DR_IMAGE_FAIL", target, id, error: code, phase } satisfies import("../core/image-messages").ImageMessage).catch(() => undefined);
    throw Object.assign(new Error(code), typeof error === "object" && error !== null ? error : {}, { code, ...(phase ? { diagnostic: { source: "deepseek", phase } } : {}) });
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
    this.searchIndex.clear();
    this.reviewReminderTarget = undefined;
    this.reviewReminder.clear();
    this.storyGame.resetPresentation();
    ++this.memoryReceiptGeneration;
    this.memoryDispatchRecords = [];
    this.dispatchCaptures.reset();
    this.dispatchReplies.reset();
    if (this.characterTextWaiter) this.settleCharacterText(this.characterTextWaiter.id, undefined, "vault-locked");
    window.clearTimeout(this.selfieScanTimer); this.selfieScanTimer = 0;
    this.scenePhotos.clear(); this.imagePresenter.clear(); this.illustrations = []; closePortraitViewer(); clearSelfieImageCache();
    this.replyRecovery.reset();
    this.state.contextCapacityWarning = null;
    this.state.oldChatNotice = null;
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
    this.worlds = []; this.entities = []; this.documents = []; this.appliedSnapshot = null; this.snapshotToken = null; this.provisionalContinuationTarget = null;
    this.retryContinuationTarget = null;
    this.pendingContinuationCommit = null; this.state.continuationCommitPending = false;
    this.deliveries.clear(); this.proposals = []; this.changes = []; this.pendingService = null;
    this.serviceFeedback = null;
    this.state.pendingHandoff = undefined;
    this.state.continuationDraft = undefined;
    this.state.handoffOffer = null; this.state.analysisSuggested = false; this.state.warning = ""; this.state.toast = "";
    this.state.selectionText = ""; this.state.selectionPosition = null;
  }

  private overrides(): MemoryOverrides { return this.adapter.getChatId() ? this.sharedBinding()?.memoryOverrides ?? EMPTY_OVERRIDES : this.draftOverrides; }

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
  private memoryDelivery() {
    const binding = this.currentBinding(), worldId = this.currentScene().worldId, chatId = this.adapter.getChatId();
    if (this.state.vaultLocked || this.pendingService || !binding || !worldId || !chatId || binding.worldId !== worldId
      || !this.worlds.some(w => w.id === worldId)) return undefined;
    return memoryDeliveryView(this.memoryDispatchRecords, { worldId, bindingId: binding.id, chatId });
  }
  private async refreshMemoryDelivery(id: string) {
    const scope = this.pageScope(), worldId = this.currentScene().worldId, bindingId = this.currentBinding()?.id, generation = ++this.memoryReceiptGeneration;
    try {
      const receipt = await repository.get<import("../core/story-dispatch-capture").StoryDispatchCapture>("dispatch", id);
      if (generation !== this.memoryReceiptGeneration || this.state.vaultLocked || location.href !== scope.url
        || this.adapter.getChatId() !== scope.chatId || this.currentScene().worldId !== worldId || this.currentBinding()?.id !== bindingId || !receipt) return;
      const prior=this.memoryDispatchRecords.find(v=>(v as {id?:string}).id===id);
      const proofChanged=storyReplyProofChanged(prior,receipt);
      if (proofChanged) {
        this.storyGame.resetPresentation();
        if (validStoryDispatchCapture(receipt) && receipt.opening) this.lastRecordingAttempt = null;
      }
      this.memoryDispatchRecords = [...this.memoryDispatchRecords.filter(v => (v as {id?:string}).id !== id), receipt];
      // A late ordinary receipt can invalidate proof AFTER that reply's scan.
      // Rescan it too, otherwise cards-off would remain pending indefinitely.
      if (receipt.delivery?.status === 'accepted' && (receipt.purpose === 'out-of-character' || proofChanged)) { this.characterScan = null; this.storyGameScanKey = null; this.syncSceneChoices(); this.scheduleScan(); }
      this.render();
    } catch { /* Read-only receipt failure cannot stop the native request. */ }
  }
  private sharedBinding(): ChatBinding | undefined {
    const binding = this.currentBinding();
    return worldGameBinding(binding, this.worlds.find(w => w.id === binding?.worldId));
  }
  private isOutOfCharacterReply(row: HTMLElement): boolean {
    const binding = this.currentBinding(), worldId = this.currentScene().worldId, chatId = this.adapter.getChatId();
    const nativeRow = row.closest<HTMLElement>('article, [data-message-id], [data-virtual-list-item-key]') ?? row;
    return !this.state.vaultLocked && !!binding && !!worldId && !!chatId && storyReplyPurpose(this.memoryDispatchRecords, { bindingId: binding.id, worldId, chatId }, nativeMessageIdentity(nativeRow), this.storyGame.presentationSnapshot()) === 'out-of-character';
  }
  private hasOutOfCharacterCapture(): boolean {
    const binding=this.currentBinding(),worldId=this.currentScene().worldId,chatId=this.adapter.getChatId();
    return !this.state.vaultLocked && !!binding && !!worldId && !!chatId && this.memoryDispatchRecords.some(c=>validStoryDispatchCapture(c) && c.origin==='local' && c.purpose==='out-of-character' && c.worldId===worldId && c.bindingId===binding.id && c.identity.chatId===chatId && c.injection!=='unconfirmed' && c.delivery?.status==='accepted');
  }
  private choicesPurposePending(): boolean {
    return this.sharedGameActive() && this.hasOutOfCharacterCapture() && this.storyGame.presentationPending();
  }
  private sharedGameActive(): boolean {
    const binding = this.currentBinding(), game = this.worlds.find(w => w.id === binding?.worldId)?.sharedGame;
    return !game || game.activeBindingId === binding?.id;
  }
  private async activateGame(mode: WorldGameActivation["mode"] = "resume") {
    const scope = this.pageScope(), binding = this.currentBinding(), world = this.worlds.find(w => w.id === binding?.worldId);
    if (!binding || !world) return;
    await repository.activateWorldGame({ chatId: binding.chatId, chatUrl: scope.url, worldId: world.id, expectedRevision: world.sharedGame?.revision ?? null, mode });
    this.assertScope(scope); await this.reload();
    if (this.worlds.find(w => w.id === world.id)?.sharedGame?.managed && !this.trackedBindings.has(this.currentBinding()?.id ?? "")) {
      await this.storyGame.run("start"); await this.reload();
    }
  }

  private stayInOldChat(): Promise<void> {
    const scope = this.pageScope(), notice = this.state.oldChatNotice, binding = this.currentBinding();
    if (!notice || !binding) return Promise.resolve();
    // The notice can disappear during reload before activation/start has
    // finished. Sends must await the entire explicit scene change, not just
    // observe that the notice is gone and compile an intermediate checkpoint.
    const task = this.sceneQueue.catch(() => undefined).then(async () => {
      this.assertScope(scope);
      await repository.acknowledgeOldChatNotice({ chatId: binding.chatId, chatUrl: scope.url, worldId: binding.worldId ?? null, snapshotId: notice.snapshotId, targetChatId: notice.targetChatId, mode: "dismissed" });
      this.assertScope(scope);
      await this.reload();
      if (!this.sharedGameActive()) await this.activateGame("resume");
      this.assertScope(scope);
    });
    this.sceneQueue = task;
    return task;
  }

  private currentScene(): SceneState {
    const binding = this.currentBinding();
    const chatId = this.adapter.getChatId(), snapshot = this.appliedSnapshot;
    const provisional = this.matchesQueuedContinuationTarget();
    const raw: SceneState = chatId ? binding ? { worldId: binding.worldId ?? null, focusIds: binding.focusIds ?? [], bookId: binding.bookId }
      : provisional && snapshot ? { worldId: memoryWorld(snapshot, this.books), focusIds: snapshot.focusIds ?? [], bookId: snapshot.bookId } : { ...EMPTY_SCENE } : this.draftScene;
    const worldId = this.worlds.some((w) => w.id === raw.worldId) ? raw.worldId : null;
    return { worldId, focusIds: raw.focusIds.filter((id) => this.entities.some((e) => e.id === id && e.worldId === worldId)), bookId: this.books.some((b) => b.id === raw.bookId && (b.worldId ?? null) === worldId && b.active) ? raw.bookId : null };
  }

  private setScene(scene: SceneState, importTarget?: import("../core/messages").ImportSceneTarget): Promise<void> {
    const scope = this.pageScope();
    const task = this.sceneQueue.catch(() => undefined).then(async () => {
      if (!importTarget) return this.persistScene(scene, scope);
      if (importTarget.chatId !== scope.chatId || importTarget.chatUrl !== scope.url || !await this.reload()) throw Error("scene-changed");
      const assertImportTarget = () => {
        this.assertScope(scope);
        const worldId = this.currentScene().worldId;
        if (this.adapter.isAuthenticationPage() || this.state.vaultLocked || !scene.worldId || document.visibilityState === "hidden"
          || (importTarget.empty && !importTarget.worldId && worldId !== scene.worldId && this.adapter.getMessageCount() > 0)
          || this.adapter.isGenerating() || this.pendingService || this.preparingService || this.state.continuation || this.appliedSnapshot
          || (worldId !== importTarget.worldId && worldId !== scene.worldId)) throw Error("scene-changed");
      };
      assertImportTarget();
      if (this.currentScene().worldId !== scene.worldId) await this.persistScene(scene, scope, undefined, assertImportTarget);
    });
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

  private async persistScene(scene: SceneState, scope: PageScope, carry?: HandoffSnapshot, assertImportTarget?: () => void) {
    this.assertScope(scope);
    if (await repository.isLocked()) throw new Error("vault-locked");
    this.assertScope(scope);
    assertImportTarget?.();
    if (scene.worldId && !this.worlds.some((w) => w.id === scene.worldId)) throw new Error("unknown-world");
    if (scene.bookId && !this.books.some((b) => b.id === scene.bookId && (b.worldId ?? null) === scene.worldId && b.active)) throw new Error("unknown-book");
    scene = { ...scene, focusIds: [...new Set(scene.focusIds)].filter((id) => this.entities.some((e) => e.id === id && e.worldId === scene.worldId)) };
    const changedWorld = scene.worldId !== this.currentScene().worldId;
    const chatId = scope.chatId;
    if (chatId) {
      const existing = this.currentBinding();
      const binding: ChatBinding = withHandoffCharacters({ ...existing, memoryOverrides: changedWorld ? EMPTY_OVERRIDES : this.overrides(), id: existing?.id ?? `binding:${chatId}`, chatId, chatUrl: location.href, messageCountAtAnalysis: existing?.messageCountAtAnalysis ?? 0, createdAt: existing?.createdAt ?? Date.now(), ...scene, updatedAt: Date.now() }, carry ?? this.appliedSnapshot);
      if (!existing && scene.worldId && this.worlds.find(w => w.id === scene.worldId)?.sharedGame) delete binding.characterScenes;
      await repository.putIfUnchanged("binding", binding, existing ?? null);
      this.bindings = [...this.bindings.filter((b) => b.chatId !== chatId), binding];
      if (scene.worldId && (changedWorld || !existing)) await this.activateGame("attach");
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
      this.retryContinuationTarget = null;
      this.pendingContinuationCommit = null; this.state.continuationCommitPending = false;
      await this.saveTabState({ snapshotId: null, snapshotToken: null, retryContinuationTarget: null });
      this.state.handoffOffer = null;
    }
    await this.updateContext(); this.updateSuggestions(); this.syncSceneChoices();
    void browser.runtime.sendMessage({ type: "DR_DATA_CHANGED" } satisfies DeepRoleMessage).catch(() => undefined);
  }

  private async updateContext(draft = this.adapter.getDraft(), characterRequestId?: string, requestChatId?: string, requiredContext?: string, opening = false) {
    this.state.oldChatNotice = oldChatNotice(this.currentBinding(), this.snapshots, this.books, this.worlds);
    const scene = this.currentScene();
    const world = this.worlds.find((w) => w.id === scene.worldId);
    const chatId = this.adapter.getChatId();
    const tracked = this.sharedGameActive() && this.trackedBindings.has(this.currentBinding()?.id ?? "");
    const gameMode = tracked ? "active" : "";
    if (document.documentElement.dataset.deeproleStoryGame !== gameMode) document.documentElement.dataset.deeproleStoryGame = gameMode;
    const savedMemoryTarget = this.savedMemoryTarget();
    const strictMode = (this.settings.strictMemorySending || savedMemoryTarget) && !this.pendingService ? "active" : "";
    const transferMode = this.pendingContinuationCommit ? "active" : "";
    if (document.documentElement.dataset.deeproleTransferPending !== transferMode) document.documentElement.dataset.deeproleTransferPending = transferMode;
    if (document.documentElement.dataset.deeproleStrictMemory !== strictMode) document.documentElement.dataset.deeproleStrictMemory = strictMode;
    const recentMessages = tracked ? (this.trackedHistory.get(this.currentBinding()!.id) ?? []).slice(-this.settings.recentMessageCount) : this.adapter.getRecentMessages(this.settings.recentMessageCount);
    const contextualEntities = world?.sharedGame ? worldGamePeople(this.entities, world, this.storyRecords) : scene.worldId && chatId ? currentStoryProfileEntities(this.entities, this.storyRecords, scene.worldId, chatId, this.currentBinding()?.id) : this.entities;
    const canonicalEntities = new Map(this.entities.map(e => [e.id, e]));
    const characterEntities = contextualEntities.filter(e => e.worldId === scene.worldId && e.kind === "character" && characterInChat(e, chatId));
    const characterScene = world ? this.sharedBinding()?.characterScenes?.[world.id] ?? world.sharedGame?.scene ?? handoffCharacterScene(this.appliedSnapshot, world.id) : undefined;
    const profilesEnabled = !!(world && this.settings.characterSheetsEnabled && !this.state.vaultLocked);
    const sheetsEnabled = profilesEnabled && !!chatId;
    const recentGame = world?.sharedGame;
    const gameBranch = this.trackedBranches.get(this.currentBinding()?.id ?? "");
    const savedBranch = savedMemoryTarget && recentGame ? this.trackedBranches.get(recentGame.activeBindingId) : undefined;
    const characterScope = `${scene.worldId}:${chatId}`;
    if (this.characterScan && this.characterScan.scope !== characterScope) { this.characterScan = null; this.characterStatus = "idle"; }
    this.state.characters = sheetsEnabled ? { storyProfileIds: characterEntities.filter(e => e !== canonicalEntities.get(e.id)).map(e => e.id), relationshipsEnabled: this.settings.relationshipsEnabled !== false && world?.relationshipsEnabled !== false, relationshipDisplay: this.settings.relationshipDisplay, worldId: world!.id, chatId: chatId!, base: characterRevision(this.entities.filter(e => e.worldId === scene.worldId && e.kind === "character" && characterInChat(e, chatId)), characterScene), entities: characterEntities, scene: characterScene, actions: actionsFor(world?.characterActions ?? this.settings.characterActions), status: this.characterStatus, openId: this.state.characters?.openId } : undefined;
    const overrides = this.overrides();
    const snapshot = this.appliedSnapshot && memoryWorld(this.appliedSnapshot, this.books) === scene.worldId ? this.appliedSnapshot : null;
    const choicesEnabled = Boolean(world && (this.settings.sceneChoicesEnabled ?? true));
    const readOnly = this.currentBinding()?.nextStoryMessageMode === "out-of-character" || explicitOutOfCharacter(draft,world?.bracketedOoc===true);
    let memoryCoverage:import("../core/game-memory-coverage").GameMemoryCoverage|undefined;
    const compiled = compileGameContext({
      draft,
      readOnly,
      recentMessages,
      entries: this.entries,
      activeBookId: scene.bookId,
      scene, books: this.books, entities: contextualEntities.filter(e => characterInChat(e, chatId)), worlds: this.worlds,
      manualIds: overrides.includedIds,
      excludedIds: overrides.excludedIds,
      settings: world ?? this.settings,
      character: profilesEnabled ? [world!.id,chatId ?? requestChatId ?? "",characterEntities,characterScene,actionsFor(world?.characterActions ?? this.settings.characterActions),scene.focusIds,[draft,...recentMessages.slice(-2)].join("\n"),characterRequestId,this.settings.relationshipsEnabled !== false && world?.relationshipsEnabled !== false,!!this.pendingService || savedMemoryTarget,this.imageSettings.enabled && isSelfieRequest(draft)] : undefined,
      story: tracked && gameBranch && world && chatId && !this.pendingService ? {world,chat:chatId,branch:gameBranch,facts:world.sharedGame?.facts ?? this.trackedFacts.get(this.currentBinding()!.id) ?? [],taskArchive:this.taskArchives.get(gameBranch),sheetsEnabled:!!this.settings.characterSheetsEnabled} : opening && world && chatId ? {world,chat:chatId,facts:[],sheetsEnabled:!!this.settings.characterSheetsEnabled} : world && recentGame && savedBranch && !this.pendingService ? {world,chat:recentGame.activeChatId,branch:savedBranch,facts:recentGame.facts,taskArchive:this.taskArchives.get(savedBranch),sheetsEnabled:!!this.settings.characterSheetsEnabled,referenceOnly:true} : undefined,
      snapshot,
      continuation: !this.pendingService && !recentGame?.restartPending && recentGame?.recentStory?.turns.length && recentGame.recentChatId !== chatId && !snapshot ? recentGame.recentStory : undefined,
      restart: !!recentGame?.restartPending && !this.pendingService,
      choices: choicesEnabled && !this.pendingService,
      requiredContext,
    },{searchIndex:this.searchIndex,memoryTransport:"columns"},coverage=>{memoryCoverage=coverage;});
    this.selection = {...compiled.selection,memoryCoverage}; this.documents = compiled.documents;
    this.state.pendingHandoff = this.pendingContinuationCommit ? undefined : snapshot?.title;
    const memoryText = compiled.memoryText;
    const contextText = compiled.text;
    this.state.sceneChoicesEnabled = choicesEnabled;
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
    const signature = JSON.stringify([scene, overrides, contextText, this.selection.omittedCount, memoryCoverage]);
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
    const prompt = snapshot.resetGameId ? this.state.locale==="ru"?"Начни историю с утверждённой исходной точки.":"Begin the story at the approved starting point." : continuationText(this.state.locale, "continuePrompt");
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
    const authenticationPage = this.adapter.isAuthenticationPage();
    const savedMemory = this.savedMemoryTransferState(authenticationPage), savedMemoryQueued = this.savedMemoryTarget();
    const activitySignature = JSON.stringify([this.state.activity, this.state.generating, this.state.warning, savedMemory, savedMemoryQueued]);
    if (activitySignature !== this.publishedActivity) {
      this.publishedActivity = activitySignature;
      void browser.runtime.sendMessage({ type: "DR_CONTEXT_CHANGED" } satisfies DeepRoleMessage).catch(() => undefined);
    }
    this.state.contextPosition = this.resolveContextIndicatorPosition();
    this.root?.render(<PageWidget
      state={{ ...this.state, selection: this.selection, memoryDelivery: this.memoryDelivery() }}
      onStayInOldChat={() => this.stayInOldChat()}
      onContinueStory={() => void this.continueStory().then(result => { if (!result.ok) this.showToast(continuationText(this.state.locale, result.error === "draft-not-empty" ? "ready" : result.error === "busy" ? "waiting" : result.error === "continuation-world-too-large" ? "tooLarge" : "failed")); })}
      savedMemoryTransfer={savedMemory ? {
        ...savedMemory,
        preview: worldId => this.previewSavedMemory(savedMemory.scope, worldId),
        open: (version, worldId) => this.openSavedMemory(savedMemory.scope, version, worldId),
      } : undefined}
      savedMemoryQueued={savedMemoryQueued}
      onDismissCapacityWarning={() => void this.dismissCapacityWarning()}
      onDisableCapacityWarnings={() => void updateSettings({ contextWarningsEnabled: false }).then(() => this.reload())}
      onPanelWidthChange={async width => { await updateSettings({ floatingPanelWidth: width }); await this.reload(); }}
      onSaveMemoryBudget={async (contextBudget, expected) => {
        const chatId = this.adapter.getChatId();
        if (!chatId || this.currentScene().worldId !== expected.id) throw new Error("memory-budget-scope");
        try { await repository.saveMemoryBudget({ worldId: expected.id, chatId, chatUrl: location.href, contextBudget, expectedBudget: expected.contextBudget }); }
        catch (error) { await this.reload(); throw error; }
        if (!await this.reload()) await this.reloadTask;
        if (this.worlds.find(world => world.id === expected.id)?.contextBudget !== contextBudget) throw new Error("memory-budget-conflict");
      }}
      onAddCharacterAction={async (worldId, name) => {
        const cast = this.state.characters;
        if (!cast || cast.worldId !== worldId) throw new Error("character-scope");
        const next = await repository.addCharacterAction({ worldId, chatId: cast.chatId, chatUrl: location.href, base: cast.base }, name);
        await this.reload(); return next;
      }}
      onAskSelfie={id => this.askSelfie(id)}
      onSaveCharacter={(edit) => this.saveCharacter(edit)}
      onGenerateCharacterText={(draft, options) => this.generateIsolatedCharacterText(draft, options)}
      onRequestCharacterFact={async (targetEntityId, brief) => { const result = await this.runService({ id: createId("service"), type: "memory-analysis", targetEntityId, brief, bookId: this.currentScene().bookId, createdAt: Date.now() }); if (!result.ok) throw new Error(result.error); }}
      onRetryCharacters={() => { this.characterScan = null; void this.scanCharacters(); }}
      onCharacterOpened={() => { if (this.state.characters) this.state.characters.openId = null; }}
      authenticationPage={authenticationPage}
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
      onDismissPromptLength={() => { this.state.promptLength = undefined; this.render(); }}
      onDismissContinuationDraft={() => { this.state.continuationDraft = undefined; this.render(); }}
      onCopyContext={() => { void navigator.clipboard.writeText(this.state.contextText); this.showToast(this.t("contextCopied")); }}
      onAnalyze={() => void this.runService({ id: createId("service"), type: "memory-analysis", bookId: this.currentScene().bookId, createdAt: Date.now() }).then((result) => { if (!result.ok) this.showToast(assistantText(this.state.locale, result.error === "empty-chat" ? "emptyChat" : result.error === "draft-not-empty" ? "draftProtected" : result.error === "busy" ? "busy" : result.error === "scene-changed" ? "sceneChanged" : "serviceFailed")); })}
      onDismissSuggestion={() => { this.dismissedAt.set(this.adapter.getChatId() ?? "draft", this.adapter.getMessageCount()); this.state.analysisSuggested = false; this.render(); }}
      onSaveSelection={() => void this.saveSelection(this.state.selectionText)}
      onApplyHandoff={() => { const snapshot = this.state.handoffOffer; if (snapshot) void this.applySnapshot(snapshot.id).catch(() => this.showToast(sceneText(this.state.locale, "failed"))); }}
      onDismissHandoff={() => { this.state.handoffOffer = null; this.render(); }}
      onKeepContinuationMemory={() => this.keepContinuationMemory()}
      onCancelContinuation={() => void this.cancelContinuation().catch(() => this.showToast(continuationText(this.state.locale, "failed")))}
      onRetryContinuationCommit={() => void this.retryContinuationCommit()}
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
      this.syncReviewReminder();
      // The automatic correction must run AFTER the writer releases its scan.
      // Calling both here synchronously always saw characterScanTask as busy.
      void this.scanCharacters().then(async () => { await this.syncMetadataRepair(); await this.syncMemoryBatch(); }).catch(() => undefined);
    }, 350);
  }

  private scheduleHistoryRefresh(delay: number) {
    window.clearTimeout(this.historyRefreshTimer);
    this.historyRefreshTimer = window.setTimeout(() => {
      this.historyRefreshTimer = 0;
      this.requestHistoryEstimate(true);
    }, delay);
  }

  private syncReviewReminder() {
    const target = this.reviewReminderTarget;
    const binding = this.currentBinding();
    const key = !this.state.vaultLocked && target?.chatId === binding?.chatId && target?.worldId === binding?.worldId ? target?.key : undefined;
    this.reviewReminder.sync(key, this.state.locale, !!key && this.adapter.isGenerating());
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
    } : undefined, { allowReply: row => !this.choicesPurposePending() && !this.isOutOfCharacterReply(row), adaptiveLayout: this.settings.adaptiveLayout !== false, pinSceneChoices: !!this.settings.pinSceneChoices, pinPortraits: !!(this.settings.pinPortraitLeft || this.settings.pinPortraitRight), onToggle: key => this.toggleChoicePin(key) });
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

  private async startAutomaticRecording(beforeSend?: { chatId: string; nativeParentKey: string | null }): Promise<boolean> {
    const scope = this.pageScope(), binding = this.currentBinding();
    const world = this.worlds.find(w => w.id === binding?.worldId), policy = world?.storyAutomation;
    if (!binding || !world || !policy || policy.mode === "off" || world.sharedGame?.activeBindingId !== binding.id
      || this.trackedBindings.has(binding.id) || beforeSend && beforeSend.chatId !== binding.chatId) return false;
    const allowed = () => !this.state.vaultLocked && !this.adapter.isAuthenticationPage() && !this.appliedSnapshot
      && !this.pendingService && !this.preparingService && location.href === scope.url && this.adapter.getChatId() === scope.chatId
      && this.currentBinding()?.id === binding.id && this.currentScene().worldId === world.id
      && this.worlds.find(w => w.id === world.id)?.storyAutomation?.revision === policy.revision
      && (!!beforeSend || document.visibilityState === "visible" && !this.adapter.isGenerating());
    if (!allowed()) return false;
    if (this.automaticRecordingTask) await this.automaticRecordingTask;
    if (!allowed() || this.trackedBindings.has(binding.id)) return false;
    const attempt = JSON.stringify([scope.url, binding.id, policy.revision, fieldHistoryAnchor(document, true)]);
    if (!beforeSend && this.lastRecordingAttempt === attempt) return false;
    this.lastRecordingAttempt = attempt;
    const task = (async () => {
      try {
        const result = await this.storyGame.run("start", beforeSend?.nativeParentKey ?? null, "stop", undefined, { allowed, beforeSend: !!beforeSend });
        return result.active && await this.reload() && result.changed;
      } catch { return false; }
    })();
    this.automaticRecordingTask = task;
    try { return await task; } finally { if (this.automaticRecordingTask === task) this.automaticRecordingTask = null; }
  }

  private scanCharacters(): Promise<void> {
    if (this.characterScanTask) { this.characterRescanQueued = true; return this.characterScanTask; }
    const task = (async () => {
      await this.startAutomaticRecording();
      if (this.state.characters) await this.scanCharacterTurn();
      else await this.scanStoryWithoutCards();
    })().finally(() => {
      if (this.characterScanTask !== task) return;
      this.characterScanTask = null;
      // A native arrow click can arrive while the previous history GET is still
      // being validated. Coalesce it, but never lose the newly displayed reply.
      if (this.characterRescanQueued) { this.characterRescanQueued = false; this.scheduleScan(); }
    });
    this.characterScanTask = task;
    return task;
  }

  private async scanStoryWithoutCards() {
    if (!this.sharedGameActive()) return;
    if (this.state.vaultLocked || this.adapter.isGenerating() || this.pendingService) return;
    const tracked=this.trackedBindings.has(this.currentBinding()?.id ?? '');
    if(!tracked&&!this.hasOutOfCharacterCapture())return;
    const response = latestCharacterResponse(); if (!response) return;
    const key = JSON.stringify([this.adapter.getChatId(), this.currentScene().worldId, nativeMessageIdentity(response.row), response.signature]);
    if (this.storyGameScanKey === key && !this.choicesPurposePending()) return;
    this.storyGameScanKey = key;
    try {
      if(tracked){const result = await this.storyGame.run(); if (result.active) this.clearStoryGameWarning(); this.queueMetadataRepair(result); if (result.changed) await this.reload();}
      if(this.hasOutOfCharacterCapture()&&!this.storyGame.presentationSnapshot())await this.storyGame.readForPresentation();
      this.syncSceneChoices();
    }
    catch (error) { this.storyGameWarning = this.state.warning = storyReviewText(this.state.locale, storyReviewError(error)); this.render(); }
  }

  private clearStoryGameWarning() {
    if (this.storyGameWarning && this.state.warning === this.storyGameWarning) { this.state.warning = ""; this.render(); }
    this.storyGameWarning = null;
  }
  private queueMetadataRepair(result: import("../core/story-game").StoryGameOutcome) {
    this.pendingMetadataRevision = result.active && !result.repairAttempted && result.revisionId && result.update && result.update.status !== "accepted" && !result.update.issues.some(i => i.rule === "scope") && (result.update.status === "missing" || result.update.issues.some(i => i.rule !== "policy")) ? result.revisionId : null;
  }
  private async syncMetadataRepair() {
    if (this.settings.automaticMetadataRepair && this.pendingMetadataRevision && Date.now() - this.lastMetadataRepairAt < 30000 && !this.metadataRepairTimer) this.metadataRepairTimer = window.setTimeout(() => { this.metadataRepairTimer = 0; this.scheduleScan(); }, 31000 - (Date.now() - this.lastMetadataRepairAt));
    if (!this.settings.automaticMetadataRepair || !this.pendingMetadataRevision || this.metadataRepairTask || this.characterScanTask || this.state.vaultLocked || this.preparingService || this.pendingService || this.adapter.isGenerating() || this.adapter.getDraft().trim() || document.visibilityState !== "visible" || Date.now() - this.lastMetadataRepairAt < 30000) return;
    const revisionId = this.pendingMetadataRevision; this.lastMetadataRepairAt = Date.now();
    try {
      const scope = this.currentScene(), chat = this.adapter.getChatId(); if (!scope.worldId || !chat) return;
      const page = await repository.readStoryReview({ chatId: chat, worldId: scope.worldId, cursor: null }, location.href);
      if (page.currentRevisionId !== revisionId || page.repair || !page.guard) { this.pendingMetadataRevision = null; return; }
      await this.startMetadataRepair({ worldId: scope.worldId, chatId: chat, revisionId, guard: page.guard });
    } catch { /* A busy lane does not dispatch or consume a correction attempt. */ }
  }
  private async syncMemoryBatch() {
    const worldId = this.currentScene().worldId, chatId = this.adapter.getChatId(), world = this.worlds.find(w => w.id === worldId);
    if (world?.storyMemoryBatch?.mode !== "automatic") { window.clearTimeout(this.memoryBatchTimer); this.memoryBatchTimer = 0; return; }
    if (!this.memoryBatchTimer) this.memoryBatchTimer = window.setTimeout(() => { this.memoryBatchTimer = 0; this.scheduleScan(); }, 15000);
    if (!worldId || !chatId || !this.sharedGameActive() || this.characterDiscoveryTask || this.characterScanTask || this.metadataRepairTask || this.fieldPreparing || this.state.vaultLocked || this.preparingService || this.pendingService || this.adapter.isGenerating() || this.adapter.getDraft().trim() || document.visibilityState !== "visible" || Date.now() - this.lastMemoryBatchAt < 15000) return;
    this.lastMemoryBatchAt = Date.now();
    const input = { worldId, chatId, force: false };
    try {
      const status = await browser.runtime.sendMessage({ type: "DR_FIELD", action: "memory-batch-status", input });
      if (status?.ok && status.data?.due) await this.startMemoryBatch(input);
    } catch { /* Busy/failed work is visible in Story; no silent retry/resend. */ }
  }
  private async startMemoryBatch(input: import("../core/story-memory-batch").MemoryBatchInput) {
    if (this.characterDiscoveryTask || this.metadataRepairTask || this.characterScanTask || this.fieldPreparing || this.state.vaultLocked || this.pendingService || this.preparingService || this.adapter.isGenerating() || this.adapter.getDraft().trim()) throw Error("busy");
    const url = location.href, abort = new AbortController(); this.characterDiscoveryAbort = abort;
    const current = () => !abort.signal.aborted && !this.state.vaultLocked && location.href === url && this.adapter.getChatId() === input.chatId && this.currentScene().worldId === input.worldId && !this.adapter.isGenerating() && !this.adapter.getDraft().trim();
    const task = (async () => { await this.storyGame.run(); await this.characterDiscoveryClient.run(input, current, abort.signal); await this.reload(); })();
    this.characterDiscoveryTask = task; this.memoryBatchRunning = true;
    try { await task; } finally { if (this.characterDiscoveryTask === task) { this.characterDiscoveryTask = null; this.characterDiscoveryAbort = null; this.memoryBatchRunning = false; } this.scheduleScan(); }
  }
  private async startMetadataRepair(input: import("../storage/story-repair").StoryRepairInput) {
    if (this.characterDiscoveryTask || this.metadataRepairTask || this.state.vaultLocked || this.pendingService || this.preparingService || this.adapter.isGenerating() || this.adapter.getDraft().trim()) throw Error("story-checkpoint-busy");
    const url = location.href, anchor = fieldHistoryAnchor(document, true), abort = new AbortController(); this.metadataRepairAbort = abort;
    const task = (async () => {
      await this.storyGame.run();
      await this.storyRepairClient.run(input, () => !this.state.vaultLocked && location.href === url && this.adapter.getChatId() === input.chatId && this.currentScene().worldId === input.worldId && fieldHistoryAnchor(document, true) === anchor && !this.adapter.isGenerating() && !this.adapter.getDraft().trim(), abort.signal);
      this.pendingMetadataRevision = null; await this.reload();
    })();
    this.metadataRepairTask = task;
    try { await task; } finally { if (this.metadataRepairTask === task) { this.metadataRepairTask = null; this.metadataRepairAbort = null; } this.scheduleScan(); }
  }

  private async searchStoryCharacters(input: CharacterDiscoveryInput | DiscoveryProfileInput | DiscoveryQueueInput) {
    if (!(validCharacterDiscoveryInput(input) || validDiscoveryProfileInput(input) || validDiscoveryQueueInput(input)) || input.chatId !== this.adapter.getChatId() || input.worldId !== this.currentScene().worldId) throw Error("story-binding-conflict");
    if (this.characterDiscoveryTask || this.metadataRepairTask || this.state.vaultLocked || this.pendingService || this.preparingService || this.adapter.isGenerating() || this.adapter.getDraft().trim()) throw Error("story-checkpoint-busy");
    const url = location.href, anchor = fieldHistoryAnchor(document, true), abort = new AbortController(); this.characterDiscoveryAbort = abort;
    const current = () => !abort.signal.aborted && !this.state.vaultLocked && location.href === url && this.adapter.getChatId() === input.chatId && this.currentScene().worldId === input.worldId && fieldHistoryAnchor(document, true) === anchor && !this.adapter.isGenerating() && !this.adapter.getDraft().trim();
    const task = (async () => {
      const synced = await this.storyGame.run();
      if (!synced.active) throw Error("story-checkpoint-busy");
      let page = await repository.readCharacterDiscovery({ chatId: input.chatId, worldId: input.worldId, offset: 0, guard: input.guard }, url);
      if ("operation" in input) return runDiscoveryProfileQueue(input, {
        current, read: () => repository.readCharacterDiscovery({ chatId: input.chatId, worldId: input.worldId, offset: 0 }, url),
        edit: async value => { const result = await browser.runtime.sendMessage({ type: "DR_FIELD", action: "discovery-queue", input: value }); if (!result?.ok) throw Error(result?.error ?? "request-failed"); },
        prepare: value => this.characterDiscoveryClient.run(value, current, abort.signal),
      });
      if ("eventId" in input) {
        await this.characterDiscoveryClient.run(input, current, abort.signal);
        return repository.readCharacterDiscovery({ chatId: input.chatId, worldId: input.worldId, offset: 0 }, url);
      }
      while (page.remaining) {
        if (!current()) throw Error("cancelled");
        await this.characterDiscoveryClient.run({ chatId: input.chatId, worldId: input.worldId, guard: page.guard }, current, abort.signal);
        page = await repository.readCharacterDiscovery({ chatId: input.chatId, worldId: input.worldId, offset: 0 }, url);
      }
      return page;
    })();
    this.characterDiscoveryTask = task;
    try { return await task; } finally { if (this.characterDiscoveryTask === task) { this.characterDiscoveryTask = null; this.characterDiscoveryAbort = null; } this.scheduleScan(); }
  }

  private async prepareStorySupplement(input: SupplementInput) {
    if (!validSupplementInput(input) || input.chatId !== this.adapter.getChatId() || input.worldId !== this.currentScene().worldId) throw Error("story-binding-conflict");
    if (this.characterDiscoveryTask || this.metadataRepairTask || this.state.vaultLocked || this.pendingService || this.preparingService || this.adapter.isGenerating() || this.adapter.getDraft().trim()) throw Error("story-checkpoint-busy");
    const url = location.href, anchor = fieldHistoryAnchor(document, true), abort = new AbortController(); this.characterDiscoveryAbort = abort;
    const current = () => !abort.signal.aborted && !this.state.vaultLocked && location.href === url && this.adapter.getChatId() === input.chatId && this.currentScene().worldId === input.worldId && fieldHistoryAnchor(document, true) === anchor && !this.adapter.isGenerating() && !this.adapter.getDraft().trim();
    const task = (async () => { const synced = await this.storyGame.run(); if (!synced.active) throw Error("story-checkpoint-busy"); await this.characterDiscoveryClient.run(input, current, abort.signal); return repository.readProfileSupplements({ worldId: input.worldId, chatId: input.chatId, query: "", offset: 0, entityId: input.entityId }, url); })();
    this.characterDiscoveryTask = task;
    try { return await task; } finally { if (this.characterDiscoveryTask === task) { this.characterDiscoveryTask = null; this.characterDiscoveryAbort = null; } this.scheduleScan(); }
  }

  private async scanCharacterTurn() {
    if (!this.sharedGameActive()) return;
    // Metadata repairs run in a separate owned worker lane.
    await this.characterReceiptTask;
    await this.dispatchCaptures.flush();
    const characters = this.state.characters;
    if (!characters || this.characterSaving || this.state.vaultLocked || this.adapter.isGenerating() || this.preparingService || this.currentActivity()?.phase === "waiting") return;
    const response = latestCharacterResponse();
    if (!response) return;
    const scope = `${characters.worldId}:${characters.chatId}`;
    const turnKey = response.turn ? characterTurnKey(response.turn) : response.signature;
    const key = JSON.stringify([nativeMessageIdentity(response.row), response.signature, turnKey]);
    if (this.characterScan?.scope === scope && this.characterScan.key === key && this.characterScan.done && !this.choicesPurposePending()) return;
    if (this.characterScan?.scope !== scope || this.characterScan.key !== key) this.characterScan = { scope, key, since: Date.now(), done: false };
    if (Date.now() - this.characterScan.since < 1200) { window.setTimeout(() => this.scheduleScan(), 1250); return; }
    this.characterScan.done = true;
    let outOfCharacter = this.isOutOfCharacterReply(response.row);
    try {
      const synced = await this.storyGame.run();
      // Managed sync already read the native history. Legacy/UI-only mode may
      // need one bounded GET for an accepted OOC whose SSE link is unavailable.
      if (!outOfCharacter && !this.storyGame.presentationSnapshot() && this.hasOutOfCharacterCapture()) await this.storyGame.readForPresentation();
      if (this.state.vaultLocked || this.currentScene().worldId!==characters.worldId || this.adapter.getChatId()!==characters.chatId || latestCharacterResponse()?.signature!==response.signature) return;
      outOfCharacter = this.isOutOfCharacterReply(response.row);
      if (synced.active) {
        if (!outOfCharacter) this.queueMetadataRepair(synced);
        this.clearStoryGameWarning();
        if (synced.changed) await this.reload();
        const status: CharacterCopyKey = outOfCharacter ? "outOfCharacter" : synced.update ? synced.update.status === "accepted" || synced.update.status === "partial" ? "updated" : synced.update.status === "missing" ? "missing" : "invalidUpdate" : response.turn ? "updated" : response.text.includes("<deeprole_characters>") ? "invalidUpdate" : "missing";
        if (!outOfCharacter && synced.update && synced.update.status !== "accepted") this.storyGameWarning = this.state.warning = storyUpdateText(this.state.locale, synced.update.status);
        this.characterStatus = status;
        if (this.state.characters) this.state.characters.status = status;
        if (response.turn || response.text.includes("<deeprole_characters>")) foldCharacterPayload(response.row, this.state.locale, status);
        this.syncSceneChoices(); this.render(); return;
      }
    } catch (error) {
      this.storyGameWarning = this.state.warning = storyReviewText(this.state.locale, storyReviewError(error)); this.render();
      const code = error instanceof Error ? error.message : "";
      if (["story-review-stale", "story-binding-conflict", "story-source-incomplete", "story-native-line-unavailable"].includes(code) && (this.storyScanRetries.get(key) ?? 0) < 2) {
        if (this.storyScanRetries.size > 64) this.storyScanRetries.clear();
        this.storyScanRetries.set(key, (this.storyScanRetries.get(key) ?? 0) + 1);
        await this.reload();
        if (this.characterScan?.key === key) this.characterScan.done = false;
        window.setTimeout(() => this.scheduleScan(), 300);
      }
      return;
    }
    const rawTurn = response.turn;
    if (outOfCharacter) {
      if (!this.state.characters || `${this.state.characters.worldId}:${this.state.characters.chatId}` !== scope) return;
      this.characterStatus = 'outOfCharacter'; this.state.characters.status = 'outOfCharacter';
      if (rawTurn) foldCharacterPayload(response.row, this.state.locale, 'outOfCharacter');
      this.syncSceneChoices(); this.render(); return;
    }
    if (rawTurn?.request) this.characterReceipt = (await browser.runtime.sendMessage({ type: "DR_GET_TAB_STATE" } satisfies DeepRoleMessage) as TabSessionState | undefined)?.characterRequest ?? null;
    const turn = rawTurn?.request ? bindCharacterTurn(rawTurn, this.characterReceipt, characters) : rawTurn;
    let status: CharacterCopyKey = "missing";
    if (rawTurn && characters.scene?.lastReply === turnKey) status = "updated";
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
          status = reason === "character-read-only" ? "idle" : reason === "character-story-managed" ? "historyManaged" : reason === "character-conflict" ? "stale" : reason === "character-scope" ? "otherChat" : reason === "character-unknown" ? "unknown" : reason === "character-invalid" ? "invalidUpdate" : reason === "character-limit" ? "limit" : "autoFailed";
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
    const target = latestSceneChoiceTarget();
    if (!target || target.signature !== signature || this.choicesPurposePending() || this.isOutOfCharacterReply(target.row)) return false;
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
    if (this.state.vaultLocked || this.settings.sceneChoicesEnabled === false || this.adapter.isGenerating() || this.preparingService || this.choicesPurposePending() || this.currentActivity()?.phase === "waiting") {
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
  private async generateIsolatedCharacterText(draft: CharacterTextRequest, options?: CharacterTextRunOptions): Promise<CharacterTextOutcome> {
    fieldCancellation(options?.signal);
    if (!validCharacterTextRequest(draft)) throw new Error("invalid-brief");
    if (this.state.vaultLocked || await repository.isLocked()) throw new Error("vault-locked");
    if (this.adapter.isGenerating() || this.pendingService || this.preparingService || this.fieldPreparing) throw new Error("busy");
    this.fieldPreparing = true;
    try {
      const scope: IsolatedFieldInput["scope"] = { chatId: this.adapter.getChatId(), chatUrl: location.href, worldId: this.currentScene().worldId, bookId: this.currentScene().bookId };
      const inScope = () => !this.state.vaultLocked && location.href === scope.chatUrl && this.adapter.getChatId() === scope.chatId && this.currentScene().worldId === scope.worldId && this.currentScene().bookId === scope.bookId;
      // Old in-chat service rows remain hidden and must not enter the new prompt.
      this.syncCharacterTextServices();
      const sceneReference = fieldSceneReference(visibleStoryHistory());
      const target = this.state.entities?.find(e => e.id === draft.reference.entityId && e.worldId === scope.worldId);
      const query = { name: String(draft.reference.name), field: draft.field.key, aliases: [...new Set([...(target ? [target.name] : []), ...(target?.aliases ?? [])])].filter(a => a.trim() && a.length <= 80 && a !== draft.reference.name).slice(0, 20), ...(draft.field.key === "character-profile" ? { relatedNames: profileRelatedNames(draft.reference, (this.state.entities ?? []).filter(e => e.worldId === scope.worldId)) } : {}) };
      const historyReference = draft.field.key === "image-plan" ? undefined : await requestFieldHistory(scope.chatId, query, inScope, document, options?.signal) ?? visibleFieldHistory(visibleStoryHistory(), query);
      fieldCancellation(options?.signal);
      if (!inScope() || this.adapter.isGenerating()) throw new Error("scene-changed");
      if (await repository.isLocked()) throw new Error("vault-locked");
      const result = await this.isolatedFields.generate({ scope, draft, locale: this.state.locale, sceneReference, historyReference }, inScope, options?.signal);
      fieldCancellation(options?.signal);
      if (await repository.isLocked()) throw new Error("vault-locked");
      if (!inScope()) throw new Error("scene-changed");
      return result;
    } finally { this.fieldPreparing = false; }
  }
  private async generateCharacterText(draft: CharacterTextRequest, _imageAttempt?: import("../core/image-plan").ImageAttempt): Promise<string> {
    const outcome = await this.generateIsolatedCharacterText(draft);
    if (outcome.cleanup === "failed") this.showToast(this.state.locale === "ru" ? "Текст готов, но временный чат не удалён. Проверьте список чатов DeepSeek." : "Text is ready, but the temporary chat was not deleted. Check your DeepSeek chat list.");
    return outcome.text;
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
    // Legacy rows can still be read/hidden; new field jobs never use this path.
    if (["character-text"].includes(request.type)) return { ok: false, error: "invalid-brief" };
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
      const basePrompt = request.type === "character-text" ? characterFieldPrompt(request.characterText!, existing, this.state.locale) : target ? characterFactPrompt(target, request.brief!, existing, this.state.locale) : request.type === "scene-choices" ? sceneChoiceRecoveryPrompt(this.state.locale) : request.type === "memory-analysis" ? memoryAnalysisPrompt(book?.name, existing, this.state.locale) : request.type === "lore-draft" ? loreDraftPrompt(request.brief!, this.state.locale, this.settings.relationshipsEnabled !== false && this.worlds.find(w => w.id === request.worldId)?.relationshipsEnabled !== false ? relationshipLoreBrief(this.entities.filter(e => e.worldId === request.worldId), request.brief ?? "") : "") : request.type === "continue-handoff" && request.continuationId ? sceneHandoffPrompt(request.brief ?? "{}", existing, this.state.locale) : handoffPrompt();
      // Service bodies deliberately bypass the injection bridge. Attach bounded,
      // read-only reference here; never create a character-update receipt for them.
      const serviceWorld = this.worlds.find(w => w.id === request.worldId);
      const serviceCharacters = this.entities.filter(e => e.worldId === request.worldId && e.kind === "character");
      const serviceScene = serviceWorld ? this.currentBinding()?.characterScenes?.[serviceWorld.id] ?? handoffCharacterScene(this.appliedSnapshot, serviceWorld.id) : undefined;
      const reference = serviceWorld && this.settings.characterSheetsEnabled ? characterInstruction(serviceWorld.id, request.chatId ?? "", serviceCharacters, serviceScene, actionsFor(serviceWorld.characterActions ?? this.settings.characterActions), request.focusIds ?? [], this.adapter.getRecentMessages(2).join("\n"), undefined, this.settings.relationshipsEnabled !== false && serviceWorld.relationshipsEnabled !== false, true) : "";
      const selectedMemory = ["scene-choices", "handoff", "continue-handoff"].includes(request.type) ? formatMemoryContext(this.selection, null) : "";
      const prompt = [basePrompt.replace("[DeepRole Service]\n", `[DeepRole Service]\n[Request ID: ${request.id}]\n`), reference, selectedMemory].filter(Boolean).join("\n\n");
      if (prompt.length > DEEPSEEK_PROMPT_CHAR_LIMIT) {
        this.state.promptLength = { length: prompt.length, url: initialUrl };
        return await cancel("prompt-too-long");
      }
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

  private savedMemorySource(worldId?: string, authenticationPage = this.adapter.isAuthenticationPage()): SavedMemoryRequest | undefined {
    if (this.state.vaultLocked || this.appliedSnapshot || authenticationPage) return;
    if (worldId !== undefined) {
      const world = this.worlds.find(item => item.id === worldId);
      if (isDeepSeekHome(location.href) && world && savedMemoryBinding(world, this.bindings)) return { fromHome: true, worldId };
      return;
    }
    const chatId = this.adapter.getChatId(), binding = this.currentBinding();
    if (chatId && binding?.worldId && binding.worldId === this.currentScene().worldId && this.sharedGameActive()) return { chatId, chatUrl: location.href, worldId: binding.worldId };
  }

  private savedMemoryScope() {
    return JSON.stringify([location.href, this.adapter.getChatId(), this.currentScene().worldId]);
  }

  private savedMemoryTransferState(authenticationPage: boolean): SavedMemoryTransferState | undefined {
    if (this.state.vaultLocked || this.appliedSnapshot || authenticationPage) return;
    const worlds = isDeepSeekHome(location.href) ? this.worlds.filter(world => savedMemoryBinding(world, this.bindings)).map(({ id, name }) => ({ id, name })) : undefined;
    if (!worlds?.length && !this.savedMemorySource(undefined, authenticationPage)) return;
    return {
      scope: this.savedMemoryScope(), worlds,
      blocked: !!(this.transferring || this.state.continuation || this.pendingService || this.preparingService || this.adapter.isGenerating()),
    };
  }

  private resolveSavedMemory(scope: string, worldId?: string): SavedMemoryRequest {
    if (this.savedMemoryScope() !== scope) throw Error("handoff-stale");
    const source = this.savedMemorySource(worldId);
    if (!source) throw Error("handoff-stale");
    return source;
  }

  private async previewSavedMemory(scope: string, worldId?: string) {
    const source = this.resolveSavedMemory(scope, worldId);
    const { preview } = await repository.savedMemoryContinuation(source);
    this.resolveSavedMemory(scope, worldId);
    return preview;
  }

  private matchesQueuedContinuationTarget(): boolean {
    const snapshot = this.appliedSnapshot;
    const scope = [snapshot?.id, this.snapshotToken, snapshot?.sourceChatId, this.adapter.getChatId(), !!this.currentBinding()] as const;
    return this.retryContinuationTarget ? matchesContinuationTarget(this.retryContinuationTarget, ...scope)
      : matchesProvisionalContinuationTarget(this.provisionalContinuationTarget, ...scope);
  }

  private savedMemoryTarget(): boolean {
    const snapshot = this.appliedSnapshot;
    if (!snapshot?.savedMemory || !this.snapshotToken) return false;
    return matchesContinuationTarget(this.retryContinuationTarget ?? this.provisionalContinuationTarget, snapshot.id, this.snapshotToken,
      snapshot.sourceChatId, this.adapter.getChatId(), !!this.currentBinding()) || !this.retryContinuationTarget && isDeepSeekHome(location.href);
  }

  private async openSavedMemory(scope: string, version: string, worldId?: string) {
    const source = this.resolveSavedMemory(scope, worldId);
    const fromHome = "fromHome" in source;
    const guard = () => {
      this.resolveSavedMemory(scope, worldId);
      if (this.adapter.getDraft().trim()) throw Error("draft-not-empty");
      if (this.state.continuation || this.pendingService || this.preparingService || this.adapter.isGenerating()) throw Error("busy");
    };
    if (this.transferring) throw Error("busy");
    guard();
    this.transferring = true; this.state.transferring = true; this.render();
    try {
      await this.sceneQueue; guard();
      const { snapshot } = await repository.savedMemoryContinuation(source, version);
      guard();
      if (!snapshot) throw Error("handoff-invalid");
      const token = createId("handoff");
      if (!await this.saveTabState({ snapshotId: snapshot.id, snapshotToken: token, retryContinuationTarget: null, continueOnFreshChat: false, continueUntil: null }, { snapshotId: null, continuationKey: continuationKey(null) })) throw Error("handoff-conflict");
      try { guard(); }
      catch (error) { await this.saveTabState({ snapshotId: null, snapshotToken: null }, { snapshotId: snapshot.id, snapshotToken: token }); throw error; }
      if (fromHome) await this.reload();
      else location.assign("https://chat.deepseek.com/");
    } finally { this.transferring = false; this.state.transferring = false; this.render(); }
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
    this.dispatchCaptures.reset();
    this.dispatchReplies.reset();
    if (this.autoContinuePending && !(location.origin === "https://chat.deepseek.com" && location.pathname === "/" && !this.adapter.getChatId())) {
      await this.disarmAutoContinue(true);
    }
    const chatId = this.adapter.getChatId();
    const promoteDraft = !this.previousChatId && !!chatId;
    const nextScene = this.draftScene;
    const nextOverrides = this.draftOverrides;
    // DeepSeek can allocate /a/chat/s/:id before its first completion POST.
    // Keep the queued scene available for that request without promoting the
    // binding/world until the existing accepted-delivery transaction succeeds.
    if (promoteDraft && this.appliedSnapshot && this.snapshotToken && !this.currentBinding()
      && chatId !== this.appliedSnapshot.sourceChatId && nextScene.worldId === memoryWorld(this.appliedSnapshot, this.books)) {
      this.provisionalContinuationTarget = { snapshotId: this.appliedSnapshot.id, snapshotToken: this.snapshotToken, targetChatId: chatId!, expiresAt: Date.now() + 90_000 };
    } else if (this.provisionalContinuationTarget?.targetChatId !== chatId) this.provisionalContinuationTarget = null;
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
    // A queued handoff owns activation. Ordinary draft promotion must not
    // switch ownership before its receipt transaction commits (or after failure).
    if (promoteDraft && !this.currentBinding() && !this.appliedSnapshot) {
      await this.setScene(nextScene);
      const binding = this.currentBinding();
      if (binding) await repository.putIfUnchanged("binding", { ...binding, memoryOverrides: nextOverrides }, binding);
      await this.reload();
    }
  }

  private navigate() {
    if (this.reviewReminderTarget?.chatId !== this.adapter.getChatId()) {
      this.reviewReminderTarget = undefined;
      this.reviewReminder.clear();
    }
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
    if (this.state.promptLength?.url !== location.href) this.state.promptLength = undefined;
    if (this.state.continuationDraft?.url !== location.href) this.state.continuationDraft = undefined;
    this.lastUrl = location.href;
    this.navigationTask = this.navigationTask.catch(() => undefined).then(() => this.handleNavigation());
    void this.navigationTask.catch(() => { this.publishContext(""); });
  }

  private handleBridgeMessage(event: MessageEvent) {
    if (event.source !== window || event.data?.source !== "deeprole-page-bridge") return;
    if (event.data.type === "PROMPT_LENGTH_BLOCKED") {
      const { url, chatId, length, draft, id } = event.data;
      const currentChatId = this.adapter.getChatId();
      if (event.origin !== location.origin || url !== location.href || (currentChatId && chatId && chatId !== currentChatId)
        || !Number.isSafeInteger(length) || length <= DEEPSEEK_PROMPT_CHAR_LIMIT
        || (draft !== null && (typeof draft !== "string" || draft.length > length))) return;
      if (typeof id === "string") this.deliveries.delete(id);
      // DeepSeek can clear the composer before its network call. Preserve a
      // draft typed in the meantime and offer the blocked text for copying.
      if (draft !== null && !this.adapter.getDraft()) this.adapter.setDraft(draft);
      this.state.promptLength = { length, url, draft: draft ?? undefined, restored: draft !== null && this.adapter.getDraft() === draft };
      this.render(); return;
    }
    if (event.data.type === "STRICT_MEMORY_BLOCKED") {
      const savedTransfer = this.savedMemoryTarget();
      if (event.origin !== location.origin || !this.settings.strictMemorySending && !savedTransfer || event.data.url !== location.href
        || event.data.chatId !== this.adapter.getChatId() && !(savedTransfer && isDeepSeekHome(location.href))) return;
      if (typeof event.data.draft === "string" && event.data.draft.length <= 100000 && !this.adapter.getDraft().trim()) this.adapter.setDraft(event.data.draft);
      this.state.warning = storyUpdateText(this.state.locale, "blocked"); this.render(); return;
    }
    if (this.dispatchCaptures.receive(event)) return;
    if (this.dispatchReplies.receive(event)) return;
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
      if (this.state.promptLength && (!this.state.promptLength.draft || this.state.promptLength.restored)) this.state.promptLength = undefined;
      this.pickedSceneChoice = null;
      this.scheduleHistoryRefresh(12_000);
      dismissSceneChoiceCards();
      const { id } = event.data; const initialDraft = event.data.draft as string; const initialUrl = location.href;
      const requestChatId = typeof event.data.chatId === "string" && /^[\w-]{1,120}$/u.test(event.data.chatId) ? event.data.chatId : undefined;
      const parentMessageId = typeof event.data.parentMessageId === "string" && /^[\w-]{1,120}$/u.test(event.data.parentMessageId) ? event.data.parentMessageId : undefined;
      const requestIdentity = validStoryTransportIdentity(event.data.storyIdentity) && event.data.storyIdentity.chatId === requestChatId ? structuredClone(event.data.storyIdentity) : undefined;
      const opening = this.savedMemoryTarget() && requestIdentity?.nativeParentKey === null && requestChatId !== this.appliedSnapshot?.sourceChatId
        ? { snapshot: this.appliedSnapshot, token: this.snapshotToken } : null;
      const preparationStartedAt = Date.now();
      let preparationStage: MemoryPreparationStage = "navigation";
      const prepareContext = async (url: string) => {
        preparationStage = "navigation";
        let draft = initialDraft, storyIdentity = requestIdentity;
        if (this.adapter.getChatId() !== this.previousChatId) this.navigate();
        const navigation = this.navigationTask;
        try { await navigation; }
        finally {
          // Reject THIS send after a failed transition, but do not poison all
          // later sends after the user has repaired/activated the current chat.
          // A newer queued navigation keeps ownership of its own outcome.
          if (this.navigationTask === navigation) this.navigationTask = navigation.catch(() => undefined);
        }
        preparationStage = "scene";
        await this.sceneQueue.catch(() => undefined);
        preparationStage = "recovery";
        await this.replyRecovery.flush();
        await this.recoveryReceiptTask;
        await this.oldChatNoticeReceiptTask;
        // Reuse the page's current library snapshot. Storage changes and chat
        // navigation already schedule reloads; starting another full
        // IndexedDB read for every outgoing message makes large worlds miss
        // the bounded injection handshake. If a refresh is already running,
        // follow its newest task before compiling this request's context.
        preparationStage = "reload";
        let task = this.reloadTask;
        let loaded = await task;
        // A first request can race extension startup before its initial load
        // has been scheduled (for example, immediately after creating a chat).
        if (!loaded && !this.state.pageReady) { task = this.reload(); loaded = await task; }
        // Follow the newest in-flight snapshot instead of starting competing reads.
        for (let attempt = 0; attempt < 5 && (!loaded || task !== this.reloadTask); attempt++) {
          task = this.reloadTask; loaded = await task;
        }
        if (!loaded || location.href !== url) throw new Error("context-changed");
        if (this.pendingContinuationCommit) throw Error("handoff-commit-pending");
        const oldNotice = oldChatNotice(this.currentBinding(), this.snapshots, this.books, this.worlds);
        if (!this.pendingService && requestChatId === this.adapter.getChatId() && !this.sharedGameActive() && oldNotice && (oldNotice.sent || oldNotice.dismissed)) {
          preparationStage = "activation";
          await this.activateGame("resume"); loaded = await this.reload();
          if (!loaded || location.href !== url) throw Error("context-changed");
        }
        // During a handoff the provisional scene supplies context, but the
        // recorder still belongs to the source until the new chat is accepted.
        const bound = this.currentBinding();
        const shared = this.worlds.find(w => w.id === bound?.worldId)?.sharedGame;
        if (!this.pendingService && bound && requestChatId === bound.chatId && shared?.managed && shared.activeBindingId === bound.id && !this.trackedBindings.has(bound.id)) {
          preparationStage = "start";
          await this.storyGame.run("start"); loaded = await this.reload();
          if (!loaded || location.href !== url) throw Error("context-changed");
        }
        // Start at the verified native parent before preparing this user turn.
        // A failed proof leaves the ordinary send and the manual controls available.
        const recordingStarted = storyIdentity && requestChatId === this.adapter.getChatId()
          && await this.startAutomaticRecording(storyIdentity);
        if (location.href !== url) throw Error("context-changed");
        // An ordinary chat (including reply recovery without a bound world)
        // has no managed story head to rewind. Its native parent ID alone
        // must not invoke the game client or reject otherwise valid memory.
        if (!recordingStarted && (storyIdentity || typeof event.data.editNativeKey === "string") && !this.pendingService && this.sharedGameActive() && this.trackedBindings.has(this.currentBinding()?.id ?? "")) {
          preparationStage = "parent";
          const parentScope = this.contextScopeKey(), parentBindingId = this.currentBinding()!.id;
          let synced: import("../core/story-game").StoryGameOutcome;
          for (let attempt = 0; ; attempt++) {
            try {
              synced = await this.storyGame.run(storyIdentity ? "parent" : "edit", storyIdentity?.nativeParentKey ?? event.data.editNativeKey);
              break;
            } catch (error) {
              // A prior checkpoint/profile write can finish before its library
              // notification reaches this tab. The stale-base guard rejects
              // before committing; refresh once, then validate the SAME parent.
              // Never retry a native model send or bypass branch/manual guards.
              if (attempt !== 0 || !(error instanceof Error) || error.message !== "story-review-stale") throw error;
              loaded = await this.reload();
              if (!loaded || location.href !== url || this.contextScopeKey() !== parentScope || this.currentBinding()?.id !== parentBindingId
                || !this.sharedGameActive() || !this.trackedBindings.has(parentBindingId)) throw Error("context-changed");
            }
          }
          if (synced.active && typeof event.data.editNativeKey === "string" && synced.preparedParentKey !== undefined && requestChatId) {
            storyIdentity = { chatId: requestChatId, nativeParentKey: synced.preparedParentKey };
            const prefixes = this.knownUserPrefixes.get(JSON.stringify([this.currentBinding()?.id, event.data.editNativeKey])) ?? [];
            const prefix = prefixes.find(p => draft.startsWith(p));
            if (prefix) draft = draft.slice(prefix.length);
          }
          if (synced.changed) { this.characterScan = null; loaded = await this.reload(); if (!loaded || location.href !== url) throw Error("context-changed"); }
        }
        preparationStage = "policy";
        const generation = this.reloadGeneration;
        const sceneKey = this.contextScopeKey();
        const scene = this.currentScene();
        // A library notification can be delayed/missed while this tab stays
        // open. Never compile a send's mode from that cached world policy:
        // durable capture below reads the saved world too. Read just this
        // record (not the entire lore/history) before creating either prompt
        // or character receipt. Only refresh the policy field; game state
        // continues to use the consistently loaded snapshot above.
        if (scene.worldId && !this.pendingService) {
          const policyScope = this.pageScope();
          const savedWorld = await repository.get<WorldProfile>("world", scene.worldId);
          this.assertScope(policyScope);
          if (!savedWorld || generation !== this.reloadGeneration || sceneKey !== this.contextScopeKey()) throw new Error("context-changed");
          if (this.savedMemoryTarget() && savedWorld.sharedGame?.revision !== this.appliedSnapshot?.sharedGameRevision) throw Error("story-review-stale");
          this.worlds = this.worlds.map(world => world.id === scene.worldId ? { ...world, bracketedOoc: savedWorld.bracketedOoc === true } : world);
        }
        const currentChatId = this.adapter.getChatId();
        // An API request to another existing chat must not receive this page's lore.
        if (requestChatId && currentChatId && requestChatId !== currentChatId) throw new Error("context-changed");
        if (this.savedMemoryTarget() && (storyIdentity?.nativeParentKey !== null || storyIdentity.chatId === this.appliedSnapshot?.sourceChatId
          || this.bindings.some(binding => binding.chatId === storyIdentity.chatId)
          || this.retryContinuationTarget && storyIdentity.chatId !== this.retryContinuationTarget.targetChatId)) throw Error("context-changed");
        const characterChatId = currentChatId ?? (location.pathname === "/" ? requestChatId : undefined);
        const snapshot = this.appliedSnapshot && memoryWorld(this.appliedSnapshot, this.books) === scene.worldId ? this.appliedSnapshot : null;
        const delivery: ContextDelivery = {
          targetChatId: characterChatId,
          storyIdentity,
          scope: this.pageScope(), scopeKey: sceneKey,
          snapshot,
          originalDraft: snapshot ? initialDraft : undefined,
          snapshotToken: this.snapshotToken, createdAt: Date.now(),
        };
        const reply = this.settings.replyRecoveryEnabled !== false && !this.adapter.isAuthenticationPage() && currentChatId && requestChatId === currentChatId
          ? pendingRecoveredReply(this.currentBinding()?.recoveredReplies ?? [], parentMessageId) : undefined;
        const recoveryContext = reply ? recoveredReplyContext(reply) : "";
        const notice = !this.pendingService && currentChatId && requestChatId === currentChatId ? oldChatNotice(this.currentBinding(), this.snapshots, this.books, this.worlds) : null;
        const reminder = notice && !notice.sent && !notice.dismissed ? oldChatNoticePrompt(notice, this.state.locale) : "";
        // Count the whole validated recovered reply in required memory, not
        // an unmetered suffix. Keep the request-specific result across awaits.
        preparationStage = "compile";
        const openingWorld = this.worlds.find(world => world.id === scene.worldId), openingBinding = this.currentBinding();
        const opening = !snapshot && !this.pendingService && !reminder && !!openingBinding && !!openingWorld?.storyAutomation
          && openingWorld.storyAutomation.mode !== "off" && openingWorld.sharedGame?.activeBindingId === openingBinding.id
          && !openingWorld.sharedGame.managed && !this.trackedBindings.has(openingBinding.id)
          && storyIdentity?.nativeParentKey === null && storyIdentity.chatId === openingBinding.chatId && !fieldHistoryAnchor(document, true)
          && openingBinding.nextStoryMessageMode !== "out-of-character" && !explicitOutOfCharacter(draft, openingWorld.bracketedOoc === true)
          && (event.data.captureTransport === "xhr" || event.data.captureTransport === "fetch");
        const normalContext = await this.updateContext(draft, id, characterChatId, recoveryContext, opening);
        const context = reminder || normalContext;
        if (reminder && notice) delivery.oldChatNotice = { chatId: currentChatId!, chatUrl: url, worldId: scene.worldId, snapshotId: notice.snapshotId, targetChatId: notice.targetChatId, mode: "sent" };
        if (reply && recoveryContext && !reminder) delivery.recoveredReply = { chatId: currentChatId!, chatUrl: url, reply };
        preparationStage = "vault";
        if (await repository.isLocked()) { this.publishContext(""); throw new Error("vault-locked"); }
        this.assertScope(delivery.scope);
        if (generation !== this.reloadGeneration || sceneKey !== this.contextScopeKey()) throw new Error("context-changed");
        const oversizedLength = assembledPromptLength(draft, context);
        if (oversizedLength > DEEPSEEK_PROMPT_CHAR_LIMIT) {
          await this.retainContinuationTarget(delivery, true);
          window.postMessage({ source: "deeprole-extension", type: "CONTEXT_READY", id, ok: true, oversizedLength, ...(delivery.snapshot ? { continuation: true, url } : {}), ...(draft !== initialDraft ? { replacementDraft: draft } : {}) }, location.origin);
          return;
        }
        const retry = this.retryContinuationTarget;
        if (snapshot?.savedMemory && retry?.returnHomeAfterLengthBlock) {
          // A retry that may reach DeepSeek is only recoverable at its exact ID.
          const target = { snapshotId: retry.snapshotId, snapshotToken: retry.snapshotToken, targetChatId: retry.targetChatId };
          if (!await this.saveTabState({ retryContinuationTarget: target }, {
            snapshotId: retry.snapshotId, snapshotToken: retry.snapshotToken, retryContinuationTarget: retry, continuationReceipt: null,
          })) throw Error("context-changed");
          if (this.retryContinuationTarget === retry) this.retryContinuationTarget = target;
        }
        if (!reminder && !explicitOutOfCharacter(draft,this.worlds.find(w=>w.id===scene.worldId)?.bracketedOoc===true) && this.currentBinding()?.nextStoryMessageMode !== "out-of-character" && scene.worldId && characterChatId && this.settings.characterSheetsEnabled && !this.state.vaultLocked) {
          const entities = this.entities.filter(e => e.worldId === scene.worldId && e.kind === "character" && characterInChat(e, characterChatId));
          const characterScene = this.currentBinding()?.characterScenes?.[scene.worldId] ?? this.worlds.find(w => w.id === scene.worldId)?.sharedGame?.scene ?? handoffCharacterScene(this.appliedSnapshot, scene.worldId);
          delivery.characterRequest = { id, worldId: scene.worldId, chatId: characterChatId, base: characterRevision(entities, characterScene), createdAt: Date.now(), accepted: false, generatedSelfiesEnabled: !this.pendingService && this.imageSettings.enabled && isSelfieRequest(draft), relationshipsEnabled: !this.pendingService && this.settings.relationshipsEnabled !== false && this.worlds.find(w => w.id === scene.worldId)?.relationshipsEnabled !== false };
          if (storyIdentity) delivery.characterRequest.storyIdentity = storyIdentity;
          if (!await this.saveTabState({ characterRequest: delivery.characterRequest })) throw new Error("context-changed");
        }
        this.assertScope(delivery.scope);
        if (generation !== this.reloadGeneration || sceneKey !== this.contextScopeKey()) throw new Error("context-changed");
        for (const [key, value] of this.deliveries) if (Date.now() - value.createdAt > 10 * 60 * 1000 || this.deliveries.size >= 64) this.deliveries.delete(key);
        this.deliveries.set(id, delivery);
        const binding = this.currentBinding();
        preparationStage = "capture";
        const capture = storyIdentity && binding && scene.worldId && binding.worldId === scene.worldId && !this.pendingService
          && (event.data.captureTransport === "xhr" || event.data.captureTransport === "fetch")
          ? await this.dispatchCaptures.prepare({ id, worldId: scene.worldId, bindingId: binding.id, identity: storyIdentity, transport: event.data.captureTransport,
            sceneRevision: binding.characterScenes?.[scene.worldId]?.revision ?? null, originalDraft: draft, proposedContext: context, ...(opening ? { opening: true } : {}) }) : false;
        this.assertScope(delivery.scope);
        if (generation !== this.reloadGeneration || sceneKey !== this.contextScopeKey()) throw new Error("context-changed");
        window.postMessage({ source: "deeprole-extension", type: "CONTEXT_READY", id, ok: true, context, ...(delivery.snapshot ? { continuation: true, url } : {}), ...(capture ? { capture: true } : {}), ...(draft !== initialDraft ? { replacementDraft: draft } : {}), ...(typeof event.data.editNativeKey === "string" && storyIdentity ? { preparedIdentity: storyIdentity } : {}) }, "*");
        this.maybeWarnContext();
      };
      void prepareContext(initialUrl).catch(async (error: unknown) => {
        // Native navigation can allocate the first chat while context is being read.
        // Reprepare the same draft once. No model request has been made yet.
        const url = location.href;
        if (!opening || !requestChatId || !isDeepSeekFirstChatRoute(initialUrl, url, requestChatId)
          || this.appliedSnapshot?.id !== opening.snapshot?.id || this.snapshotToken !== opening.token || this.currentBinding()
          || !(error instanceof Error) || !["context-changed", "scene-changed"].includes(error.message)) throw error;
        this.deliveries.delete(id);
        await prepareContext(url);
      }).catch(error => {
        this.deliveries.delete(id);
        reportMemoryPreparationFailure(preparationStage, error, preparationStartedAt);
        if (error instanceof Error && error.message.startsWith("story-")) { this.state.warning = storyReviewText(this.state.locale, storyReviewError(error)); this.render(); }
        window.postMessage({ source: "deeprole-extension", type: "CONTEXT_READY", id, ok: false }, location.origin);
      });
      return;
    }
    if (event.data.type !== "INJECTION_STATUS" || event.origin !== location.origin) return;
    const delivery = this.deliveries.get(event.data.id);
    this.deliveries.delete(event.data.id);
    if (delivery?.snapshot) {
      const { link } = event.data;
      const target = this.adapter.getChatId();
      const current = this.appliedSnapshot?.id === delivery.snapshot.id && this.snapshotToken === delivery.snapshotToken
        && !this.state.vaultLocked && (target ? target === delivery.targetChatId : location.pathname === "/");
      if (!current) {
        console.debug("[DeepRole continuation]", "scope-changed");
        return;
      }
      if (event.data.reason === "continuation-unconfirmed") {
        void this.showUnconfirmedContinuation(delivery);
        return;
      }
      if (event.data.ok && (!delivery.storyIdentity || !validNativeStoryRequestLink(link) || link.requestId !== event.data.id
        || link.chatId !== delivery.targetChatId || link.chatId !== delivery.storyIdentity.chatId || link.nativeParentKey !== delivery.storyIdentity.nativeParentKey)) {
        console.debug("[DeepRole continuation]", "link-mismatch");
        return;
      }
      if (event.data.ok) this.state.continuationDraft = undefined;
    }
    if (event.data.ok && delivery) {
      if (delivery.oldChatNotice) {
        const edit = delivery.oldChatNotice;
        this.oldChatNoticeReceiptTask = this.oldChatNoticeReceiptTask.then(() => repository.acknowledgeOldChatNotice(edit))
          .then(async () => { if (delivery.scope.url === location.href) await this.reload(); }).catch(() => undefined);
      }
      if (delivery.recoveredReply) {
        const edit = delivery.recoveredReply;
        this.recoveryReceiptTask = this.recoveryReceiptTask.then(() => repository.acknowledgeRecoveredReply(edit))
          .then(async () => { if (delivery.scope.url === location.href) await this.reload(); }).catch(() => undefined);
      }
      if (delivery.characterRequest) {
        const receipt = { ...delivery.characterRequest, accepted: true };
        if (Number.isInteger(event.data.httpStatus) && event.data.httpStatus >= 200 && event.data.httpStatus < 300) receipt.httpStatus = event.data.httpStatus;
        this.characterReceiptTask = this.saveTabState({ characterRequest: receipt }, { characterRequestId: delivery.characterRequest.id }).then(ok => { if (ok) { this.characterReceipt = receipt; this.characterScan = null; this.scheduleScan(); } }).catch(() => undefined);
      }
      if (delivery.scope.url === location.href && delivery.scopeKey === this.contextScopeKey()) this.state.warning = "";
      void this.acknowledgeDelivery(delivery).catch(async () => {
        // The accepted model request must not be replayed to retry a local write.
        if (delivery.snapshot) console.debug("[DeepRole continuation]", "commit-failed");
        await this.reload().catch(() => undefined);
        // Session storage can fail before it saves the receipt. Keep the
        // accepted target in this page too, but never resurrect a newer token.
        const receipt = matchingContinuationReceipt({ snapshotId: delivery.snapshot?.id, snapshotToken: delivery.snapshotToken, targetChatId: delivery.targetChatId ?? this.adapter.getChatId() }, this.appliedSnapshot?.id, this.snapshotToken, this.adapter.getChatId(), location.origin === "https://chat.deepseek.com" && location.pathname === "/");
        if (receipt) { this.pendingContinuationCommit = receipt; this.state.continuationCommitPending = true; this.state.pendingHandoff = undefined; await this.updateContext().catch(() => this.render()); }
      });
    } else if (!event.data.ok && event.data.url === location.href && (this.selection.entries.length > 0 || this.appliedSnapshot)) {
      this.state.warning = this.injectionWarning(event.data.reason);
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

  private async retainContinuationTarget(delivery: ContextDelivery, lengthBlocked = false) {
    const { snapshot, snapshotToken, storyIdentity, targetChatId } = delivery;
    const scope = this.pageScope();
    if (this.retryContinuationTarget || !snapshot?.savedMemory || !snapshotToken || !targetChatId || scope.chatId !== targetChatId
      || storyIdentity?.chatId !== targetChatId || storyIdentity.nativeParentKey !== null || !this.savedMemoryTarget()) return;
    const target: ContinuationTarget = { snapshotId: snapshot.id, snapshotToken, targetChatId, ...(lengthBlocked ? { returnHomeAfterLengthBlock: true } : {}) };
    const retained = await this.saveTabState({ retryContinuationTarget: target }, { snapshotId: snapshot.id, snapshotToken, retryContinuationTarget: null, continuationReceipt: null }).catch(() => false);
    if (retained && scope.url === location.href && this.appliedSnapshot?.id === snapshot.id && this.snapshotToken === snapshotToken) this.retryContinuationTarget = target;
  }

  private async showUnconfirmedContinuation(delivery: ContextDelivery) {
    const { snapshot, snapshotToken } = delivery;
    if (!snapshot) return;
    const scope = this.pageScope();
    await this.retainContinuationTarget(delivery);
    if (scope.url !== location.href || this.state.vaultLocked || this.appliedSnapshot?.id !== snapshot.id || this.snapshotToken !== snapshotToken) return;
    if (delivery.originalDraft) {
      this.state.continuationDraft = { url: scope.url, draft: delivery.originalDraft };
      this.render();
    } else this.showToast(continuationText(this.state.locale, "sendUnconfirmed"));
  }

  private async acknowledgeDelivery(delivery: ContextDelivery) {
    const snapshot = delivery.snapshot;
    if (!snapshot) return;
    const targetChatId = delivery.targetChatId ?? this.adapter.getChatId();
    if (!targetChatId) return; // Never discard exact progress before a target branch exists.
    const cleared = await repository.completeContinuation(snapshot, delivery.snapshotToken, targetChatId);
    console.debug("[DeepRole continuation]", cleared ? "commit-done" : "commit-unmatched");
    if (cleared && this.appliedSnapshot?.id === snapshot.id && this.snapshotToken === delivery.snapshotToken) {
      // Load the committed target before removing its in-memory handoff fallback.
      this.bindings = await repository.list<ChatBinding>("binding");
      this.appliedSnapshot = null; this.snapshotToken = null;
      this.retryContinuationTarget = null;
      await this.updateContext();
    }
  }

  private async retryContinuationCommit(automatic?: ContinuationReceipt) {
    const receipt = this.pendingContinuationCommit, snapshot = this.appliedSnapshot;
    if (this.state.continuationCommitRunning || !receipt || !snapshot || snapshot.id !== receipt.snapshotId || this.snapshotToken !== receipt.snapshotToken || this.state.vaultLocked) return;
    if (automatic) {
      const key = JSON.stringify([receipt.snapshotId, receipt.snapshotToken, receipt.targetChatId]);
      if (receipt !== automatic || this.adapter.getChatId() !== receipt.targetChatId || this.attemptedContinuationCommit === key) return;
      this.attemptedContinuationCommit = key;
    }
    this.state.continuationCommitRunning = true;
    this.render();
    try {
      if (!await repository.completeContinuation(snapshot, receipt.snapshotToken, receipt.targetChatId, automatic ? true : undefined)) throw Error("handoff-conflict");
      await this.reload();
    } catch { if (!automatic) this.showToast(continuationText(this.state.locale, "commitFailed")); }
    finally { this.state.continuationCommitRunning = false; this.render(); }
  }

  private async handleRuntimeMessage(message: DeepRoleMessage): Promise<unknown> {
    if (message.type === "DR_MEMORY_BATCH_IDLE") return { ok: message.worldId === this.currentScene().worldId && message.chatId === this.adapter.getChatId() && !this.state.vaultLocked && !this.adapter.isGenerating() && !this.adapter.getDraft().trim() && !this.preparingService && !this.pendingService && !this.fieldPreparing };
    if (message.type === "DR_MEMORY_BATCH") {
      try {
        if (message.input?.worldId !== this.currentScene().worldId || message.input?.chatId !== this.adapter.getChatId()) throw Error("scene-changed");
        if (message.action === "cancel") { if (this.memoryBatchRunning) this.characterDiscoveryAbort?.abort(); return await browser.runtime.sendMessage({ type: "DR_FIELD", action: "memory-batch-cancel", input: message.input }); }
        if (message.action === "run") { await this.startMemoryBatch(message.input); return { ok: true }; }
        const result = await browser.runtime.sendMessage(message.action === "policy" ? { type: "DR_FIELD", action: "memory-batch-policy", input: message.input, mode: message.mode } : { type: "DR_FIELD", action: "memory-batch-status", input: message.input });
        if (message.action === "policy" && result?.ok) { await this.reload(); this.scheduleScan(); }
        return result;
      } catch { return { ok: false, error: "memory-batch-stopped" }; }
    }
    if (message.type === "DR_STORY_MERGE") {
      try {
        const chatId = this.adapter.getChatId(), worldId = this.currentScene().worldId, url = location.href;
        if (!chatId || !worldId || message.input?.chatId !== chatId || message.input?.worldId !== worldId) throw Error("story-binding-conflict");
        if (message.action !== "read" && (this.characterDiscoveryTask || this.adapter.isGenerating() || this.pendingService)) throw Error("story-checkpoint-busy");
        const data = message.action === "read" ? await repository.readStoryMerge(message.input, url) : message.action === "approve" ? await repository.approveStoryMerge(message.input, url) : await repository.undoStoryMerge(message.input, url);
        if (message.action !== "read") await this.reload();
        if (location.href !== url || chatId !== this.adapter.getChatId() || worldId !== this.currentScene().worldId) throw Error("story-binding-conflict");
        return { ok: true, data };
      } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "story-review-invalid" }; }
    }
    if (message.type === "DR_STORY_IDENTITIES") {
      try {
        const chatId = this.adapter.getChatId(), worldId = this.currentScene().worldId, url = location.href;
        if (!chatId || !worldId || message.input?.chatId !== chatId || message.input?.worldId !== worldId) throw Error("story-binding-conflict");
        if (message.action === "approve" && (this.characterDiscoveryTask || this.adapter.isGenerating() || this.pendingService)) throw Error("story-checkpoint-busy");
        const data = message.action === "read" ? await repository.readStoryIdentities(message.input, url) : await repository.approveStoryIdentity(message.input, url);
        if (message.action === "approve") await this.reload();
        if (location.href !== url || chatId !== this.adapter.getChatId() || worldId !== this.currentScene().worldId) throw Error("story-binding-conflict");
        return { ok: true, data };
      } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "story-review-invalid" }; }
    }
    if (message.type === "DR_STORY_PROFILE") {
      try {
        const chatId = this.adapter.getChatId(), worldId = this.currentScene().worldId, url = location.href;
        if (!chatId || !worldId || message.input?.chatId !== chatId || message.input?.worldId !== worldId) throw Error("story-binding-conflict");
        if (message.action === "cancel") { this.characterDiscoveryAbort?.abort(); return { ok: true, data: { cancelled: true } }; }
        if (message.action === "prepare") return { ok: true, data: await this.prepareStorySupplement(message.input) };
        let result: { applied: number; skipped: import("../core/character-profile").ProfileField[] } | undefined, entityId: string | null = null;
        if (message.action === "approve") {
          if (this.characterDiscoveryTask || this.adapter.isGenerating() || this.pendingService) throw Error("story-checkpoint-busy");
          await this.storyGame.run(); const receipt = await repository.approveProfileSupplement(message.input, url); result = receipt; entityId = receipt.entityId; await this.reload();
        }
        const data = await repository.readProfileSupplements(message.action === "read" ? message.input : { chatId, worldId, query: "", offset: 0, entityId }, url);
        if (location.href !== url || chatId !== this.adapter.getChatId() || worldId !== this.currentScene().worldId) throw Error("story-binding-conflict");
        return { ok: true, data: { ...data, ...(result ? { result: { applied: result.applied, skipped: result.skipped } } : {}) } };
      } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "story-review-invalid" }; }
    }
    if (message.type === "DR_CHARACTER_DISCOVERY") {
      try {
        const chatId = this.adapter.getChatId(), worldId = this.currentScene().worldId, url = location.href;
        if (!chatId || !worldId || message.input?.chatId !== chatId || message.input?.worldId !== worldId) throw Error("story-binding-conflict");
        if (message.action === "cancel") { this.characterDiscoveryAbort?.abort(); return { ok: true, data: { cancelled: true } }; }
        if (message.action === "run" || message.action === "profile" || message.action === "queue") return { ok: true, data: await this.searchStoryCharacters(message.input) };
        if (message.action === "approve") { if (this.characterDiscoveryTask || this.adapter.isGenerating() || this.pendingService) throw Error("story-checkpoint-busy"); await this.storyGame.run(); await repository.approveCharacterDiscovery(message.input, url); await this.reload(); }
        const data = await repository.readCharacterDiscovery(message.action === "read" ? message.input : { chatId, worldId, offset: 0 }, url);
        if (location.href !== url || chatId !== this.adapter.getChatId() || worldId !== this.currentScene().worldId) throw Error("story-binding-conflict");
        return { ok: true, data };
      } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "story-review-invalid" }; }
    }
    if (message.type === "DR_STORY_REPAIR") {
      try { if (message.cancel) this.metadataRepairAbort?.abort(); else await this.startMetadataRepair(message.input); return { ok: true, data: { active: true, changed: true } }; }
      catch (error) { return { ok: false, error: error instanceof Error ? error.message : "request-failed" }; }
    }
    if (message.type === "DR_AUTOMATION_READ" || message.type === "DR_AUTOMATION_RESOLVE") {
      try {
        const url = location.href;
        if (message.input.chatId !== this.adapter.getChatId() || message.input.worldId !== this.currentScene().worldId) throw Error("story-binding-conflict");
        if (message.type === "DR_AUTOMATION_RESOLVE" && (this.adapter.isGenerating() || this.pendingService)) throw Error("story-checkpoint-busy");
        if (message.type === "DR_AUTOMATION_RESOLVE") await this.storyGame.run();
        const data = message.type === "DR_AUTOMATION_READ" ? await repository.readAutomationReview(message.input,url) : await repository.resolveAutomationReview(message.input,url);
        if (url !== location.href) throw Error("story-binding-conflict");
        if (message.type === "DR_AUTOMATION_RESOLVE") await this.reload();
        return { ok: true, data };
      } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "story-review-invalid" }; }
    }
    if (message.type === "DR_STORY_FACT") {
      try { await this.storyGame.run(); const data = await repository.approveStoryFact(message.input, location.href); await this.reload(); return { ok: true, data }; }
      catch (error) { return { ok: false, error: error instanceof Error ? error.message : "story-review-invalid" }; }
    }
    if (message.type === "DR_RESUME_WORLD_GAME") {
      try {
        if (message.chatId !== this.adapter.getChatId() || message.worldId !== this.currentScene().worldId || this.pendingService || this.adapter.isGenerating()) throw Error("story-binding-conflict");
        await this.reload(); await this.activateGame("resume"); this.characterScan = null; this.scheduleScan(); return { ok: true };
      } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "story-game-inactive" }; }
    }
    if (message.type === "DR_STORY_GAME") {
      try {
        if (this.pendingService || this.adapter.isGenerating()) throw Error("story-checkpoint-busy");
        const storyUrl = location.href;
        await this.reload();
        const scope = this.currentScene();
        if (message.scope && (location.href !== storyUrl || message.scope.worldId !== scope.worldId || message.scope.chatId !== this.adapter.getChatId())) throw Error("story-binding-conflict");
        if (message.expectedBase !== undefined && (message.operation !== "reset" || typeof message.expectedBase !== "string" || !message.expectedBase || message.expectedBase.length > 160)) throw Error("story-game-invalid");
        const data = message.operation === "out-of-character" ? await repository.markNonStoryMessage(this.adapter.getChatId()!, scope.worldId!, location.href) : await this.storyGame.run(message.operation === "sync" ? "resume" : message.operation, null, message.manual, message.expectedBase);
        if (message.operation === "out-of-character") this.state.warning = "marked" in data && data.marked ? storyReviewText(this.state.locale, "nonStoryOn") : "";
        await this.reload(); this.characterScan = null; this.scheduleScan();
        if (message.operation !== "out-of-character") this.state.warning = message.operation === "undo" ? storyReviewText(this.state.locale, "paused") : "";
        return { ok: true, data };
      } catch (error) { this.state.warning = storyReviewText(this.state.locale, storyReviewError(error)); this.render(); return { ok: false, error: error instanceof Error ? error.message : "story-game-invalid" }; }
    }
    if (message.type === "DR_STORY_REVIEW_READ" || message.type === "DR_STORY_REVIEW_PREVIEW") {
      const chatId = this.adapter.getChatId(), worldId = this.currentScene().worldId, url = location.href;
      if (!chatId || !worldId) return { ok: false, error: "story-checkpoint-no-scope" };
      if (this.state.vaultLocked) return { ok: false, error: "vault-locked" };
      if (this.adapter.isGenerating() || this.pendingService) return { ok: false, error: "story-checkpoint-busy" };
      try {
        if (message.type === "DR_STORY_REVIEW_PREVIEW" && (message.input?.chatId !== chatId || message.input?.worldId !== worldId)) throw Error("story-binding-conflict");
        const data = message.type === "DR_STORY_REVIEW_READ" ? await repository.readStoryReview({ chatId, worldId, cursor: message.cursor }, url) : await repository.previewStoryReview(message.input, url);
        if (location.href !== url || this.adapter.getChatId() !== chatId || this.currentScene().worldId !== worldId || this.state.vaultLocked) throw Error("story-binding-conflict");
        return { ok: true, data };
      } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "story-review-invalid" }; }
    }
    if (message.type === "DR_STORY_CHECKPOINT_READ" || message.type === "DR_STORY_CHECKPOINT_SAVE") {
      const chatId = this.adapter.getChatId(), worldId = this.currentScene().worldId, url = location.href;
      if (!chatId || !worldId) return { ok: false, error: "story-checkpoint-no-scope" };
      if (this.state.vaultLocked) return { ok: false, error: "vault-locked" };
      if (this.adapter.isGenerating() || this.pendingService) return { ok: false, error: "story-checkpoint-busy" };
      try {
        if (message.type === "DR_STORY_CHECKPOINT_SAVE" && (message.choice?.chatId !== chatId || message.choice?.worldId !== worldId)) throw Error("story-binding-conflict");
        const data = message.type === "DR_STORY_CHECKPOINT_READ" ? await repository.readStoryCheckpoint({ chatId, worldId }, url) : await repository.saveStoryCheckpoint(message.choice, url);
        if (location.href !== url || this.adapter.getChatId() !== chatId || this.currentScene().worldId !== worldId || this.state.vaultLocked) throw Error("story-binding-conflict");
        return { ok: true, data };
      } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "story-checkpoint-failed" }; }
    }
    if (message.type === "DR_STORY_DIAGNOSTICS") return this.storyDiagnostics.check();
    if (message.type === "DR_GET_PAGE_STATE") {
      const status = this.adapter.getStatus();
      return {
        type: "DR_PAGE_STATE",
        chatId: this.adapter.getChatId(),
        chatUrl: location.href,
        messageCount: this.adapter.getMessageCount(),
        status,
        scene: this.currentScene(),
        selection: this.selection, overrides: this.overrides(), memoryDelivery: this.memoryDelivery(),
        pendingHandoff: this.state.pendingHandoff,
        savedMemory: this.savedMemoryTransferState(status.reason === "authentication-page"), savedMemoryQueued: this.savedMemoryTarget(),
        activity: this.currentActivity(), generating: this.adapter.isGenerating(), warning: this.state.warning,
      } satisfies DeepRoleMessage;
    }
    if (message.type === "DR_RUN_SERVICE") return this.runService(message.request);
    if (message.type === "DR_CONTINUE_STORY") return this.continueStory();
    if (message.type === "DR_SAVED_MEMORY_PREVIEW" || message.type === "DR_SAVED_MEMORY_OPEN") {
      try {
        if (message.type === "DR_SAVED_MEMORY_PREVIEW") return { ok: true, preview: await this.previewSavedMemory(message.scope, message.worldId) };
        await this.openSavedMemory(message.scope, message.version, message.worldId);
        return { ok: true };
      } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "handoff-failed" }; }
    }
    if (message.type === "DR_MEMORY_OVERRIDE") { try { await this.overrideMemory(message.id, message.action); return { ok: true }; } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "failed" }; } }
    if (message.type === "DR_SET_SCENE") { try { await this.setScene(message.scene, message.importTarget); return { ok: true }; } catch { return { ok: false }; } }
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

  private injectionWarning(reason: unknown): string {
    const key: MessageKey = reason === "context-timeout" || reason === "context-unavailable" ? "memoryInjectWait"
      : reason === "page-changed" ? "memoryInjectPageChanged"
      : reason === "unsupported-request-shape" || reason === "invalid-json" || reason === "invalid-request" ? "memoryInjectUnsupported"
      : reason === "memory-already-present" ? "memoryInjectAlreadyPresent"
      : reason === "synchronous-request" ? "memoryInjectSync"
      : "memoryInjectFailed";
    return this.t(key);
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
