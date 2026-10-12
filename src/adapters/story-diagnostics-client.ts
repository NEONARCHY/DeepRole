import { diagnosticUnavailable, readStoryDiagnosticResult, type StoryDiagnosticResult } from "../core/story-diagnostics";
import { validNativeStoryId } from "../core/story-transport";
import { fieldHistoryAnchor } from "./field-history-client";

export interface DiagnosticPageScope { chatId: string | null; url: string; generating: boolean; locked: boolean }
/** Explicit, short-lived read-only probe. No transcript, repository access or model request. */
export class StoryDiagnosticsClient {
  private pending = false;
  constructor(private host: Window, private scope: () => DiagnosticPageScope, private visibleAnchor = () => fieldHistoryAnchor(host.document, true)) {}
  async check(): Promise<StoryDiagnosticResult> {
    const scope = { ...this.scope() };
    if (!validNativeStoryId(scope.chatId)) return diagnosticUnavailable("no-chat");
    if (scope.locked) return diagnosticUnavailable("vault-locked");
    if (scope.generating || this.pending) return diagnosticUnavailable("busy");
    const anchorId = this.visibleAnchor();
    if (anchorId !== null && !validNativeStoryId(anchorId)) return diagnosticUnavailable("invalid-bridge");
    this.pending = true;
    try {
      return await new Promise<StoryDiagnosticResult>(resolve => {
        const requestId = "probe_" + crypto.randomUUID();
        const current = () => { const next = this.scope(); return next.url === scope.url && next.chatId === scope.chatId && !next.locked && !next.generating && this.visibleAnchor() === anchorId; };
        const finish = (value: StoryDiagnosticResult) => { this.host.clearTimeout(timer); this.host.removeEventListener("message", receive); resolve(value); };
        const receive = (event: MessageEvent) => {
          if (event.source !== this.host || event.origin !== this.host.location.origin || event.data?.source !== "deeprole-page-bridge"
            || event.data.type !== "NATIVE_STORY_METADATA_RESULT" || event.data.requestId !== requestId || event.data.chatId !== scope.chatId) return;
          if (anchorId !== null && event.data.anchorId !== anchorId) return;
          const safe = readStoryDiagnosticResult(event.data.probe);
          const replyProbe = safe?.status === "read" && (safe.diagnostics.diagnosticVersion === 3 || safe.diagnostics.diagnosticVersion === 4) ? safe.diagnostics.replyProbe : null;
          const mismatchedAnchor = replyProbe
            && (anchorId === null ? !["not-supplied", "invalid-history"].includes(replyProbe.anchor) : replyProbe.anchor === "not-supplied");
          // Legacy reports remain readable, but cannot claim to describe a captured anchor.
          finish(!current() ? diagnosticUnavailable("changed") : !safe || mismatchedAnchor || anchorId !== null && safe.status === "read" && !replyProbe
            ? diagnosticUnavailable("invalid-bridge") : safe);
        };
        const timer = this.host.setTimeout(() => finish(diagnosticUnavailable(current() ? "timeout" : "changed")), 5500);
        this.host.addEventListener("message", receive);
        try { this.host.postMessage({ source: "deeprole-extension", type: "NATIVE_STORY_METADATA_REQUEST", requestId, chatId: scope.chatId, ...(anchorId !== null ? { anchorId } : {}) }, this.host.location.origin); }
        catch { finish(diagnosticUnavailable("not-connected")); }
      });
    } finally { this.pending = false; }
  }
}

interface DiagnosticTabs {
  query(query: { active: boolean; currentWindow: boolean }): Promise<{ id?: number; url?: string }[]>;
  sendMessage(tabId: number, message: { type: "DR_STORY_DIAGNOSTICS" }): Promise<unknown>;
}
export function isDiagnosticChatUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try { const url = new URL(value); return url.origin === "https://chat.deepseek.com" && !url.username && !url.password && /^\/(?:a\/)?chat\/(?:s\/)?[\w-]{1,160}\/?$/u.test(url.pathname); } catch { return false; }
}
/** Route only to the active chat; discard a result if the user switched tabs or URL. */
export async function checkActiveStoryDiagnostics(tabs: DiagnosticTabs): Promise<StoryDiagnosticResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  try {
    const work = async () => {
      const [tab] = await tabs.query({ active: true, currentWindow: true });
      if (expired) return diagnosticUnavailable("timeout");
      if (tab?.id === undefined || !isDiagnosticChatUrl(tab.url)) return diagnosticUnavailable("no-chat");
      const reply = await tabs.sendMessage(tab.id, { type: "DR_STORY_DIAGNOSTICS" });
      const [current] = await tabs.query({ active: true, currentWindow: true });
      if (current?.id !== tab.id || current.url !== tab.url) return diagnosticUnavailable("changed");
      return readStoryDiagnosticResult(reply) ?? diagnosticUnavailable("invalid-bridge");
    };
    return await Promise.race([work(), new Promise<StoryDiagnosticResult>(resolve => { timer = setTimeout(() => { expired = true; resolve(diagnosticUnavailable("timeout")); }, 6500); })]);
  } catch { return diagnosticUnavailable("not-connected"); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
