import { NATIVE_TURN, REASONING, isUserMessage } from "./deepseek-message-dom";

export const TRANSPORT_FRAGMENT = "[data-deeprole-choices-payload]";
export const TRANSPORT_VIEW = "[data-deeprole-payload-view]";
export const TRANSPORT_SOURCE = "[data-deeprole-payload-source]";
export const TRANSPORT_CONTAINER = "[data-deeprole-transport-container]";
const RESULT = "[data-deeprole-characters-result]";
const SKIP = `${REASONING}, ${RESULT}, ${TRANSPORT_VIEW}, button, [role=button], [role=toolbar], script, style`;
const OWNED = `${TRANSPORT_VIEW}, ${RESULT}, [data-deeprole-choices-host], [data-deeprole-choices-loading], [data-deeprole-choices-recovery]`;
const SAFE_MARKDOWN = "div,p,span,pre,code,em,strong,b,i,s,del,u,small,sub,sup,kbd,mark,blockquote,ul,ol,li,h1,h2,h3,h4,h5,h6,br,hr,table,thead,tbody,tfoot,tr,th,td";
type Kind = "choices" | "characters";
type Block = { kind: Kind; start: number; end: number; complete: boolean };
type Part = { node: Text; start: number; end: number };
type Hidden = { kind: Kind; view?: HTMLElement };
const hiddenBySource = new WeakMap<HTMLElement, Map<HTMLElement, Hidden>>();
const projections = new WeakMap<HTMLElement, HTMLElement>();
const results = new WeakMap<HTMLElement, { details: HTMLDetailsElement; payload: string }>();

export function hasTransportView(element: HTMLElement): boolean {
  return !!projections.get(element)?.getClientRects().length;
}

export function clearDetachedTransportViews(root: ParentNode): void {
  for (const view of root.querySelectorAll<HTMLElement>(TRANSPORT_VIEW)) {
    const source = view.nextSibling;
    if (!(source instanceof HTMLElement) || projections.get(source) !== view) view.remove();
  }
}

export function transportResult(source: HTMLElement): HTMLDetailsElement | undefined {
  return results.get(source)?.details;
}

export function rememberTransportResult(source: HTMLElement, details: HTMLDetailsElement, payload: string): void {
  results.set(source, { details, payload });
}

export function readTransportSource(source: HTMLElement) {
  const walker = source.ownerDocument.createTreeWalker(source, NodeFilter.SHOW_TEXT);
  const parts: Part[] = [];
  let text = "";
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (node.parentElement?.closest(SKIP) || !node.data) continue;
    parts.push({ node, start: text.length, end: text.length + node.length });
    text += node.data;
  }
  return { text, parts };
}

function partialTransport(text: string): Block | undefined {
  const suffix = /<deeprole(?:_[a-z]*)?$/u.exec(text);
  if (!suffix) return;
  const kind = (["characters", "choices"] as const).find(value => `<deeprole_${value}>`.startsWith(suffix[0]));
  if (kind) return { kind, start: suffix.index, end: text.length, complete: false };
}

export function hasTransportMarker(text: string): boolean {
  return /<deeprole_(?:characters|choices)\b/u.test(text) || !!partialTransport(text);
}

/** Markdown can split one marker across nodes, then append marker-free chunks. */
export function transportChanged(changes: MutationRecord[]): boolean {
  const sources = new Set<HTMLElement>();
  const elementFor = (node: Node) => node instanceof HTMLElement ? node : node.parentElement;
  for (const change of changes) {
    if ([...change.removedNodes].some(node => node instanceof HTMLElement
      && (node.matches(TRANSPORT_SOURCE) || node.querySelector(TRANSPORT_SOURCE)))) return true;
    const touched = [...change.addedNodes, ...change.removedNodes];
    if (touched.length && touched.every(node => elementFor(node)?.closest(OWNED))) continue;
    for (const node of [change.target, ...change.addedNodes]) {
      const element = elementFor(node);
      if (!element || element.closest(`${SKIP}, ${OWNED}, deeprole-page-widget, form, [contenteditable=true]`)) continue;
      const source = element.closest<HTMLElement>(".ds-markdown") ?? element.closest<HTMLElement>(NATIVE_TURN);
      if (source) {
        if (!isUserMessage(source)) sources.add(source);
      } else if (node !== change.target && hasTransportMarker(element.textContent ?? "")) return true;
    }
  }
  return [...sources].some(source => hasManagedTransport(source) || hasTransportMarker(source.textContent ?? ""));
}

function transportBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const marker of text.matchAll(/<deeprole_(characters|choices)\b/gu)) {
    const start = marker.index;
    if (start < (blocks.at(-1)?.end ?? 0)) continue;
    const kind = marker[1] as Kind;
    const close = `</deeprole_${kind}>`;
    const index = text.indexOf(close, start + marker[0].length);
    blocks.push({ kind, start, end: index < 0 ? text.length : index + close.length, complete: index >= 0 });
  }
  const partial = partialTransport(text);
  if (partial && partial.start >= (blocks.at(-1)?.end ?? 0)) blocks.push(partial);
  return blocks;
}

export function projectedTransportText(source: HTMLElement): string | undefined {
  if (!source.matches(TRANSPORT_SOURCE) && !source.querySelector(TRANSPORT_SOURCE)) return undefined;
  const { text } = readTransportSource(source);
  let cursor = 0;
  let prose = "";
  for (const block of transportBlocks(text)) {
    prose += text.slice(cursor, block.start);
    cursor = block.end;
  }
  return prose + text.slice(cursor);
}

function ensureStyles(doc: Document) {
  if (doc.getElementById("deeprole-transport-visibility")) return;
  const style = doc.createElement("style");
  style.id = "deeprole-transport-visibility";
  style.textContent = `${TRANSPORT_FRAGMENT},${TRANSPORT_SOURCE}{display:none!important}`;
  doc.head.append(style);
}

/** Copy only formatted prose for text nodes that contain both story and JSON.
 * React always keeps its original text nodes and child elements. */
function proseView(element: HTMLElement, markup: HTMLElement) {
  const doc = element.ownerDocument;
  const host = doc.createElement("span");
  host.dataset.deeprolePayloadView = "true";
  const computed = doc.defaultView?.getComputedStyle(element);
  const inline = /^(SPAN|EM|STRONG|B|I|S|DEL|U|SMALL|SUB|SUP|KBD|MARK|CODE)$/u.test(element.tagName);
  host.style.display = computed?.display && computed.display !== "none" ? computed.display : inline ? "inline" : "block";
  // The original paragraph can carry native Markdown margins and line height.
  // Move these to the projection host so replacing it does not move the chat.
  for (const property of ["margin-block-start", "margin-block-end", "margin-inline-start", "margin-inline-end", "font-family", "font-size", "font-style", "font-weight", "line-height", "white-space", "letter-spacing"]) {
    const value = computed?.getPropertyValue(property);
    if (value) host.style.setProperty(property, value);
  }
  const shadow = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = "p{margin:0 0 .75em}p:last-child{margin-bottom:0}pre,code{white-space:pre-wrap;overflow-wrap:anywhere}table{max-width:100%}style+*{margin:0;font:inherit;white-space:inherit}:host{overflow-wrap:anywhere}";
  shadow.append(style, markup);
  return host;
}

export function syncTransportVisibility(source: HTMLElement, enabled = true) {
  const { text, parts } = enabled ? readTransportSource(source) : { text: "", parts: [] };
  const reasoning = enabled ? [...source.querySelectorAll(REASONING)] : [];
  const blocks = transportBlocks(text).filter(block => {
    if (!reasoning.length) return true;
    const first = parts.find(part => part.end > block.start)?.node;
    const last = parts.findLast(part => part.start < block.end)?.node;
    return !reasoning.some(node => first && last
      && first.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING
      && last.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING);
  });
  const previous = hiddenBySource.get(source) ?? new Map<HTMLElement, Hidden>();
  const next = new Map<HTMLElement, Hidden>();
  const result = results.get(source);
  if (result && !blocks.some(block => block.complete && block.kind === "characters"
    && text.slice(block.start, block.end) === result.payload)) {
    result.details.remove();
    results.delete(source);
  }
  if (blocks.length) {
    const visibleText = new Map<Text, string>();
    const covered = new Map<HTMLElement, Kind>();
    for (const part of parts) {
      let cursor = part.start;
      let visible = "";
      let kind: Kind | undefined;
      for (const block of blocks) {
        if (block.end <= part.start || block.start >= part.end) continue;
        kind ??= block.kind;
        visible += part.node.data.slice(cursor - part.start, Math.max(cursor, block.start) - part.start);
        cursor = Math.min(block.end, part.end);
      }
      if (!kind) continue;
      visible += part.node.data.slice(cursor - part.start);
      visibleText.set(part.node, visible);
      const parent = part.node.parentElement!;
      covered.set(parent, kind);
    }
    const visibleParents = new Set<HTMLElement>();
    for (const part of parts) {
      if (!(visibleText.get(part.node) ?? part.node.data).trim()) continue;
      for (let parent = part.node.parentElement; parent && !visibleParents.has(parent); parent = parent.parentElement) {
        visibleParents.add(parent);
        if (parent === source) break;
      }
    }
    const safe = (element: HTMLElement) => (element === source || element.matches(SAFE_MARKDOWN))
      && [...element.querySelectorAll("*")].every(node => node.closest(`${RESULT}, ${TRANSPORT_VIEW}`)
        || node.matches(SAFE_MARKDOWN) && !node.matches(SKIP));
    const containers = new Map<HTMLElement, Kind>();
    for (const [parent, kind] of covered) {
      let element = parent;
      // A transport-only paragraph must not leave blank margins around its
      // hidden Markdown spans. Keep mixed prose in its original container.
      while (element !== source && element.parentElement && !visibleParents.has(element.parentElement)
        && !element.parentElement.querySelector("hr") && safe(element.parentElement)) element = element.parentElement;
      if (!containers.has(element)) containers.set(element, kind);
    }
    const parents = [...containers].sort(([a], [b]) => a.contains(b) ? -1 : b.contains(a) ? 1 : 0);
    for (const [element, kind] of parents) {
      if ([...next.keys()].some(parent => parent.contains(element))) continue;
      if (!safe(element)) continue;
      const doc = element.ownerDocument;
      function copy(node: Node): Node | undefined {
        if (node.nodeType === Node.TEXT_NODE) {
          const value = visibleText.get(node as Text) ?? node.textContent;
          return value ? doc.createTextNode(value) : undefined;
        }
        if (!(node instanceof HTMLElement) || node.matches(`${RESULT}, ${TRANSPORT_VIEW}`)) return;
        const clone = doc.createElement(node.matches(SAFE_MARKDOWN) ? node.localName : "div");
        for (const child of node.childNodes) {
          const rendered = copy(child);
          if (rendered) clone.append(rendered);
        }
        if (node === element || clone.childNodes.length || node.matches("br,hr")) return clone;
      }
      const markup = copy(element) as HTMLElement;
      const view = markup.textContent?.trim() || markup.querySelector("hr") ? previous.get(element)?.view ?? proseView(element, markup) : undefined;
      if (view) {
        const rendered = view.shadowRoot!.lastElementChild!;
        if (rendered.outerHTML !== markup.outerHTML) rendered.replaceWith(markup);
        if (view.nextSibling !== element) element.before(view);
        projections.set(element, view);
      }
      next.set(element, { kind, view });
    }
  }
  for (const [element, { view }] of previous) {
    if (next.get(element)?.view !== view) {
      view?.remove();
      if (!next.get(element)?.view) projections.delete(element);
    }
    if (next.has(element)) continue;
    element.removeAttribute("data-deeprole-choices-payload");
    element.removeAttribute("data-deeprole-payload-source");
  }
  if (next.size) ensureStyles(source.ownerDocument);
  for (const [element, { kind, view }] of next) {
    const name = view ? "data-deeprole-payload-source" : "data-deeprole-choices-payload";
    const other = view ? "data-deeprole-choices-payload" : "data-deeprole-payload-source";
    element.removeAttribute(other);
    if (element.getAttribute(name) !== kind) element.setAttribute(name, kind);
  }
  hiddenBySource.set(source, next);
  source.toggleAttribute("data-deeprole-transport-container", next.size > 0);
  return { text, blocks, hidden: next };
}

export function hasManagedTransport(source: HTMLElement): boolean {
  return (hiddenBySource.get(source)?.size ?? 0) > 0 || results.has(source);
}
