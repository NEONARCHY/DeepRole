import { describe, expect, it } from "vitest";
import { indexStoryLineage } from "../src/core/story-lineage";
import type { StoryRevision } from "../src/core/story-records";

function revision(id: string, parentRevisionId: string | null, override: Partial<StoryRevision> = {}): StoryRevision {
  return { format: "deeprole-story", contractVersion: 1, type: "revision", id, messageId: "message-" + id, nativeMessageKey: "native-" + id, worldId: "world", playthroughId: "playthrough", branchId: "branch", requestId: null, parentRevisionId, role: "assistant", completion: "complete", content: "Synthetic", createdAt: 0, updatedAt: 0, ...override };
}
describe("iterative lineage index for request ancestors", () => {
  it("indexes a shuffled forest without confusing sibling alternatives or separate roots", () => {
    const records = [revision("a1", "a"), revision("b1", "b"), revision("root", null), revision("a", "root"), revision("other", null), revision("b", "root", { messageId: "message-a", nativeMessageKey: "native-a" })];
    const result = indexStoryLineage(records);
    const ancestor = (a: string, b: string) => result.get(a)!.start <= result.get(b)!.start && result.get(b)!.start < result.get(a)!.end;
    expect(ancestor("root", "a1")).toBe(true); expect(ancestor("root", "b1")).toBe(true); expect(ancestor("a", "b1")).toBe(false); expect(ancestor("other", "b1")).toBe(false);
    expect([...result.values()].every(position => position.complete && position.distinct)).toBe(true);
  });
  it("marks incomplete ancestors without poisoning the sibling branch", () => {
    const result = indexStoryLineage([revision("root", null), revision("partial", "root", { completion: "partial" }), revision("child", "partial"), revision("sibling", "root")]);
    expect(result.get("child")!.complete).toBe(false); expect(result.get("sibling")!.complete).toBe(true);
  });
  it.each(["messageId", "nativeMessageKey"] as const)("marks repeated %s only inside one path", field => {
    const root = revision("root", null), child = revision("child", "root", { [field]: root[field] });
    const result = indexStoryLineage([root, child, revision("descendant", "child"), revision("sibling", "root")]);
    expect(result.get("child")!.distinct).toBe(false); expect(result.get("descendant")!.distinct).toBe(false); expect(result.get("sibling")!.distinct).toBe(true);
  });
  it("does not use recursive calls for a 12,000-node chain", () => {
    const records = Array.from({ length: 12_000 }, (_, index) => revision(String(index), index ? String(index - 1) : null));
    const result = indexStoryLineage(records);
    expect(result.size).toBe(12_000); expect(result.get("0")!.end).toBe(12_000); expect(result.get("11999")!.start).toBe(11_999); expect(result.get("11999")!.distinct).toBe(true);
  });
  it("rejects a missing parent, duplicate ID, and rootless cycle instead of inventing order", () => {
    expect(() => indexStoryLineage([revision("child", "missing")])).toThrow("story-lineage-invalid");
    expect(() => indexStoryLineage([revision("a", null), revision("a", null)])).toThrow("story-cycle");
    expect(() => indexStoryLineage([revision("a", "b"), revision("b", "a")])).toThrow("story-lineage-invalid");
  });
});
