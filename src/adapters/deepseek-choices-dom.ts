import { parseSceneChoices, sceneChoiceText, type SceneChoice } from "../core/scene-choices";
import type { Locale } from "../core/types";
import { findSafeServiceContainer } from "./deepseek-service-dom";

const MARKER = "<deeprole_choices>";
const HOST = "[data-deeprole-choices-host]";
const HIDDEN = "[data-deeprole-choices-payload]";
let dismissedChoice: string | null = null;

export function dismissSceneChoiceCards(root: ParentNode = document): void {
  const host = [...root.querySelectorAll<HTMLElement>(HOST)].at(-1);
  if (host?.dataset.deeproleChoicesSignature) dismissedChoice = `${location.href}:${host.dataset.deeproleChoicesSignature}`;
  root.querySelectorAll<HTMLElement>(HOST).forEach((card) => card.remove());
}

/** Keep the story in DeepSeek's reply while replacing only its machine-readable choices. */
export function syncSceneChoiceCards(enabled: boolean, generating: boolean, locale: Locale, onPick: (choice: SceneChoice, signature: string) => Promise<boolean>, root: ParentNode = document): void {
  if (!enabled) {
    root.querySelectorAll<HTMLElement>(HOST).forEach((host) => host.remove());
    return;
  }
  const turns = [...root.querySelectorAll<HTMLElement>("[data-message-id]")]
    .filter((element) => !element.closest("deeprole-page-widget") && !element.querySelector("[data-message-id]"));
  const latestTurn = turns.at(-1);
  const candidates = findChoiceElements(latestTurn ?? root).flatMap(({ element, parsed }) => {
    if (element.closest("deeprole-page-widget, [data-deeprole-service-reply='true']")) return [];
    return [{ element, parsed, row: findSafeServiceContainer(element) }];
  });
  const last = candidates.at(-1);
  const signature = last ? choiceSignature(last.element) : "";
  const active = !generating && last && (!latestTurn || latestTurn.contains(last.element)) && dismissedChoice !== `${location.href}:${signature}` ? last : null;
  root.querySelectorAll<HTMLElement>(HOST).forEach((host) => {
    if (host.previousElementSibling !== active?.row) host.remove();
    else host.style.display = generating ? "none" : "";
  });
  if (!active) return;
  const next = active.row.nextElementSibling;
  const existing = next instanceof HTMLElement && next.matches(HOST) ? next : null;
  if (existing?.dataset.deeproleChoicesSignature === signature && existing.dataset.deeproleChoicesLocale === locale) return;
  existing?.remove();
  if (!active.element.querySelector(HIDDEN)) hideBlock(active.element, active.parsed.start, active.parsed.end);
  active.row.after(createCard(active.parsed.choices.options, locale, signature, onPick, active.row.ownerDocument));
}

function choiceSignature(element: HTMLElement): string {
  const text = element.textContent ?? "";
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}

function findChoiceElements(root: ParentNode) {
  const selector = "article, [data-message-id], [data-testid*='message'], div";
  const nodes = [...root.querySelectorAll<HTMLElement>(selector)];
  if (root instanceof HTMLElement && root.matches(selector)) nodes.unshift(root);
  const elements = nodes
    .flatMap((element) => { const text = element.textContent ?? ""; if (!text.includes(MARKER)) return []; const parsed = parseSceneChoices(text); return parsed ? [{ element, parsed }] : []; });
  return elements.filter(({ element }) => !elements.some((other) => other.element !== element && element.contains(other.element)));
}

function hideBlock(element: HTMLElement, start: number, end: number): void {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = element.ownerDocument.createRange();
  let offset = 0; let foundStart = false; let foundEnd = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (!foundStart && start < offset + length) { range.setStart(node, start - offset); foundStart = true; }
    if (foundStart && end <= offset + length) { range.setEnd(node, end - offset); foundEnd = true; break; }
    offset += length;
  }
  if (!foundStart || !foundEnd) return;
  const hidden = element.ownerDocument.createElement("span");
  hidden.dataset.deeproleChoicesPayload = "true";
  hidden.setAttribute("aria-hidden", "true");
  hidden.style.setProperty("display", "none", "important");
  hidden.append(range.extractContents());
  range.insertNode(hidden);
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
