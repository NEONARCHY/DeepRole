import { assertStoryGraph, type StoryProjection } from "../core/story-records";
import { StoryProjectionError } from "../core/story-projection";
import type { ChatBinding, DataRecord } from "../core/types";
import { assertWorldGameWriter } from "../core/world-game";

/** One scene has at most one replay writer. A checkpoint alone owns no effects.
 * Must run under the same repository lock as the proposed scene write.
 */
export function storySceneOwner(all: DataRecord[], binding: ChatBinding, worldId: string, branchId?: string): StoryProjection | null {
  assertWorldGameWriter(all, binding, worldId);
  assertStoryGraph(all);
  const bindings = all.filter(row => row.kind === "binding" && (row.data as ChatBinding).chatId === binding.chatId);
  if (bindings.length !== 1 || bindings[0]!.id !== binding.id || binding.worldId !== worldId) throw new StoryProjectionError("story-binding-conflict");
  const owners = all.filter(row => row.kind === "story" && (row.data as { type: string }).type === "projection")
    .map(row => row.data as StoryProjection).filter(row => row.worldId === worldId && row.bindingId === binding.id && row.chatId === binding.chatId);
  if (owners.length > 1 || owners[0] && branchId !== undefined && owners[0].branchId !== branchId) throw new StoryProjectionError("story-scene-ownership-conflict");
  return owners[0] ?? null;
}
