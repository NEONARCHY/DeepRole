import { validStoryGameSnapshot, type StoryGameInput, type StoryGameSnapshot } from "../core/story-game";
import { createId } from "../core/id";
import { fieldHistoryAnchor } from "./field-history-client";
import { nativeStoryMessageKey } from "../core/story-transport";
interface Scope { chatId: string | null; worldId: string | null; base: string; url: string; locked: boolean; generating: boolean; managed?: boolean }
interface Store {
  storyGameStatus(chatId: string, worldId: string, chatUrl: string): Promise<boolean>;
  runStoryGame(input: StoryGameInput, chatUrl: string): Promise<import("../core/story-game").StoryGameOutcome>;
}
/** A bounded GET of the native history, never a second model request. Each call is
 * tied to its original world/chat/revision and cannot write after navigation. */
export class StoryGameClient {
  private task: Promise<import("../core/story-game").StoryGameOutcome> | null = null;
  constructor(private readonly win: Window, private readonly scope: () => Scope, private readonly store: Store) {}
  async run(operation: StoryGameInput["operation"] = "sync", nativeParentKey: string | null = null, manual: "stop" | "keep" = "stop") {
    // A new visible variant must not be mistaken for an older in-flight sync.
    // Serialise reads, then take a fresh scope/anchor for THIS invocation.
    while (this.task) { try { await this.task; } catch { /* A new explicit/read attempt gets its own scope. */ } }
    const initial = { ...this.scope() };
    const anchor = fieldHistoryAnchor(this.win.document, true);
    const preparation = operation === "parent" || operation === "edit";
    if (!initial.chatId || !initial.worldId || initial.locked || initial.generating && !preparation) throw Error("story-checkpoint-busy");
    const same = () => { const now = this.scope(); return now.url === initial.url && now.chatId === initial.chatId && now.worldId === initial.worldId && now.base === initial.base && !now.locked; };
    const work = async () => {
      if (operation !== "start" && operation !== "restart" && initial.managed === false) return { active: false, changed: false };
      if (operation !== "start" && operation !== "restart" && !await this.store.storyGameStatus(initial.chatId!, initial.worldId!, initial.url)) return { active: false, changed: false };
      // Undo acts on the already saved head. It does not need a readable newest
      // site reply and must remain available after an interrupted answer.
      if (operation === "undo") return this.store.runStoryGame({ chatId: initial.chatId!, worldId: initial.worldId!, expectedBase: initial.base, operation, snapshot: { chatId: initial.chatId!, selectedNativeKey: null, messages: [] }, nativeParentKey: null, manual }, initial.url);
      const snapshot = await new Promise<StoryGameSnapshot>((resolve, reject) => {
        const requestId = createId("game");
        const finish = () => { this.win.clearTimeout(timer); this.win.removeEventListener("message", receive); };
        const receive = (event: MessageEvent) => {
          if (event.source !== this.win || event.origin !== this.win.location.origin || event.data?.source !== "deeprole-page-bridge" || event.data.type !== "STORY_GAME_SNAPSHOT_RESULT" || event.data.requestId !== requestId) return;
          finish();
          if (!same() || !validStoryGameSnapshot(event.data.snapshot) || event.data.snapshot.chatId !== initial.chatId || !preparation && fieldHistoryAnchor(this.win.document, true) !== anchor) reject(Error("story-native-line-unavailable"));
          else {
            const snapshot: StoryGameSnapshot = structuredClone(event.data.snapshot);
            // A visible native/virtual key is a candidate until matched to an exact,
            // completed server identity. The server pointer alone is not page selection.
            if (!preparation && snapshot.messages.length) {
              if (!anchor || !snapshot.messages.some(m => m.identity.nativeMessageKey === nativeStoryMessageKey(anchor) && m.identity.role === "assistant" && m.completion === "complete")) { reject(Error("story-native-line-unavailable")); return; }
              snapshot.selectedNativeKey = nativeStoryMessageKey(anchor);
            }
            resolve(snapshot);
          }
        };
        const timer = this.win.setTimeout(() => { finish(); reject(Error("story-native-line-unavailable")); }, 9000);
        this.win.addEventListener("message", receive);
        this.win.postMessage({ source: "deeprole-extension", type: "STORY_GAME_SNAPSHOT_REQUEST", requestId, chatId: initial.chatId }, this.win.location.origin);
      });
      if (!same()) throw Error("story-binding-conflict");
      return this.store.runStoryGame({ chatId: initial.chatId!, worldId: initial.worldId!, expectedBase: initial.base, operation, snapshot, nativeParentKey, manual }, initial.url);
    };
    const task = work(); this.task = task;
    try { return await task; } finally { if (this.task === task) this.task = null; }
  }
}
