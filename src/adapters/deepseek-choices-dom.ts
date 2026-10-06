import { parseSceneChoices, sceneChoiceText, type SceneChoice } from "../core/scene-choices";
import type { Locale } from "../core/types";
import { findSafeServiceContainer } from "./deepseek-service-dom";
import { nativeMessageRow, isUserMessage } from "./deepseek-message-dom";
import designTokens from "../entrypoints/shared/design-tokens.css?raw";
import designEffects from "../entrypoints/shared/design-effects.css?raw";
import { fitAdaptiveChoices } from "./adaptive-layout";
import { bindPinnedChoices, composerBounds } from "./pinned-choices";
import { bindInlineChoices, unbindInlineChoices, choiceScrollContainer } from "./inline-choices";

const MARKER = "<deeprole_choices>";
const STREAM_MARKERS = ["<deeprole_characters", "<deeprole_choices"] as const;
const HOST = "[data-deeprole-choices-host]";
const HIDDEN = "[data-deeprole-choices-payload]";
const RECOVERY = "[data-deeprole-choices-recovery]";
const LOADING = "[data-deeprole-choices-loading]";
export type ChoicePin = "pinSceneChoices" | "pinPortraits";
export interface ChoicePresentation { adaptiveLayout?: boolean; pinSceneChoices: boolean; pinPortraits: boolean; onToggle: (key: ChoicePin) => void | Promise<void> }
const managedCards = new WeakMap<ParentNode, Set<HTMLElement>>();
const sourceRows = new WeakMap<HTMLElement, HTMLElement>();
const inlineAnchors = new WeakMap<HTMLElement, HTMLElement>();
function choiceCards(root: ParentNode): HTMLElement[] {
  return [...new Set([...root.querySelectorAll<HTMLElement>(HOST), ...(managedCards.get(root) ?? [])])].filter(host => host.isConnected);
}
function removeChoiceCard(host: HTMLElement): void {
  unbindInlineChoices(host); bindPinnedChoices(host, false); inlineAnchors.get(host)?.remove(); inlineAnchors.delete(host); host.remove();
}
function placeChoiceCard(host: HTMLElement, row: HTMLElement, reveal?: boolean): void {
  sourceRows.set(host, row);
  const hadAnchor = !!inlineAnchors.get(host)?.isConnected;
  if (host.dataset.deeproleChoicesPinned === "true") {
    unbindInlineChoices(host);
    let anchor = inlineAnchors.get(host);
    if (!anchor?.isConnected) { anchor = row.ownerDocument.createElement("span"); anchor.hidden = true; anchor.dataset.deeproleChoicesAnchor = "true"; row.after(anchor); inlineAnchors.set(host, anchor); }
    if (host.parentElement !== row.ownerDocument.body) row.ownerDocument.body.append(host);
  } else {
    const anchor = inlineAnchors.get(host);
    if (anchor?.isConnected) anchor.replaceWith(host);
    else if (row.nextElementSibling !== host) row.after(host);
    inlineAnchors.delete(host);
  }
  bindPinnedChoices(host, host.dataset.deeproleChoicesPinned === "true");
  if (host.dataset.deeproleChoicesPinned !== "true") bindInlineChoices(host, reveal ?? hadAnchor);
}
type SettlingState = { signature: string; changedAt: number; row?: HTMLElement; observedGeneration: boolean; busy?: boolean; requestSource?: string; timer?: ReturnType<typeof setTimeout> };
const settling = new WeakMap<ParentNode, SettlingState>();
const USER = "[data-role='user'], [data-message-role='user'], [data-testid*='user-message'], .ds-message--user";
const REASONING = "[data-testid*='thinking'], [data-testid*='reasoning'], .ds-think-content, .ds-think-content-wrapper";
const MEMORY_SERVICE = "[data-deeprole-memory-presentation], [data-deeprole-memory-request], [data-deeprole-choices-request]";
let dismissedChoice: string | null = null;
type ChoiceHandler = (choice: SceneChoice, signature: string) => Promise<boolean>;
const choiceHandlers = new WeakMap<HTMLElement, ChoiceHandler>();
const choicePresentations = new WeakMap<HTMLElement, ChoicePresentation>();
type ScrollFollow = { scroller: Element; lastTop: number; following: boolean; pausedByUser: boolean; pointerDown: boolean; resumeRequested: boolean; onScroll: () => void; onWheel: (event: WheelEvent) => void; onKeyDown: (event: KeyboardEvent) => void; onPointerDown: () => void; onPointerUp: () => void };
const scrollFollowing = new WeakMap<ParentNode, ScrollFollow>();

function stopFollowing(root: ParentNode): void {
  const state = scrollFollowing.get(root);
  if (!state) return;
  const doc = state.scroller.ownerDocument;
  (state.scroller === doc.scrollingElement ? doc.defaultView : state.scroller)?.removeEventListener("scroll", state.onScroll);
  doc.removeEventListener("wheel", state.onWheel, true);
  doc.removeEventListener("keydown", state.onKeyDown, true);
  doc.removeEventListener("pointerdown", state.onPointerDown, true);
  doc.removeEventListener("pointerup", state.onPointerUp, true);
  scrollFollowing.delete(root);
}

function scrollContainer(row: HTMLElement): Element {
  return choiceScrollContainer(row);
}

function beginFollowing(root: ParentNode, row: HTMLElement, wasNearBottom: boolean): void {
  const scroller = scrollContainer(row);
  const existing = scrollFollowing.get(root);
  if (existing?.scroller === scroller) return;
  if (existing) stopFollowing(root);
  const state: ScrollFollow = { scroller, lastTop: scroller.scrollTop, following: wasNearBottom, pausedByUser: false, pointerDown: false, resumeRequested: false, onScroll: () => {}, onWheel: () => {}, onKeyDown: () => {}, onPointerDown: () => {}, onPointerUp: () => {} };
  state.onScroll = () => {
    const delta = scroller.scrollTop - state.lastTop;
    // Collapsing hidden JSON can itself decrease scrollTop. Only a drag in
    // progress is evidence that this upward movement came from the reader.
    if (state.pointerDown && delta < -2) { state.following = false; state.pausedByUser = true; state.resumeRequested = false; }
    else if (nearBottom(scroller) && (!state.pausedByUser || (state.pointerDown && delta > 2) || state.resumeRequested)) {
      state.following = true; state.pausedByUser = false; state.resumeRequested = false;
    }
    state.lastTop = scroller.scrollTop;
  };
  state.onWheel = event => {
    if (event.deltaY < 0) { state.following = false; state.pausedByUser = true; state.resumeRequested = false; }
    else if (event.deltaY > 0) { state.resumeRequested = true; if (nearBottom(scroller)) { state.following = true; state.pausedByUser = false; state.resumeRequested = false; } }
  };
  state.onKeyDown = event => {
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
    if (["ArrowUp", "PageUp", "Home"].includes(event.key)) { state.following = false; state.pausedByUser = true; state.resumeRequested = false; }
    else if (["ArrowDown", "PageDown", "End"].includes(event.key)) { state.resumeRequested = true; if (nearBottom(scroller)) { state.following = true; state.pausedByUser = false; state.resumeRequested = false; } }
  };
  state.onPointerDown = () => { state.pointerDown = true; };
  state.onPointerUp = () => { state.pointerDown = false; };
  const doc = scroller.ownerDocument;
  (scroller === doc.scrollingElement ? doc.defaultView : scroller)?.addEventListener("scroll", state.onScroll);
  doc.addEventListener("wheel", state.onWheel, true);
  doc.addEventListener("keydown", state.onKeyDown, true);
  doc.addEventListener("pointerdown", state.onPointerDown, true);
  doc.addEventListener("pointerup", state.onPointerUp, true);
  scrollFollowing.set(root, state);
}

function nearBottom(scroller: Element): boolean {
  return scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 220;
}

function followTarget(root: ParentNode, target: HTMLElement): void {
  if (target.matches(HOST) && target.dataset.deeproleChoicesPinned === "true") return;
  const state = scrollFollowing.get(root);
  if (!state?.following) return;
  const doc = target.ownerDocument;
  const viewport = state.scroller === doc.scrollingElement
    ? { top: 0, bottom: doc.defaultView?.innerHeight ?? 0 }
    : state.scroller.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  // On a short viewport, show the start of a tall options card instead of
  // pushing its heading and first choices above the screen.
  const tallCard = target.matches(HOST) && rect.height > viewport.bottom - viewport.top - 170;
  const composer = composerBounds(doc, true);
  const bottom = composer ? Math.min(viewport.bottom, composer.top - 12) : viewport.bottom - 130;
  const delta = tallCard ? rect.top - viewport.top - 40 : rect.bottom - bottom;
  if (delta > 0) { state.scroller.scrollTop += delta; state.lastTop = state.scroller.scrollTop; }
}

export function dismissSceneChoiceCards(root: ParentNode = document, remember = true): void {
  stopFollowing(root);
  const state = settling.get(root); if (state?.timer) clearTimeout(state.timer); settling.delete(root);
  const host = choiceCards(root).at(-1);
  if (!remember) dismissedChoice = null;
  else if (host?.dataset.deeproleChoicesSignature) dismissedChoice = `${location.href}:${host.dataset.deeproleChoicesSignature}`;
  choiceCards(root).forEach(removeChoiceCard); managedCards.delete(root);
  root.querySelectorAll<HTMLElement>(RECOVERY).forEach((card) => card.remove());
  root.querySelectorAll<HTMLElement>(LOADING).forEach((card) => card.remove());
}

function latestTurn(root: ParentNode): HTMLElement | undefined {
  const turns = [...root.querySelectorAll<HTMLElement>(".ds-message, [data-message-id], [data-testid*='message'], article, [data-message-role], [data-role='user'], [data-role='assistant']")]
    .filter((element) => !element.closest(`deeprole-page-widget, ${HOST}, ${RECOVERY}, ${REASONING}, ${MEMORY_SERVICE}`)
      && !element.querySelector(".ds-message, [data-message-id], article, [data-message-role], [data-role='user'], [data-role='assistant']")
      && element.getClientRects().length > 0);
  // Some site versions put the assistant Markdown after an empty message-id row.
  const markdown = [...root.querySelectorAll<HTMLElement>(".ds-markdown")]
    .filter((element) => !element.closest(`deeprole-page-widget, ${USER}, ${REASONING}, ${MEMORY_SERVICE}`) && element.getClientRects().length > 0);
  const candidates = [...turns, ...markdown].sort((a, b) => a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  return candidates.reverse().find(element => !isAuxiliaryServiceTurn(element));
}

function isAuxiliaryServiceTurn(element: HTMLElement): boolean {
  const row = nativeMessageRow(element) ?? findSafeServiceContainer(element);
  const text = (row.textContent ?? "").trim();
  if (text.startsWith("[DeepRole Service]")) return true;
  const previous = row.previousElementSibling;
  const priorText = previous?.textContent?.trim() ?? "";
  if (priorText.startsWith("[DeepRole Service]") && priorText.includes("[DeepRole Scene Choices]")) return false;
  if (text.includes("<deeprole_data>") || row.dataset.deeproleServiceReply === "true" && row.dataset.deeproleSceneChoicesReply !== "true") return true;
  return priorText.startsWith("[DeepRole Service]") && !priorText.includes("[DeepRole Scene Choices]");
}

/** Require an identifiable last assistant turn. Never offer a request under a user message. */
export function latestSceneChoiceTarget(root: ParentNode = document): { row: HTMLElement; signature: string } | null {
  let turn = latestTurn(root);
  const isChoicesRequest = (node: Element | null | undefined) => {
    const text = node?.textContent?.trim() ?? "";
    return text.startsWith("[DeepRole Service]") && text.includes("[DeepRole Scene Choices]");
  };
  // A failed transport can leave only our request and an empty assistant row.
  // Put the retry beside the original scene, not beneath that user request.
  const unanswered = isChoicesRequest(turn) ? turn : !turn?.textContent?.trim() && isChoicesRequest(turn?.previousElementSibling) ? turn?.previousElementSibling : null;
  if (unanswered) {
    let previous = unanswered.previousElementSibling;
    while (previous && (previous.matches(`${HOST}, ${RECOVERY}`) || !previous.textContent?.trim() || isChoicesRequest(previous))) previous = previous.previousElementSibling;
    turn = previous instanceof HTMLElement ? previous : undefined;
  }
  if (!turn || isUserMessage(turn)) return null;
  const text = (turn.textContent ?? "").trim();
  if (!text || text.startsWith("[DeepRole Service]") || text.includes("<deeprole_choice_mode")) return null;
  const row = findSafeServiceContainer(turn);
  const previous = row.previousElementSibling;
  const priorText = previous?.textContent?.trim() ?? "";
  const choiceReply = priorText.startsWith("[DeepRole Service]") && priorText.includes("[DeepRole Scene Choices]");
  if (!choiceReply && (row.matches("[data-deeprole-service-reply='true']") || priorText.startsWith("[DeepRole Service]") || text.includes("<deeprole_data>"))) return null;
  if (!choiceReply && !turn.matches("[data-role='assistant'], [data-message-role='assistant'], [data-testid*='assistant'], .ds-markdown")
    && !turn.querySelector(".ds-markdown")) return null;
  return { row, signature: `${location.href}:${row.getAttribute("data-message-id") ?? ""}:${textSignature(text)}` };
}

/** Keep the story in DeepSeek's reply while replacing only its machine-readable choices. */
export function syncSceneChoiceCards(enabled: boolean, generating: boolean, locale: Locale, onPick: ChoiceHandler, root: ParentNode = document, recovery?: { busy: boolean; loading?: boolean; requestSignature?: string; onRequest: (signature: string) => Promise<boolean> }, presentation?: ChoicePresentation): void {
  const previous = settling.get(root);
  if (previous?.timer) clearTimeout(previous.timer);
  if (!enabled) {
    stopFollowing(root);
    choiceCards(root).forEach(removeChoiceCard); managedCards.delete(root);
    root.querySelectorAll<HTMLElement>(RECOVERY).forEach((host) => host.remove());
    root.querySelectorAll<HTMLElement>(LOADING).forEach((host) => host.remove());
    settling.delete(root);
    return;
  }
  const beforeConceal = generating ? latestSceneChoiceTarget(root)?.row : null;
  const wasNearBottom = beforeConceal ? nearBottom(scrollContainer(beforeConceal)) : false;
  // Remember the reader's position while the story is still streaming. By
  // the time the first JSON chunk arrives it may have already grown the page
  // enough that a fresh near-bottom check incorrectly says "not following".
  if (beforeConceal) beginFollowing(root, beforeConceal, wasNearBottom);
  concealChoicePayloads(root);
  const current = currentChoice(root);
  const signature = current?.signature ?? "";
  const active = !generating && current && dismissedChoice !== `${location.href}:${signature}` ? current : null;
  choiceCards(root).forEach((host) => {
    if (sourceRows.get(host) !== active?.row) { removeChoiceCard(host); managedCards.get(root)?.delete(host); }
    else host.style.display = generating ? "none" : "";
  });
  const scene = latestSceneChoiceTarget(root);
  const requestSource = recovery?.busy ? recovery.requestSignature ?? (previous?.busy ? previous.requestSource : previous?.signature) : undefined;
  const state: SettlingState = previous && previous.signature === scene?.signature ? previous : { signature: scene?.signature ?? "", changedAt: Date.now(), row: scene?.row, observedGeneration: previous?.row === scene?.row && !!previous?.observedGeneration };
  state.busy = !!recovery?.busy; state.requestSource = requestSource;
  const sceneText = scene?.row.textContent ?? "";
  if (generating || sceneText.includes("<deeprole_choices") && !sceneText.includes("</deeprole_choices>")) state.observedGeneration = true;
  settling.set(root, state);
  const settlingReply = !active && state.observedGeneration && !!scene && Date.now() - state.changedAt < 1200;
  const waiting = generating || !!recovery?.busy || settlingReply;
  const target = !waiting && !active && recovery ? scene : null;
  // Generating story text (or waiting for a manual request) is not yet generating
  // options. Concealment marks only the actual choices transport, never thinking.
  const choicesStarted = (!!scene?.row.querySelector(HIDDEN) || !!current) && !(requestSource && scene?.signature === requestSource);
  const loadingRow = !active && waiting && choicesStarted && recovery?.loading !== false && (recovery || current) ? scene?.row ?? current?.row : null;
  root.querySelectorAll<HTMLElement>(LOADING).forEach(host => { if (host.previousElementSibling !== loadingRow || host.lang !== locale) host.remove(); });
  if (loadingRow && !loadingRow.nextElementSibling?.matches(LOADING)) loadingRow.after(createLoading(locale, loadingRow.ownerDocument));
  if (loadingRow && generating) beginFollowing(root, loadingRow, wasNearBottom);
  const loader = loadingRow?.nextElementSibling;
  if (loader instanceof HTMLElement && loader.matches(LOADING)) followTarget(root, loader);
  if (settlingReply && !generating && !recovery?.busy) state.timer = setTimeout(() => syncSceneChoiceCards(enabled, generating, locale, onPick, root, recovery, presentation), 1250 - (Date.now() - state.changedAt));
  root.querySelectorAll<HTMLElement>(RECOVERY).forEach((host) => {
    if (host.previousElementSibling !== target?.row || host.dataset.deeproleChoicesSignature !== target?.signature
      || host.dataset.deeproleChoicesLocale !== locale || host.dataset.busy !== String(recovery?.busy) || !host.shadowRoot) host.remove();
  });
  if (target && recovery && !target.row.nextElementSibling?.matches(RECOVERY)) {
    target.row.after(createRecoveryCard(locale, target.signature, recovery, target.row.ownerDocument));
  }
  if (!active) { if (!generating && !waiting) stopFollowing(root); return; }
  const blockText = (active.element.textContent ?? "").slice(active.parsed.start, active.parsed.end);
  const alreadyHidden = [...active.element.querySelectorAll<HTMLElement>(HIDDEN)]
    .some((payload) => payload.textContent === blockText);
  if (!alreadyHidden && !hideBlock(active.element, active.parsed.start, active.parsed.end)) return;
  const existing = choiceCards(root).find(host => sourceRows.get(host) === active.row) ?? null;
  if (existing?.dataset.deeproleChoicesSignature === signature && existing.dataset.deeproleChoicesLocale === locale
    && existing.shadowRoot?.querySelectorAll(".grid button").length === 4) { choiceHandlers.set(existing, onPick); applyChoicePresentation(existing, presentation); followTarget(root, existing); stopFollowing(root); return; }
  if (existing) { removeChoiceCard(existing); managedCards.get(root)?.delete(existing); }
  const card = createCard(active.parsed.choices.options, locale, signature, onPick, active.row.ownerDocument, root, presentation);
  const cards = managedCards.get(root) ?? new Set<HTMLElement>(); cards.add(card); managedCards.set(root, cards);
  placeChoiceCard(card, active.row, wasNearBottom);
  fitAdaptiveChoices(card);
  followTarget(root, card);
  stopFollowing(root);
}

/** Hide unfinished transport too; retain its text for parsers and site updates. */
export function concealChoicePayloads(root: ParentNode): void {
  for (const element of root.querySelectorAll<HTMLElement>(".ds-markdown, [data-role='assistant'], [data-message-role='assistant'], article, [data-message-id]")) {
    if (element.closest(`${USER}, ${REASONING}, ${HOST}, ${RECOVERY}, ${LOADING}`) || isUserMessage(element)) continue;
    if (element.querySelector(`.ds-markdown, ${REASONING}`)) continue;
    if ((element.textContent ?? "").includes("<deeprole_choice_mode")) continue;
    for (const marker of STREAM_MARKERS) {
      if (!(element.textContent ?? "").includes(marker)) continue;
      // DeepSeek may replace or append Markdown nodes while streaming. Keep a
      // current wrapper unless the marker reappears outside that wrapper.
      const visible = element.cloneNode(true) as HTMLElement;
      visible.querySelectorAll(HIDDEN).forEach(node => node.remove());
      const kind = marker === STREAM_MARKERS[0] ? "characters" : "choices";
      if (visible.textContent?.includes(marker)) [...element.querySelectorAll<HTMLElement>(HIDDEN)]
        .filter(node => node.dataset.deeproleChoicesPayload === kind).forEach(node => node.remove());
      const text = element.textContent ?? "";
      const start = text.indexOf(marker);
      if (start < 0) continue;
      const closingTag = `</deeprole_${kind}>`;
      const closing = text.indexOf(closingTag, start);
      const end = closing < 0 ? text.length : closing + closingTag.length;
      hideBlock(element, start, end, kind);
      [...element.querySelectorAll<HTMLElement>(HIDDEN)].filter(node => !node.textContent).forEach(node => node.remove());
    }
  }
  for (const row of root.querySelectorAll<HTMLElement>(".ds-message, article, [data-message-id]")) {
    const text = row.textContent?.trim() ?? "";
    if (text.startsWith("[DeepRole Service]") && text.includes("[DeepRole Scene Choices]") && !row.querySelector(".ds-message, article, [data-message-id]")) {
      row.dataset.deeproleChoicesRequest = "true";
      row.style.setProperty("display", "none", "important");
    }
  }
}

function createLoading(locale: Locale, doc: Document): HTMLElement {
  const host = doc.createElement("div"); host.dataset.deeproleChoicesLoading = "true"; host.lang = locale;
  const shadow = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = `${designTokens}:host{display:block;margin:16px 0;font:13px/1.5 system-ui,sans-serif;color:var(--dr-muted)}.loading{display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid var(--dr-border);border-radius:12px;background:var(--dr-panel)}.spinner{width:14px;height:14px;border:2px solid var(--dr-border);border-top-color:var(--dr-primary);border-radius:50%;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.spinner{animation:none}}`;
  const label = doc.createElement("div"); label.className = "loading"; label.setAttribute("role", "status");
  const spinner = doc.createElement("span"); spinner.className = "spinner"; spinner.setAttribute("aria-hidden", "true");
  label.append(spinner, doc.createTextNode(sceneChoiceText(locale, "waiting"))); shadow.append(style, label);
  return host;
}

/** Recheck at click time as well as polling time: an old visible card is not permission to pick an old turn. */
function currentChoice(root: ParentNode) {
  const latest = latestTurn(root);
  // Some DeepSeek versions place final Markdown outside its message-id row.
  const candidates = findChoiceElements(root).flatMap(({ element, parsed }) => {
    if (element.closest(`deeprole-page-widget, ${USER}, ${REASONING}, form, [contenteditable='true']`) || isUserMessage(element)) return [];
    if (element.closest("[data-deeprole-service-reply='true']:not([data-deeprole-scene-choices-reply='true'])")) return [];
    return [{ element, parsed, row: findSafeServiceContainer(element) }];
  });
  const last = candidates.at(-1);
  if (!last || latest && !latest.contains(last.element) && !(latest.compareDocumentPosition(last.element) & Node.DOCUMENT_POSITION_FOLLOWING)) return null;
  // The safe placement container can be only a paragraph in a tall reply.
  // Identity must still cover its entire assistant turn, not just that paragraph.
  const reply = nativeMessageRow(last.element) ?? last.row;
  return { ...last, signature: `${location.href}:${reply.getAttribute("data-message-id") ?? ""}:${textSignature(JSON.stringify(last.parsed.choices))}:${choiceReplySignature(reply)}` };
}

/** Regeneration can reuse both the message id and options. Bind to the final
 * reply too, but ignore live thinking and our localized transport summary. */
function choiceReplySignature(row: HTMLElement): string {
  const walker = row.ownerDocument.createTreeWalker(row, NodeFilter.SHOW_TEXT, {
    acceptNode: node => node.parentElement?.closest(`${REASONING}, [data-deeprole-characters-summary]`) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  let text = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode()) text += node.textContent ?? "";
  // Markdown may introduce or remove whitespace at transport boundaries.
  return textSignature(text.replace(/(<\/?deeprole_(?:choices|characters)>)/gu, " $1 "));
}

function textSignature(text: string): string {
  text = text.replace(/\s+/gu, " ").trim();
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}

function createRecoveryCard(locale: Locale, signature: string, recovery: { busy: boolean; onRequest: (signature: string) => Promise<boolean> }, doc: Document): HTMLElement {
  const host = doc.createElement("div");
  host.dataset.deeproleChoicesRecovery = "true";
  host.dataset.deeproleChoicesSignature = signature;
  host.dataset.deeproleChoicesLocale = locale;
  host.dataset.busy = String(recovery.busy);
  const shadow = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = `${designTokens}:host{display:block;margin:var(--dr-space-4) 0;font:13px/1.5 system-ui,sans-serif;color:var(--dr-text)}.box{max-width:690px;padding:var(--dr-space-4);border:1px solid var(--dr-border);border-radius:var(--dr-radius);background:var(--dr-panel);background-image:var(--dr-surface-light);box-shadow:var(--dr-depth-card);box-sizing:border-box}button{min-height:40px;padding:9px 14px;border:1px solid var(--dr-action);border-radius:10px;background:var(--dr-action);color:var(--dr-on-action);font:600 13px/1.4 system-ui,sans-serif;cursor:pointer}button:hover{background:var(--dr-action-hover)}button:focus-visible{outline:2px solid var(--dr-primary);outline-offset:3px}button:disabled{opacity:.65;cursor:wait}p{margin:var(--dr-space-2) 0 0;color:var(--dr-muted);font-size:12px;overflow-wrap:anywhere}${designEffects}`;
  const box = doc.createElement("div"); box.className = "box";
  const button = doc.createElement("button"); button.type = "button"; button.className = "dr-accent-action"; button.disabled = recovery.busy;
  button.textContent = sceneChoiceText(locale, recovery.busy ? "waiting" : "request");
  const hint = doc.createElement("p"); hint.textContent = sceneChoiceText(locale, recovery.busy ? "waitingHint" : "requestHint");
  button.setAttribute("aria-describedby", "request-hint"); hint.id = "request-hint";
  button.addEventListener("click", () => {
    button.disabled = true;
    host.style.setProperty("display", "none", "important");
    // The next sync shows a loader only once reply JSON starts, not at send time.
    void Promise.resolve().then(() => recovery.onRequest(signature)).then(ok => { if (!ok && host.isConnected) host.style.removeProperty("display"); }).catch(() => { if (host.isConnected) host.style.removeProperty("display"); }).finally(() => { button.disabled = recovery.busy; });
  });
  box.append(button, hint); shadow.append(style, box);
  return host;
}

function findChoiceElements(root: ParentNode) {
  const selector = "article, [data-message-id], [data-testid*='message'], div, p, pre, code, span";
  const doc = (root as Node).ownerDocument ?? document;
  const walker = doc.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT);
  const seen = new Set<HTMLElement>();
  const elements: { element: HTMLElement; parsed: NonNullable<ReturnType<typeof parseSceneChoices>> }[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node.textContent ?? "").includes("deeprole")) continue;
    for (let element = node.parentElement, depth = 0; element && depth < 12; element = element.parentElement, depth += 1) {
      if (element.matches("script, style, body, main") || element.closest(HOST)) break;
      // Multiple transport blocks split a reply into several text nodes. Once
      // this reply is parsed, don't climb past it and mistake the entire chat
      // wrapper for a second (and newer) reply.
      if (seen.has(element)) break;
      if (!element.matches(selector) || element.closest(HIDDEN)) continue;
      const text = element.textContent ?? "";
      if (!text.includes(MARKER)) continue;
      const parsed = parseSceneChoices(text);
      if (!parsed) { if (nativeMessageRow(element) === element) break; continue; }
      seen.add(element);
      elements.push({ element, parsed });
      break;
    }
  }
  return elements.filter(({ element }) => {
    const turn = element.closest<HTMLElement>("article, [data-message-id], [data-testid*='message'], [class*='message']");
    // The injected prompt includes a valid example, which must not become a card.
    return !(turn?.textContent ?? element.textContent ?? "").includes("<deeprole_choice_mode");
  });
}

function hideBlock(element: HTMLElement, start: number, end: number, kind = "choices"): boolean {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = element.ownerDocument.createRange();
  let offset = 0; let foundStart = false; let foundEnd = false; let visible = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (offset < end && offset + length > start && !node.parentElement?.closest(HIDDEN)) visible = true;
    if (!foundStart && start < offset + length) { range.setStart(node, start - offset); foundStart = true; }
    if (foundStart && end <= offset + length) { range.setEnd(node, end - offset); foundEnd = true; break; }
    offset += length;
  }
  if (!foundStart || !foundEnd) return false;
  if (!visible) return true;
  if (range.cloneContents().querySelector(REASONING)) return false;
  const hidden = element.ownerDocument.createElement("span");
  hidden.dataset.deeproleChoicesPayload = kind;
  hidden.setAttribute("aria-hidden", "true");
  hidden.style.setProperty("display", "none", "important");
  hidden.append(range.extractContents());
  hidden.querySelectorAll(HIDDEN).forEach(node => node.replaceWith(...node.childNodes));
  range.insertNode(hidden);
  return true;
}

function applyChoicePresentation(host: HTMLElement, presentation?: ChoicePresentation): void {
  if (!presentation) return;
  choicePresentations.set(host, presentation);
  const wasPinned = host.dataset.deeproleChoicesPinned === "true";
  host.dataset.deeproleChoicesPinned = String(presentation.pinSceneChoices);
  host.dataset.deeproleAdaptive = String(!!presentation.adaptiveLayout);
  const row = sourceRows.get(host);
  if (row) placeChoiceCard(host, row, wasPinned && !presentation.pinSceneChoices ? false : undefined);
  fitAdaptiveChoices(host);
  if (!host.isConnected) queueMicrotask(() => { if (host.isConnected) fitAdaptiveChoices(host); });
  for (const key of ["pinPortraits", "pinSceneChoices"] as const) {
    const button = host.shadowRoot?.querySelector<HTMLButtonElement>(`[data-choice-pin='${key}']`);
    if (!button) continue;
    const pinned = presentation[key];
    const label = sceneChoiceText(host.dataset.deeproleChoicesLocale as Locale, key === "pinSceneChoices" ? pinned ? "unpinChoices" : "pinChoices" : pinned ? "unpinPortraits" : "pinPortraits");
    button.setAttribute("aria-label", label); button.title = label; button.setAttribute("aria-pressed", String(pinned));
  }
}

function createCard(options: SceneChoice[], locale: Locale, signature: string, onPick: ChoiceHandler, doc: Document, root: ParentNode, presentation?: ChoicePresentation): HTMLElement {
  const host = doc.createElement("div");
  host.dataset.deeproleChoicesHost = "true";
  host.dataset.deeproleChoicesSignature = signature;
  host.dataset.deeproleChoicesLocale = locale;
  choiceHandlers.set(host, onPick);
  const shadow = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = `${designTokens}
    :host{display:block;container-type:inline-size;margin:var(--dr-space-4) 0;font:14px/1.5 system-ui,sans-serif;color:var(--dr-text)}
    :host([data-deeprole-choices-pinned=true]){position:fixed;left:50%;bottom:24px;z-index:2147481900;width:min(720px,calc(100vw - 32px));margin:0;transform:translateX(-50%)}
    :host([data-deeprole-choices-pinned=true]) section{max-height:var(--dr-pinned-max-height,calc(100dvh - 84px));overflow:auto;overscroll-behavior:contain;box-shadow:var(--dr-depth-panel)}
    :host([data-deeprole-choices-inline=true]) section{max-height:var(--dr-inline-max-height);overflow:auto;overscroll-behavior:contain}
    section{box-sizing:border-box;max-width:1000px;padding:var(--dr-space-4);border:0;border-radius:16px;background:var(--dr-panel);background-image:var(--dr-surface-light);box-shadow:var(--dr-depth-card)}
    .choice-heading{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:var(--dr-space-2);margin-bottom:var(--dr-space-1)}h3{margin:0;min-width:0;font-size:17px;font-weight:650}.choice-tools{display:flex;align-items:center;flex-wrap:wrap;gap:4px}.choice-pin{display:grid;place-items:center;min-width:32px;min-height:32px;padding:4px;border:1px solid var(--dr-border);border-radius:9px;background:var(--dr-surface);color:var(--dr-muted);cursor:pointer}.choice-pin:hover{background:var(--dr-raised);color:var(--dr-text)}.choice-pin[aria-pressed=true]{color:var(--dr-primary);border-color:var(--dr-primary);background:var(--dr-primary-soft)}.choice-pin svg{width:15px;height:15px;stroke:currentColor;stroke-width:1.8;fill:none;stroke-linecap:round;stroke-linejoin:round}.choice-pin span{font-size:14px;line-height:1}
    .choice-expand{flex-shrink:0;min-height:44px;max-width:55%;padding:var(--dr-space-2) var(--dr-space-3);border:1px solid var(--dr-border);border-radius:8px;background:var(--dr-surface);color:var(--dr-text);cursor:pointer;font:600 12px/1.4 system-ui,sans-serif}.choice-expand:hover{background:var(--dr-raised)}
    .grid{display:grid;grid-template-columns:1fr;gap:var(--dr-space-2)}
    .grid button{--choice-tint:var(--dr-choice-neutral);position:relative;box-sizing:border-box;width:100%;min-height:80px;padding:var(--dr-space-3);text-align:start;border:1px solid color-mix(in oklab,var(--choice-tint) 40%,var(--dr-surface));border-inline-start:3px solid var(--choice-tint);border-radius:10px;background:color-mix(in oklab,var(--choice-tint) 5%,var(--dr-surface));color:var(--dr-text);cursor:pointer;font:inherit;box-shadow:inset 0 1px 0 #ffffff08;transition:background-color var(--dr-motion-fast) var(--dr-ease-out),border-color var(--dr-motion-fast) var(--dr-ease-out)}
    .grid button[data-choice-kind=positive]{--choice-tint:var(--dr-choice-positive)}
    .grid button[data-choice-kind=negative]{--choice-tint:var(--dr-choice-negative)}
    .grid button[data-choice-kind=surprise]{--choice-tint:var(--dr-choice-surprise)}
    .grid button:hover{border-color:var(--choice-tint);background:color-mix(in oklab,var(--choice-tint) 9%,var(--dr-surface))}
    .grid button:active{background:color-mix(in oklab,var(--choice-tint) 12%,var(--dr-surface));box-shadow:inset 0 2px 4px #0003}
    .choice-pin,.choice-expand{transition:background-color var(--dr-motion-fast) var(--dr-ease-out),border-color var(--dr-motion-fast) var(--dr-ease-out),color var(--dr-motion-fast) var(--dr-ease-out)}
    input,textarea{caret-color:var(--dr-primary)}::selection{color:var(--dr-text);background:var(--dr-selected)}
    @media(prefers-reduced-motion:reduce){button{transition:none!important}}
    button:focus-visible{outline:2px solid var(--dr-primary);outline-offset:3px}
    .grid button[aria-pressed=true]{border-color:var(--choice-tint);background:color-mix(in oklab,var(--choice-tint) 12%,var(--dr-surface));box-shadow:inset 0 0 0 1px var(--choice-tint)}
    .grid button[aria-pressed=true] .preview{color:var(--dr-text)}
    button:disabled,button[aria-disabled=true]{opacity:.65;cursor:wait}small{display:block;margin-bottom:var(--dr-space-1);color:var(--dr-muted);font-size:11px}
    .number{position:absolute;inset-inline-end:10px;top:10px;min-width:20px;text-align:center;border:1px solid color-mix(in oklab,var(--choice-tint) 45%,var(--dr-surface));border-radius:5px;color:var(--choice-tint);font:12px/20px system-ui}
    .grid button[aria-pressed=true] .number{background:var(--choice-tint);color:var(--dr-bg);border-color:var(--choice-tint)}
    .grid button[aria-pressed=true] .number::before{content:'✓';margin-inline-end:3px}
    .grid small{padding-inline-end:40px;color:var(--choice-tint)}strong{display:block;font-size:14px;font-weight:600;white-space:normal;overflow-wrap:anywhere}
    .preview{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;margin-top:var(--dr-space-1);color:var(--dr-muted);font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}.grid[data-expanded=true] .preview{display:block;-webkit-line-clamp:unset}
    .choice-status{min-height:18px;margin:var(--dr-space-3) 0 0;overflow-wrap:anywhere}.choice-status[data-selected=true]{color:var(--dr-primary)}
    @container(min-width:560px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    :host([data-deeprole-adaptive=true]) section{padding:clamp(10px,2vw,16px)}
    :host([data-deeprole-adaptive=true]) .grid{gap:6px}
    :host([data-deeprole-adaptive=true]) .grid button{padding:10px;min-height:72px}
    @container(min-width:430px){:host([data-deeprole-adaptive=true]) .grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;
  const section = doc.createElement("section");
  section.setAttribute("aria-label", sceneChoiceText(locale, "title"));
  const title = doc.createElement("h3"); title.textContent = sceneChoiceText(locale, "title");
  const heading = doc.createElement("div"); heading.className = "choice-heading";
  const expand = doc.createElement("button"); expand.type = "button"; expand.className = "choice-expand"; expand.textContent = sceneChoiceText(locale, "expand"); expand.setAttribute("aria-expanded", "false"); expand.setAttribute("aria-controls", "scene-choice-options");
  const hint = doc.createElement("p"); hint.textContent = sceneChoiceText(locale, "hint");
  const grid = doc.createElement("div"); grid.className = "grid"; grid.setAttribute("role", "group"); grid.setAttribute("aria-label", sceneChoiceText(locale, "title"));
  grid.id = "scene-choice-options";
  expand.addEventListener("click", () => {
    const expanded = expand.getAttribute("aria-expanded") !== "true";
    expand.setAttribute("aria-expanded", String(expanded)); grid.dataset.expanded = String(expanded);
    expand.textContent = sceneChoiceText(locale, expanded ? "collapse" : "expand");
  });
  const tools = doc.createElement("div"); tools.className = "choice-tools";
  if (presentation) for (const key of ["pinPortraits", "pinSceneChoices"] as const) {
    const button = doc.createElement("button"); button.type = "button"; button.className = "choice-pin"; button.dataset.choicePin = key;
    if (key === "pinSceneChoices") {
      const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
      const path = doc.createElementNS("http://www.w3.org/2000/svg", "path"); path.setAttribute("d", "M12 17v5m-5-9-2 3v1h14v-1l-2-3V6l2-2V3H5v1l2 2z"); svg.append(path); button.append(svg);
    } else { const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true"); const path = doc.createElementNS("http://www.w3.org/2000/svg", "path"); path.setAttribute("d", "M7 4H3v16h4m10-16h4v16h-4M8 12h8m-6-2-2 2 2 2m4-4 2 2-2 2"); svg.append(path); button.append(svg); }
    button.addEventListener("click", () => { const current = choicePresentations.get(host); if (current) void current.onToggle(key); }); tools.append(button);
  }
  tools.append(expand); heading.append(title, tools);
  grid.title = sceneChoiceText(locale, "navigation");
  const status = doc.createElement("p"); status.className = "choice-status"; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  status.textContent = sceneChoiceText(locale, "navigation");
  let picking = false;
  for (const [index, choice] of options.entries()) {
    const button = doc.createElement("button"); button.type = "button"; button.setAttribute("aria-pressed", "false");
    button.dataset.choiceKind = choice.kind;
    button.title = choice.text;
    const number = doc.createElement("span"); number.className = "number"; number.textContent = String(index + 1); number.setAttribute("aria-hidden", "true");
    const category = doc.createElement("small"); category.textContent = sceneChoiceText(locale, choice.kind);
    const label = doc.createElement("strong"); label.textContent = choice.label;
    const preview = doc.createElement("span"); preview.className = "preview"; preview.textContent = choice.text;
    button.append(number, category, label, preview);
    button.addEventListener("click", () => {
      if (picking || !host.isConnected) return;
      const current = currentChoice(root);
      if (current?.signature !== signature || current.row !== sourceRows.get(host)) { status.textContent = sceneChoiceText(locale, "changed"); status.dataset.selected = "false"; return; }
      picking = true;
      const buttons = grid.querySelectorAll<HTMLButtonElement>("button");
      grid.setAttribute("aria-busy", "true"); buttons.forEach(item => item.setAttribute("aria-disabled", "true"));
      void (async () => {
        try {
          const ok = await choiceHandlers.get(host)!(choice, signature);
          if (!host.isConnected) return;
          if (!ok) { status.textContent = sceneChoiceText(locale, "notInserted"); status.dataset.selected = "false"; return; }
          buttons.forEach(item => item.setAttribute("aria-pressed", String(item === button)));
          status.textContent = sceneChoiceText(locale, "selected").replace("{label}", choice.label); status.dataset.selected = "true";
        } catch { if (host.isConnected) { status.textContent = sceneChoiceText(locale, "unavailable"); status.dataset.selected = "false"; } }
        finally { picking = false; grid.setAttribute("aria-busy", "false"); buttons.forEach(item => item.setAttribute("aria-disabled", "false")); }
      })();
    });
    grid.append(button);
  }
  grid.addEventListener("keydown", event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (picking) { if (/^[1-4]$|^Arrow(?:Right|Down|Left|Up)$|^(?:Home|End)$/u.test(event.key)) event.preventDefault(); return; }
    const buttons = [...grid.querySelectorAll<HTMLButtonElement>("button")];
    const current = buttons.indexOf(event.target as HTMLButtonElement); if (current < 0) return;
    if (/^[1-4]$/u.test(event.key)) { event.preventDefault(); buttons[Number(event.key) - 1]?.click(); return; }
    if (event.key === "Home" || event.key === "End") { event.preventDefault(); buttons[event.key === "Home" ? 0 : buttons.length - 1]?.focus(); return; }
    const columns = Math.max(1, doc.defaultView?.getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/u).length ?? 1);
    const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" ? columns : event.key === "ArrowUp" ? -columns : 0;
    if (offset) { event.preventDefault(); buttons[(current + offset + buttons.length) % buttons.length]?.focus(); }
  });
  section.append(heading, hint, grid, status); shadow.append(style, section);
  applyChoicePresentation(host, presentation);
  return host;
}
