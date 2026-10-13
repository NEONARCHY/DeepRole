import { afterEach, expect, it, vi } from "vitest";
import { startupBudget, startupDeadline } from "../src/core/startup";

afterEach(() => vi.useRealTimers());
it("one startup budget bounds consecutive slow reads, not a new deadline per phase", async () => {
  vi.useFakeTimers();const applied=vi.fn();
  const result=expect(startupBudget(async active=>{
    await new Promise(resolve=>setTimeout(resolve,6000));
    await new Promise(resolve=>setTimeout(resolve,6000));
    if(active())applied();
  })).rejects.toThrow("startup-timeout");
  await vi.advanceTimersByTimeAsync(8000);await result;
  await vi.advanceTimersByTimeAsync(4000);expect(applied).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it("expired startup does not begin a later phase when the first read settles",async()=>{
  vi.useFakeTimers();const later=vi.fn();let finish!:()=>void;
  const result=expect(startupBudget(async active=>{
    await new Promise<void>(resolve=>{finish=resolve});
    if(active())later();
  })).rejects.toThrow("startup-timeout");
  await vi.advanceTimersByTimeAsync(8000);await result;finish();await Promise.resolve();
  expect(later).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});
it("successful startup returns its result and closes the active lease",async()=>{
  vi.useFakeTimers();let active!:()=>boolean;
  await expect(startupBudget(async check=>{active=check;expect(active()).toBe(true);return 42})).resolves.toBe(42);
  expect(active()).toBe(false);expect(vi.getTimerCount()).toBe(0);
});
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
