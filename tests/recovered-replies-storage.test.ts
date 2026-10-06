import { afterEach, describe, expect, it } from "vitest";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { saveRecoveredReply } from "../src/storage/recovered-replies";
import type { ChatBinding } from "../src/core/types";

const edit = { chatId: "a", chatUrl: "https://chat.deepseek.com/chat/s/a", reply: { messageKey: JSON.stringify(["message", "reply"]), html: "<p>The exact original fragment.</p>", capturedAt: 1, recoveredAt: 2 } };
const databases: DeepRoleDatabase[] = [];
async function setup() { const db = new DeepRoleDatabase(`reply-recovery-${crypto.randomUUID()}`); databases.push(db); return { db, repo: new DeepRoleRepository(db) }; }
afterEach(async () => { await Promise.all(databases.map(db => db.delete())); databases.length = 0; });

describe("durable reply recovery archive", () => {
  it("stores recoveries in extension-owned chat records, including chats without a world", async () => {
    const { repo, db } = await setup(); await saveRecoveredReply(edit, repo);
    const reloaded = new DeepRoleRepository(db); const stored = await reloaded.get<ChatBinding>("binding", "binding:a");
    expect(stored?.recoveredReplies).toEqual([edit.reply]); expect(stored?.worldId).toBeUndefined(); expect(stored?.bookId).toBeNull();
    await saveRecoveredReply({ ...edit, chatId: "b", chatUrl: "https://chat.deepseek.com/chat/s/b", reply: { ...edit.reply, html: "<p>Another chat</p>" } }, repo);
    expect((await repo.get<ChatBinding>("binding", "binding:a"))!.recoveredReplies).toEqual([edit.reply]);
  });
  it("merges independent concurrent saves and preserves current scene and memory choices", async () => {
    const { repo } = await setup(); const binding: ChatBinding = { id: "binding:a", chatId: "a", chatUrl: edit.chatUrl, worldId: "w", bookId: "book", focusIds: ["mira"], memoryOverrides: { includedIds: ["oath"], excludedIds: ["old"] }, messageCountAtAnalysis: 14, createdAt: 1, updatedAt: 2 };
    await repo.put("binding", binding);
    await Promise.all([saveRecoveredReply(edit, repo), saveRecoveredReply({ ...edit, reply: { ...edit.reply, messageKey: JSON.stringify(["message", "reply2"]), html: "<p>Second fragment</p>" } }, repo)]);
    const after = (await repo.get<ChatBinding>("binding", binding.id))!;
    expect(after.recoveredReplies).toHaveLength(2); const { recoveredReplies, updatedAt, ...rest } = after; const { updatedAt: ignored, ...expected } = binding; expect(rest).toEqual(expected);
  });
  it("deduplicates repeated capture and rejects invalid scope or older regeneration attempts", async () => {
    const { repo } = await setup(); await saveRecoveredReply(edit, repo); await saveRecoveredReply(edit, repo);
    await saveRecoveredReply({ ...edit, reply: { ...edit.reply, capturedAt: 0, html: "<p>Obsolete text</p>" } }, repo);
    expect((await repo.get<ChatBinding>("binding", "binding:a"))!.recoveredReplies).toEqual([edit.reply]);
    await expect(saveRecoveredReply({ ...edit, chatUrl: "https://chat.deepseek.com/chat/s/b" }, repo)).rejects.toThrow("reply-invalid");
    await expect(saveRecoveredReply({ ...edit, reply: { ...edit.reply, messageKey: "same-looking-message" } }, repo)).rejects.toThrow("reply-invalid");
  });
  it("honors vault locks and encrypts recovered content together with the chat binding", async () => {
    const { repo, db } = await setup(); await repo.enableVault("test-only-password"); await saveRecoveredReply(edit, repo);
    const rows = await db.records.toArray(); expect(JSON.stringify(rows)).not.toContain("exact original fragment"); expect(rows[0]?.encrypted).toBeDefined();
    await repo.lockVault(); await expect(saveRecoveredReply({ ...edit, reply: { ...edit.reply, html: "New private text" } }, repo)).rejects.toThrow();
    await repo.unlockVault("test-only-password"); expect((await repo.get<ChatBinding>("binding", "binding:a"))!.recoveredReplies).toEqual([edit.reply]);
  });
});
