import { isSameDeepSeekChat } from "../core/chat-scope";
import { portraitKey, validPortraitPose, validPortraitLayout } from "../core/portrait-layout";
import type { ChatBinding, PortraitPose, SceneEntity } from "../core/types";
import { repository, type DeepRoleRepository } from "./repository";

export interface PortraitLayoutEdit {
  worldId: string; chatId: string; chatUrl: string; resetAt: number;
  entityId: string | null; pose: PortraitPose | null;
}
/** Patch just one UI position atomically; never overwrite a simultaneous scene update. */
export async function savePortraitLayout(edit: PortraitLayoutEdit, repo: DeepRoleRepository = repository) {
  if (!portraitKey(edit.worldId) || !portraitKey(edit.chatId) || !Number.isFinite(edit.resetAt) || edit.resetAt < 0 || edit.resetAt > Number.MAX_SAFE_INTEGER
    || edit.entityId !== null && !portraitKey(edit.entityId) || edit.pose !== null && !validPortraitPose(edit.pose) || edit.entityId === null && edit.pose !== null) throw new Error("character-invalid");
  await repo.updateRecords(all => {
    const binding = all.find(r => r.kind === "binding" && (r.data as ChatBinding).chatId === edit.chatId)?.data as ChatBinding | undefined;
    if (!binding || binding.worldId !== edit.worldId || !isSameDeepSeekChat(edit.chatUrl, binding.chatUrl, edit.chatId)
      || !all.some(r => r.kind === "world" && r.id === edit.worldId)
      || edit.entityId && !all.some(r => r.kind === "entity" && r.id === edit.entityId && (r.data as SceneEntity).worldId === edit.worldId && (r.data as SceneEntity).kind === "character")) throw new Error("character-scope");
    const previous = binding.portraitLayouts?.[edit.worldId];
    const positions = edit.entityId && previous?.resetAt === edit.resetAt ? { ...previous.positions } : {};
    if (edit.entityId) { if (edit.pose) positions[edit.entityId] = { ...edit.pose }; else delete positions[edit.entityId]; }
    const layout = { resetAt: edit.resetAt, positions };
    if (!validPortraitLayout(layout)) throw new Error("character-invalid");
    return { records: [{ kind: "binding" as const, id: binding.id, data: { ...binding, portraitLayouts: { ...binding.portraitLayouts, [edit.worldId]: layout }, updatedAt: Date.now() } }], removed: [], result: undefined };
  });
}
