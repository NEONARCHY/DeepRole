import { parseSceneChoices, sceneChoiceText, type SceneChoice } from "../core/scene-choices";
import type { Locale } from "../core/types";
import { findSafeServiceContainer } from "./deepseek-service-dom";
import { nativeMessageRow, isUserMessage } from "./deepseek-message-dom";
import designTokens from "../entrypoints/shared/design-tokens.css?raw";

const MARKER = "<deeprole_choices>";
const HOST = "[data-deeprole-choices-host]";
const HIDDEN = "[data-deeprole-choices-payload]";
const RECOVERY = "[data-deeprole-choices-recovery]";
const USER = "[data-role='user'], [data-message-role='user'], [data-testid*='user-message'], .ds-message--user";
const REASONING = "[data-testid*='thinking'], [data-testid*='reasoning'], .ds-think-content, .ds-think-content-wrapper";
const MEMORY_SERVICE = "[data-deeprole-memory-presentation], [data-deeprole-memory-request]";
let dismissedChoice: string | null = null;
type ChoiceHandler = (choice: SceneChoice, signature: string) => Promise<boolean>;
const choiceHandlers = new WeakMap<HTMLElement, ChoiceHandler>();

export function dismissSceneChoiceCards(root: ParentNode = document, remember = true): void {
  const host = [...root.querySelectorAll<HTMLElement>(HOST)].at(-1);
  if (!remember) dismissedChoice = null;
  else if (host?.dataset.deeproleChoicesSignature) dismissedChoice = `${location.href}:${host.dataset.deeproleChoicesSignature}`;
  root.querySelectorAll<HTMLElement>(HOST).forEach((card) => card.remove());
  root.querySelectorAll<HTMLElement>(RECOVERY).forEach((card) => card.remove());
}

function latestTurn(root: ParentNode): HTMLElement | undefined {
  const turns = [...root.querySelectorAll<HTMLElement>(".ds-message, [data-message-id], [data-testid*='message'], article, [data-message-role], [data-role='user'], [data-role='assistant']")]
    .filter((element) => !element.closest(`deeprole-page-widget, ${HOST}, ${RECOVERY}, ${REASONING}, ${MEMORY_SERVICE}`)
      && !element.querySelector(".ds-message, [data-message-id], article, [data-message-role], [data-role='user'], [data-role='assistant']")
      && element.getClientRects().length > 0);
  const last = turns.at(-1);
  // Some site versions put the assistant Markdown after an empty message-id row.
  const markdown = [...root.querySelectorAll<HTMLElement>(".ds-markdown")]
    .filter((element) => !element.closest(`deeprole-page-widget, ${USER}, ${REASONING}, ${MEMORY_SERVICE}`) && element.getClientRects().length > 0).at(-1);
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
export function syncSceneChoiceCards(enabled: boolean, generating: boolean, locale: Locale, onPick: ChoiceHandler, root: ParentNode = document, recovery?: { busy: boolean; onRequest: (signature: string) => Promise<boolean> }): void {
  if (!enabled) {
    root.querySelectorAll<HTMLElement>(HOST).forEach((host) => host.remove());
    root.querySelectorAll<HTMLElement>(RECOVERY).forEach((host) => host.remove());
    return;
  }
  const current = currentChoice(root);
  const signature = current?.signature ?? "";
  const active = !generating && current && dismissedChoice !== `${location.href}:${signature}` ? current : null;
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
    && existing.shadowRoot?.querySelectorAll(".grid button").length === 4) { choiceHandlers.set(existing, onPick); return; }
  existing?.remove();
  active.row.after(createCard(active.parsed.choices.options, locale, signature, onPick, active.row.ownerDocument, root));
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

function createCard(options: SceneChoice[], locale: Locale, signature: string, onPick: ChoiceHandler, doc: Document, root: ParentNode): HTMLElement {
  const host = doc.createElement("div");
  host.dataset.deeproleChoicesHost = "true";
  host.dataset.deeproleChoicesSignature = signature;
  host.dataset.deeproleChoicesLocale = locale;
  choiceHandlers.set(host, onPick);
  const shadow = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = `${designTokens}
    :host{display:block;container-type:inline-size;margin:var(--dr-space-4) 0;font:14px/1.5 system-ui,sans-serif;color:var(--dr-text)}
    section{box-sizing:border-box;max-width:1000px;padding:var(--dr-space-4);border:1px solid var(--dr-border);border-radius:var(--dr-radius);background:var(--dr-panel)}
    .choice-heading{display:flex;align-items:center;justify-content:space-between;gap:var(--dr-space-3);margin-bottom:var(--dr-space-1)}h3{margin:0;min-width:0;font-size:17px;font-weight:650}p{margin:0 0 var(--dr-space-4);color:var(--dr-muted);font-size:12px}
    .choice-expand{flex-shrink:0;min-height:44px;max-width:55%;padding:var(--dr-space-2) var(--dr-space-3);border:1px solid var(--dr-border);border-radius:8px;background:var(--dr-surface);color:var(--dr-text);cursor:pointer;font:600 12px/1.4 system-ui,sans-serif}.choice-expand:hover{background:var(--dr-raised)}
    .grid{display:grid;grid-template-columns:1fr;gap:var(--dr-space-2)}
    .grid button{--choice-tint:var(--dr-choice-neutral);position:relative;box-sizing:border-box;width:100%;min-height:80px;padding:var(--dr-space-3);text-align:start;border:1px solid color-mix(in oklab,var(--choice-tint) 40%,var(--dr-surface));border-inline-start:3px solid var(--choice-tint);border-radius:10px;background:color-mix(in oklab,var(--choice-tint) 14%,var(--dr-surface));color:var(--dr-text);cursor:pointer;font:inherit}
    .grid button[data-choice-kind=positive]{--choice-tint:var(--dr-choice-positive)}
    .grid button[data-choice-kind=negative]{--choice-tint:var(--dr-choice-negative)}
    .grid button[data-choice-kind=surprise]{--choice-tint:var(--dr-choice-surprise)}
    .grid button:hover{border-color:var(--choice-tint);background:color-mix(in oklab,var(--choice-tint) 18%,var(--dr-surface))}
    button:focus-visible{outline:2px solid var(--dr-primary);outline-offset:3px}
    .grid button[aria-pressed=true]{border-color:var(--choice-tint);background:color-mix(in oklab,var(--choice-tint) 22%,var(--dr-surface));box-shadow:inset 0 0 0 1px var(--choice-tint)}
    .grid button[aria-pressed=true] .preview{color:var(--dr-text)}
    button:disabled,button[aria-disabled=true]{opacity:.65;cursor:wait}small{display:block;margin-bottom:var(--dr-space-1);color:var(--dr-muted);font-size:11px}
    .number{position:absolute;inset-inline-end:10px;top:10px;min-width:20px;text-align:center;border:1px solid color-mix(in oklab,var(--choice-tint) 45%,var(--dr-surface));border-radius:5px;color:var(--choice-tint);font:12px/20px system-ui}
    .grid button[aria-pressed=true] .number{background:var(--choice-tint);color:var(--dr-bg);border-color:var(--choice-tint)}
    .grid button[aria-pressed=true] .number::before{content:'✓';margin-inline-end:3px}
    .grid small{padding-inline-end:40px;color:var(--choice-tint)}strong{display:block;font-size:14px;font-weight:600;white-space:normal;overflow-wrap:anywhere}
    .preview{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;margin-top:var(--dr-space-1);color:var(--dr-muted);font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}.grid[data-expanded=true] .preview{display:block;-webkit-line-clamp:unset}
    .choice-status{min-height:18px;margin:var(--dr-space-3) 0 0;overflow-wrap:anywhere}.choice-status[data-selected=true]{color:var(--dr-primary)}
    @container(min-width:560px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
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
  heading.append(title, expand);
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
      if (current?.signature !== signature || current.row !== host.previousElementSibling) { status.textContent = sceneChoiceText(locale, "changed"); status.dataset.selected = "false"; return; }
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
  return host;
}
