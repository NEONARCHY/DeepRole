import { afterEach, expect, it, vi } from "vitest";
import { startupDeadline } from "../src/core/startup";

afterEach(() => vi.useRealTimers());
it("bounds an unanswered request", async () => {
  vi.useFakeTimers();
  const result = expect(startupDeadline(new Promise(() => {}))).rejects.toThrow("startup-timeout");
  await vi.advanceTimersByTimeAsync(8000);
  await result;
});
it("preserves a successful result and clears its timer", async () => {
  vi.useFakeTimers();
  await expect(startupDeadline(Promise.resolve(42))).resolves.toBe(42);
  await Promise.resolve();
  expect(vi.getTimerCount()).toBe(0);
});
it("preserves rejection and tolerates a late settlement", async () => {
  vi.useFakeTimers();
  await expect(startupDeadline(Promise.reject(new Error("offline")))).rejects.toThrow("offline");
  let finish!: (value: number) => void;
  const pending = new Promise<number>(resolve => { finish = resolve; });
  const result = expect(startupDeadline(pending, 20)).rejects.toThrow("startup-timeout");
  await vi.advanceTimersByTimeAsync(20);
  await result;
  finish(1);
  await Promise.resolve();
  expect(vi.getTimerCount()).toBe(0);
});
