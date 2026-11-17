import { createId } from "../core/id";
import { memoryWorld } from "../core/scene";
import { boundStory, validStoryContinuation } from "../core/story-continuation";
import { savedMemoryBinding, type SavedMemoryPreview, type SavedMemoryRequest } from "../core/saved-memory-continuation";
import { storyReplyProse } from "../core/story-update";
import type { StoryBaseline, StoryBranch, StoryRecord, StoryRevision } from "../core/story-records";
import type { ChatBinding, HandoffSnapshot, MemoryBook, MemoryOverrides, SceneState, StoryContinuation, WorldProfile } from "../core/types";
import { repository, type DeepRoleRepository } from "./repository";
import { withHandoffCharacters } from "../core/relationship-handoff";
import { captureWorldGame, planWorldGameActivation } from "./world-game";
import { assertWorldGameWriter } from "../core/world-game";
import { acceptedContinuationHistory } from "../core/continuation-recovery";
import { planRecoveredContinuationTurn } from "./continuation-opening";
import { sameStoryValue } from "../core/story-value";

export interface ContinuationCapture {
  chatId: string;
  chatUrl: string;
  scene: SceneState;
  story: StoryContinuation;
  recap?: { title: string; summary: string };
  overrides: MemoryOverrides;
}

/** Preview and capture use only the active game's durable local records. */
export async function savedMemoryContinuation(input: SavedMemoryRequest, expected?: string, repo: DeepRoleRepository = repository): Promise<{ preview: SavedMemoryPreview; snapshot?: HandoffSnapshot }> {
  return repo.updateRecords<{ preview: SavedMemoryPreview; snapshot?: HandoffSnapshot }>(records => {
    const world = records.find(r => r.kind === "world" && r.id === input.worldId)?.data as WorldProfile | undefined;
    if (!world) throw Error("handoff-scope");
    const bindings = records.filter(r => r.kind === "binding").map(r => r.data as ChatBinding);
    const binding = "fromHome" in input ? savedMemoryBinding(world, bindings) : bindings.find(item => item.chatId === input.chatId);
    if (!binding || binding.worldId !== world.id) throw Error("handoff-scope");
    assertWorldGameWriter(records, binding, world.id);
    const game = world.sharedGame;
    const stories = new Map(records.filter(r => r.kind === "story").map(r => [r.id, r.data as StoryRecord]));
    const baseline = [...stories.values()].find((r): r is StoryBaseline => r.type === "baseline" && r.worldId === world.id && r.origin.bindingId === binding.id && (!game || r.gameId === undefined || r.gameId === game.id));
    const branch = baseline && stories.get(baseline.branchId) as StoryBranch | undefined;
    const projection = branch?.type === "branch" && branch.gameManaged && branch.projectionId ? stories.get(branch.projectionId) : undefined;
    const savedReply = !game?.restartPending && projection?.type === "projection" ? projection.revisionIds.map(id => stories.get(id)).findLast((r): r is StoryRevision => r?.type === "revision" && r.role === "assistant" && r.completion === "complete" && r.storyPurpose !== "out-of-character" && !!storyReplyProse(r.content).trim()) : undefined;
    const inherited = !game?.restartPending ? game?.recentStory?.turns.findLast(turn => turn.role === "assistant")?.text : undefined;
    const text = (savedReply ? storyReplyProse(savedReply.content) : inherited ?? "").trim();
    const excerpt = text.length > 1600 ? "…" + text.slice(-1600).replace(/^[\uDC00-\uDFFF]/u, "").trimStart() : text;
    const preview = { version: JSON.stringify([binding.id, binding.updatedAt, game?.revision, savedReply?.id, savedReply?.updatedAt]), scene: excerpt || null, savedAt: savedReply?.createdAt ?? null };
    if (expected === undefined) return { records: [], removed: [], result: { preview } };
    if (expected !== preview.version) throw Error("handoff-stale");
    const books = records.filter(r => r.kind === "book").map(r => r.data as MemoryBook);
    const scene = game?.scene ?? binding.characterScenes?.[world.id];
    const snapshot: HandoffSnapshot = {
      id: createId("snapshot"), savedMemory: true, title: world.name, worldId: world.id,
      sourceChatId: binding.chatId, sourceChatUrl: "fromHome" in input ? binding.chatUrl : input.chatUrl, createdAt: Date.now(),
      bookId: books.some(b => b.id === binding.bookId && b.active && b.worldId === world.id) ? binding.bookId : null,
      focusIds: [...binding.focusIds ?? []], memoryOverrides: structuredClone(game?.memoryOverrides ?? binding.memoryOverrides ?? { includedIds: [], excludedIds: [] }),
      summary: excerpt || "No saved scene is available. Use the saved world state and the user's new message. Do not invent missing events.",
      ...(!excerpt ? { continuation: boundStory([], "history", true) } : {}),
      ...(game ? { sharedGameRevision: game.revision } : {}),
      ...(scene ? { characterScene: structuredClone(scene) } : {}),
    };
    return { records: [{ kind: "snapshot", id: snapshot.id, data: snapshot }], removed: [], result: { preview, snapshot } };
  });
}
/** Latest structured progress is captured under the same lock as character edits.
 * Saving a checkpoint never mutates lore, images or the source branch.
 */
export async function captureContinuation(input: ContinuationCapture, repo: DeepRoleRepository = repository): Promise<HandoffSnapshot> {
  if (!input.chatId || !validStoryContinuation(input.story) || (!input.story.turns.length && !input.recap)) throw new Error("handoff-invalid");
  if (input.recap && (!input.recap.title.trim() || input.recap.title.length > 240 || !input.recap.summary.trim() || input.recap.summary.length > 30000)) throw new Error("handoff-invalid");
  return repo.updateRecords(records => {
    const bindings = records.filter(r => r.kind === "binding").map(r => r.data as ChatBinding);
    const books = records.filter(r => r.kind === "book").map(r => r.data as MemoryBook);
    const snapshots = records.filter(r => r.kind === "snapshot").map(r => r.data as HandoffSnapshot);
    const binding = bindings.find(b => b.chatId === input.chatId);
    const worldId = input.scene.worldId;
    const world = records.find(r => r.kind === "world" && r.id === worldId)?.data as WorldProfile | undefined;
    if (binding && worldId) assertWorldGameWriter(records, binding, worldId);
    if (worldId && !world || binding && ((binding.worldId ?? null) !== worldId || binding.bookId !== input.scene.bookId || JSON.stringify(binding.focusIds ?? []) !== JSON.stringify(input.scene.focusIds))) throw new Error("handoff-scope");
    if (input.scene.bookId && !books.some(b => b.id === input.scene.bookId && (b.worldId ?? null) === worldId && b.active)) throw new Error("handoff-scope");
    const inherited = snapshots.find(s => s.id === binding?.continuationSnapshotId && memoryWorld(s, books) === worldId);
    const recap = snapshots.filter(s => s.sourceChatId === input.chatId && memoryWorld(s, books) === worldId && !s.continuation).sort((a, b) => b.createdAt - a.createdAt)[0] ?? inherited;
    const earlier = inherited?.continuation;
    const story = boundStory([...(earlier?.turns ?? []), ...input.story.turns], input.story.source,
      input.story.partial || !!earlier?.partial, input.story.omittedTurns + (earlier?.omittedTurns ?? 0));
    const snapshot: HandoffSnapshot = {
      id: createId("snapshot"), title: input.recap?.title ?? world?.name ?? recap?.title ?? "Story continuation",
      summary: input.recap?.summary ?? recap?.summary ?? "Continue the established story using the approved world memory and previous conversation below. Do not invent missing past events.",
      sourceChatId: input.chatId, sourceChatUrl: input.chatUrl, worldId,
      bookId: input.scene.bookId, focusIds: [...input.scene.focusIds], createdAt: Date.now(),
      ...(world?.sharedGame ? { sharedGameRevision: world.sharedGame.revision } : {}),
      ...(!input.recap ? { continuation: story } : {}), memoryOverrides: structuredClone(binding?.memoryOverrides ?? input.overrides),
      ...(worldId && binding?.characterScenes?.[worldId] ? { characterScene: structuredClone(binding.characterScenes[worldId]) } : {}),
    };
    return { records: [{ kind: "snapshot", id: snapshot.id, data: snapshot }], removed: [], result: snapshot };
  });
}

/** One library transaction: target progress and the checkpoint's receipt. */
export async function completeContinuation(expected: HandoffSnapshot, targetChatId: string, repo: DeepRoleRepository = repository, opening?: { draft: import("../core/continuation-flow").ContinuationDraft; history: import("../core/story-game").StoryGameSnapshot; settings: import("../core/types").DeepRoleSettings }, stillCurrent?: () => Promise<void>, overrides?: import("../core/types").MemoryOverrides): Promise<void> {
  if (!/^[\w-]{1,120}$/u.test(targetChatId)) throw new Error("handoff-invalid");
  if (opening) {
    opening = structuredClone(opening);
    if (!expected.savedMemory || opening.draft.snapshotId !== expected.id || opening.draft.targetChatId !== targetChatId || !await acceptedContinuationHistory(opening.history, opening.draft)) throw Error("handoff-opening-conflict");
  }
  await repo.updateRecords(records => {
    const snapshot = records.find(r => r.kind === "snapshot" && r.id === expected.id)?.data as HandoffSnapshot | undefined;
    if (!snapshot || snapshot.targetChatId && snapshot.targetChatId !== targetChatId || JSON.stringify({ ...snapshot, appliedAt: undefined, targetChatId: undefined }) !== JSON.stringify({ ...expected, appliedAt: undefined, targetChatId: undefined })) throw new Error("handoff-conflict");
    const books = records.filter(r => r.kind === "book").map(r => r.data as MemoryBook);
    const worldId = memoryWorld(snapshot, books);
    if (worldId && !records.some(r => r.kind === "world" && r.id === worldId)) throw new Error("handoff-scope");
    if (snapshot.bookId && !books.some(b => b.id === snapshot.bookId && b.active && (b.worldId ?? null) === worldId)) throw new Error("handoff-scope");
    const existing = records.find(r => r.kind === "binding" && (r.data as ChatBinding).chatId === targetChatId)?.data as ChatBinding | undefined;
    if (existing && (existing.worldId ?? null) !== worldId) throw new Error("handoff-scope");
    if (snapshot.appliedAt !== undefined && snapshot.targetChatId === targetChatId) return { records: [], removed: [], result: undefined };
    if (snapshot.savedMemory && (!worldId || existing || targetChatId === snapshot.sourceChatId)) throw Error("handoff-conflict");
    const binding = targetChatId === snapshot.sourceChatId ? undefined : withHandoffCharacters(existing ?? {
      id: `binding:${targetChatId}`, chatId: targetChatId, chatUrl: `https://chat.deepseek.com/a/chat/s/${targetChatId}`,
      worldId, focusIds: snapshot.focusIds ?? [], bookId: snapshot.bookId, messageCountAtAnalysis: 0, createdAt: Date.now(), updatedAt: Date.now(),
    }, snapshot);
    if (worldId && binding && !existing) delete binding.characterScenes;
    const changes: import("../core/types").DataRecord[] = [...(binding && binding !== existing ? [{ kind: "binding" as const, id: binding.id, data: binding }] : [])];
    const removed: { kind: import("../core/types").RecordKind; id: string }[] = [];
    if (worldId && binding) {
      const world = records.find(r => r.kind === "world" && r.id === worldId)!.data as WorldProfile;
      if(snapshot.resetGameId&&world.sharedGame?.id!==snapshot.resetGameId)throw Error("handoff-conflict");
      const source = records.find(r => r.kind === "binding" && (r.data as ChatBinding).chatId === snapshot.sourceChatId)?.data as ChatBinding | undefined;
      if (snapshot.savedMemory && (source?.worldId !== worldId || world.sharedGame?.revision !== snapshot.sharedGameRevision)) throw Error("handoff-conflict");
      if (source) assertWorldGameWriter(records, source, worldId);
      if (snapshot.sharedGameRevision && world.sharedGame?.revision !== snapshot.sharedGameRevision) throw Error("handoff-conflict");
      let game = world.sharedGame ?? captureWorldGame(records, world, source ?? binding);
       // Carry the prepared scene reference into the next segment. Original
       // selected revisions/episode IDs remain intact; the recap is not canon.
       game = { ...game, ...(overrides ? { memoryOverrides: structuredClone(overrides) } : {}), recentStory: snapshot.continuation ?? boundStory([{ role: "assistant", text: snapshot.summary }], "history", true), recentChatId: snapshot.sourceChatId };
      const base = [...records.filter(r => !(r.kind === "binding" && r.id === binding.id) && !(r.kind === "world" && r.id === worldId)), { kind: "binding" as const, id: binding.id, data: binding }, { kind: "world" as const, id: world.id, data: { ...world, sharedGame: game } }];
      const activation = planWorldGameActivation(base, { chatId: targetChatId, chatUrl: binding.chatUrl, worldId, expectedRevision: game.revision, mode: "attach" });
      const keys = new Set([...activation.records, ...activation.removed].map(r => r.kind + ":" + r.id));
      changes.splice(0, changes.length, ...changes.filter(r => !keys.has(r.kind + ":" + r.id)), ...activation.records);
      if (!keys.has("world:" + world.id)) changes.push({ kind: "world", id: world.id, data: { ...world, sharedGame: game } });
      removed.push(...activation.removed);
    }
    changes.push({ kind: "snapshot", id: snapshot.id, data: { ...snapshot, appliedAt: snapshot.appliedAt ?? Date.now(), ...(targetChatId !== snapshot.sourceChatId ? { targetChatId } : {}) } });
    if (!opening || !worldId) return { records: changes, removed, result: undefined };
    const keys = new Set([...changes, ...removed].map(r => r.kind + ":" + r.id));
    const final = planRecoveredContinuationTurn([...records.filter(r => !keys.has(r.kind + ":" + r.id)), ...changes], worldId, targetChatId, opening.draft, opening.history, opening.settings);
    return { records: final.filter(r => !records.some(old => old.kind === r.kind && old.id === r.id && sameStoryValue(old.data, r.data))),
      removed: records.filter(r => !final.some(next => next.kind === r.kind && next.id === r.id)).map(r => ({ kind: r.kind, id: r.id })), result: undefined };
  }, stillCurrent);
}
