import { afterEach, expect, it } from "vitest";
import { oldChatNotice, oldChatNoticePrompt, validOldChatNoticeEdit, validOldChatNoticeReceipt } from "../src/core/old-chat-notice";
import { acknowledgeOldChatNotice } from "../src/storage/old-chat-notice";
import { captureContinuation, completeContinuation } from "../src/storage/story-continuation";
import { prepareDispatchCapture } from "../src/storage/story-dispatch-capture";
import { validDataRecord } from "../src/core/record-validation";
import { presentHiddenHandoffs } from "../src/adapters/deepseek-handoff-dom";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { storyWorld } from "./fixtures/story-worlds";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import type { ChatBinding, HandoffSnapshot } from "../src/core/types";
const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { document.body.replaceChildren(); await Promise.all(dbs.splice(0).map(db => db.delete())); });
async function fixture() {
 const f = storyWorld("ru"), db = new DeepRoleDatabase("old-chat-" + crypto.randomUUID()); dbs.push(db); const repo = new DeepRoleRepository(db); await repo.mergeRecords(f.records);
 const snapshot = await captureContinuation({ chatId: f.binding.chatId, chatUrl: f.binding.chatUrl, scene: { worldId: f.world.id, bookId: null, focusIds: [] }, overrides: { includedIds: [], excludedIds: [] }, story: { version: 1, source: "history", turns: [{ role: "assistant", text: "The clock waits." }], partial: false, omittedTurns: 0 } }, repo);
 const read = async () => oldChatNotice((await repo.get<ChatBinding>("binding", f.binding.id))!, await repo.list("snapshot"), [], await repo.list("world"));
 const edit = async (mode: "sent" | "dismissed") => { const n = (await read())!; return { chatId: f.binding.chatId, chatUrl: f.binding.chatUrl, worldId: f.world.id, snapshotId: n.snapshotId, targetChatId: n.targetChatId, mode }; };
 return { ...f, db, repo, snapshot, read, edit };
}
it("marks only successful continuation; keeps original scene and lore unchanged, retry is idempotent", async () => {
 const f = await fixture(); expect(await f.read()).toBeNull();
 await completeContinuation(f.snapshot, "new-chat", f.repo); expect(await f.read()).toMatchObject({ targetChatId: "new-chat", sent: false, dismissed: false });
 expect(await f.repo.get("binding", f.binding.id)).toEqual(f.binding);
 const before = await f.repo.rawRecords(); await completeContinuation(f.snapshot, "new-chat", f.repo); expect(await f.repo.rawRecords()).toEqual(before);
 await expect(completeContinuation(f.snapshot, "other-chat", f.repo)).rejects.toThrow("handoff-conflict");
});
it("acknowledges once without changing played data; dismissed notice allows normal sends and survives backup", async () => {
 const f = await fixture(); await completeContinuation(f.snapshot, "new-chat", f.repo);
 await acknowledgeOldChatNotice(await f.edit("sent"), f.repo); expect(await f.read()).toMatchObject({ sent: true, dismissed: false });
 const before = await f.repo.rawRecords(); await acknowledgeOldChatNotice(await f.edit("sent"), f.repo); expect(await f.repo.rawRecords()).toEqual(before);
 await acknowledgeOldChatNotice(await f.edit("dismissed"), f.repo); expect(await f.read()).toMatchObject({ sent: true, dismissed: true });
 const source = (await f.repo.get<ChatBinding>("binding", f.binding.id))!; expect(source.characterScenes).toEqual(f.binding.characterScenes);
 const backup = await parseBackup(JSON.stringify(await createBackup(undefined, f.repo))); await restoreBackup(backup, "replace", f.repo); expect(await f.read()).toMatchObject({ dismissed: true });
});
it("links to the last confirmed world destination, including return to an older chat, and ignores other worlds", () => {
 const f = storyWorld(), base = { title: "Next", summary: "", worldId: f.world.id, bookId: null, sourceChatUrl: "", createdAt: 1 } as const;
 const snapshots: HandoffSnapshot[] = [{ ...base, id: "ab", sourceChatId: f.binding.chatId, targetChatId: "b", appliedAt: 2 }, { ...base, id: "bc", sourceChatId: "b", targetChatId: "c", appliedAt: 3 }, { ...base, id: "unconfirmed", sourceChatId: "c", targetChatId: "wrong" }, { ...base, id: "foreign", sourceChatId: "c", targetChatId: "other", worldId: "foreign", appliedAt: 4 }];
 expect(oldChatNotice(f.binding, snapshots)).toMatchObject({ snapshotId: "bc", targetChatId: "c" });
 expect(oldChatNotice({ ...f.binding, chatId: "c" }, snapshots)).toBeNull();
 expect(oldChatNotice(f.binding, [...snapshots, { ...base, id: "ca", sourceChatId: "c", targetChatId: f.binding.chatId, appliedAt: 5 }])).toBeNull();
 expect(oldChatNotice({ ...f.binding, chatId: "b" }, [...snapshots, { ...base, id: "ad", sourceChatId: f.binding.chatId, targetChatId: "d", appliedAt: 5 }])).toMatchObject({ targetChatId: "d", snapshotId: "ad" });
 expect(oldChatNotice({ ...f.binding, chatId: "unrelated" }, snapshots)).toBeNull();
 expect(oldChatNotice(f.binding, [{ ...base, id: "older", sourceChatId: f.binding.chatId, appliedAt: 2 }])).toBeNull();
});
it("rejects stale links, changed worlds and cancelled commits without writing a receipt", async () => {
 const f = await fixture(); await completeContinuation(f.snapshot, "new-chat", f.repo); const input = await f.edit("sent"), before = await f.repo.rawRecords();
 await expect(acknowledgeOldChatNotice({ ...input, targetChatId: "wrong" }, f.repo)).rejects.toThrow("handoff-conflict");
 await expect(acknowledgeOldChatNotice({ ...input, worldId: "foreign" }, f.repo)).rejects.toThrow("handoff-scope");
 await expect(acknowledgeOldChatNotice(input, f.repo, async () => { throw Error("scene-changed"); })).rejects.toThrow("scene-changed");
 expect(await f.repo.rawRecords()).toEqual(before);
});
it("treats the navigation reminder as non-story without consuming an independently marked next message", async () => {
 const f = await fixture(); await completeContinuation(f.snapshot, "new-chat", f.repo); const n = (await f.read())!;
 await f.repo.put("binding", { ...f.binding, nextStoryMessageMode: "out-of-character" });
 const input = { id: crypto.randomUUID(), worldId: f.world.id, bindingId: f.binding.id, identity: { chatId: f.binding.chatId, nativeParentKey: null }, transport: "fetch" as const, sceneRevision: f.binding.characterScenes![f.world.id]!.revision, originalDraft: "Continue.", proposedContext: oldChatNoticePrompt(n, "ru") };
 await prepareDispatchCapture(input, 1, f.repo);
 expect(await f.repo.get("dispatch", input.id)).toMatchObject({ purpose: "out-of-character" }); expect((await f.repo.get<ChatBinding>("binding", f.binding.id))!.nextStoryMessageMode).toBe("out-of-character");
 expect(await f.repo.list("story")).toHaveLength(0);
});
it("keeps technical instructions hidden in the user bubble while preserving its original text", () => {
 const n = { sourceChatId: "a", targetChatId: "b", snapshotId: "snap", sent: false, dismissed: false };
 document.body.innerHTML = '<article data-role="user"><div class="ds-markdown"></div></article>';
 const body = document.querySelector(".ds-markdown")!; const original = oldChatNoticePrompt(n, "ru") + "\n\n[User message]\nЯ открываю дверь."; body.textContent = original;
 presentHiddenHandoffs(); expect(body.querySelector("[data-deeprole-handoff-visible]")!.textContent).toBe("Я открываю дверь.");
 expect(body.textContent).toContain(original); presentHiddenHandoffs(); expect(body.querySelectorAll("[data-deeprole-handoff-visible]")).toHaveLength(1);
 expect(oldChatNoticePrompt(n, "en")).toContain("you can keep playing here too");
});
it("strictly validates optional backup metadata and receipts", () => {
 const f = storyWorld(), s: HandoffSnapshot = { id: "snapshot", title: "Next", summary: "", sourceChatId: "a", sourceChatUrl: "", targetChatId: "b", bookId: null, worldId: f.world.id, createdAt: 1, appliedAt: 2 };
 expect(validDataRecord({ kind: "snapshot", id: s.id, data: s })).toBe(true);
 for (const targetChatId of ["https://example.com", "b?x=1", "a"]) expect(validDataRecord({ kind: "snapshot", id: s.id, data: { ...s, targetChatId } })).toBe(false);
 expect(validOldChatNoticeReceipt({ snapshotId: "s", sentAt: 1 })).toBe(true); expect(validOldChatNoticeReceipt({ snapshotId: "s", sentAt: -1 })).toBe(false);
 expect(validOldChatNoticeEdit({ chatId: "a", chatUrl: "", worldId: null, snapshotId: "s", targetChatId: "b", mode: "blocked" })).toBe(false);
});
