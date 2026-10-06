import type { CharacterScene, ChatBinding, HandoffSnapshot } from "./types";

/** Stable revision lets the first request and later SPA chat binding agree. */
export function handoffCharacterScene(snapshot: HandoffSnapshot | null | undefined, worldId: string): CharacterScene | undefined {
  if (snapshot?.worldId !== worldId || !snapshot.characterScene) return undefined;
  const { lastReply: _reply, portraitCycles: _cycles, relationshipNotice: _notice, progress: _progress, ...scene } = structuredClone(snapshot.characterScene);
  return { ...scene, revision: `handoff:${snapshot.id}` };
}
/** Applying a recap never silently overwrites a branch that already has played state. */
export function withHandoffCharacters(binding: ChatBinding, snapshot: HandoffSnapshot | null | undefined): ChatBinding {
  if (!snapshot || (binding.worldId ?? null) !== (snapshot.worldId ?? null) || binding.chatId === snapshot.sourceChatId) return binding;
  const destination = binding.worldId ? binding.characterScenes?.[binding.worldId] : undefined;
  if (destination && (Object.keys(destination.states).length || destination.presentIds.length)) return binding;
  const scene = binding.worldId ? handoffCharacterScene(snapshot, binding.worldId) : undefined;
  return {
    ...binding, continuationSnapshotId: snapshot.id,
    ...(snapshot.memoryOverrides ? { memoryOverrides: structuredClone(snapshot.memoryOverrides) } : {}),
    ...(scene ? { characterScenes: { ...binding.characterScenes, [binding.worldId!]: scene } } : {}),
  };
}
