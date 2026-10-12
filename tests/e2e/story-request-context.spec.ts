import { expect, test } from "@playwright/test";
import type { StoryBaseline, StoryBranch, StoryEvent, StoryRecord, StoryRevision } from "../../src/core/story-records";

for (const locale of ["ru", "en"] as const) test(`request character prompt excludes the canceled future in ${locale}`, async ({ page }) => {
  await page.goto("/tests/fixtures/deepseek.html");
  const result = await page.evaluate(async locale => {
    const fixtureUrl = "/tests/fixtures/story-worlds.ts", recordsUrl = "/src/core/story-records.ts", replayUrl = "/src/core/story-projection.ts", contextUrl = "/src/core/story-request-context.ts", characterUrl = "/src/core/characters.ts";
    const { storyWorld } = await import(fixtureUrl), { assertStoryGraph, storyRow } = await import(recordsUrl), { projectStoryBranch } = await import(replayUrl),
      { projectStoryRequestContext, storyRequestCharacterScene } = await import(contextUrl), { characterInstruction } = await import(characterUrl);
    const f = storyWorld(locale), hero = f.entities[0].id, initial = f.binding.characterScenes[f.world.id].states[hero];
    const first = { ...initial, condition: locale === "ru" ? "Ключ передан мастеру" : "Key delivered to the maker" }, canceled = { ...first, condition: locale === "ru" ? "Часы уже починены" : "Clock already repaired" };
    const scope = { format: "deeprole-story" as const, contractVersion: 1 as const, worldId: f.world.id, playthroughId: "run", branchId: "branch", createdAt: 30, updatedAt: 30 };
    const baseline: StoryBaseline = { ...scope, type: "baseline", id: "baseline", historyBeforeBaseline: "unknown", legacyEntryScope: "unclassified",
      origin: { worldId: f.world.id, bindingId: f.binding.id, chatId: f.binding.chatId, sceneRevision: "legacy-scene-a" }, snapshot: { states: structuredClone(f.binding.characterScenes[f.world.id].states), presentIds: [hero, f.entities[1].id], partnerIds: [], names: { [hero]: f.entities[0].name } } };
    const branch: StoryBranch = { ...scope, type: "branch", id: "branch", baselineId: "baseline", parentBranchId: null, forkRevisionId: null, headRevisionId: "a2", selectionVersion: 1, projectionId: "projection" };
    const sources: StoryRevision[] = ["u1", "a1", "u2", "a2"].map((id, index, ids) => ({ ...scope, type: "revision", id, messageId: "message-" + id, nativeMessageKey: JSON.stringify(["message", String(index + 1)]),
      requestId: null, parentRevisionId: ids[index - 1] ?? null, role: index % 2 ? "assistant" : "user", completion: "complete", content: "The clock story continues." }));
    const events: StoryEvent[] = [first, canceled].map((after, index) => ({ ...scope, type: "event", id: "event-" + index, revisionId: index ? "a2" : "a1", ordinal: 0, disposition: "candidate", label: "Synthetic clock event", quote: "The clock story continues.", participantIds: [hero], changes: [{ entityId: hero, before: index ? first : initial, after }] }));
    const records: StoryRecord[] = [baseline, branch, ...sources, ...events];
    records.push({ ...scope, type: "projection", id: "projection", algorithmVersion: 1, baselineId: "baseline", selectionVersion: 1, ...projectStoryBranch(records, branch.id, "a2", events.map(event => event.id)),
      bindingId: f.binding.id, chatId: f.binding.chatId, bindingRevision: "latest-scene", previousHeadRevisionId: null });
    records.push({ ...scope, type: "request", id: "request_fixture_parent", purpose: "assistant-retry", bindingId: f.binding.id, chatId: f.binding.chatId, nativeParentKey: sources[2]!.nativeMessageKey,
      parentRevisionId: "u2", selectedHeadRevisionId: "a2", selectionVersion: 1, sceneRevision: "latest-scene", delivery: { status: "prepared" }, context: { algorithmVersion: 1, acceptedEventIds: ["event-0"] } });
    assertStoryGraph([...f.records, ...records.map(storyRow)]);
    const before = JSON.stringify(records), context = projectStoryRequestContext(records, branch.id, "request_fixture_parent"), scene = storyRequestCharacterScene(context);
    const prompt = characterInstruction(f.world.id, f.binding.chatId, f.entities, scene, ["neutral"], [], f.entities[0].name, context.requestId);
    const value = { prompt, first: first.condition, canceled: canceled.condition, state: scene.states[hero].condition, revisions: context.revisionIds, events: context.appliedEventIds, unchanged: before === JSON.stringify(records) };
    scene.states[hero].condition = "Mutation after prompt";
    return { ...value, detached: context.snapshot.states[hero].condition === first.condition };
  }, locale);
  expect(result.prompt).toContain(result.first); expect(result.prompt).not.toContain(result.canceled); expect(result.state).toBe(result.first);
  expect(result.revisions).toEqual(["u1", "a1", "u2"]); expect(result.events).toEqual(["event-0"]); expect(result.unchanged).toBe(true); expect(result.detached).toBe(true);
});
