import { afterEach, expect, it } from "vitest";
import { storyWorld } from "./fixtures/story-worlds";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { characterRevision } from "../src/core/characters";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";
import { runStoryGame } from "../src/storage/story-game";
import { readStoryReview } from "../src/storage/story-review";
import { approveStoryFact } from "../src/storage/story-facts";
import type { ChatBinding } from "../src/core/types";
import type { StoryEvent, StoryProjection, StoryRecord } from "../src/core/story-records";
import { storyFactContext } from "../src/core/story-fact-context";
const databases: DeepRoleDatabase[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(db => db.delete())); });
async function setup() {
  const f = storyWorld(), db = new DeepRoleDatabase("facts-" + crypto.randomUUID()); databases.push(db); const repo = new DeepRoleRepository(db); await repo.mergeRecords(f.records);
  const message = (id: string, parent: string | null, role: "user" | "assistant", content: string) => ({ identity: { nativeMessageKey: key(id), nativeParentKey: parent === null ? null : key(parent), role }, completion: "complete" as const, content });
  const snapshot = { chatId: f.binding.chatId, selectedNativeKey: key("2"), messages: [message("1", null, "user", "Begin"), message("2", "1", "assistant", "Workshop")] };
  const play = async (operation: "start" | "sync" = "sync") => { const b = (await repo.get<ChatBinding>("binding", f.binding.id))!; return runStoryGame({ chatId: b.chatId, worldId: f.world.id, expectedBase: characterRevision(f.entities, b.characterScenes![f.world.id]), operation, snapshot, nativeParentKey: null, manual: "stop" }, DEFAULT_SETTINGS, repo); };
  const read = () => readStoryReview({ chatId: f.binding.chatId, worldId: f.world.id, cursor: null }, repo);
  await play("start"); const branch = (await read()).guard!.branchId;
  const prose = "Мира передала медный ключ. Мира обещала починить ворота завтра.";
  snapshot.messages.push(message("3", "2", "user", "Act"), message("4", "3", "assistant", prose + `<deeprole_characters>${JSON.stringify({ version: 2, world: f.world.id, chat: f.binding.chatId, branch, facts: [{ text: "Медный ключ у героя", kind: "event", quote: "Мира передала медный ключ." }, { text: "Мира обещала ремонт завтра", kind: "promise", quote: "Мира обещала починить ворота завтра." }] })}</deeprole_characters>`), message("5", "3", "assistant", "Мира оставила ключ у себя.")); snapshot.selectedNativeKey = key("4"); await play();
  const context = async () => { const story = await repo.list<StoryRecord>("story"), p = story.find(r => r.type === "projection") as StoryProjection; return storyFactContext(p.appliedEventIds.flatMap(id => (story.find(r => r.id === id) as StoryEvent)?.memory ? [(story.find(r => r.id === id) as StoryEvent).memory!] : []), 600); };
  const approve = async (index: number, text?: string, accept = true) => { const page = await read(), fact = page.facts![index]!; return approveStoryFact({ chatId: f.binding.chatId, worldId: f.world.id, guard: page.guard!, eventId: fact.eventId, text: text ?? fact.text, accept }, repo); };
  return { ...f, db, repo, snapshot, read, play, approve, context };
}
it("reviewed played facts and promises enter context; proposals alone do not", async () => {
  const f = await setup(); expect(await f.context()).toBe(""); const page = await f.read(); expect(page.facts).toHaveLength(2); expect(page.facts!.every(f => !f.accepted)).toBe(true);
  await f.approve(0); await f.approve(1); const context = await f.context(); expect(context).toContain("Медный ключ у героя"); expect(context).toContain('"kind":"promise"'); expect(context).toContain("NOT proof of fulfillment"); expect(await f.repo.list("entry")).toEqual(f.records.filter(r => r.kind === "entry").map(r => r.data));
});
it("user edits are remembered, alternatives exclude their facts and returning does not duplicate them", async () => {
  const f = await setup(); await f.approve(0, "Герой хранит медный ключ в кармане"); expect((await f.read()).facts![0]!.edited).toBe(true);
  f.snapshot.selectedNativeKey = key("5"); await f.play(); expect(await f.context()).toBe("");
  f.snapshot.selectedNativeKey = key("4"); await f.play(); expect(await f.context()).toContain("в кармане"); const before = await f.repo.rawRecords(); await f.play(); expect(await f.repo.rawRecords()).toEqual(before); expect((await f.read()).facts).toHaveLength(2);
});
it("stale/foreign approval and a manual scene conflict cannot overwrite state", async () => {
  const f = await setup(), page = await f.read(), input = { chatId: f.binding.chatId, worldId: f.world.id, guard: page.guard!, eventId: page.facts![0]!.eventId, text: "Keep key", accept: true };
  await expect(approveStoryFact({ ...input, chatId: "another-chat" }, f.repo)).rejects.toThrow("story-binding-conflict");
  await f.approve(0); await expect(approveStoryFact(input, f.repo)).rejects.toThrow("story-review-stale");
  const b = (await f.repo.get<ChatBinding>("binding", f.binding.id))!; b.characterScenes![f.world.id]!.states["person-1"]!.goal = "My goal"; b.characterScenes![f.world.id]!.revision = "manual"; await f.repo.put("binding", b);
  const before = await f.repo.rawRecords(); await expect(f.approve(1)).rejects.toThrow("story-manual-conflict"); expect(await f.repo.rawRecords()).toEqual(before);
});
it("removing an approval does not delete the source or its proposal", async () => {
  const f = await setup(); await f.approve(0); await f.approve(0, undefined, false); expect(await f.context()).toBe(""); expect((await f.read()).facts).toHaveLength(2); f.db.close(); await f.db.open(); expect((await f.read()).facts![0]!.accepted).toBe(false);
});
