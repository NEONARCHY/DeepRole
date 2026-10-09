import { fitAdaptiveChoices } from "./adaptive-layout";
import { composerBounds, inlineSceneFit, observeChoiceComposer } from "./pinned-choices";

const CHOICES = "[data-deeprole-choices-host]";

/** Same geometry as the options; no image pixels or draft contents are read. */
export function illustrationBounds(doc: Document): { left: number; width: number } | null {
  if (composerBounds(doc, true)) {
    const fit = inlineSceneFit(doc);
    return { left: fit.x, width: fit.choices };
  }
  const host = doc.querySelector<HTMLElement>(CHOICES);
  const section = host?.shadowRoot?.querySelector("section") ?? host;
  const bounds = section?.getBoundingClientRect();
  return bounds && bounds.width > 0 ? { left: bounds.left, width: bounds.width } : null;
}

/** One observer group for the whole history, not one per illustration. */
export class IllustrationLayout {
  private hosts: HTMLElement[] = [];
  private watched = new Set<Element>();
  private resize?: ResizeObserver;
  private attributes?: MutationObserver;
  private replacements?: MutationObserver;
  private stopComposer?: () => void;
  private frame = 0;
  constructor(private readonly doc: Document) {}

  private readonly schedule = () => {
    if (this.frame) return;
    this.frame = this.doc.defaultView!.requestAnimationFrame(() => {
      this.frame = 0; this.watch(); this.fit();
    });
  };

  sync(hosts: Iterable<HTMLElement>) {
    this.hosts = [...hosts].filter(host => host.isConnected);
    if (!this.hosts.length) { this.clear(); return; }
    if (!this.stopComposer) {
      // A stable, detached anchor keeps the common observer alive even if the
      // first native reply is virtualized or replaced. Nothing is added to DOM.
      this.stopComposer = observeChoiceComposer(this.doc.createElement("div"), this.schedule);
      this.resize = new ResizeObserver(this.schedule);
      this.attributes = new MutationObserver(this.schedule);
      this.replacements = new MutationObserver(records => {
        if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node =>
          node instanceof Element && (node.matches(CHOICES) || node.querySelector(CHOICES))))) this.schedule();
      });
      this.replacements.observe(this.doc.body, { childList: true, subtree: true });
      for (const event of ["deeprole-inline-layout", "deeprole-pinned-layout"]) this.doc.defaultView!.addEventListener(event, this.schedule);
    }
    this.watch(); this.fit();
  }

  private watch() {
    const host = this.doc.querySelector<HTMLElement>(CHOICES);
    const nodes = new Set<Element>([
      ...this.hosts.flatMap(image => [image.parentElement, image.parentElement?.parentElement]),
      host, host?.shadowRoot?.querySelector("section"),
    ].filter((node): node is HTMLElement => !!node?.isConnected));
    if (nodes.size === this.watched.size && [...nodes].every(node => this.watched.has(node))) return;
    this.resize?.disconnect(); this.attributes?.disconnect(); this.watched = nodes;
    for (const node of nodes) {
      this.resize?.observe(node);
      this.attributes?.observe(node, { attributes: true, attributeFilter: ["style", "class", "hidden"] });
    }
  }

  private fit() {
    const bounds = illustrationBounds(this.doc), win = this.doc.defaultView!;
    // Read all native parents before writing any host to avoid layout thrashing.
    const positions = this.hosts.filter(host => host.isConnected).map(host => {
      const parent = host.parentElement!, rect = parent.getBoundingClientRect(), style = win.getComputedStyle(parent);
      return { host, contentLeft: rect.left + (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.borderLeftWidth) || 0) };
    });
    for (const { host, contentLeft } of positions) {
      for (const [key, value] of [["width", bounds ? `${bounds.width}px` : ""], ["margin-left", bounds ? `${bounds.left - contentLeft}px` : ""]] as const) {
        if (host.style.getPropertyValue(key) === value) continue;
        if (value) host.style.setProperty(key, value); else host.style.removeProperty(key);
      }
    }
    // A story without options still has its optional recovery card. Keep that
    // surface on the same edges, without using it as a circular size source.
    this.doc.querySelectorAll<HTMLElement>("[data-deeprole-choices-recovery]").forEach(fitAdaptiveChoices);
  }

  clear() {
    this.stopComposer?.(); this.stopComposer = undefined;
    this.resize?.disconnect(); this.attributes?.disconnect(); this.replacements?.disconnect();
    this.doc.defaultView!.cancelAnimationFrame(this.frame); this.frame = 0;
    for (const event of ["deeprole-inline-layout", "deeprole-pinned-layout"]) this.doc.defaultView!.removeEventListener(event, this.schedule);
    this.watched.clear(); this.hosts = [];
  }
}
