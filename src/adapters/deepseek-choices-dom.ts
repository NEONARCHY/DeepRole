import { parseSceneChoices, sceneChoiceText, type SceneChoice } from "../core/scene-choices";
import type { Locale } from "../core/types";
import { findSafeServiceContainer } from "./deepseek-service-dom";
import designTokens from "../entrypoints/shared/design-tokens.css?raw";

const MARKER = "<deeprole_choices>";
const HOST = "[data-deeprole-choices-host]";
const HIDDEN = "[data-deeprole-choices-payload]";
const RECOVERY = "[data-deeprole-choices-recovery]";
const USER = "[data-role='user'], [data-message-role='user'], [data-testid*='user-message'], .ds-message--user";
const REASONING = "[data-testid*='thinking'], [data-testid*='reasoning'], .ds-think-content, .ds-think-content-wrapper";
let dismissedChoice: string | null = null;

export function dismissSceneChoiceCards(root: ParentNode = document, remember = true): void {
  const host = [...root.querySelectorAll<HTMLElement>(HOST)].at(-1);
  if (!remember) dismissedChoice = null;
  else if (host?.dataset.deeproleChoicesSignature) dismissedChoice = `${location.href}:${host.dataset.deeproleChoicesSignature}`;
  root.querySelectorAll<HTMLElement>(HOST).forEach((card) => card.remove());
  root.querySelectorAll<HTMLElement>(RECOVERY).forEach((card) => card.remove());
}

function latestTurn(root: ParentNode): HTMLElement | undefined {
  const turns = [...root.querySelectorAll<HTMLElement>("[data-message-id], [data-testid*='message'], article, [data-message-role], [data-role='user'], [data-role='assistant']")]
    .filter((element) => !element.closest(`deeprole-page-widget, ${HOST}, ${RECOVERY}, ${REASONING}`)
      && !element.querySelector("[data-message-id], article, [data-message-role], [data-role='user'], [data-role='assistant']")
      && element.getClientRects().length > 0);
  const last = turns.at(-1);
  // Some site versions put the assistant Markdown after an empty message-id row.
  const markdown = [...root.querySelectorAll<HTMLElement>(".ds-markdown")]
    .filter((element) => !element.closest(`deeprole-page-widget, ${USER}, ${REASONING}`) && element.getClientRects().length > 0).at(-1);
  return markdown && (!last || last.compareDocumentPosition(markdown) & Node.DOCUMENT_POSITION_FOLLOWING) ? markdown : last;
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
  if (!turn || turn.closest(USER)) return null;
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
export function syncSceneChoiceCards(enabled: boolean, generating: boolean, locale: Locale, onPick: (choice: SceneChoice, signature: string) => Promise<boolean>, root: ParentNode = document, recovery?: { busy: boolean; onRequest: (signature: string) => Promise<boolean> }): void {
  if (!enabled) {
    root.querySelectorAll<HTMLElement>(HOST).forEach((host) => host.remove());
    root.querySelectorAll<HTMLElement>(RECOVERY).forEach((host) => host.remove());
    return;
  }
  const latest = latestTurn(root);
  // DeepSeek sometimes renders the assistant body outside its message-id node.
  // Search the page, then reject blocks belonging to an earlier turn.
  const candidates = findChoiceElements(root).flatMap(({ element, parsed }) => {
    if (element.closest(`deeprole-page-widget, ${USER}, ${REASONING}, form, [contenteditable='true']`)) return [];
    if (element.closest("[data-deeprole-service-reply='true']:not([data-deeprole-scene-choices-reply='true'])")) return [];
    return [{ element, parsed, row: findSafeServiceContainer(element) }];
  });
  const last = candidates.at(-1);
  const signature = last ? `${location.href}:${last.row.getAttribute("data-message-id") ?? ""}:${textSignature(JSON.stringify(last.parsed.choices))}` : "";
  const belongsToLatest = !latest || Boolean(last && (latest.contains(last.element) || latest.compareDocumentPosition(last.element) & Node.DOCUMENT_POSITION_FOLLOWING));
  const active = !generating && last && belongsToLatest && dismissedChoice !== `${location.href}:${signature}` ? last : null;
  root.querySelectorAll<HTMLElement>(HOST).forEach((host) => {
    if (host.previousElementSibling !== active?.row) host.remove();
    else host.style.display = generating ? "none" : "";
  });
  const target = !generating && !active && recovery ? latestSceneChoiceTarget(root) : null;
  root.querySelectorAll<HTMLElement>(RECOVERY).forEach((host) => {
    if (host.previousElementSibling !== target?.row || host.dataset.deeproleChoicesSignature !== target?.signature
      || host.dataset.deeproleChoicesLocale !== locale || host.dataset.busy !== String(recovery?.busy) || !host.shadowRoot) host.remove();
  });
  if (target && recovery && !target.row.nextElementSibling?.matches(RECOVERY)) {
    target.row.after(createRecoveryCard(locale, target.signature, recovery, target.row.ownerDocument));
  }
  if (!active) return;
  const blockText = (active.element.textContent ?? "").slice(active.parsed.start, active.parsed.end);
  const alreadyHidden = [...active.element.querySelectorAll<HTMLElement>(HIDDEN)]
    .some((payload) => payload.textContent === blockText);
  if (!alreadyHidden && !hideBlock(active.element, active.parsed.start, active.parsed.end)) return;
  const next = active.row.nextElementSibling;
  const existing = next instanceof HTMLElement && next.matches(HOST) ? next : null;
  if (existing?.dataset.deeproleChoicesSignature === signature && existing.dataset.deeproleChoicesLocale === locale
    && existing.shadowRoot?.querySelectorAll(".grid button").length === 4) return;
  existing?.remove();
  active.row.after(createCard(active.parsed.choices.options, locale, signature, onPick, active.row.ownerDocument));
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
  style.textContent = `${designTokens}:host{display:block;margin:var(--dr-space-4) 0;font:13px/1.5 system-ui,sans-serif;color:var(--dr-text)}.box{max-width:690px;padding:var(--dr-space-4);border:1px solid var(--dr-border);border-radius:var(--dr-radius);background:var(--dr-panel);box-sizing:border-box}button{min-height:40px;padding:9px 14px;border:1px solid var(--dr-action);border-radius:10px;background:var(--dr-action);color:var(--dr-on-action);font:600 13px/1.4 system-ui,sans-serif;cursor:pointer}button:hover{background:var(--dr-action-hover)}button:focus-visible{outline:2px solid var(--dr-primary);outline-offset:3px}button:disabled{opacity:.65;cursor:wait}p{margin:var(--dr-space-2) 0 0;color:var(--dr-muted);font-size:12px;overflow-wrap:anywhere}`;
  const box = doc.createElement("div"); box.className = "box";
  const button = doc.createElement("button"); button.type = "button"; button.disabled = recovery.busy;
  button.textContent = sceneChoiceText(locale, recovery.busy ? "waiting" : "request");
  const hint = doc.createElement("p"); hint.textContent = sceneChoiceText(locale, recovery.busy ? "waitingHint" : "requestHint");
  button.setAttribute("aria-describedby", "request-hint"); hint.id = "request-hint";
  button.addEventListener("click", () => {
    button.disabled = true;
    void recovery.onRequest(signature).finally(() => { if (host.isConnected) button.disabled = recovery.busy; });
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
      if (!parsed) continue;
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

function hideBlock(element: HTMLElement, start: number, end: number): boolean {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = element.ownerDocument.createRange();
  let offset = 0; let foundStart = false; let foundEnd = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (!foundStart && start < offset + length) { range.setStart(node, start - offset); foundStart = true; }
    if (foundStart && end <= offset + length) { range.setEnd(node, end - offset); foundEnd = true; break; }
    offset += length;
  }
  if (!foundStart || !foundEnd) return false;
  const hidden = element.ownerDocument.createElement("span");
  hidden.dataset.deeproleChoicesPayload = "true";
  hidden.setAttribute("aria-hidden", "true");
  hidden.style.setProperty("display", "none", "important");
  hidden.append(range.extractContents());
  range.insertNode(hidden);
  return true;
}

function createCard(options: SceneChoice[], locale: Locale, signature: string, onPick: (choice: SceneChoice, signature: string) => Promise<boolean>, doc: Document): HTMLElement {
  const host = doc.createElement("div");
  host.dataset.deeproleChoicesHost = "true";
  host.dataset.deeproleChoicesSignature = signature;
  host.dataset.deeproleChoicesLocale = locale;
  const shadow = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = `:host{display:block;margin:16px 0;font:14px/1.45 system-ui,sans-serif;color:#e6ebee}section{max-width:690px;padding:16px;border:1px solid #3b4a53;border-radius:14px;background:#172027;box-shadow:0 8px 24px #0002}h3{margin:0 0 4px;font-size:15px;font-weight:650}p{margin:0 0 13px;color:#a9b8c1;font-size:12px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}button{box-sizing:border-box;width:100%;min-height:88px;padding:11px 12px;text-align:left;border:1px solid #455762;border-radius:10px;background:#202c34;color:#e6ebee;cursor:pointer;font:inherit}button:hover,button:focus-visible{border-color:#9bc9e6;background:#283944;outline:none}button[aria-pressed=true]{border-color:#9bc9e6;background:#294357}button:disabled{opacity:.55;cursor:wait}small{display:block;margin-bottom:4px;color:#a9b8c1;font-size:11px}strong{display:block;font-size:13px;font-weight:600;white-space:normal;overflow-wrap:anywhere}.preview{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;margin-top:5px;color:#a9b8c1;font-size:12px;overflow-wrap:anywhere}@media(max-width:600px){.grid{grid-template-columns:1fr}button{min-height:68px}}`;
  const section = doc.createElement("section");
  section.setAttribute("aria-label", sceneChoiceText(locale, "title"));
  const title = doc.createElement("h3"); title.textContent = sceneChoiceText(locale, "title");
  const hint = doc.createElement("p"); hint.textContent = sceneChoiceText(locale, "hint");
  const grid = doc.createElement("div"); grid.className = "grid"; grid.setAttribute("role", "group"); grid.setAttribute("aria-label", sceneChoiceText(locale, "title"));
  for (const choice of options) {
    const button = doc.createElement("button"); button.type = "button"; button.setAttribute("aria-pressed", "false");
    const category = doc.createElement("small"); category.textContent = sceneChoiceText(locale, choice.kind);
    const label = doc.createElement("strong"); label.textContent = choice.label;
    const preview = doc.createElement("span"); preview.className = "preview"; preview.textContent = choice.text;
    button.append(category, label, preview);
    button.addEventListener("click", () => { void onPick(choice, signature).then((ok) => { if (ok) grid.querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", String(item === button))); }); });
    grid.append(button);
  }
  section.append(title, hint, grid); shadow.append(style, section);
  return host;
}
