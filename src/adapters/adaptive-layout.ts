import { fitComposerInlineChoices } from "./pinned-choices";

/** The widget lives in a shadow root in production, and plain DOM in fixtures. */
export function widgetDeck(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>(".dr-widget-deck") ?? doc.querySelector("deeprole-page-widget")?.shadowRoot?.querySelector<HTMLElement>(".dr-widget-deck") ?? null;
}
export function widgetRects(doc: Document): DOMRect[] {
  return [...(widgetDeck(doc)?.querySelectorAll<HTMLElement>(".dr-widget-dock,.dr-widget-tile:not([hidden])") ?? [])].map(node => node.getBoundingClientRect()).filter(rect => rect.width && rect.height);
}

export function sceneAvailableLeft(doc: Document): number {
  const deck = widgetDeck(doc);
  if (!deck) return 8;
  const minimum = Number(deck.dataset.minimumLeft) || 8;
  if (deck.dataset.compact === "true") return minimum;
  const rects = widgetRects(doc);
  const leftPanels = rects.filter(rect => rect.width && rect.right < doc.documentElement.clientWidth * .55);
  return Math.max(minimum, ...leftPanels.map(rect => rect.right + 16));
}

const listening = new WeakSet<Document>();
export function fitAdaptiveChoices(host: HTMLElement) {
  const doc = host.ownerDocument;
  if (!listening.has(doc)) {
    listening.add(doc);
    let pending = false;
    const update = () => {
      if (pending) return; pending = true;
      doc.defaultView?.requestAnimationFrame(() => { pending = false; doc.querySelectorAll<HTMLElement>("[data-deeprole-choices-host]").forEach(fitAdaptiveChoices); });
    };
    doc.defaultView?.addEventListener("resize", update);
    doc.defaultView?.addEventListener("deeprole-layout-change", update);
  }
  if (host.hasAttribute("data-adaptive-portraits")) return;
  // Pinned geometry has a single owner, including when adaptive sizing is disabled.
  if (host.dataset.deeproleChoicesPinned === "true") return;
  if (fitComposerInlineChoices(host)) return;
  if (host.dataset.deeproleAdaptive !== "true") {
    for (const key of ["width", "left", "margin-left"]) host.style.removeProperty(key);
    return;
  }
  const left = sceneAvailableLeft(doc), width = doc.documentElement.clientWidth;
  const parent = host.parentElement?.getBoundingClientRect();
  if (!parent) return;
  const parentStyle = doc.defaultView!.getComputedStyle(host.parentElement!);
  const contentLeft = parent.left + (parseFloat(parentStyle.paddingLeft) || 0) + (parseFloat(parentStyle.borderLeftWidth) || 0);
  const choices = Math.min(720, Math.max(1, width - left - 8), parent.width);
  const pinned = host.dataset.deeproleChoicesPinned === "true";
  const x = Math.max(left, Math.min(width - choices - 8, pinned ? (left + width - 8 - choices) / 2 : parent.left + (parent.width - choices) / 2));
  host.style.width = `${choices}px`;
  host.style.left = pinned ? `${x + choices / 2}px` : "";
  host.style.marginLeft = pinned ? "0px" : `${x - contentLeft}px`;
}
