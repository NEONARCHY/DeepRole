import { describe, expect, it } from "vitest";
import { memoryReadiness, pendingActivity, selectionReason } from "../src/core/memory-experience";
import type { RankedMemory, ServiceRequest } from "../src/core/types";

describe("memory status reflects the actual outgoing selection", () => {
  it("does not claim readiness offline or after a failed injection", () => {
    expect(memoryReadiness(false, undefined, 4, 8)).toBe("offline");
    expect(memoryReadiness(true, "failed", 4, 8)).toBe("failed");
    expect(memoryReadiness(true, "", 4, 8)).toBe("ready");
    expect(memoryReadiness(true, "", 0, 8)).toBe("matching");
    expect(memoryReadiness(true, "", 0, 0)).toBe("empty");
  });
  it("explains matches, explicit scene selection and overrides separately", () => {
    const item = { entry: { activation: "smart" }, manuallySelected: false, reasons: ["name-in-title"] } as RankedMemory;
    expect(selectionReason(item)).toBe("reasonMatch");
    expect(selectionReason({ ...item, reasons: ["entity:mira"] })).toBe("reasonScene");
    expect(selectionReason({ ...item, reasons: ["linked"] })).toBe("reasonLink");
    expect(selectionReason({ ...item, manuallySelected: true })).toBe("reasonManual");
    expect(selectionReason({ ...item, entry: { ...item.entry, activation: "always" } })).toBe("reasonAlways");
    expect(selectionReason({ ...item, entry: { ...item.entry, activation: "always" }, origin: { kind: "entity", id: "mira" } })).toBe("reasonScene");
  });
});
describe("service progress", () => {
  const request: ServiceRequest = { id: "request-1", type: "memory-analysis", chatId: "a", bookId: null, createdAt: 100 };
  it("never shows another chat's pending analysis", () => {
    expect(pendingActivity(request, "b", false, 200)).toBeNull();
    expect(pendingActivity(null, "a", false)).toBeNull();
    expect(pendingActivity(request, "a", false, 200)?.phase).toBe("waiting");
  });
  it("unblocks a stale request without erasing its correlation metadata", () => {
    expect(pendingActivity(request, "a", false, 600100)?.phase).toBe("error");
    expect(pendingActivity(request, "a", true, 600100)?.phase).toBe("waiting");
    expect(request.id).toBe("request-1");
  });
  it("supports creating lore before the new chat has an id", () => {
    expect(pendingActivity({ ...request, chatId: undefined, type: "lore-draft" }, null, false, 200)?.phase).toBe("waiting");
  });
});
