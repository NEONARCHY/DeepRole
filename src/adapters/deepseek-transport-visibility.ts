import { REASONING } from "./deepseek-message-dom";

export const TRANSPORT_FRAGMENT = "[data-deeprole-choices-payload]";
export const TRANSPORT_VIEW = "[data-deeprole-payload-view]";
export const TRANSPORT_SOURCE = "[data-deeprole-payload-source]";
export const TRANSPORT_CONTAINER = "[data-deeprole-transport-container]";
const RESULT = "[data-deeprole-characters-result]";
const SKIP = `${REASONING}, ${RESULT}, ${TRANSPORT_VIEW}, button, [role=button], [role=toolbar], script, style`;
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
  host.style.display = /^(SPAN|EM|STRONG|B|I|S|DEL|U|SMALL|SUB|SUP|KBD|MARK|CODE)$/u.test(element.tagName) ? "inline" : "block";
  const shadow = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = "p{margin:0 0 .75em}p:last-child{margin-bottom:0}pre,code{white-space:pre-wrap;overflow-wrap:anywhere}table{max-width:100%}:host{overflow-wrap:anywhere}";
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
    // Handle outer text parents first. A projection already accounts for all
    // affected descendants in the same element.
    const parents = [...covered].sort(([a], [b]) => a.contains(b) ? -1 : b.contains(a) ? 1 : 0);
    for (const [element, kind] of parents) {
      if ([...next.keys()].some(parent => parent.contains(element))) continue;
      // Preserve interactive native content and media. A mixed container with
      // those elements cannot safely be replaced by an inert prose view.
      if (element !== source && !element.matches(SAFE_MARKDOWN)) continue;
      const descendants = [...element.querySelectorAll("*")].filter(node => !node.closest(`${RESULT}, ${TRANSPORT_VIEW}`));
      if (descendants.some(node => !node.matches(SAFE_MARKDOWN) || node.matches(SKIP))) continue;
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
