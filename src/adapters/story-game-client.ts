import { validStoryGameSnapshot, type StoryGameInput, type StoryGameSnapshot } from "../core/story-game";
import { createId } from "../core/id";
import { fieldHistoryAnchor } from "./field-history-client";
import { nativeStoryMessageKey } from "../core/story-transport";
interface Scope { chatId: string | null; worldId: string | null; base: string; url: string; locked: boolean; generating: boolean; managed?: boolean; replySignature?: string }
interface Store {
  storyGameStatus(chatId: string, worldId: string, chatUrl: string): Promise<boolean>;
  runStoryGame(input: StoryGameInput, chatUrl: string): Promise<import("../core/story-game").StoryGameOutcome>;
}
/** A bounded GET of the native history, never a second model request. Each call is
 * tied to its original world/chat/revision and cannot write after navigation. */
export class StoryGameClient {
  private task: Promise<import("../core/story-game").StoryGameOutcome> | null = null;
  private presentationTask: Promise<StoryGameSnapshot> | null = null;
  private presentation?: { scope: Scope; anchor: string | null; snapshot: StoryGameSnapshot };
  private presentationSettled?: { scope: Scope; anchor: string | null };
  private presentationEpoch = 0;
  constructor(private readonly win: Window, private readonly scope: () => Scope, private readonly store: Store) {}
  resetPresentation() { this.presentationEpoch++; this.presentation = undefined; this.presentationSettled = undefined; }
  /** Hide choices while purpose is still unverified, including the interval
   * BEFORE a scanner starts its GET. Failure releases UI, not write authority. */
  presentationPending(): boolean {
    const now = this.scope(), anchor = fieldHistoryAnchor(this.win.document, true), settled = this.presentationSettled;
    if (now.locked || now.generating || !now.chatId || !now.worldId || !anchor || this.presentationSnapshot()) return false;
    return !(settled && settled.anchor === anchor && now.url === settled.scope.url
      && now.chatId === settled.scope.chatId && now.worldId === settled.scope.worldId
      && now.replySignature === settled.scope.replySignature);
  }
  /** Ephemeral UI evidence only. No branch selection, capture upgrade or writes. */
  presentationSnapshot(): StoryGameSnapshot | undefined {
    const now=this.scope(), cached=this.presentation;
    if(now.generating){this.presentation=undefined;return;}
    return cached && !now.locked && !now.generating && now.url===cached.scope.url && now.chatId===cached.scope.chatId && now.worldId===cached.scope.worldId
      && now.replySignature===cached.scope.replySignature && fieldHistoryAnchor(this.win.document,true)===cached.anchor ? cached.snapshot : undefined;
  }
  async readForPresentation(): Promise<StoryGameSnapshot | undefined> {
    while(this.task || this.presentationTask) { try { await (this.task ?? this.presentationTask); } catch { /* A fresh scope gets its own bounded read. */ } }
    const cached=this.presentationSnapshot();if(cached)return cached;
    const initial={...this.scope()},anchor=fieldHistoryAnchor(this.win.document,true);
    if(!initial.chatId||!initial.worldId||initial.locked||initial.generating||!anchor)return;
    const task=this.readSnapshot(initial,anchor,false);this.presentationTask=task;
    try{return await task;}catch{return undefined;}finally{if(this.presentationTask===task)this.presentationTask=null;}
  }
  private async readSnapshot(initial: Scope, anchor: string | null, preparation: boolean): Promise<StoryGameSnapshot> {
    const epoch=this.presentationEpoch;
    const same=()=>{const now=this.scope();return epoch===this.presentationEpoch && now.url===initial.url && now.chatId===initial.chatId && now.worldId===initial.worldId && now.base===initial.base && !now.locked && (preparation||!now.generating&&now.replySignature===initial.replySignature);};
    const snapshot=await new Promise<StoryGameSnapshot>((resolve,reject)=>{
      const requestId=createId('game');
      const finish=()=>{this.win.clearTimeout(timer);this.win.removeEventListener('message',receive);};
      const receive=(event:MessageEvent)=>{
        if(event.source!==this.win||event.origin!==this.win.location.origin||event.data?.source!=='deeprole-page-bridge'||event.data.type!=='STORY_GAME_SNAPSHOT_RESULT'||event.data.requestId!==requestId)return;
        finish();
        if(!same()||!validStoryGameSnapshot(event.data.snapshot)||event.data.snapshot.chatId!==initial.chatId||!preparation&&fieldHistoryAnchor(this.win.document,true)!==anchor){reject(Error('story-native-line-unavailable'));return;}
        const value:StoryGameSnapshot=structuredClone(event.data.snapshot);
        if(!preparation&&value.messages.length){
          if(!anchor||!value.messages.some(m=>m.identity.nativeMessageKey===nativeStoryMessageKey(anchor)&&m.identity.role==='assistant'&&m.completion==='complete')){reject(Error('story-native-line-unavailable'));return;}
          value.selectedNativeKey=nativeStoryMessageKey(anchor);
        }
        if(!preparation&&anchor&&!value.messages.length){reject(Error('story-native-line-unavailable'));return;}
        resolve(value);
      };
      const timer=this.win.setTimeout(()=>{finish();reject(Error('story-native-line-unavailable'));},9000);
      this.win.addEventListener('message',receive);
      this.win.postMessage({source:'deeprole-extension',type:'STORY_GAME_SNAPSHOT_REQUEST',requestId,chatId:initial.chatId},this.win.location.origin);
    }).finally(() => {
      if (!preparation && same() && fieldHistoryAnchor(this.win.document, true) === anchor)
        this.presentationSettled = { scope: initial, anchor };
    });
    if(!preparation&&same())this.presentation={scope:initial,anchor,snapshot};
    return snapshot;
  }
  async run(operation: StoryGameInput["operation"] = "sync", nativeParentKey: string | null = null, manual: "stop" | "keep" = "stop") {
    // A new visible variant must not be mistaken for an older in-flight sync.
    // Serialise reads, then take a fresh scope/anchor for THIS invocation.
    while (this.task || this.presentationTask) { try { await (this.task ?? this.presentationTask); } catch { /* A new explicit/read attempt gets its own scope. */ } }
    const initial = { ...this.scope() };
    const anchor = fieldHistoryAnchor(this.win.document, true);
    const preparation = operation === "parent" || operation === "edit";
    if (!initial.chatId || !initial.worldId || initial.locked || initial.generating && !preparation) throw Error("story-checkpoint-busy");
    const same = () => { const now = this.scope(); return now.url === initial.url && now.chatId === initial.chatId && now.worldId === initial.worldId && now.base === initial.base && !now.locked; };
    const work = async () => {
      if (operation !== "start" && operation !== "restart" && operation !== "reset" && operation !== "restore" && initial.managed === false) return { active: false, changed: false };
      if (operation !== "start" && operation !== "restart" && operation !== "reset" && operation !== "restore" && !await this.store.storyGameStatus(initial.chatId!, initial.worldId!, initial.url)) return { active: false, changed: false };
      // Undo acts on the already saved head. It does not need a readable newest
      // site reply and must remain available after an interrupted answer.
      if (operation === "undo") return this.store.runStoryGame({ chatId: initial.chatId!, worldId: initial.worldId!, expectedBase: initial.base, operation, snapshot: { chatId: initial.chatId!, selectedNativeKey: null, messages: [] }, nativeParentKey: null, manual }, initial.url);
      const snapshot = await this.readSnapshot(initial, anchor, preparation);
      if (!same()) throw Error("story-binding-conflict");
      return this.store.runStoryGame({ chatId: initial.chatId!, worldId: initial.worldId!, expectedBase: initial.base, operation, snapshot, nativeParentKey, manual }, initial.url);
    };
    const task = work(); this.task = task;
    try { return await task; } finally { if (this.task === task) this.task = null; }
  }
}
