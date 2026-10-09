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

/** The optional request belongs to its story illustration, not to the input. */
function fitIllustrationRecovery(host: HTMLElement): boolean {
  if (!host.hasAttribute("data-deeprole-choices-recovery")) return false;
  const parent = host.parentElement, row = host.previousElementSibling;
  const image = row?.querySelector<HTMLElement>("[data-deeprole-illustrations]");
  if (!parent || !image) return false;
  const anchor = image.shadowRoot?.querySelector<HTMLElement>(".dr-illustration-reply") ?? image;
  const bounds = anchor.getBoundingClientRect(), doc = host.ownerDocument, viewport = doc.documentElement.clientWidth;
  if (!bounds.width || !viewport) return false;
  const style = doc.defaultView!.getComputedStyle(parent), parentBounds = parent.getBoundingClientRect();
  const contentLeft = parentBounds.left + (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.borderLeftWidth) || 0);
  const x = Math.max(8, Math.min(viewport - 9, bounds.left));
  const width = Math.max(1, Math.min(bounds.width, viewport - x - 8));
  for (const [key, value] of [["width", `${width}px`], ["left", ""], ["margin-left", `${x - contentLeft}px`]] as const) {
    if (host.style.getPropertyValue(key) !== value) host.style.setProperty(key, value);
  }
  return true;
}

export function fitAdaptiveChoices(host: HTMLElement) {
  const doc = host.ownerDocument;
  if (!listening.has(doc)) {
    listening.add(doc);
    let pending = false;
    const update = () => {
      if (pending) return; pending = true;
      doc.defaultView?.requestAnimationFrame(() => { pending = false; doc.querySelectorAll<HTMLElement>("[data-deeprole-choices-host],[data-deeprole-choices-recovery]").forEach(fitAdaptiveChoices); });
    };
    doc.defaultView?.addEventListener("resize", update);
    doc.defaultView?.addEventListener("deeprole-layout-change", update);
  }
  if (host.hasAttribute("data-adaptive-portraits")) return;
  // Pinned geometry has a single owner, including when adaptive sizing is disabled.
  if (host.dataset.deeproleChoicesPinned === "true") return;
  if (fitIllustrationRecovery(host)) return;
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
