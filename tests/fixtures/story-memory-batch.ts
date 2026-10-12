import { storyWorld } from "./story-worlds";
import { DeepRoleDatabase } from "../../src/storage/database";
import { DeepRoleRepository } from "../../src/storage/repository";
import { activateWorldGame } from "../../src/storage/world-game";
import { runStoryGame } from "../../src/storage/story-game";
import { DEFAULT_SETTINGS } from "../../src/core/defaults";
import { characterRevision, characterInChat } from "../../src/core/characters";
import { nativeStoryMessageKey } from "../../src/core/story-transport";
const key = (id: number) => nativeStoryMessageKey(String(id));
import type { ChatBinding, SceneEntity, WorldProfile } from "../../src/core/types";
import type { StoryGameSnapshot } from "../../src/core/story-game";
import { changeMemoryBatch, prepareMemoryBatch, type MemoryBatchBrief } from "../../src/storage/story-memory-batch";
export async function batchFixture(turns = 12) {
 const f = storyWorld("en", 3), db = new DeepRoleDatabase("batch-" + crypto.randomUUID()), repo = new DeepRoleRepository(db);
 f.world.storyAutomation = { mode: "automatic", revision: "inline-policy" };
 await repo.mergeRecords(f.records);
 const input = { worldId: f.world.id, chatId: f.binding.chatId, force: true };
 const world = async () => (await repo.get<WorldProfile>("world", f.world.id))!;
 const binding = async () => (await repo.list<ChatBinding>("binding")).find(b => b.chatId === input.chatId)!;
 await activateWorldGame({ worldId: input.worldId, chatId: input.chatId, chatUrl: f.binding.chatUrl, expectedRevision: null, mode: "initialize" }, repo);
 const message = (id: number, parent: number | null, role: "user" | "assistant", content: string) => ({ identity: { nativeMessageKey: key(id), nativeParentKey: parent === null ? null : key(parent), role }, completion: "complete" as const, content });
 const snapshot: StoryGameSnapshot = { chatId: input.chatId, selectedNativeKey: key(2), messages: [message(1,null,"user","Before recording."),message(2,1,"assistant","Before recording.")] };
 const play = async (operation: "start" | "sync" | "restart" | "reset" | "restore" = "sync") => { const b = await binding(); return runStoryGame({ worldId: input.worldId, chatId: input.chatId, operation, expectedBase: characterRevision((await repo.list<SceneEntity>("entity")).filter(p => characterInChat(p,input.chatId)),b.characterScenes?.[input.worldId]), snapshot, manual: "stop", nativeParentKey: null }, DEFAULT_SETTINGS, repo); };
 await play("start"); await changeMemoryBatch(input,"automatic",repo);
 let sequence = 2;
 const add = async (text?: string) => { const user=++sequence, reply=++sequence; snapshot.messages.push(message(user,user-1,"user","I explore room "+reply+"."),message(reply,user,"assistant",text ?? "Room"+reply+" contains token"+reply+"."));snapshot.selectedNativeKey=key(reply);await play();return reply; };
 for (let i=0;i<turns;i++) await add();
 const prepare = () => prepareMemoryBatch(input,"field_"+crypto.randomUUID(),"en",repo);
 return { ...f, db, repo, input, world, binding, snapshot, message, add, play, prepare };
}
export function batchReply(b: MemoryBatchBrief, custom?: (part: MemoryBatchBrief["parts"][number]) => {facts?: unknown[];people?:unknown[]}) {
 return JSON.stringify({ requestId: b.requestId, results: b.parts.map(part => ({ source: part.id, complete: true, facts: custom?.(part)?.facts ?? (part.role === "assistant" ? [{ text:part.text, quote:part.text, kind:"event",risk:"ordinary" }] : []), people:custom?.(part)?.people ?? [] })) });
}
