import { validNativeStoryReplyQuery, validNativeStoryReplyResult, type NativeStoryReplyQuery } from "../core/story-native-reply";
import { sameStoryValue } from "../core/story-value";

interface ReplyScope { chatId: string | null; worldId: string | null; url: string; locked: boolean }
interface ReplyStore {
  pendingDispatchReplies(chatId: string, chatUrl: string): Promise<NativeStoryReplyQuery[]>;
  recordDispatchReply(result: unknown, chatUrl: string): Promise<void>;
}
/** Bounded read-only source recovery, not a model call. Registered native IDs come from
 * the saved receipt, never from a model echo or from the most recent DOM paragraph. */
export class StoryDispatchReplyClient {
  private readonly pending = new Map<string, { query: NativeStoryReplyQuery; scope: ReplyScope; finish: () => void }>();
  private epoch = 0;
  private recoveredScope: string | null = null;
  constructor(private readonly win: Window, private readonly current: () => ReplyScope, private readonly store: ReplyStore) {}
  private inScope(scope: ReplyScope) { const now = this.current(); return !now.locked && !!now.worldId && sameStoryValue(now, scope); }
  read(query: NativeStoryReplyQuery): Promise<void> {
    const scope = structuredClone(this.current());
    if (!validNativeStoryReplyQuery(query) || query.identity.chatId !== scope.chatId || !this.inScope(scope) || this.pending.has(query.requestId) || this.pending.size >= 4) return Promise.resolve();
    query = structuredClone(query);
    return new Promise(resolve => {
      const entry = { query, scope, finish: () => { this.win.clearTimeout(timer); if (this.pending.get(query.requestId) === entry) this.pending.delete(query.requestId); resolve(); } };
      const timer = this.win.setTimeout(entry.finish, 10_000);
      this.pending.set(query.requestId, entry);
      this.win.postMessage({ source: "deeprole-extension", type: "NATIVE_STORY_REPLY_REQUEST", query }, this.win.location.origin);
    });
  }
  receive(event: MessageEvent): boolean {
    if (event.source !== this.win || event.origin !== this.win.location.origin || event.data?.source !== "deeprole-page-bridge" || event.data.type !== "NATIVE_STORY_REPLY_RESULT") return false;
    const { requestId, result } = event.data, entry = this.pending.get(requestId);
    if (!entry) return true;
    if (!this.inScope(entry.scope) || !validNativeStoryReplyResult(result) || !sameStoryValue({ requestId: result.requestId, identity: result.identity, link: result.link }, entry.query)) { entry.finish(); return true; }
    // Consume once before writing: duplicate packets cannot start parallel commits.
    entry.finish();
    void this.store.recordDispatchReply(structuredClone(result), entry.scope.url).catch(() => undefined);
    return true;
  }
  async recover() {
    const epoch = this.epoch, scope = structuredClone(this.current());
    if (!scope.chatId || !this.inScope(scope)) return;
    const key = JSON.stringify(scope);
    if (this.recoveredScope === key) return;
    this.recoveredScope = key;
    const queries = await this.store.pendingDispatchReplies(scope.chatId, scope.url).catch(() => []);
    for (const query of queries) { if (this.epoch !== epoch || !this.inScope(scope)) break; await this.read(query); }
  }
  reset() { this.epoch++; this.recoveredScope = null; for (const entry of this.pending.values()) entry.finish(); }
}
