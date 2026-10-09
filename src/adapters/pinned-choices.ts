import { fitPinnedScene, fitScene } from "../core/adaptive-layout";
import { sceneAvailableLeft } from "./adaptive-layout";

const bindings = new WeakMap<HTMLElement, () => void>();
const EDITABLE = "textarea, [contenteditable='true']";
const OWN_UI = "[data-deeprole-choices-host], deeprole-page-widget, .dr-root, .app-shell, .dr-characters, .dr-character-settings, .dr-character-dialog, .dr-character-editor";
const COMPOSER_GAP = 12;
type Composer = { editor: HTMLElement; panel: HTMLElement; bounds: DOMRect; ancestors: HTMLElement[]; floating: boolean };

/** Locate the visible native input panel. Never inspect its draft or message text. */
function findComposer(doc: Document): Composer | null {
  const win = doc.defaultView!;
  let found: Composer | null = null;
  for (const editor of doc.querySelectorAll<HTMLElement>(EDITABLE)) {
    if (editor.closest(`${OWN_UI}, [role='dialog'], [data-message-id], [data-role='assistant'], [data-role='user']`)) continue;
    const bounds = editor.getBoundingClientRect();
    if (bounds.width <= 100 || bounds.height <= 0 || bounds.top >= win.innerHeight || bounds.bottom <= 0 || win.getComputedStyle(editor).visibility === "hidden") continue;
    let panel = editor, rounded: HTMLElement | null = null, form: HTMLElement | null = null, controls: HTMLElement | null = null;
    let anchored = ["fixed", "sticky"].includes(win.getComputedStyle(editor).position), bounded = true;
    const ancestors: HTMLElement[] = [];
    // Sticky/fixed positioning often belongs to a wrapper above the rounded input panel.
    for (let parent = editor.parentElement, depth = 0; parent && parent !== doc.body && depth < 12; parent = parent.parentElement, depth++) {
      ancestors.push(parent);
      const style = win.getComputedStyle(parent), rect = parent.getBoundingClientRect();
      if (style.position === "fixed" || style.position === "sticky") anchored = true;
      if (rect.height > Math.min(380, win.innerHeight * .65) || rect.width > bounds.width * 1.8 || rect.top < 0) bounded = false;
      if (!bounded) continue;
      const hasControls = !!parent.querySelector("button");
      if (!rounded && parseFloat(style.borderRadius) >= 12 && (hasControls || parent.matches("form"))) rounded = parent;
      if (!form && parent.matches("form")) form = parent;
      if (!controls && hasControls) controls = parent;
    }
    panel = rounded ?? form ?? controls ?? panel;
    const rect = panel.getBoundingClientRect();
    if (!anchored && rect.bottom < win.innerHeight - 80) continue;
    if (!found || rect.bottom > found.bounds.bottom) found = { editor, panel, bounds: rect, ancestors, floating: anchored };
  }
  return found;
}

export function composerBounds(doc: Document, floatingOnly = false): DOMRect | null {
  const found = findComposer(doc);
  return found && (!floatingOnly || found.floating) ? found.bounds : null;
}

/** Inline options use the same native input center, but remain in the story flow. */
export function fitComposerInlineChoices(host: HTMLElement): boolean {
  const composer = composerBounds(host.ownerDocument, true), parent = host.parentElement;
  if (!composer || !parent) return false;
  const doc = host.ownerDocument, rect = parent.getBoundingClientRect(), style = doc.defaultView!.getComputedStyle(parent);
  const fit = inlineSceneFit(doc);
  const contentLeft = rect.left + (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.borderLeftWidth) || 0);
  for (const [key, value] of [["width", `${fit.choices}px`], ["left", ""], ["margin-left", `${fit.x - contentLeft}px`]] as const) {
    if (host.style.getPropertyValue(key) !== value) host.style.setProperty(key, value);
  }
  return true;
}

/** Shared by the pinned card and portrait stage, so neither can recenter the other. */
export function pinnedSceneFit(doc: Document, count = 0) {
  const width = doc.documentElement.clientWidth, left = sceneAvailableLeft(doc), composer = composerBounds(doc);
  return composer ? fitPinnedScene(width, left, composer.left + composer.width / 2, count, composer.width)
    : fitScene(width, left, (left + width - 8) / 2, count);
}

export function inlineSceneFit(doc: Document, count = 0) {
  return pinnedSceneFit(doc, count);
}

export function fitPinnedChoices(host: HTMLElement): void {
  if (host.dataset.deeproleChoicesPinned !== "true" || !host.isConnected) return;
  const doc = host.ownerDocument, win = doc.defaultView!, viewport = win.visualViewport;
  const visibleBottom = Math.min(win.innerHeight, viewport ? viewport.offsetTop + viewport.height : win.innerHeight);
  const composer = composerBounds(doc);
  const cardBottom = Math.min(composer ? composer.top - COMPOSER_GAP : visibleBottom - 24, visibleBottom - COMPOSER_GAP);
  const top = Math.max(60, (viewport?.offsetTop ?? 0) + 8) + Number(host.dataset.pinnedPortraitReserve ?? 0);
  const fit = pinnedSceneFit(doc, Number(host.dataset.pinnedPortraitCount ?? 0));
  const set = (key: string, value: string) => { if (host.style.getPropertyValue(key) !== value) host.style.setProperty(key, value); };
  // CSS bottom uses layout-viewport coordinates, not visualViewport.height (e.g. a keyboard).
  set("bottom", `${Math.max(COMPOSER_GAP, win.innerHeight - cardBottom)}px`);
  set("--dr-pinned-max-height", `${Math.max(64, cardBottom - top)}px`);
  set("width", `${fit.choices}px`);
  set("left", `${fit.x + fit.choices / 2}px`);
  set("margin-left", "0px");
}

export function bindPinnedChoices(host: HTMLElement, pinned: boolean): void {
  if (!pinned) {
    bindings.get(host)?.(); bindings.delete(host);
    for (const key of ["bottom", "--dr-pinned-max-height"]) host.style.removeProperty(key);
    return;
  }
  fitPinnedChoices(host);
  if (bindings.has(host)) return;
  bindings.set(host, observeChoiceComposer(host, () => {
    fitPinnedChoices(host); host.ownerDocument.defaultView!.dispatchEvent(new Event("deeprole-pinned-layout"));
  }));
}

/** Observe native input geometry for either placement mode; idle pages are not polled. */
export function observeChoiceComposer(host: HTMLElement, onLayout: () => void, extra: Element[] = []): () => void {
  const doc = host.ownerDocument, win = doc.defaultView!;
  let frame = 0, editor: HTMLElement | null = null, watched: HTMLElement[] = [];
  const moving = new Map<HTMLElement, Set<string>>();
  const update = () => {
    if (frame) return;
    frame = win.requestAnimationFrame(() => {
      frame = 0; observeComposer(); onLayout();
      if (moving.size) update();
    });
  };
  const observer = new ResizeObserver(update);
  const attributes = new MutationObserver(update);
  const observeComposer = () => {
    const current = findComposer(doc);
    // Keep watching a temporarily hidden input so that its return triggers a layout update.
    if (!current && editor?.isConnected) return;
    const nodes = current ? [...new Set([current.editor, current.panel, ...current.ancestors])] : [];
    if (nodes.length === watched.length && nodes.every((node, i) => node === watched[i])) return;
    watched.forEach(node => observer.unobserve(node)); attributes.disconnect();
    watched = nodes; editor = current?.editor ?? null;
    for (const node of moving.keys()) if (!watched.includes(node)) moving.delete(node);
    for (const node of watched) {
      observer.observe(node);
      attributes.observe(node, { attributes: true, attributeFilter: ["style", "class", "hidden", "disabled", "aria-hidden"] });
    }
  };
  observeComposer();
  const section = host.shadowRoot?.querySelector("section");
  if (section) observer.observe(section);
  for (const node of extra) observer.observe(node);
  const replacements = new MutationObserver(records => {
    if ((editor && !editor.isConnected) || records.some(record => [...record.addedNodes, ...record.removedNodes].some(node =>
      node instanceof Element && !node.closest(OWN_UI) && (node.matches(EDITABLE) || node.querySelector(EDITABLE) || (editor && node.contains(editor)))))) update();
  });
  replacements.observe(doc.body, { childList: true, subtree: true });
  // Position-only CSS transitions do not fire ResizeObserver. Track only geometric
  // transitions on the composer chain; idle pages and decorative effects need no polling.
  const transition = (event: TransitionEvent) => {
    const node = event.target as HTMLElement;
    if (!watched.includes(node) || !/^(transform|translate|scale|left|right|top|bottom|inset.*|.*width|.*height|margin.*|padding.*|flex.*|grid.*)$/.test(event.propertyName)) return;
    const properties = moving.get(node) ?? new Set<string>();
    if (event.type === "transitionrun") { properties.add(event.propertyName); moving.set(node, properties); }
    else { properties.delete(event.propertyName); if (!properties.size) moving.delete(node); }
    update();
  };
  doc.addEventListener("transitionrun", transition); doc.addEventListener("transitionend", transition); doc.addEventListener("transitioncancel", transition);
  win.addEventListener("resize", update); win.addEventListener("scroll", update, true); win.addEventListener("deeprole-layout-change", update);
  win.visualViewport?.addEventListener("resize", update); win.visualViewport?.addEventListener("scroll", update);
  return () => {
    observer.disconnect(); attributes.disconnect(); replacements.disconnect(); win.cancelAnimationFrame(frame);
    doc.removeEventListener("transitionrun", transition); doc.removeEventListener("transitionend", transition); doc.removeEventListener("transitioncancel", transition);
    win.removeEventListener("resize", update); win.removeEventListener("scroll", update, true); win.removeEventListener("deeprole-layout-change", update);
    win.visualViewport?.removeEventListener("resize", update); win.visualViewport?.removeEventListener("scroll", update);
  };
}
