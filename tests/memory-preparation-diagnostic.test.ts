import { expect, it, vi } from "vitest";
import { memoryPreparationDiagnostic, reportMemoryPreparationFailure, safeMemoryPreparationDetail } from "../src/core/memory-preparation-diagnostic";

it("keeps only an exact allowlisted code and a bounded duration", () => {
  expect(memoryPreparationDiagnostic("parent", Error("story-review-stale"), 12.6)).toEqual({ revision: "RP333", stage: "parent", code: "story-review-stale", elapsedMs: 13 });
  expect(memoryPreparationDiagnostic("native-snapshot", "native-http", Infinity).elapsedMs).toBe(0);
  expect(memoryPreparationDiagnostic("reload", null, -4).elapsedMs).toBe(0);
  expect(memoryPreparationDiagnostic("compile", null, 9e9).elapsedMs).toBe(3_600_000);
});
it.each([Error("story-review-stale secret user text"), Error("Bearer PRIVATE_TOKEN"), { message: "PRIVATE_LORE" }, "https://private.test/?token=SECRET"])("never copies arbitrary error details %s", error => {
  const value = memoryPreparationDiagnostic("compile", error, 42);
  expect(value.code).toBe("unknown");
  expect(JSON.stringify(value)).not.toMatch(/secret|PRIVATE|Bearer|private\.test|SECRET/);
});
it("logs only the safe record without changing the original error", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const error = Error("PRIVATE_LORE"); reportMemoryPreparationFailure("navigation", error, Date.now());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toBe("[DeepRole memory preparation]");
    expect(JSON.parse(warn.mock.calls[0]?.[1])).toMatchObject({ revision: "RP333", stage: "navigation", code: "unknown" });
    expect(error.message).toBe("PRIVATE_LORE");
  } finally { warn.mockRestore(); }
});
it("retains only fixed activation causes without serializing an arbitrary cause object", () => {
  expect(memoryPreparationDiagnostic("activation", Error("story-binding-conflict", {cause:"activation-tab-inactive"}), 2)).toMatchObject({code:"story-binding-conflict",detail:"activation-tab-inactive"});
  for (const cause of ["SECRET", "activation-tab-inactive PRIVATE_LORE", {message:"PRIVATE_LORE"}, Error("Bearer PRIVATE_TOKEN")]) {
    expect(safeMemoryPreparationDetail(cause)).toBeUndefined();
    expect(memoryPreparationDiagnostic("activation", Error("story-binding-conflict",{cause}), 2)).not.toHaveProperty("detail");
  }
});
