import { createId } from "../core/id";
import { characterInChat } from "../core/characters";
import { captureStoryBaselineEffects } from "../core/story-baseline-effects";
import { assertStoryGraph, canonicalStoryValue, storyRow, type StoryBaseline, type StoryBranch, type StoryEvent, type StoryProjection, type StoryRecord, type StoryRequest, type StoryRevision, type StorySnapshot, type StoryStateChange } from "../core/story-records";
import type { ChatBinding, DataRecord, SceneEntity } from "../core/types";
import { repository, type DeepRoleRepository } from "./repository";

const storyRecords = (all: DataRecord[]) => all.filter(row => row.kind === "story").map(row => row.data as StoryRecord);
const scope = (branch: StoryBranch) => ({ format: "deeprole-story" as const, contractVersion: 1 as const, worldId: branch.worldId, playthroughId: branch.playthroughId, branchId: branch.id });

/** On-demand checkpoint only. Never scans old messages or changes current lore. */
export async function ensureLegacyStory(input: { worldId: string; bindingId: string }, repo: DeepRoleRepository = repository): Promise<StoryBranch> {
  input = structuredClone(input);
  return repo.updateRecords(all => planLegacyStory(all, input), undefined, ["story", "world", "binding", "entity"]);
}

/** Shared atomic planner. A checkpoint caller must not persist an unanchored half first. */
export function planLegacyStory(all: DataRecord[], input: { worldId: string; bindingId: string }) {
    assertStoryGraph(all);
    const existing = storyRecords(all).find(row => row.type === "baseline" && row.worldId === input.worldId && row.origin.bindingId === input.bindingId) as StoryBaseline | undefined;
    if (existing) return { records: [], removed: [], result: structuredClone(storyRecords(all).find(row => row.id === existing.branchId) as StoryBranch) };
    const binding = all.find(row => row.kind === "binding" && row.id === input.bindingId)?.data as ChatBinding | undefined;
    if (!all.some(row => row.kind === "world" && row.id === input.worldId) || !binding || binding.worldId !== input.worldId && !binding.characterScenes?.[input.worldId]) throw new Error("story-scope-invalid");
    const scene = binding.characterScenes?.[input.worldId];
    const branchId = createId("branch"), now = Date.now();
    const branch: StoryBranch = { format: "deeprole-story", contractVersion: 1, type: "branch", id: branchId, worldId: input.worldId, playthroughId: createId("playthrough"), branchId,
      baselineId: createId("baseline"), parentBranchId: null, forkRevisionId: null, headRevisionId: null, selectionVersion: 0, createdAt: now, updatedAt: now };
    const baseline: StoryBaseline = { ...scope(branch), type: "baseline", id: branch.baselineId, historyBeforeBaseline: "unknown", legacyEntryScope: "unclassified",
      origin: { bindingId: binding.id, chatId: binding.chatId, worldId: input.worldId, sceneRevision: scene?.revision ?? null },
      snapshot: legacyStorySnapshot(all, input.worldId, binding), legacyEffects: captureStoryBaselineEffects(binding, input.worldId), createdAt: now, updatedAt: now };
    const changes = [storyRow(baseline), storyRow(branch)]; assertStoryGraph([...all, ...changes]);
    return { records: changes, removed: [], result: structuredClone(branch) };
}

export function legacyStorySnapshot(all: DataRecord[], worldId: string, binding: ChatBinding): StorySnapshot {
  const scene = binding.characterScenes?.[worldId], states = structuredClone(scene?.states ?? {}), presentIds = [...scene?.presentIds ?? []];
  const participants = new Set([...Object.keys(states), ...presentIds]);
  const people = all.filter(row => row.kind === "entity" && (row.data as SceneEntity).worldId === worldId && (row.data as SceneEntity).kind === "character" && characterInChat(row.data as SceneEntity, binding.chatId)).map(row => row.data as SceneEntity);
  return { states, presentIds, partnerIds: [...scene?.partnerIds ?? (scene?.partnerId ? [scene.partnerId] : [])], names: Object.fromEntries(people.filter(person => participants.has(person.id)).map(person => [person.id, person.name])) };
}

export interface StoryObservation {
  /** Locally assigned before delivery; keep the same ID for a transport retry. */
  id: string;
  messageId: string;
  nativeMessageKey: string;
  requestId: string | null;
  parentRevisionId: string | null;
  role: StoryRevision["role"];
  completion: StoryRevision["completion"];
  content: string;
  requestProof?: StoryRevision["requestProof"];
  events: { id: string; label: string; quote: string; participantIds: string[]; changes: StoryStateChange[]; sceneChange?: StoryEvent["sceneChange"] }[];
}

/** Source plus candidates form one atomic group. This API does NOT apply effects. */
export async function recordStoryObservation(branchId: string, input: StoryObservation, repo: DeepRoleRepository = repository): Promise<"recorded" | "already-recorded"> {
  input = structuredClone(input);
  return repo.updateRecords(all => planStoryObservation(all, branchId, input), undefined, ["story", "world", "entity"]);
}

/** Internal transaction planner shared by the stable native observer. */
export function planStoryObservation(all: DataRecord[], branchId: string, input: StoryObservation) {
    assertStoryGraph(all);
    const stored = storyRecords(all), branch = stored.find(row => row.type === "branch" && row.id === branchId) as StoryBranch | undefined;
    if (!branch || branch.worldId === null) throw new Error("story-scope-invalid");
    const now = Date.now();
    const revision: StoryRevision = { ...scope(branch), type: "revision", id: input.id, messageId: input.messageId, nativeMessageKey: input.nativeMessageKey, requestId: input.requestId, parentRevisionId: input.parentRevisionId, role: input.role, completion: input.completion, content: input.content, ...(input.requestProof ? { requestProof: structuredClone(input.requestProof) } : {}), createdAt: now, updatedAt: now };
    const events: StoryEvent[] = input.events.map((event, ordinal) => ({ ...scope(branch), type: "event", id: event.id, revisionId: revision.id, ordinal, disposition: "candidate", label: event.label, quote: event.quote, participantIds: structuredClone(event.participantIds), changes: structuredClone(event.changes), ...(event.sceneChange ? { sceneChange: structuredClone(event.sceneChange) } : {}), createdAt: now, updatedAt: now }));
    const changes = [storyRow(revision), ...events.map(storyRow)], previous = stored.find(row => row.id === input.id);
    if (previous) {
      const previousEvents = stored.filter(row => row.type === "event" && row.revisionId === input.id);
      const content = (rows: StoryRecord[]) => rows.map(({ createdAt: _created, updatedAt: _updated, ...data }) => data).sort((a, b) => a.id.localeCompare(b.id));
      if (canonicalStoryValue(content([previous, ...previousEvents])) !== canonicalStoryValue(content([revision, ...events]))) throw new Error("story-revision-conflict");
      return { records: [], removed: [], result: "already-recorded" as const };
    }
    const existingIds = new Set(stored.map(row => row.id));
    if (changes.some(row => existingIds.has(row.id))) throw new Error("story-id-conflict");
    const people = new Set(all.filter(row => row.kind === "entity" && (row.data as SceneEntity).kind === "character" && (row.data as SceneEntity).worldId === branch.worldId).map(row => row.id));
    if (events.some(event => event.participantIds.some(id => !people.has(id)))) throw new Error("story-participant-invalid");
    assertStoryGraph([...all, ...changes]);
    return { records: changes, removed: [], result: "recorded" as const };
}

/** Unselected observations remain separate from the selected scene and memory. */
export async function readStoryTimeline(branchId: string, repo: DeepRoleRepository = repository) {
  return repo.updateRecords(all => {
    assertStoryGraph(all);
    const stored = storyRecords(all), branch = stored.find(row => row.type === "branch" && row.id === branchId) as StoryBranch | undefined;
    if (!branch) throw new Error("story-scope-invalid");
    const baseline = stored.find(row => row.id === branch.baselineId) as StoryBaseline;
    const revisions = stored.filter(row => row.type === "revision" && row.branchId === branchId) as StoryRevision[];
    const events = stored.filter(row => row.type === "event" && row.branchId === branchId) as StoryEvent[];
    const requests = stored.filter(row => row.type === "request" && row.branchId === branchId) as StoryRequest[];
    const projection = stored.find(row => row.type === "projection" && row.id === branch.projectionId) as StoryProjection | undefined;
    return { records: [], removed: [], result: structuredClone({ branch, baseline, revisions, events, requests, projection: projection ?? null }) };
  }, undefined, ["story", "world"]);
}
