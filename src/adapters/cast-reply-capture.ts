import { isRefusalFragment, isReplacedReply } from "../core/reply-recovery";
import { castChatId } from "../core/cast-chat";
import { plainCharacterReplyText } from "./deepseek-service-dom";
import { isUserMessage, nativeMessageIdentity, nativeMessageRows, NATIVE_TURN, REASONING } from "./deepseek-message-dom";

export interface CastReplyCheckpoint { step: number; repair: boolean; chatId: string; replyIdentity: string; raw: string }
/** A quick transport check only; the coordinator still validates the full schema and lore evidence. */
export function completeCastReply(raw: string, request: string): boolean {
  if (!raw.trim() || raw.length > 180000) return false;
  const blocks = [...raw.matchAll(/<deeprole_cast>\s*([\s\S]*?)\s*<\/deeprole_cast>/gu)];
  if (blocks.length > 1 || raw.includes("<deeprole_cast>") && !blocks.length) return false;
  const fence = String.fromCharCode(96).repeat(3);
  let body = (blocks[0]?.[1] ?? raw).trim();
  if (body.startsWith(fence) && body.endsWith(fence)) body = body.slice(body.indexOf("\n") + 1, -3).trim();
  try {
    const data = JSON.parse(body);
    return !!data && data.version === 1 && data.request === request && Array.isArray(data.characters) && data.characters.length > 0 && data.characters.length <= 40 && Array.isArray(data.present) && Array.isArray(data.partners) && Array.isArray(data.warnings);
  } catch { return false; }
}

/** One request, one final assistant turn, no reasoning or cross-chat archive. */
export class CastReplyCapture {
  private observer: MutationObserver | null = null;
  private row: HTMLElement | null = null;
  private requestRow: HTMLElement | null = null;
  private identity: string | undefined;
  private source: HTMLElement | null = null;
  private remembered = "";
  private chatId: string | undefined;
  private invalidated = false;
  constructor(private readonly request: string, private readonly marker: string, private readonly enabled: boolean, private readonly doc: Document = document,
    private readonly onComplete: (raw: string, replyIdentity: string) => void = () => {}, checkpoint?: CastReplyCheckpoint) {
    if (checkpoint && enabled && completeCastReply(checkpoint.raw, request)) { this.chatId = checkpoint.chatId; this.identity = checkpoint.replyIdentity; this.remembered = checkpoint.raw; }
  }
  start() {
    if (this.enabled) {
      this.observer = new MutationObserver(changes => this.process(changes));
      this.observer.observe(this.doc, { childList: true, subtree: true, characterData: true, characterDataOldValue: true });
    }
    this.scan();
  }
  stop() { this.observer?.disconnect(); this.observer = null; this.row = null; this.requestRow = null; this.source = null; this.remembered = ""; }
  private currentChat() { return castChatId(this.doc.defaultView?.location.pathname); }
  private scoped() {
    const current = this.currentChat();
    if (this.chatId && current !== this.chatId || this.requestRow?.isConnected && !(this.requestRow.textContent ?? "").includes(this.marker)) { this.invalidated = true; this.remembered = ""; }
    return !this.invalidated;
  }
  private remember(raw: string) {
    if (!this.enabled || !this.scoped() || !completeCastReply(raw, this.request) || raw === this.remembered) return;
    this.remembered = raw;
    if (this.identity) this.onComplete(raw, this.identity);
  }
  scan(): string {
    if (!this.scoped()) return "";
    const rows = nativeMessageRows(this.doc);
    const user = rows.findLastIndex(row => isUserMessage(row) && (row.textContent ?? "").includes(this.marker));
    if (user >= 0) this.requestRow = rows[user]!;
    const next = user >= 0 ? rows[user + 1] : this.identity ? rows.find(row => nativeMessageIdentity(row) === this.identity) : undefined;
    const row = next && !isUserMessage(next) ? next : undefined;
    if (!row) return "";
    const identity = nativeMessageIdentity(row);
    if (this.identity && identity !== this.identity) this.remembered = ""; // A regenerated branch is not the old answer.
    this.identity = identity; this.row = row;
    this.chatId ??= this.currentChat();
    this.source = row.querySelector<HTMLElement>(".ds-assistant-message-main-content") ?? [...row.querySelectorAll<HTMLElement>(".ds-markdown")].find(node => !node.closest(REASONING)) ?? row;
    const raw = plainCharacterReplyText(row); this.remember(raw); return raw;
  }
  process(changes: MutationRecord[]) {
    if (!this.enabled || !this.scoped()) return;
    // First bind freshly mounted rows; insertion and replacement may share one microtask.
    const live = this.scan();
    if (completeCastReply(live, this.request)) return; // Newer complete live data wins; do not rewrite checkpoints with detached older versions.
    for (const change of changes) {
      const target = change.target instanceof Element ? change.target : change.target.parentElement;
      if (!target || target.closest(REASONING) || !this.row || !this.source) continue;
      const within = target === this.source || this.source.contains(target) || target === this.row;
      if (change.type === "childList") for (const node of change.removedNodes) {
        if (node instanceof HTMLElement && node.matches(NATIVE_TURN) && !isUserMessage(node) && this.identity && nativeMessageIdentity(node) === this.identity) this.remember(plainCharacterReplyText(node));
      }
      if (!within) continue;
      if (change.type === "characterData" && change.oldValue) this.remember(change.oldValue.trim());
      if (change.type === "childList" && change.removedNodes.length) {
        const removed = this.doc.createElement("div");
        for (const node of change.removedNodes) if (!(node instanceof Element) || !node.matches(REASONING)) removed.append(node.cloneNode(true));
        this.remember(plainCharacterReplyText(removed));
      }
    }
  }
  resolve(raw: string): { raw: string; recovered: boolean } {
    if (!this.enabled || !this.scoped() || !this.remembered || raw && !isReplacedReply(raw) && !isRefusalFragment(raw)) return { raw, recovered: false };
    return { raw: this.remembered, recovered: true };
  }
}
