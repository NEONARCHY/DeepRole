import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { BrainCircuit } from "lucide-react";
import { translate } from "../../core/i18n";
import type { ContextSelection, ConversationEstimate, HandoffSnapshot, MemoryEntry } from "../../core/types";
import { SectionGuide, HelpLocale } from "../shared/Help";
import { SceneControls } from "../shared/SceneControls";
import { EMPTY_SCENE } from "../../core/scene";
import type { MemoryBook, SceneEntity, SceneState, WorldProfile } from "../../core/types";
import type { ActivationMode, MemoryProposalBatch, MemoryCandidate, LoreChange, MemoryOverrides } from "../../core/types";
import { assistantText } from "../../core/assistant-i18n";
import { MemoryReview, QuickMemory } from "../shared/MemoryAssistant";
import { TooltipButton } from "../shared/TooltipButton";
import { ServiceProgress } from "../shared/MemoryStatus";
import { experienceText } from "../../core/experience-i18n";
import { sceneChoiceText } from "../../core/scene-choices";
import { selectionReason, type ServiceActivity } from "../../core/memory-experience";
import { CharacterPanel } from "../shared/CharacterSheets";
import type { CharacterEdit } from "../../storage/characters";
import type { CharacterScene } from "../../core/types";
import type { CharacterCopyKey } from "../../core/characters";

export interface WidgetState {
  characters?: { worldId: string; chatId: string; base: string; entities: SceneEntity[]; scene?: CharacterScene; emotions: string[]; status: CharacterCopyKey; openId?: string | null };
  pageReady: boolean;
  pendingHandoff?: string;
  activity?: ServiceActivity | null;
  generating?: boolean;
  sceneChoicesEnabled?: boolean;
  showChatContextMeter?: boolean;
  showMemoryContextIndicator?: boolean;
  vaultLocked: boolean;
  proposals?: MemoryProposalBatch[];
  reviewProposalId?: string | null;
  lastChange?: LoreChange | null;
  overrides?: MemoryOverrides;
  worlds?: WorldProfile[];
  entities?: SceneEntity[];
  books?: MemoryBook[];
  scene?: SceneState;
  locale: "ru" | "en";
  selection: ContextSelection;
  warning: string;
  contextText: string;
  selectionText: string;
  selectionPosition: { x: number; y: number } | null;
  contextPosition: { x: number; y: number } | null;
  canAnalyzeChat: boolean;
  analysisSuggested: boolean;
  handoffOffer: HandoffSnapshot | null;
  conversationEstimate?: ConversationEstimate | null;
  toast: string;
  availableEntries: MemoryEntry[];
}

export function PageWidget(props: {
  state: WidgetState;
  onSaveCharacter?: (edit: Omit<CharacterEdit, "chatUrl">) => Promise<void>;
  onRetryCharacters?: () => void;
  onCharacterOpened?: () => void;
  authenticationPage?: boolean;
  composerActionPosition?: { x: number; y: number } | null;
  onToggleEntry: (entry: MemoryEntry, included: boolean) => void;
  onAttachEntry: (entry: MemoryEntry) => void;
  onCopyContext: () => void;
  onAnalyze: () => void;
  onDismissSuggestion: () => void;
  onSaveSelection: () => void;
  onApplyHandoff: () => void;
  onDismissHandoff: () => void;
  onContextPositionChange: (position: { x: number; y: number }) => void;
  menuUrl: string;
  onSceneChange?: (scene: SceneState) => void | Promise<boolean>;
  onSceneChoicesToggle?: () => void;
  onResetEntry?: (id: string) => void;
  onQuickSave?: (text: string, mode: ActivationMode, title: string) => Promise<void>;
  onDraftLore?: (brief: string) => Promise<void>;
  onReview?: (batch: MemoryProposalBatch, items: MemoryCandidate[]) => Promise<void>;
  onDiscard?: (id: string) => Promise<void>;
  onReviewClose?: () => void;
  onUndo?: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [attachQuery, setAttachQuery] = useState("");
  const [quick, setQuick] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [undoError, setUndoError] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mapLayout, setMapLayout] = useState<"closed" | "compact" | "full">("closed");
  const menuFrame = useRef<HTMLIFrameElement>(null);
  const contextAnchor = useRef<HTMLDivElement>(null);
  const [panelBounds, setPanelBounds] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const [contextPosition, setContextPosition] = useState(props.state.contextPosition);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; width: number; height: number; moved: boolean } | null>(null);
  const suppressContextClick = useRef(false);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (mapLayout !== "closed") menuFrame.current?.contentWindow?.postMessage({ source: "deeprole-page", type: "CLOSE_MAP" }, "*");
      else setMenuOpen(false);
    };
    const closeFromMenu = (event: MessageEvent) => {
      if (event.source !== menuFrame.current?.contentWindow) return;
      // Extension iframes have a different origin from DeepSeek. Browser extension
      // MessageEvents may expose an opaque origin; the exact frame is mandatory.
      const menuUrl = new URL(props.menuUrl, location.href);
      const menuOrigin = menuUrl.origin === "null" ? `${menuUrl.protocol}//${menuUrl.host}` : menuUrl.origin;
      if (event.origin !== menuOrigin && event.origin !== "null") return;
      if (event.data?.source === "deeprole-menu" && event.data.type === "CLOSE") { setMenuOpen(false); setMapLayout("closed"); }
      if (event.data?.source === "deeprole-menu" && event.data.type === "MAP_LAYOUT" && ["closed", "compact", "full"].includes(event.data.mode)) setMapLayout(event.data.mode);
    };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("message", closeFromMenu);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("message", closeFromMenu);
    };
  }, [menuOpen, props.menuUrl, mapLayout]);
  useEffect(() => { if (!menuOpen) setMapLayout("closed"); }, [menuOpen]);
  useEffect(() => {
    if (!props.state.vaultLocked) return;
    setOpen(false); setAdding(false); setQuick(false); setReviewId(null); setUndoError(false); setMapLayout("closed");
  }, [props.state.vaultLocked]);
  useEffect(() => setContextPosition(props.state.contextPosition), [props.state.contextPosition?.x, props.state.contextPosition?.y]);
  useEffect(() => {
    const keepVisible = () => setContextPosition((current) => {
      if (!current || !contextAnchor.current) return current;
      const rect = contextAnchor.current.getBoundingClientRect();
      const next = clampPosition(current, rect.width, rect.height);
      return next.x === current.x && next.y === current.y ? current : next;
    });
    const observer = new ResizeObserver(keepVisible);
    if (contextAnchor.current) observer.observe(contextAnchor.current);
    window.addEventListener("resize", keepVisible);
    keepVisible();
    return () => { observer.disconnect(); window.removeEventListener("resize", keepVisible); };
  }, [props.state.contextPosition?.x, props.state.contextPosition?.y]);
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(props.state.locale, key, vars);
  const count = props.state.selection.entries.length;
  const at = (key: Parameters<typeof assistantText>[1]) => assistantText(props.state.locale, key);
  const x = (key: Parameters<typeof experienceText>[1], vars?: Record<string, string | number>) => experienceText(props.state.locale, key, vars);
  const chatEstimate = props.state.conversationEstimate;
  const chatEstimatePercent = chatEstimate ? Math.max(0, Math.min(100, chatEstimate.estimatedTokens / DEEPSEEK_WEB_CONTEXT_LIMIT * 100)) : 0;
  const chatRemaining = chatEstimate ? Math.max(0, DEEPSEEK_WEB_CONTEXT_LIMIT - chatEstimate.estimatedTokens) : 0;
  const chatMeterState = chatEstimatePercent >= 90 ? "is-critical" : chatEstimatePercent >= 75 ? "is-low" : chatEstimatePercent >= 50 ? "is-mid" : "is-roomy";
  const serviceBusy = props.state.activity?.phase === "preparing" || props.state.activity?.phase === "waiting";
  const analysisBlocked = serviceBusy || !!props.state.generating || !props.state.canAnalyzeChat;
  const proposals = props.state.proposals ?? [];
  const review = proposals.find((batch) => batch.id === reviewId);
  const assistantOpen = Boolean((quick && props.onQuickSave && props.onDraftLore) || (review && props.onReview && props.onDiscard));
  const contextStyle = contextPosition
    ? { left: `${contextPosition.x}px`, top: `${contextPosition.y}px` }
    : undefined;
  const startContextDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !contextPosition) return;
    const rect = event.currentTarget.closest(".dr-context-anchor")!.getBoundingClientRect();
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: contextPosition.x, originY: contextPosition.y, width: rect.width, height: rect.height, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveContext = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;
    if (!active.moved && Math.hypot(dx, dy) < 4) return;
    active.moved = true;
    setOpen(false);
    setContextPosition(clampPosition({ x: active.originX + dx, y: active.originY + dy }, active.width, active.height));
  };
  const finishContextDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    if (!active.moved) return;
    const finalPosition = clampPosition({
      x: active.originX + event.clientX - active.startX,
      y: active.originY + event.clientY - active.startY,
    }, active.width, active.height);
    setContextPosition(finalPosition);
    suppressContextClick.current = true;
    props.onContextPositionChange(finalPosition);
    window.setTimeout(() => { suppressContextClick.current = false; }, 0);
  };
  useEffect(() => {
    if (props.authenticationPage) {
      setOpen(false); setAdding(false); setQuick(false); setReviewId(null); setMenuOpen(false); setMapLayout("closed");
    }
  }, [props.authenticationPage, props.state.pageReady]);
  useEffect(() => {
    const id = props.state.reviewProposalId;
    if (!id || !props.state.proposals?.some((batch) => batch.id === id)) return;
    setOpen(true); setQuick(false); setReviewId(id);
  }, [props.state.reviewProposalId, props.state.proposals]);
  useLayoutEffect(() => {
    if (!open || props.authenticationPage || props.state.vaultLocked || !props.state.pageReady) return;
    const anchor = contextAnchor.current;
    if (!anchor) return;
    const place = () => {
      // Anchor to the controls, not the entire portrait/status stack. A tall
      // stack must never push the review's approval buttons outside the window.
      const rect = (anchor.querySelector(".dr-pill-row") ?? anchor).getBoundingClientRect();
      const pad = 12;
      const width = Math.max(0, Math.min(assistantOpen ? 420 : 340, window.innerWidth - pad * 2));
      const maxHeight = Math.max(0, Math.min(720, window.innerHeight * .75, window.innerHeight - pad * 2));
      const next = {
        left: Math.max(pad, Math.min(rect.left, window.innerWidth - width - pad)),
        top: Math.max(pad, Math.min(rect.bottom + 8, window.innerHeight - maxHeight - pad)),
        width, maxHeight,
      };
      setPanelBounds(old => old && Object.keys(next).every(key => old[key as keyof typeof next] === next[key as keyof typeof next]) ? old : next);
    };
    const observer = new ResizeObserver(place);
    observer.observe(anchor);
    window.addEventListener("resize", place);
    place();
    return () => { observer.disconnect(); window.removeEventListener("resize", place); };
  }, [open, assistantOpen, contextPosition?.x, contextPosition?.y, props.authenticationPage, props.state.vaultLocked, props.state.pageReady]);
  if (props.authenticationPage || !props.state.pageReady) {
    return <HelpLocale.Provider value={props.state.locale}><div className="dr-root" aria-hidden="true" /></HelpLocale.Provider>;
  }
  return <HelpLocale.Provider value={props.state.locale}><div className="dr-root">
    <button className="dr-launcher" onClick={() => setMenuOpen(!menuOpen)} aria-label={t("openDeepRole")} aria-expanded={menuOpen}><span className="dr-orb" /><span>DeepRole</span></button>
    {!props.state.vaultLocked && props.state.canAnalyzeChat && props.composerActionPosition && <TooltipButton className="dr-composer-action" style={{ left: props.composerActionPosition.x, top: props.composerActionPosition.y }} aria-label={at("chatAnalyze")} tooltip={analysisBlocked ? x(serviceBusy ? "waiting" : "generating") : x("requestsVisible")} aria-disabled={analysisBlocked} onClick={() => { if (!analysisBlocked) props.onAnalyze(); }}><BrainCircuit aria-hidden="true" /></TooltipButton>}
    {menuOpen && <div className="dr-menu-layer"><aside className={`dr-menu-drawer map-${mapLayout}`} aria-label="DeepRole"><iframe ref={menuFrame} src={props.menuUrl} title="DeepRole" /></aside></div>}
    {props.state.toast && <div className="dr-toast" role="status">{props.state.toast}</div>}
    {!props.state.vaultLocked && props.state.warning && <Alert title={t("memoryNotAddedTitle")} text={props.state.warning} primary={t("copyContext")} onPrimary={props.onCopyContext} />}
    {!props.state.vaultLocked && props.state.handoffOffer && <Alert title={t("continueStoryQuestion", { title: props.state.handoffOffer.title })} text={t("snapshotNextText")} primary={t("apply")} secondary={t("notNow")} onPrimary={props.onApplyHandoff} onSecondary={props.onDismissHandoff} />}
    {!props.state.vaultLocked && props.state.selectionPosition && props.state.selectionText && <div className="dr-selection" style={{ left: props.state.selectionPosition.x, top: props.state.selectionPosition.y }}><button onClick={props.onSaveSelection}><span className="dr-orb" />{t("saveToDeepRole")}</button></div>}
      <div ref={contextAnchor} className={`dr-context-anchor ${contextPosition && contextPosition.x > window.innerWidth / 2 ? "is-right" : ""} ${contextPosition && contextPosition.y > window.innerHeight / 2 ? "is-bottom" : ""}`} style={contextStyle}>
      <div className="dr-pill-row">
        {props.state.vaultLocked ? <button className="dr-pill" onPointerDown={startContextDrag} onPointerMove={moveContext} onPointerUp={finishContextDrag} onPointerCancel={() => { drag.current = null; }} onClick={() => { if (!suppressContextClick.current) setMenuOpen(true); }} aria-expanded={menuOpen}><span className="dr-orb" /><span><strong>{t("vaultClosed")}</strong><small>{t("unlock")}</small></span></button> : ((props.state.showMemoryContextIndicator !== false) || (props.state.showChatContextMeter !== false && chatEstimate && chatEstimate.messageCount > 0)) && <div className="dr-context-indicators">
        {props.state.showChatContextMeter !== false && chatEstimate && chatEstimate.messageCount > 0 && <div className={`dr-chat-meter ${chatMeterState}`} role="group" title={x("chatMeterEstimateHelp")} aria-label={`${x("chatMeterTitle")}: ~${compactTokens(chatEstimate.estimatedTokens, props.state.locale)} / 1M; ${x("chatMeterRemaining", { count: compactTokens(chatRemaining, props.state.locale) })}`}>
          <div className="dr-chat-meter-heading"><span>{x("chatMeterTitle")}</span><strong>~{compactTokens(chatEstimate.estimatedTokens, props.state.locale)} / 1M</strong></div>
          <div className="dr-chat-meter-track" role="progressbar" aria-valuemin={0} aria-valuemax={DEEPSEEK_WEB_CONTEXT_LIMIT} aria-valuenow={Math.min(chatEstimate.estimatedTokens, DEEPSEEK_WEB_CONTEXT_LIMIT)} aria-valuetext={`~${compactTokens(chatEstimate.estimatedTokens, props.state.locale)} / 1M`}><i style={{ width: `${chatEstimatePercent}%` }} /></div>
          <div className="dr-chat-meter-foot"><strong>{x("chatMeterRemaining", { count: compactTokens(chatRemaining, props.state.locale) })}</strong><small>{x(chatEstimate.source === "history" ? "chatMeterHistory" : "chatMeterPageOnly")}</small></div>
          {chatEstimate.atLeast && <small className="dr-chat-meter-note">{x("chatMeterAtLeast")}</small>}
        </div>}
        {props.state.showMemoryContextIndicator !== false && <button className="dr-pill" onPointerDown={startContextDrag} onPointerMove={moveContext} onPointerUp={finishContextDrag} onPointerCancel={() => { drag.current = null; }} onClick={() => { if (!suppressContextClick.current) setOpen(!open); }} aria-expanded={open}><span className="dr-orb" /><span><strong>{t("context")} <b className="dr-count">{count}</b></strong><small>{t("shortTokens", { count: props.state.selection.estimatedTokens })}</small></span></button>}
        </div>}
        {!props.state.vaultLocked && props.state.scene?.worldId && props.onSceneChoicesToggle && <button className="dr-pill dr-scene-choice-toggle" type="button" title={sceneChoiceText(props.state.locale, "toggleHelp")} aria-pressed={Boolean(props.state.sceneChoicesEnabled)} onClick={props.onSceneChoicesToggle}>{sceneChoiceText(props.state.locale, props.state.sceneChoicesEnabled ? "toggleOn" : "toggleOff")}</button>}
        {!props.state.vaultLocked && proposals.length > 0 && <button className="dr-pill dr-review-pill" onClick={() => { setOpen(true); setQuick(false); setReviewId(proposals[0]!.id); }} aria-label={at("review")}>{at("ready")} · {proposals.reduce((total, batch) => total + batch.items.length, 0)}</button>}
      {!props.state.vaultLocked && props.state.analysisSuggested && <button className="dr-pill" onClick={() => setOpen(true)}>{at("analyze")}</button>}
      </div>
      {!props.state.vaultLocked && props.state.characters && props.onSaveCharacter && <CharacterPanel key={`${props.state.characters.worldId}:${props.state.characters.chatId}`} {...props.state.characters} locale={props.state.locale} generating={props.state.generating} onSave={props.onSaveCharacter} onRetry={() => props.onRetryCharacters?.()} onOpened={props.onCharacterOpened} />}
      {!props.state.vaultLocked && props.state.activity && <ServiceProgress locale={props.state.locale} activity={props.state.activity} />}
      {!props.state.vaultLocked && ((props.state.worlds?.length ?? 0) > 0 || (props.state.books?.length ?? 0) > 0) && props.onSceneChange && <SceneControls compact locale={props.state.locale} worlds={props.state.worlds ?? []} entities={props.state.entities ?? []} books={props.state.books ?? []} scene={props.state.scene ?? EMPTY_SCENE} onChange={props.onSceneChange} />}
      {!props.state.vaultLocked && open && <div className="dr-panel" style={panelBounds ? { ...panelBounds, position: "fixed", right: "auto", bottom: "auto", margin: 0, zIndex: 3 } : undefined}>{!assistantOpen && <><header><strong>{t("selectedMemory")}</strong><button onClick={() => setOpen(false)} aria-label={t("close")}>✕</button></header>
        <SectionGuide locale={props.state.locale} text={x("previewHint")} />
        {props.state.pendingHandoff && <p className="dr-inline-note">{experienceText(props.state.locale, "pendingRecap", { name: props.state.pendingHandoff })}</p>}
        <div className="dr-play-tools">{props.onQuickSave && <button onClick={() => { setQuick(!quick); setReviewId(null); }}>{at("remember")}</button>}<button disabled={analysisBlocked} onClick={props.onAnalyze}>{at("analyze")}</button>{props.state.analysisSuggested && <button onClick={props.onDismissSuggestion}>{t("later")}</button>}</div>
        {analysisBlocked && <p className="dr-inline-note">{x(serviceBusy ? "waiting" : props.state.generating ? "generating" : "startChat")}</p>}
        </>}
        {quick && props.onQuickSave && props.onDraftLore ? <QuickMemory worldName={props.state.worlds?.find((world) => world.id === props.state.scene?.worldId)?.name} locale={props.state.locale} onSave={props.onQuickSave} onDraft={props.onDraftLore} onClose={() => setQuick(false)} /> : review && props.onReview && props.onDiscard ? <MemoryReview key={review.id} locale={props.state.locale} batch={review} onSave={(items) => props.onReview!(review, items)} onDiscard={() => props.onDiscard!(review.id)} onClose={() => { setReviewId(null); props.onReviewClose?.(); }} /> : <>
        {(props.state.selection.overBudgetTokens ?? 0) > 0 && <p className="dr-budget-note">{at("overflow")}</p>}{props.state.selection.omittedCount > 0 && <p className="dr-budget-note">{at("omitted")} ({props.state.selection.omittedCount})</p>}
        {count === 0 ? <div className="dr-empty">{t("contextEmpty")}</div> : props.state.selection.entries.map((item) => <div key={item.entry.id}><label className="dr-entry"><input type="checkbox" checked onChange={(event) => props.onToggleEntry(item.entry, event.target.checked)} /><div><strong>{item.entry.title}</strong><small>{item.entry.content}</small></div><em>{x(selectionReason(item))}</em></label>{props.state.overrides?.includedIds.includes(item.entry.id) && <button className="dr-reset" onClick={() => props.onResetEntry?.(item.entry.id)}>{at("reset")}</button>}</div>)}{props.state.availableEntries.length > 0 && <div className="dr-add"><button onClick={() => setAdding(!adding)}>＋ {t("attachManually")}</button>{adding && <div className="dr-add-list"><input className="dr-attach-search" aria-label={x("searchAttach")} placeholder={x("searchAttach")} value={attachQuery} onChange={(event) => setAttachQuery(event.target.value)} />{props.state.availableEntries.filter((entry) => `${entry.title} ${entry.content}`.toLocaleLowerCase().includes(attachQuery.trim().toLocaleLowerCase())).map((entry) => <div key={entry.id}><button onClick={() => props.onAttachEntry(entry)}><strong>{entry.title}</strong><small>{entry.content}</small></button>{props.state.overrides?.excludedIds.includes(entry.id) && <button onClick={() => props.onResetEntry?.(entry.id)}>{at("reset")}</button>}</div>)}</div>}</div>}
        {proposals.map((batch) => <button className="dr-reset" key={batch.id} onClick={() => { setQuick(false); setReviewId(batch.id); }}>{at("review")} · {batch.items.length}</button>)}
        {props.state.lastChange && props.onUndo && <div className="dr-play-tools"><button disabled={undoBusy} onClick={() => { setUndoBusy(true); setUndoError(false); void props.onUndo!(props.state.lastChange!.id).catch(() => setUndoError(true)).finally(() => setUndoBusy(false)); }}>{at("undo")}</button></div>}{undoError && <p role="alert">{at("conflict")}</p>}
        </>}
      </div>}
    </div>
  </div></HelpLocale.Provider>;
}

function clampPosition(position: { x: number; y: number }, width: number, height: number): { x: number; y: number } {
  const padding = 8;
  return {
    x: Math.round(Math.max(padding, Math.min(window.innerWidth - width - padding, position.x))),
    y: Math.round(Math.max(padding, Math.min(window.innerHeight - height - padding, position.y))),
  };
}

const DEEPSEEK_WEB_CONTEXT_LIMIT = 1_000_000;
function compactTokens(value: number, locale: "ru" | "en"): string {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function Alert(props: { title: string; text: string; primary: string; secondary?: string; onPrimary: () => void; onSecondary?: () => void }) {
  return <div className="dr-alert"><strong>{props.title}</strong><p>{props.text}</p><div className="dr-alert-actions"><button onClick={props.onPrimary}>{props.primary}</button>{props.secondary && <button onClick={props.onSecondary}>{props.secondary}</button>}</div></div>;
}
