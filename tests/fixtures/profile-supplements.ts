import { storyWorld } from "./story-worlds";
import { DeepRoleDatabase } from "../../src/storage/database";
import { DeepRoleRepository } from "../../src/storage/repository";
import { characterInChat, characterRevision } from "../../src/core/characters";
import { nativeStoryMessageKey as key } from "../../src/core/story-transport";
import { DEFAULT_SETTINGS } from "../../src/core/defaults";
import { runStoryGame } from "../../src/storage/story-game";
import { readProfileSupplements, prepareProfileSupplement, type SupplementBrief } from "../../src/storage/profile-supplements";
import { currentStoryProfileEntities } from "../../src/core/story-profile-view";
import type { ChatBinding, SceneEntity } from "../../src/core/types";
import type { StoryRecord } from "../../src/core/story-records";
export async function profileFixture(count = 3) {
 const f = storyWorld("en", count), actor = f.entities[1]!; actor.name = "Mira"; actor.aliases = ["Keeper"]; actor.characterSheet!.appearance = "Author: green coat.";
 const other = structuredClone(f.binding); other.id = "binding:synthetic-b"; other.chatId = "synthetic-b"; other.chatUrl = "https://chat.deepseek.com/chat/s/synthetic-b"; f.records.push({ kind: "binding", id: other.id, data: other });
 const db = new DeepRoleDatabase("supplement-" + crypto.randomUUID()), repo = new DeepRoleRepository(db); await repo.mergeRecords(f.records);
 const message = (id: string, parent: string | null, role: "user" | "assistant", content: string) => ({ identity: { nativeMessageKey: key(id), nativeParentKey: parent === null ? null : key(parent), role }, completion: "complete" as const, content });
 const scope = { worldId: f.world.id, chatId: f.binding.chatId }, snapshot = { chatId: scope.chatId, selectedNativeKey: key("2"), messages: [message("1", null, "user", "Before tracking."), message("2", "1", "assistant", "Old Mira costume description.")] };
 const scene = async () => (await repo.get<ChatBinding>("binding", f.binding.id))!.characterScenes![f.world.id]!;
 const play = async (operation: "start" | "sync" | "restart" = "sync", manual: "stop" | "keep" = "stop") => runStoryGame({ ...scope, expectedBase: characterRevision((await repo.list<SceneEntity>("entity")).filter(p => characterInChat(p, scope.chatId)), await scene()), operation, snapshot, nativeParentKey: null, manual }, DEFAULT_SETTINGS, repo);
 await play("start"); snapshot.messages.push(message("3", "2", "user", "Continue."), message("4", "3", "assistant", "Mira has a scar above her left eyebrow. Keeper grew up by the harbor."), message("5", "3", "assistant", "The keeper is absent.")); snapshot.selectedNativeKey = key("4"); await play();
 const read = (entityId: string | null = actor.id, query = "", offset = 0) => readProfileSupplements({ ...scope, entityId, query, offset }, repo);
 const prepare = async () => prepareProfileSupplement({ ...scope, entityId: actor.id, guard: (await read()).guard }, "field_" + crypto.randomUUID(), "en", repo);
 const visible = async (chat = scope.chatId) => currentStoryProfileEntities(await repo.list<SceneEntity>("entity"), await repo.list<StoryRecord>("story"), scope.worldId, chat);
 return { ...f, actor, other, db, repo, scope, snapshot, message, scene, play, read, prepare, visible };
}
export function supplementReply(b: SupplementBrief, alter?: (fields: any) => void) {
 const scar = b.sources.find(s => s.text.includes("Mira has a scar above her left eyebrow."))!, harbor = b.sources.find(s => s.text.includes("Keeper grew up by the harbor."))!;
 const fields = { appearance: { status: "found", text: "A scar above her left eyebrow.", evidence: [{ source: scar.id, quote: "Mira has a scar above her left eyebrow." }] }, personality: { status: "not-found", text: "", evidence: [] }, goals: { status: "not-found", text: "", evidence: [] }, background: { status: "found", text: "Grew up by the harbor.", evidence: [{ source: harbor.id, quote: "Keeper grew up by the harbor." }] } }; alter?.(fields);
 return JSON.stringify({ requestId: b.requestId, field: "character-profile", fields });
}
