import { describe, expect, it } from "vitest";
import { createId } from "../src/core/id";
import type { CharacterStatus, DataRecord } from "../src/core/types";
import { assertStoryGraph, storyRow, type StoryBaseline, type StoryBranch, type StoryEvent, type StoryRecord, type StoryRevision } from "../src/core/story-records";
import { projectStoryBranch } from "../src/core/story-projection";
import { storyWorld } from "./fixtures/story-worlds";

function fixture() {
  const world = storyWorld("en"), branchId = "branch-root";
  const common = { format: "deeprole-story" as const, contractVersion: 1 as const, worldId: world.world.id, playthroughId: "playthrough-root", branchId, createdAt: 20, updatedAt: 20 };
  const scene = world.binding.characterScenes![world.world.id]!;
  const baseline: StoryBaseline = { ...common, type: "baseline", id: "baseline-root", historyBeforeBaseline: "unknown", legacyEntryScope: "unclassified", origin: { bindingId: world.binding.id, chatId: world.binding.chatId, worldId: world.world.id, sceneRevision: scene.revision }, snapshot: { states: structuredClone(scene.states), presentIds: [...scene.presentIds], partnerIds: [], names: Object.fromEntries(world.entities.map(e => [e.id, e.name])) } };
  const branch: StoryBranch = { ...common, type: "branch", id: branchId, baselineId: baseline.id, parentBranchId: null, forkRevisionId: null, headRevisionId: null, selectionVersion: 0 };
  const story: StoryRecord[] = [baseline, branch];
  const initial = structuredClone(baseline.snapshot.states[world.entities[0]!.id]!);
  function add(parentRevisionId: string | null, before: CharacterStatus = initial, condition = "Key delivered", messageId = createId("message")) {
    const revision: StoryRevision = { ...common, type: "revision", id: createId("revision"), messageId, nativeMessageKey: messageId, requestId: createId("request"), parentRevisionId, role: "assistant", completion: "complete", content: "The courier delivered the clock key." };
    const event: StoryEvent = { ...common, type: "event", id: createId("event"), revisionId: revision.id, ordinal: 0, disposition: "candidate", label: "Delivery", quote: "delivered the clock key", participantIds: [world.entities[0]!.id], changes: [{ entityId: world.entities[0]!.id, before: structuredClone(before), after: { ...structuredClone(before), condition } }] };
    story.push(revision, event); return { revision, event, state: event.changes[0]!.after! };
  }
  const records = (): DataRecord[] => [...world.records, ...story.map(storyRow)];
  return { ...world, baseline, branch, story, initial, add, records };
}

describe("RP-01 deterministic selected-line projection", () => {
  it("starts from the exact baseline and leaves input records untouched", () => {
    const f = fixture(), original = structuredClone(f.story);
    const result = projectStoryBranch(f.story, f.branch.id, null, []);
    expect(result.snapshot).toEqual(f.baseline.snapshot); expect(result.revisionIds).toEqual([]); expect(result.appliedEventIds).toEqual([]);
    result.snapshot.states[f.entities[0]!.id]!.condition = "Only a caller mutation";
    expect(f.story).toEqual(original);
  });

  it("does not apply a candidate merely because its source is selected", () => {
    const f = fixture(), a = f.add(null);
    const result = projectStoryBranch(f.story, f.branch.id, a.revision.id, []);
    expect(result.snapshot).toEqual(f.baseline.snapshot); expect(result.revisionIds).toEqual([a.revision.id]); expect(result.appliedEventIds).toEqual([]);
  });

  it("applies accepted events in parent and ordinal order, not storage order", () => {
    const f = fixture(), a = f.add(null), b = f.add(a.revision.id, a.state, "Clock repaired");
    f.story.reverse();
    const result = projectStoryBranch(f.story, f.branch.id, b.revision.id, [b.event.id, a.event.id]);
    expect(result.snapshot.states[f.entities[0]!.id]).toEqual(b.state);
    expect(result.revisionIds).toEqual([a.revision.id, b.revision.id]); expect(result.appliedEventIds).toEqual([a.event.id, b.event.id]);
  });

  it("isolates three alternatives and returns to an earlier choice without accumulating effects", () => {
    const f = fixture(), messageId = createId("message");
    const options = ["Key delivered", "Key lost", "Key retained"].map(condition => f.add(null, f.initial, condition, messageId));
    const accepted = options.map(o => o.event.id);
    for (const option of [...options, options[0]!]) {
      const result = projectStoryBranch(f.story, f.branch.id, option.revision.id, accepted);
      expect(result.appliedEventIds).toEqual([option.event.id]); expect(result.snapshot.states[f.entities[0]!.id]).toEqual(option.state);
    }
  });

  it("excludes descendants of a replaced or edited parent", () => {
    const f = fixture(), a = f.add(null), child = f.add(a.revision.id, a.state, "Clock repaired"), alternate = f.add(null, f.initial, "Key retained", a.revision.messageId);
    const accepted = [a.event.id, child.event.id, alternate.event.id];
    expect(projectStoryBranch(f.story, f.branch.id, child.revision.id, accepted).appliedEventIds).toEqual([a.event.id, child.event.id]);
    const replacement = projectStoryBranch(f.story, f.branch.id, alternate.revision.id, accepted);
    expect(replacement.appliedEventIds).toEqual([alternate.event.id]); expect(replacement.snapshot.states[f.entities[0]!.id]).toEqual(alternate.state);
    expect(projectStoryBranch(f.story, f.branch.id, null, accepted).snapshot).toEqual(f.baseline.snapshot);
  });

  it("rejects an incompatible dependent event when an earlier event is not accepted", () => {
    const f = fixture(), a = f.add(null), child = f.add(a.revision.id, a.state);
    expect(() => projectStoryBranch(f.story, f.branch.id, child.revision.id, [child.event.id])).toThrow("story-state-conflict");
  });

  it("checks every change in a multi-character event before changing any state", () => {
    const f = fixture(), a = f.add(null), second = f.entities[1]!.id;
    a.event.participantIds.push(second);
    a.event.changes.push({ entityId: second, before: null, after: f.initial });
    const before = structuredClone(f.story);
    expect(() => projectStoryBranch(f.story, f.branch.id, a.revision.id, [a.event.id])).toThrow("story-state-conflict");
    expect(f.story).toEqual(before);
  });

  it.each(["partial", "interrupted"] as const)("does not apply an accepted event from a %s source", completion => {
    const f = fixture(), a = f.add(null); a.revision.completion = completion;
    expect(() => projectStoryBranch(f.story, f.branch.id, a.revision.id, [a.event.id])).toThrow("story-source-incomplete");
  });

  it("does not accept unknown or duplicate event IDs", () => {
    const f = fixture(), a = f.add(null);
    expect(() => projectStoryBranch(f.story, f.branch.id, a.revision.id, ["unknown-event"])).toThrow("story-approval-invalid");
    expect(() => projectStoryBranch(f.story, f.branch.id, a.revision.id, [a.event.id, a.event.id])).toThrow("story-approval-invalid");
  });

  it("rejects a target from a different playthrough", () => {
    const f = fixture(), a = f.add(null); a.revision.playthroughId = "other-playthrough";
    expect(() => projectStoryBranch(f.story, f.branch.id, a.revision.id, [])).toThrow("story-lineage-invalid");
  });

  it("rejects a missing source or a cyclic chain instead of guessing a parent", () => {
    const f = fixture(), a = f.add(null);
    expect(() => projectStoryBranch(f.story, f.branch.id, "unknown-revision", [])).toThrow("story-lineage-invalid");
    a.revision.parentRevisionId = a.revision.id;
    expect(() => projectStoryBranch(f.story, f.branch.id, a.revision.id, [])).toThrow("story-cycle");
  });

  it("replays an explicitly anchored fork prefix without importing the parent's other alternatives", () => {
    const f = fixture(), a = f.add(null), other = f.add(null, f.initial, "Other alternative");
    const childBranch: StoryBranch = { ...f.branch, id: "child-branch", branchId: "child-branch", parentBranchId: f.branch.id, forkRevisionId: a.revision.id };
    f.story.push(childBranch);
    const child = f.add(a.revision.id, a.state, "Child outcome"); child.revision.branchId = childBranch.id; child.event.branchId = childBranch.id;
    assertStoryGraph(f.records());
    const result = projectStoryBranch(f.story, childBranch.id, child.revision.id, [a.event.id, child.event.id]);
    expect(result.appliedEventIds).toEqual([a.event.id, child.event.id]); expect(result.snapshot.states[f.entities[0]!.id]).toEqual(child.state);
    expect(projectStoryBranch(f.story, childBranch.id, null, [a.event.id]).appliedEventIds).toEqual([a.event.id]);
    expect(() => projectStoryBranch(f.story, childBranch.id, child.revision.id, [other.event.id])).toThrow("story-approval-invalid");
  });

  it("does not interpret two variants of one message as successive turns", () => {
    const f = fixture(), a = f.add(null), b = f.add(a.revision.id, a.state, "Retained", a.revision.messageId);
    expect(() => projectStoryBranch(f.story, f.branch.id, b.revision.id, [])).toThrow("story-lineage-invalid");
  });

  it("does not hide a repeated site message behind a different local message ID", () => {
    const f = fixture(), a = f.add(null), b = f.add(a.revision.id, a.state);
    b.revision.nativeMessageKey = a.revision.nativeMessageKey;
    expect(() => projectStoryBranch(f.story, f.branch.id, b.revision.id, [])).toThrow("story-lineage-invalid");
  });

  it("drops assistant consequences when an earlier user message is edited", () => {
    const f = fixture(), user = f.add(null); user.revision.role = "user"; user.event.changes = [];
    const a = f.add(user.revision.id), nextUser = f.add(a.revision.id); nextUser.revision.role = "user"; nextUser.event.changes = [];
    const b = f.add(nextUser.revision.id, a.state, "Clock repaired");
    const editedUser = f.add(null, f.initial, "", user.revision.messageId); editedUser.revision.role = "user"; editedUser.event.changes = [];
    assertStoryGraph(f.records());
    expect(projectStoryBranch(f.story, f.branch.id, b.revision.id, [a.event.id, b.event.id]).snapshot.states[f.entities[0]!.id]).toEqual(b.state);
    const result = projectStoryBranch(f.story, f.branch.id, editedUser.revision.id, [a.event.id, b.event.id]);
    expect(result.snapshot).toEqual(f.baseline.snapshot); expect(result.revisionIds).toEqual([editedUser.revision.id]); expect(result.appliedEventIds).toEqual([]);
  });

  it("uses event ordinals within one source and reports conflicts without source text", () => {
    const f = fixture(), a = f.add(null), second: StoryEvent = { ...structuredClone(a.event), id: createId("event"), ordinal: 1, changes: [{ entityId: f.entities[0]!.id, before: a.state, after: { ...a.state, condition: "Clock repaired" } }] };
    f.story.unshift(second);
    const result = projectStoryBranch(f.story, f.branch.id, a.revision.id, [second.id, a.event.id]);
    expect(result.appliedEventIds).toEqual([a.event.id, second.id]);
    second.changes[0]!.before = null;
    try { projectStoryBranch(f.story, f.branch.id, a.revision.id, [second.id, a.event.id]); throw new Error("Expected a conflict"); }
    catch (error) { expect(error).toMatchObject({ message: "story-state-conflict", details: { eventId: second.id, entityId: f.entities[0]!.id, path: "changes.before" } }); expect(JSON.stringify(error)).not.toContain(a.revision.content); }
  });

  it("updates scene membership only through an accepted, conflict-checked transition", () => {
    const f = fixture(), a = f.add(null); a.event.changes = []; a.event.participantIds = f.entities.slice(0, 2).map(e => e.id);
    a.event.sceneChange = { before: { presentIds: [...f.baseline.snapshot.presentIds], partnerIds: [] }, after: { presentIds: [f.entities[0]!.id], partnerIds: [] } };
    assertStoryGraph(f.records());
    expect(projectStoryBranch(f.story, f.branch.id, a.revision.id, []).snapshot.presentIds).toEqual(f.baseline.snapshot.presentIds);
    expect(projectStoryBranch(f.story, f.branch.id, a.revision.id, [a.event.id]).snapshot.presentIds).toEqual([f.entities[0]!.id]);
    a.event.sceneChange.before.presentIds = [];
    expect(() => projectStoryBranch(f.story, f.branch.id, a.revision.id, [a.event.id])).toThrow("story-scene-conflict");
  });

  it("can add or clear a state without inventing a profile or erasing historical labels", () => {
    const f = fixture(), a = f.add(null), person = f.entities[2]!.id;
    a.event.participantIds = [person]; a.event.changes = [{ entityId: person, before: null, after: f.initial }];
    const added = projectStoryBranch(f.story, f.branch.id, a.revision.id, [a.event.id]);
    expect(added.snapshot.states[person]).toEqual(f.initial);
    const b = f.add(a.revision.id); b.event.participantIds = [person]; b.event.changes = [{ entityId: person, before: f.initial, after: null }];
    const cleared = projectStoryBranch(f.story, f.branch.id, b.revision.id, [a.event.id, b.event.id]);
    expect(cleared.snapshot.states).not.toHaveProperty(person); expect(cleared.snapshot.names).toEqual(f.baseline.snapshot.names);
  });

  it("walks a long chain iteratively and keeps more than 20 accepted events", () => {
    const f = fixture(), accepted: string[] = []; let parent: string | null = null, state = f.initial;
    for (let i = 0; i < 1200; i++) { const next = f.add(parent, state, `Step ${i}`); parent = next.revision.id; state = next.state; accepted.push(next.event.id); }
    const result = projectStoryBranch(f.story, f.branch.id, parent, accepted);
    expect(result.revisionIds).toHaveLength(1200); expect(result.appliedEventIds).toHaveLength(1200);
    expect(result.snapshot.states[f.entities[0]!.id]).toEqual(state);
  });
});
