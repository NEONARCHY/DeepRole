import { createId } from "../core/id";
import { memoryWorld } from "../core/scene";
import { boundStory, validStoryContinuation } from "../core/story-continuation";
import type { ChatBinding, HandoffSnapshot, MemoryBook, MemoryOverrides, SceneState, StoryContinuation, WorldProfile } from "../core/types";
import { repository, type DeepRoleRepository } from "./repository";
import { withHandoffCharacters } from "../core/relationship-handoff";
import { captureWorldGame, planWorldGameActivation } from "./world-game";
import { assertWorldGameWriter } from "../core/world-game";

export interface ContinuationCapture {
  chatId: string;
  chatUrl: string;
  scene: SceneState;
  story: StoryContinuation;
  recap?: { title: string; summary: string };
  overrides: MemoryOverrides;
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
export async function completeContinuation(expected: HandoffSnapshot, targetChatId: string, repo: DeepRoleRepository = repository): Promise<void> {
  if (!/^[\w-]{1,120}$/u.test(targetChatId)) throw new Error("handoff-invalid");
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
      if (source) assertWorldGameWriter(records, source, worldId);
      if (snapshot.sharedGameRevision && world.sharedGame?.revision !== snapshot.sharedGameRevision) throw Error("handoff-conflict");
      let game = world.sharedGame ?? captureWorldGame(records, world, source ?? binding);
      if (!game.recentStory?.turns.length) game = { ...game, recentStory: snapshot.continuation ?? boundStory([{ role: "assistant", text: snapshot.summary }], "history", true), recentChatId: snapshot.sourceChatId };
      const base = [...records.filter(r => !(r.kind === "binding" && r.id === binding.id) && !(r.kind === "world" && r.id === worldId)), { kind: "binding" as const, id: binding.id, data: binding }, { kind: "world" as const, id: world.id, data: { ...world, sharedGame: game } }];
      const activation = planWorldGameActivation(base, { chatId: targetChatId, chatUrl: binding.chatUrl, worldId, expectedRevision: game.revision, mode: "attach" });
      const keys = new Set([...activation.records, ...activation.removed].map(r => r.kind + ":" + r.id));
      changes.splice(0, changes.length, ...changes.filter(r => !keys.has(r.kind + ":" + r.id)), ...activation.records);
      if (!keys.has("world:" + world.id)) changes.push({ kind: "world", id: world.id, data: { ...world, sharedGame: game } });
      removed.push(...activation.removed);
    }
    return {
      records: [...changes,
        { kind: "snapshot" as const, id: snapshot.id, data: { ...snapshot, appliedAt: snapshot.appliedAt ?? Date.now(), ...(targetChatId !== snapshot.sourceChatId ? { targetChatId } : {}) } }],
      removed, result: undefined,
    };
  });
}
