import { createId } from "../core/id";
import { storyFactHint } from "../core/story-fact-context";
import type { DataRecord, Locale, SceneEntity, WorldProfile } from "../core/types";
import { storyRow, type StoryRevision } from "../core/story-records";
import { storyReplyProse, compactStoryFacts, cleanStoryFact } from "../core/story-update";
import { automationMode, normalizedFact, type StoryAutomationCapture } from "../core/story-automation";
import { assertWorldGameWriter } from "../core/world-game";
import { MEMORY_BATCH_BYTES, MEMORY_BATCH_TURNS, memoryBatchPrompt, parseMemoryBatch, validMemoryBatchInput, type MemoryBatchInput, type MemoryBatchPart, type MemoryBatchPolicy, type MemoryBatchStatus } from "../core/story-memory-batch";
import { repository, type DeepRoleRepository } from "./repository";
import { scopedDiscovery, discoveryGuard } from "./story-character-discovery";
import { planStoryAccompaniment } from "./story-automation";
import { planStorySelection } from "./story-selection";
import { isGameTimeFact } from "../core/story-time";
import { createEpisodeReader } from "../core/story-episodes";

export interface MemoryBatchBrief {
  input: MemoryBatchInput; requestId: string; prompt: string; parts: MemoryBatchPart[];
  guard: ReturnType<typeof scopedDiscovery>["guard"]; policy: string; activation: string;
  capture: StoryAutomationCapture;
  source: { worldId: string; chatId: string; chatUrl: string; bookId: string | null };
}
function scope(all: DataRecord[], input: MemoryBatchInput) {
  if (!validMemoryBatchInput(input)) throw Error("invalid-brief");
  const f = scopedDiscovery(all, input, true, true);
  assertWorldGameWriter(all, f.binding, input.worldId);
  const world = all.find(r => r.kind === "world" && r.id === input.worldId)?.data as WorldProfile;
  if (!world?.sharedGame?.managed || !world.storyAutomation) throw Error("story-game-inactive");
  const selected = new Set([...f.baseline.memoryBatchSeeds ?? [], ...f.projection.revisionIds]);
  const byId = new Map(f.stored.filter((r): r is StoryRevision => r.type === "revision").map(r => [r.id, r]));
  const sources: StoryRevision[] = [];
  // A turn needs BOTH completed selected sides. Service/OOC/partial alternatives do not count.
  for (const id of selected) {
    const r = byId.get(id), parent = r && byId.get(r.parentRevisionId ?? "");
    if (r?.role !== "assistant" || r.completion !== "complete" || r.storyPurpose === "out-of-character" || parent?.role !== "user" || parent.completion !== "complete" || parent.storyPurpose === "out-of-character" || !selected.has(parent.id)) continue;
    for (const value of [parent, r]) if (storyReplyProse(value.content).trim() && !sources.some(s => s.id === value.id)) sources.push(value);
  }
  // A receipt belongs to its selected analysis anchor, not just the quoted text.
  // If an alternative removes that anchor, unchanged earlier sources become eligible again.
  const offsetOf = (r: StoryRevision) => r.memoryBatch && selected.has(r.memoryBatch.request.anchor) ? r.memoryBatch.offset : 0;
  const pending = sources.filter(r => offsetOf(r) < storyReplyProse(r.content).length);
  return { ...f, world, sources, pending, offsetOf };
}
function status(f: ReturnType<typeof scope>): MemoryBatchStatus {
  const policy = f.world.storyMemoryBatch, mode = policy?.mode ?? "off";
  const pendingTurns = f.sources.filter(r => r.role === "assistant" && (f.pending.some(p => p.id === r.id) || f.pending.some(p => p.id === r.parentRevisionId))).length;
  const pendingCharacters = f.pending.reduce((n, r) => n + storyReplyProse(r.content).length - f.offsetOf(r), 0);
  const unfinished = f.pending.map(r => r.memoryBatch?.request).filter(r => r?.policy === policy?.revision);
  const running = unfinished.some(r => r?.status === "requested"), failed = unfinished.some(r => r?.status === "failed" || r?.status === "cancelled");
  const partial = f.pending.some(r => f.offsetOf(r) > 0);
  const transition = pendingTurns >= 4 && f.stored.some(e => e.type === "event" && !!e.sceneChange && f.pending.some(p => p.id === e.revisionId));
  const due = pendingTurns >= MEMORY_BATCH_TURNS || pendingCharacters >= MEMORY_BATCH_BYTES || partial || transition;
  const inactive = !f.selected.some(r => r.id === f.guard.headRevisionId && r.role === "assistant") || Object.hasOwn(f.branch, "pausedAtRevisionId") || automationMode(f.world) === "off";
  return { mode, pendingTurns, pendingCharacters, processedSources: f.sources.length - f.pending.length, due: mode === "automatic" && !inactive && !running && !failed && due,
    reason: mode === "off" ? "disabled" : mode === "paused" ? "paused" : inactive ? "inactive" : running ? "running" : failed ? "failed" : due ? "ready" : "waiting" };
}
export async function readMemoryBatch(input: MemoryBatchInput, repo: DeepRoleRepository = repository) {
  return repo.updateRecords(all => ({ records: [], removed: [], result: status(scope(all, input)) }));
}
/** Lost background jobs are durable errors, never permissions to resend. */
export async function reconcileMemoryBatch(input: MemoryBatchInput, live: Set<string>, repo: DeepRoleRepository = repository) {
  return repo.updateRecords(all => {
    const f = scope(all, input);
    return { records: f.sources.flatMap(r => r.memoryBatch?.request.status === "requested" && !live.has(r.memoryBatch.request.id) ? [storyRow({ ...r, memoryBatch: { ...r.memoryBatch, request: { ...r.memoryBatch.request, status: "failed" as const } }, updatedAt: Date.now() })] : []), removed: [], result: undefined };
  });
}
export async function changeMemoryBatch(input: MemoryBatchInput, mode: MemoryBatchPolicy["mode"], repo: DeepRoleRepository = repository, current?: () => Promise<void>) {
  if (!["automatic", "paused", "off"].includes(mode)) throw Error("invalid-brief");
  return repo.updateRecords(all => {
    const f = scope(all, input), world = { ...f.world, storyMemoryBatch: { mode, revision: createId("memory-policy") }, updatedAt: Date.now() };
    return { records: [{ kind: "world" as const, id: world.id, data: world }], removed: [], result: undefined };
  }, current);
}
export async function prepareMemoryBatch(input: MemoryBatchInput, requestId: string, locale: Locale, repo: DeepRoleRepository = repository): Promise<MemoryBatchBrief> {
  input = structuredClone(input);
  if (!/^field_[0-9a-f-]{36}$/u.test(requestId)) throw Error("invalid-brief");
  return repo.updateRecords(all => {
    const f = scope(all, input), view = status(f), policy = f.world.storyMemoryBatch;
    if (!policy || policy.mode !== "automatic" || automationMode(f.world) === "off" || Object.hasOwn(f.branch, "pausedAtRevisionId") || !f.selected.some(r => r.id === f.guard.headRevisionId && r.role === "assistant")) throw Error("scene-changed");
    if (view.reason === "running" || view.reason === "failed" || !input.force && !view.due) throw Error("busy");
    const parts: MemoryBatchPart[] = [], pending = new Set(f.pending.map(r => r.id));
    const turns = f.sources.filter(r => r.role === "assistant" && (pending.has(r.id) || pending.has(r.parentRevisionId ?? ""))).slice(0, MEMORY_BATCH_TURNS);
    const wanted = new Set(turns.flatMap(r => [r.parentRevisionId!, r.id]));
    for (const r of f.pending.filter(r => wanted.has(r.id))) {
      if (parts.length >= 24) break;
      const prose = storyReplyProse(r.content), start = f.offsetOf(r), from = Math.max(0, start - 600);
      let low = start + 1, high = prose.length, end = start;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2), candidate = { id: `s${parts.length + 1}`, revisionId: r.id, role: r.role, start, end: mid, text: prose.slice(from, mid) };
        if (JSON.stringify([...parts, candidate]).length <= MEMORY_BATCH_BYTES) { end = mid; low = mid + 1; } else high = mid - 1;
      }
      if (end <= start) break;
      if (end < prose.length && /[\uD800-\uDBFF]/u.test(prose[end - 1]!)) end--;
      if (end <= start) break;
      parts.push({ id: `s${parts.length + 1}`, revisionId: r.id, role: r.role, start, end, text: prose.slice(from, end) });
      if (end < prose.length) break;
    }
    if (!parts.length) throw Error("facts-not-found");
    const capture: StoryAutomationCapture = { mode: automationMode(f.world) === "automatic" ? "automatic" : "review", revision: f.world.storyAutomation!.revision, profileVersions: {}, profileLocks: {} };
    for (const r of all) if (r.kind === "entity" && (r.data as SceneEntity).worldId === input.worldId) {
      const p = r.data as SceneEntity; capture.profileVersions[p.id] = { ...p.profileFieldRevisions }; capture.profileLocks[p.id] = [...p.characterSheet?.protectedProfileFields ?? []];
    }
    const roster: unknown[] = []; let rosterSize = 0;
    const text = parts.map(p => p.text).join("\n").toLocaleLowerCase();
    for (const p of f.people) if ([p.name, ...p.aliases].some(n => text.includes(n.toLocaleLowerCase()))) {
      const item = { id: p.id, name: p.name, aliases: p.aliases, profile: p.characterSheet ? Object.fromEntries(["appearance", "personality", "goals", "background"].map(k => [k, p.characterSheet![k as "appearance"].slice(0, 240)])) : {} };
      const size = JSON.stringify(item).length; if (rosterSize + size > 6000) continue; roster.push(item); rosterSize += size;
    }
    const facts = [...f.world.sharedGame!.facts.filter(f => f.task?.status === "open").slice(-8), ...f.world.sharedGame!.facts.filter(f => f.task?.status !== "open").slice(-12)].filter((_, i, a) => JSON.stringify(a.slice(0, i + 1).map(f => storyFactHint(f))).length < 5000);
    const prompt = memoryBatchPrompt(requestId, parts, roster, facts, locale), now = Date.now();
    if (prompt.length > 26000) throw Error("text-too-long");
    const records = parts.map(p => storyRow({ ...f.sources.find(r => r.id === p.revisionId)!, memoryBatch: { offset: p.start, request: { id: requestId, anchor: f.guard.headRevisionId!, policy: policy.revision, end: p.end, status: "requested" as const, at: now } }, updatedAt: now }));
    return { records, removed: [], result: { input, requestId, prompt, parts, guard: f.guard, policy: policy.revision, activation: f.world.sharedGame!.activationId, capture,
      source: { worldId: input.worldId, chatId: input.chatId, chatUrl: f.binding.chatUrl, bookId: f.binding.bookId } } };
  });
}
function check(f: ReturnType<typeof scope>, b: MemoryBatchBrief) {
  discoveryGuard(f.guard, b.guard);
  if (f.world.storyMemoryBatch?.mode !== "automatic" || f.world.storyMemoryBatch.revision !== b.policy || f.world.storyAutomation?.revision !== b.capture.revision || automationMode(f.world) === "off" || f.world.sharedGame!.activationId !== b.activation || Object.hasOwn(f.branch, "pausedAtRevisionId")) throw Error("scene-changed");
  for (const p of b.parts) {
    const r = f.sources.find(r => r.id === p.revisionId), request = r?.memoryBatch?.request;
    if (!r || request?.id !== b.requestId || request.policy !== b.policy || request.status !== "requested" || r.memoryBatch!.offset !== p.start || request.end !== p.end || storyReplyProse(r.content).slice(Math.max(0, p.start - 600), p.end) !== p.text) throw Error("scene-changed");
  }
}
export async function memoryBatchCurrent(b: MemoryBatchBrief, repo: DeepRoleRepository = repository) {
  try { return await repo.updateRecords(all => { check(scope(all, b.input), b); return { records: [], removed: [], result: true }; }); } catch { return false; }
}
export async function finishMemoryBatch(input: MemoryBatchInput, requestId: string, cancelled: boolean, repo: DeepRoleRepository = repository) {
  await repo.updateRecords(all => ({ records: all.flatMap(row => {
    const r = row.data as StoryRevision;
    return row.kind === "story" && r.type === "revision" && r.worldId === input.worldId && r.memoryBatch?.request.id === requestId && r.memoryBatch.request.status === "requested" ? [storyRow({ ...r, memoryBatch: { ...r.memoryBatch, request: { ...r.memoryBatch.request, status: cancelled ? "cancelled" : "failed" } }, updatedAt: Date.now() })] : [];
  }), removed: [], result: undefined }), undefined, ["story"]);
}
export async function applyMemoryBatch(b: MemoryBatchBrief, raw: string, repo: DeepRoleRepository = repository, current?: () => Promise<void>) {
  const parsed = parseMemoryBatch(raw, b.requestId, b.parts);
  return repo.updateRecords(all => {
    const f = scope(all, b.input); check(f, b);
    const head = f.stored.find((r): r is StoryRevision => r.type === "revision" && r.id === f.guard.headRevisionId)!;
    const game = f.world.sharedGame!, clock = game.facts.find(isGameTimeFact);
    const clockPosition = clock ? createEpisodeReader(game.factRoleSeeds, game.episodeSources).position(clock) : 0;
    const sourcePositions = new Map((game.episodeSources ?? []).map((id, i) => [id, i + 1]));
    let changed = [...all]; const records: DataRecord[] = [], approved = new Set(f.projection.acceptedEventIds);
    for (const result of parsed) {
      const source = f.sources.find(r => r.id === result.part.revisionId)!;
      // Older state descriptions cannot replace a later accepted current value.
      const facts = result.facts.map(fact => {
        // Equal elapsed wording at an older source is still an older clock.
        // Do not turn delayed extraction into a fresh time transition.
        if (isGameTimeFact(fact)) {
          const at = sourcePositions.get(source.id) ?? 0;
          if (clock && (!clockPosition || !at || clockPosition > at)) return { ...fact, risk: "uncertain" };
          if (clock && clockPosition === at && clock.text === fact.text) return { ...fact, risk: "uncertain" };
        }
        const later = compactStoryFacts(f.world.sharedGame!.facts).find(old => old.claim && fact.claim && normalizedFact(old.claim.key) === normalizedFact(fact.claim.key) && (normalizedFact(old.claim.value) !== normalizedFact(fact.claim.value) || old.claim.status !== fact.claim.status));
        const laterTask = fact.task && f.world.sharedGame!.facts.some(old => old.task?.key === fact.task!.key && old.task.status !== fact.task!.status);
        return source.role === "user" && fact.kind === "event" || (later && fact.claim?.scope === "state" || laterTask) && source.id !== head.id ? { ...fact, risk: "uncertain" } : fact;
      });
      const additions = planStoryAccompaniment(changed, f.world, f.baseline, f.branch, head, approved, undefined, facts.map(cleanStoryFact), { facts, people: result.people }, b.input.chatId, { source, capture: b.capture });
      records.push(...additions); changed.push(...additions);
      const revision = { ...source, memoryBatch: { offset: result.part.end, request: { ...source.memoryBatch!.request, status: "done" as const } }, updatedAt: Date.now() };
      records.push(storyRow(revision)); changed = changed.map(r => r.kind === "story" && r.id === source.id ? storyRow(revision) : r);
    }
    const selection = planStorySelection(changed, f.branch.id, { headRevisionId: f.branch.headRevisionId, expectedHeadRevisionId: f.branch.headRevisionId, expectedSelectionVersion: f.branch.selectionVersion, acceptedEventIds: [...approved] });
    return { records: [...records, ...selection.records], removed: selection.removed, result: undefined };
  }, current);
}
