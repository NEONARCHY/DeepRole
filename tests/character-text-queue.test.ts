import { expect, it, vi } from "vitest";
import { CharacterTextQueue } from "../src/core/character-text-queue";
const deferred = () => { let resolve!: (value: string) => void; const promise = new Promise<string>(r => { resolve = r; }); return { promise, resolve }; };
const tick = async () => { await new Promise(r => setTimeout(r, 5)); };

it("dispatches FIFO one at a time and reads fresh draft after the previous consumer applies its result", async () => {
 const queue = new CharacterTextQueue(), first = deferred(), sent: string[] = []; let draft = "old";
 const a = queue.enqueue(async () => { sent.push("a"); return first.promise; }); const applied = a.then(value => { draft = typeof value === "string" ? value : value.text; });
 const progress = vi.fn(); const b = queue.enqueue(async () => { sent.push("b:" + draft); return "b"; }, { onProgress: progress });
 const c = queue.enqueue(async () => { sent.push("c"); return "c"; });
 expect(sent).toEqual(["a"]); expect(progress).toHaveBeenCalledWith({ phase: "queued", position: 1 });
 first.resolve("fresh"); await applied; expect(await b).toBe("b"); expect(await c).toBe("c"); expect(sent).toEqual(["a", "b:fresh", "c"]);
});
it("cancelled waiting fields are removed without dispatching and positions are updated", async () => {
 const queue = new CharacterTextQueue(), first = deferred(), run = vi.fn(async () => "skipped"), controller = new AbortController(), progress = vi.fn();
 const a = queue.enqueue(() => first.promise), b = queue.enqueue(run, { signal: controller.signal }), c = queue.enqueue(async () => "c", { onProgress: progress });
 expect(progress).toHaveBeenLastCalledWith({ phase: "queued", position: 2 }); const cancelled = expect(b).rejects.toThrow("cancelled"); controller.abort(); await cancelled;
 expect(progress).toHaveBeenLastCalledWith({ phase: "queued", position: 1 }); first.resolve("a"); await a; expect(await c).toBe("c"); expect(run).not.toHaveBeenCalled();
});
it("stale queued fields are skipped at dispatch, before invoking the generator", async () => {
 const queue = new CharacterTextQueue(), first = deferred(), run = vi.fn(async () => "never"); let current = true;
 const a = queue.enqueue(() => first.promise), b = queue.enqueue(run, { isCurrent: () => current }); const skipped = expect(b).rejects.toThrow("field-changed"); current = false;
 first.resolve("a"); await a; await skipped; expect(run).not.toHaveBeenCalled();
});
it("active cancellation does not release the slot while the generator is settling cleanup", async () => {
 const queue = new CharacterTextQueue(), first = deferred(), controller = new AbortController(), next = vi.fn(async () => "next"); let signal!: AbortSignal;
 const a = queue.enqueue(s => { signal = s; return first.promise; }, { signal: controller.signal }); const b = queue.enqueue(next);
 const cancelled = expect(a).rejects.toThrow("cancelled"); controller.abort(); await tick(); expect(signal.aborted).toBe(true); expect(next).not.toHaveBeenCalled();
 first.resolve("discarded"); await cancelled; expect(await b).toBe("next");
});
it.each(["cleanup-pending", "scene-changed", "vault-locked", "busy", "user-interrupted", "login-required"])("%s stops remaining requests, not an automatic retry", async code => {
 const queue = new CharacterTextQueue(), first = deferred(), second = vi.fn(async () => "never");
 const a = queue.enqueue(async () => { await first.promise; throw Error(code); }), b = queue.enqueue(second); const failed = expect(a).rejects.toThrow(code), stopped = expect(b).rejects.toThrow("queue-stopped");
 first.resolve("x"); await failed; await stopped; expect(second).not.toHaveBeenCalled();
});
it("missing facts or bad field output do not repeat and allow independent selected fields to continue", async () => {
 const queue = new CharacterTextQueue(), first = vi.fn(async () => { throw Error("facts-not-found"); });
 const a = queue.enqueue(first), b = queue.enqueue(async () => "b"); await expect(a).rejects.toThrow("facts-not-found"); expect(await b).toBe("b"); expect(first).toHaveBeenCalledTimes(1);
});
it("closing the editor cancels every pending request and prevents late results from applying", async () => {
 const queue = new CharacterTextQueue(), first = deferred(), next = vi.fn(async () => "never"); let signal!: AbortSignal;
 const a = queue.enqueue(s => { signal = s; return first.promise; }), b = queue.enqueue(next); const cancelledA = expect(a).rejects.toThrow("cancelled"), cancelledB = expect(b).rejects.toThrow("cancelled");
 queue.cancelAll(); expect(signal.aborted).toBe(true); await cancelledB; first.resolve("late"); await cancelledA; await tick(); expect(next).not.toHaveBeenCalled();
});
