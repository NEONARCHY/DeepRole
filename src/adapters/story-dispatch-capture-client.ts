import { validStoryDispatchPacket } from "../core/story-dispatch";
import { validNativeStoryStreamPacket } from "../core/story-native-stream";
import { validStoryDispatchSource, validStoryDispatchCaptureInput, type StoryDispatchCaptureInput } from "../core/story-dispatch-capture";
import { sameStoryValue } from "../core/story-value";
import type { NativeStoryReplyQuery } from "../core/story-native-reply";

interface CaptureStore {
  prepareDispatchCapture(input: StoryDispatchCaptureInput, chatUrl: string): Promise<void>;
  confirmDispatchCapture(source: unknown, chatUrl: string): Promise<void>;
  advanceDispatchCapture(packet: unknown, chatUrl: string): Promise<void>;
}
/** Page packets are untrusted. Only request IDs registered by context preparation may advance.
 * Per-request queues keep source/HTTP/wire order without blocking or repeating the native send.
 */
export class StoryDispatchCaptureClient {
  private readonly active = new Map<string, { input: StoryDispatchCaptureInput; url: string; task: Promise<void> }>();
  constructor(private readonly win: Window, private readonly current: () => { chatId: string | null; worldId: string | null; url: string; locked: boolean }, private readonly store: CaptureStore, private readonly onClosed?: (query: NativeStoryReplyQuery) => void, private readonly onUpdated?: (id: string) => void) {}
  private inScope(input: StoryDispatchCaptureInput, url: string) {
    const now = this.current(); return !now.locked && now.url === url && now.chatId === input.identity.chatId && now.worldId === input.worldId;
  }
  async prepare(input: StoryDispatchCaptureInput): Promise<boolean> {
    if (!validStoryDispatchCaptureInput(input)) return false;
    input = structuredClone(input); const url = this.current().url;
    if (!this.inScope(input, url) || this.active.has(input.id) || this.active.size >= 64) return false;
    const entry = { input, url, task: Promise.resolve() };
    this.active.set(input.id, entry);
    try { entry.task = this.store.prepareDispatchCapture(input, url); await entry.task; if (this.active.get(input.id) !== entry || !this.inScope(input, url)) throw Error(); this.updated(input.id); return true; }
    catch { this.active.delete(input.id); return false; }
  }
  receive(event: MessageEvent): boolean {
    if (event.source !== this.win || event.origin !== this.win.location.origin || event.data?.source !== "deeprole-page-bridge") return false;
    const { source: _source, type, ...packet } = event.data;
    if (!["STORY_CAPTURE_SOURCE", "NATIVE_STORY_DISPATCH", "NATIVE_STORY_STREAM"].includes(type)) return false;
    const source = type === "STORY_CAPTURE_SOURCE";
    if (!(source ? validStoryDispatchSource(packet) : type === "NATIVE_STORY_DISPATCH" ? validStoryDispatchPacket(packet) : validNativeStoryStreamPacket(packet))) return true;
    const entry = this.active.get(packet.requestId);
    if (!entry || packet.transport !== entry.input.transport || !sameStoryValue(packet.identity, entry.input.identity) || !this.inScope(entry.input, entry.url)) return true;
    const copied = structuredClone(packet);
    entry.task = entry.task.then(async () => {
      if (this.active.get(packet.requestId) !== entry || !this.inScope(entry.input, entry.url)) throw Error();
      if (source) await this.store.confirmDispatchCapture(copied, entry.url);
      else await this.store.advanceDispatchCapture(copied, entry.url);
      if (this.active.get(packet.requestId) === entry && this.inScope(entry.input, entry.url)) this.updated(packet.requestId);
      if (type === "NATIVE_STORY_STREAM" && copied.phase === "closed" && copied.sawFinish && copied.link && this.active.get(packet.requestId) === entry && this.inScope(entry.input, entry.url))
        this.onClosed?.({ requestId: packet.requestId, identity: structuredClone(entry.input.identity), link: structuredClone(copied.link) });
      if (source && this.active.get(packet.requestId) === entry && this.inScope(entry.input, entry.url)) this.win.postMessage({ source: "deeprole-extension", type: "STORY_CAPTURE_CONFIRMED", id: packet.requestId, ok: true }, this.win.location.origin);
    }).catch(() => {
      if (source && this.active.get(packet.requestId) === entry && this.inScope(entry.input, entry.url)) this.win.postMessage({ source: "deeprole-extension", type: "STORY_CAPTURE_CONFIRMED", id: packet.requestId, ok: false }, this.win.location.origin);
    });
    if (type === "NATIVE_STORY_STREAM" && (packet.phase === "closed" || packet.phase === "failed")
      || type === "NATIVE_STORY_DISPATCH" && packet.phase === "settled" && (packet.transport === "fetch" || packet.delivery.status === "failed")) void entry.task.finally(() => { if (this.active.get(packet.requestId) === entry) this.active.delete(packet.requestId); });
    return true;
  }
  reset() { this.active.clear(); }
  private updated(id: string) { try { this.onUpdated?.(id); } catch { /* A display failure must not interrupt source confirmation or sending. */ } }
  async flush() { await Promise.all([...this.active.values()].map(entry => entry.task)); }
}
