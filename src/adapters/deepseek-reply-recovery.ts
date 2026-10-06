import { formatRecoveredReplyContext, isRefusalFragment, isReplacedReply, MAX_RECOVERED_REPLY_HTML, replyRecoveryText, validRecoveredReply } from "../core/reply-recovery";
import type { Locale, RecoveredReply } from "../core/types";
import type { RecoveredReplyEdit } from "../storage/recovered-replies";
import { isUserMessage, nativeMessageIdentity, nativeMessageRow, nativeMessageRows, REASONING } from "./deepseek-message-dom";

const HOST = "[data-deeprole-recovered-reply]";
const OMIT = `${REASONING}, ${HOST}, script, style, template, iframe, object, embed, img, svg, button, [role='button'], input, textarea, select, [data-deeprole-choices-host], [data-deeprole-choices-loading], [data-deeprole-memory-card]`;
const TAGS = new Set("DIV P SPAN PRE CODE STRONG B EM I U S DEL SUP SUB KBD UL OL LI BLOCKQUOTE H1 H2 H3 H4 H5 H6 BR HR TABLE THEAD TBODY TFOOT TR TH TD A DETAILS SUMMARY".split(" "));
type Candidate = RecoveredReply & { rawText: string };
type Presentation = { source: HTMLElement; host: HTMLElement; display: string; priority: string; aria: string | null; html: string; key: string };

function messageKey(row: HTMLElement): string | undefined {
  // Prefer the server message id over a virtual-list key when both exist.
  const id = row.getAttribute("data-message-id");
  return id ? JSON.stringify(["message", id]) : nativeMessageIdentity(row);
}

function replySource(row: HTMLElement): HTMLElement | null {
  const main = row.querySelector<HTMLElement>(".ds-assistant-message-main-content");
  const markdown = [...(main ?? row).querySelectorAll<HTMLElement>(".ds-markdown")]
    .find(el => !el.closest(`${REASONING}, ${HOST}`));
  if (markdown) return markdown;
  if (main && !main.closest(REASONING)) return main;
  // Do not guess a reply from row-wide text, which includes thinking and controls.
  return null;
}

/** Build new inert markup from an allowlist, never adopt website or imported HTML. */
function safeNodes(source: Node, doc: Document): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  const append = (node: Node, parent: Node) => {
    if (node.nodeType === Node.TEXT_NODE) { parent.appendChild(doc.createTextNode(node.textContent ?? "")); return; }
    if (!(node instanceof Element) || node.matches(OMIT)) return;
    if (!TAGS.has(node.tagName)) { for (const child of node.childNodes) append(child, parent); return; }
    const copy = doc.createElement(node.tagName.toLowerCase());
    if (node.tagName === "A" && node.hasAttribute("href")) {
      try {
        const url = new URL(node.getAttribute("href") ?? "", "https://chat.deepseek.com");
        if (["http:", "https:"].includes(url.protocol)) { copy.setAttribute("href", url.href); copy.setAttribute("rel", "noopener noreferrer"); copy.setAttribute("target", "_blank"); }
      } catch { /* Plain link text is still preserved. */ }
    }
    // Only DeepRole's transport wrappers retain their hidden state; never copy arbitrary CSS.
    for (const name of ["data-deeprole-choices-payload", "data-deeprole-character-payload", "data-deeprole-memory-payload"]) {
      if (node.hasAttribute(name)) { copy.setAttribute(name, "true"); copy.style.display = "none"; copy.setAttribute("aria-hidden", "true"); }
    }
    if (node.tagName === "DETAILS" && node.hasAttribute("data-deeprole-characters-result")) copy.setAttribute("data-deeprole-characters-result", "true");
    if (node.tagName === "SUMMARY" && node.hasAttribute("data-deeprole-characters-summary")) copy.setAttribute("data-deeprole-characters-summary", "true");
    if (node.tagName === "OL" && /^-?\d{1,6}$/u.test(node.getAttribute("start") ?? "")) copy.setAttribute("start", node.getAttribute("start")!);
    if (["TD", "TH"].includes(node.tagName)) for (const name of ["colspan", "rowspan"]) {
      const value = Number(node.getAttribute(name)); if (value > 0 && value <= 100) copy.setAttribute(name, String(Math.round(value)));
    }
    for (const child of node.childNodes) append(child, copy);
    parent.appendChild(copy);
  };
  for (const child of source.childNodes) append(child, fragment);
  return fragment;
}

function snapshot(source: Node, key: string): Candidate | null {
  const doc = source.ownerDocument ?? document;
  const box = doc.createElement("div");
  if (source.nodeType === Node.TEXT_NODE) box.textContent = source.textContent;
  else box.append(safeNodes(source, doc));
  const rawText = box.textContent?.trim() ?? "";
  if (!rawText || isReplacedReply(rawText) || isRefusalFragment(rawText) || box.innerHTML.length > MAX_RECOVERED_REPLY_HTML) return null;
  const now = Date.now();
  const result = { messageKey: key, html: box.innerHTML, capturedAt: now, recoveredAt: now, rawText };
  return validRecoveredReply(result) ? result : null;
}

/** Inert conversion of saved HTML into story text; exclude UI and technical payloads. */
export function recoveredReplyContext(reply: RecoveredReply, doc: Document = document): string {
  if (!validRecoveredReply(reply)) return "";
  const template = doc.createElement("template"); template.innerHTML = reply.html;
  for (const payload of template.content.querySelectorAll("deeprole_choices, deeprole_characters, deeprole_data")) payload.remove();
  const box = doc.createElement("div"); box.append(safeNodes(template.content, doc));
  const hidden = "[data-deeprole-choices-payload], [data-deeprole-character-payload], [data-deeprole-memory-payload], [data-deeprole-characters-result]";
  const blocks = /^(?:DIV|P|PRE|LI|BLOCKQUOTE|H[1-6]|TR|BR|HR)$/u;
  const read = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node instanceof Element && node.matches(hidden)) return "";
    const children = [...node.childNodes].map(read).join("");
    if (node instanceof Element && /^(?:TD|TH)$/u.test(node.tagName)) return `${children}\t`;
    return node instanceof Element && blocks.test(node.tagName) ? `\n${children}\n` : children;
  };
  const text = read(box).replace(/<deeprole_(choices|characters|data)>[\s\S]*?(?:<\/deeprole_\1>|$)/gu, "").trim();
  return formatRecoveredReplyContext(text);
}

export class DeepSeekReplyRecovery {
  private chatId: string | null = null;
  private chatUrl = "";
  private locale: Locale = "ru";
  private enabled = false;
  private readonly candidates = new Map<string, Candidate>();
  private archived = new Map<string, RecoveredReply>();
  private readonly presentations = new Map<HTMLElement, Presentation>();
  private readonly rowScopes = new WeakMap<HTMLElement, { chatId: string; key: string }>();
  private readonly saving = new Map<string, Promise<void>>();
  private readonly failed = new Map<string, string>();
  private generation = 0;

  constructor(private readonly save: (edit: RecoveredReplyEdit) => Promise<void>, private readonly onFailure: () => void) {}

  configure(chatId: string | null, chatUrl: string, enabled: boolean, locale: Locale, replies: RecoveredReply[] = []) {
    if (chatId !== this.chatId || !enabled) this.reset();
    this.chatId = chatId; this.chatUrl = chatUrl; this.enabled = enabled && !!chatId; this.locale = locale;
    this.archived = new Map(replies.filter(validRecoveredReply).map(r => [r.messageKey, r]));
    if (this.enabled) this.scan();
  }

  reset() {
    this.generation++;
    for (const source of this.presentations.keys()) this.removePresentation(source);
    this.candidates.clear(); this.archived.clear(); this.failed.clear(); this.saving.clear();
    this.chatId = null; this.enabled = false;
  }

  /** A send immediately following a DOM replacement must await its archive write. */
  async flush() { while (this.saving.size) await Promise.all(this.saving.values()); }

  /** Called in the mutation microtask, before DeepSeek's replacement reaches the next paint. */
  process(changes: MutationRecord[]) {
    if (!this.enabled) return;
    const affected = new Set<HTMLElement>();
    for (const change of changes) {
      const target = change.target instanceof Element ? change.target : change.target.parentElement;
      if (target?.closest(`${HOST}, ${REASONING}`)) continue;
      const element = target instanceof HTMLElement ? target : target?.parentElement;
      const row = element && nativeMessageRow(element);
      if (row) {
        affected.add(row);
        const key = messageKey(row), source = replySource(row);
        const scope = this.rowScopes.get(row);
        if (key && source && (!scope || scope.chatId === this.chatId || scope.key !== key) && !isUserMessage(row)
          && (target === source || source.contains(target) || target?.contains(source)) && isRefusalFragment(source.textContent ?? "")) {
          // Capture old character data and detached reply blocks too: insertion and
          // replacement can happen in the same observer batch, before a regular scan.
          if (change.type === "characterData" && change.oldValue) this.remember(snapshot(document.createTextNode(change.oldValue), key), true);
          if (change.type === "childList" && change.removedNodes.length) {
            const removed = document.createElement("div");
            for (const node of change.removedNodes) if (!(node instanceof Element && node.matches(HOST))) removed.append(node.cloneNode(true));
            this.remember(snapshot(removed, key), true);
          }
        }
      }
      for (const node of change.addedNodes) if (node instanceof HTMLElement && !node.closest(HOST)) {
        const direct = nativeMessageRow(node); if (direct) affected.add(direct);
        for (const added of nativeMessageRows(node)) affected.add(added);
      }
      for (const node of change.removedNodes) if (node instanceof HTMLElement && !node.matches(HOST)) {
        const direct = nativeMessageRow(node);
        for (const removed of new Set([...(direct ? [direct] : []), ...nativeMessageRows(node)])) {
          const key = messageKey(removed), source = replySource(removed), scope = this.rowScopes.get(removed);
          if (key && source && !isUserMessage(removed) && (!scope || scope.chatId === this.chatId)) this.remember(snapshot(source, key), true);
        }
      }
    }
    this.scan(affected);
  }

  scan(rows: Iterable<HTMLElement> = nativeMessageRows(document)) {
    if (!this.enabled || !this.chatId) return;
    for (const [source, presentation] of this.presentations) if (!source.isConnected || !presentation.host.isConnected) this.removePresentation(source);
    for (const row of rows) {
      if (!row.isConnected || isUserMessage(row)) continue;
      const key = messageKey(row), source = replySource(row);
      if (!key || !source) continue;
      const scope = this.rowScopes.get(row);
      // A SPA can leave the old chat mounted while its URL is already the new chat.
      if (scope && scope.chatId !== this.chatId && scope.key === key) continue;
      this.rowScopes.set(row, { chatId: this.chatId, key });
      const text = source.textContent?.trim() ?? "";
      if (!isReplacedReply(text)) {
        this.removePresentation(source);
        if (!isRefusalFragment(text) && this.candidates.get(key)?.rawText !== text) this.remember(snapshot(source, key));
        continue;
      }
      const archived = this.archived.get(key), candidate = this.candidates.get(key);
      const reply = candidate && (!archived || candidate.capturedAt > archived.capturedAt) ? candidate : archived;
      if (!reply) continue;
      this.present(source, reply);
      if (reply === candidate && (!archived || archived.capturedAt < reply.capturedAt || archived.html !== reply.html)) this.persist(reply);
    }
  }

  private remember(candidate: Candidate | null, preferLonger = false) {
    if (!candidate || preferLonger && (this.candidates.get(candidate.messageKey)?.html.length ?? 0) >= candidate.html.length) return;
    this.candidates.delete(candidate.messageKey); this.candidates.set(candidate.messageKey, candidate);
    // Keep transient capture bounded; persistent storage contains only actual recoveries.
    let size = [...this.candidates.values()].reduce((sum, r) => sum + r.html.length + r.rawText.length, 0);
    while (this.candidates.size > 32 || size > 8_000_000) {
      const oldest = this.candidates.keys().next().value!;
      const old = this.candidates.get(oldest)!; size -= old.html.length + old.rawText.length; this.candidates.delete(oldest);
    }
  }

  private persist(reply: RecoveredReply) {
    const chatId = this.chatId!, chatUrl = this.chatUrl, key = reply.messageKey, generation = this.generation;
    const active = () => this.generation === generation && this.chatId === chatId && this.enabled;
    if (this.saving.has(key) || this.failed.get(key) === reply.html) return;
    const stored = { messageKey: key, html: reply.html, capturedAt: reply.capturedAt, recoveredAt: Date.now() };
    const task = this.save({ chatId, chatUrl, reply: stored }).then(() => {
      if (active()) { this.archived.set(key, stored); this.failed.delete(key); }
    }).catch(() => {
      if (active()) { this.failed.set(key, reply.html); this.onFailure(); }
    }).finally(() => { if (active()) { this.saving.delete(key); this.scan(); } });
    this.saving.set(key, task);
  }

  private present(source: HTMLElement, reply: RecoveredReply) {
    const copy = replyRecoveryText(this.locale);
    const previous = this.presentations.get(source);
    if (previous && previous.html !== reply.html) this.removePresentation(source);
    let presentation = this.presentations.get(source);
    if (!presentation) {
      const doc = source.ownerDocument, host = doc.createElement("div");
      host.dataset.deeproleRecoveredReply = "true";
      host.style.cssText = "min-width:0;max-width:100%;overflow-wrap:anywhere;";
      const badge = doc.createElement("div");
      badge.dataset.deeproleRecoveryLabel = "true";
      badge.style.cssText = "font:500 11px/1.5 system-ui,sans-serif;color:inherit;opacity:.62;text-align:right;margin:0 0 8px;user-select:none;";
      const body = doc.createElement("div"); body.className = "ds-markdown";
      const template = doc.createElement("template"); template.innerHTML = reply.html;
      body.append(safeNodes(template.content, doc));
      host.append(badge, body);
      presentation = { source, host, display: source.style.getPropertyValue("display"), priority: source.style.getPropertyPriority("display"), aria: source.getAttribute("aria-hidden"), html: reply.html, key: reply.messageKey };
      this.presentations.set(source, presentation);
      source.style.setProperty("display", "none", "important"); source.setAttribute("aria-hidden", "true");
      source.after(host);
    }
    const badge = presentation.host.querySelector<HTMLElement>("[data-deeprole-recovery-label]")!;
    const label = this.failed.get(reply.messageKey) === reply.html ? copy.unsaved : reply.contextSentAt !== undefined ? copy.sent : copy.restored;
    if (badge.textContent !== label) badge.textContent = label;
    const detail = reply.contextSentAt !== undefined ? copy.sentDetail : copy.detail;
    if (badge.title !== detail) badge.title = detail;
  }

  private removePresentation(source: HTMLElement) {
    const shown = this.presentations.get(source); if (!shown) return;
    if (shown.display) source.style.setProperty("display", shown.display, shown.priority); else source.style.removeProperty("display");
    if (shown.aria === null) source.removeAttribute("aria-hidden"); else source.setAttribute("aria-hidden", shown.aria);
    shown.host.remove(); this.presentations.delete(source);
  }
}
