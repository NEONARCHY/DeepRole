import { expect, it } from "vitest";
import { castServiceProgress } from "../src/core/cast-service";
import { castServiceOperationFromStart, validServiceOperation } from "../src/core/service-operations";
import { servicePending, validServicePending } from "../src/core/service-outbox";
import type { CastJob } from "../src/core/cast-initialization";

const id = "cast_72c2c6df-3dd2-4e31-a872-0c9500fe6458";
const job = (changes = {}): CastJob => ({ id, worldId: "w", locale: "en", createdAt: 1, updatedAt: 2, phase: "opening", step: 0, awaiting: false, repair: false, sources: [{ id: "private-source", title: "PRIVATE_TITLE", text: "PRIVATE_LORE", at: 1 }], signature: "PRIVATE_SIGNATURE", cleanup: "pending", ...changes });
it("registers strictly scoped cast metadata without a game-chat binding or model content", () => {
 const value = castServiceOperationFromStart({ id, worldId: "w", createdAt: 1 });
 expect(value).toMatchObject({ operation: "cast-preparation", fieldScope: "cast", mode: "history", sourceChatId: null, phase: "prepared" });
 for (const change of [{ operation: "character-field" }, { sourceChatId: "game" }, { fieldScope: "profile" }, { mode: "suggest" }, { id: "field_one" }, { phase: ["prepared"] }, { origin: ["local"] }, { prompt: "PRIVATE" }]) expect(validServiceOperation({ ...value, ...change })).toBe(false);
 expect(() => castServiceOperationFromStart({ id, worldId: "w", createdAt: 1, sources: "PRIVATE" })).toThrow("service-operation-invalid");
});
it("treats each intermediate batch/repair as work in progress, not a completed cast", () => {
 expect(castServiceProgress(job()).phase).toBe("prepared");
 for (const change of [{ awaiting: true }, { step: 1 }, { phase: "reading" }, { phase: "analyzing", repair: true }]) expect(castServiceProgress(job(change)).phase).toBe("dispatching");
 for (const phase of ["ready", "applied"]) expect(castServiceProgress(job({ phase, chatId: "owned" }))).toMatchObject({ phase: "result", error: null });
});
it("keeps partial/refused/cancelled outcomes separate from prepared profiles and cleanup", () => {
 expect(castServiceProgress(job({ phase: "error", error: "partial-reply", chatId: "owned", cleanup: "failed" }))).toMatchObject({ phase: "failed", error: "partial-reply", cleanup: "failed" });
 expect(castServiceProgress(job({ phase: "cancelled" }))).toMatchObject({ phase: "failed", error: "cancelled" });
 expect(castServiceProgress(job({ phase: "applied", error: "partial-reply", chatId: "owned" }))).toMatchObject({ phase: "failed", error: "partial-reply" });
 expect(castServiceProgress(job({ phase: "error", error: "tab-unavailable", cleanup: "none" }))).toMatchObject({ phase: "failed", cleanup: "done", workerChatId: null });
});
it("does not copy arbitrary worker errors, private sources or draft fields into the queue", () => {
 const progress = castServiceProgress(job({ phase: "error", error: "PRIVATE_ERROR", chatId: "owned", cleanup: "done", draft: { name: "PRIVATE_NAME" } }));
 expect(progress.error).toBe("preparation-failed"); const queued = servicePending(id, progress);
 expect(validServicePending(queued)).toBe(true); expect(JSON.stringify(queued)).not.toMatch(/PRIVATE|owned|worldId|chatId|sources|signature/u);
 expect(validServicePending({ ...queued, phase: "failed", error: "model-refusal" })).toBe(true);
 expect(validServicePending({ ...queued, id: id.replace("cast_", "field_"), error: "model-refusal" })).toBe(false);
});
