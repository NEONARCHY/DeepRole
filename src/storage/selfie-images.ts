import { browser } from "wxt/browser";
import type { ChatBinding, SceneEntity, ScenePhoto, SelfieGeneration } from "../core/types";
import type { ImageTarget } from "../core/image-messages";
import type { Illustration } from "../core/image-generation";
import { generatedSelfieCategory, selfieGate } from "../core/selfies";
import { validateWorldImageBudgets } from "./illustrations";
import { ImageApiError } from "../adapters/image/transport";
import type { DeepRoleRepository } from "./repository";

const approvalKey = (target: ImageTarget, photo: ScenePhoto) => "deeprole_selfie_approval_" + JSON.stringify([target.worldId, target.chatId, photo.imageKey]);
export const selfieIllustrationId = (photo: ScenePhoto) => "selfie:" + photo.imageKey;
/** Session-only approval is deliberately absent from backups/imports. */
export async function approveSelfie(target: ImageTarget, photo: ScenePhoto): Promise<void> {
  await browser.storage.session.set({ [approvalKey(target, photo)]: Date.now() + 24 * 60 * 60_000 });
}
export async function claimSelfie(repo: DeepRoleRepository, target: ImageTarget, entityId: string, turnKey: string, retry: boolean, tracking = true) {
  const binding = (await repo.list<ChatBinding>("binding")).find(b => b.chatId === target.chatId);
  const photo = binding?.scenePhotos?.find(p => p.worldId === target.worldId && p.messageKey === target.messageKey && p.entityId === entityId && p.turnKey === turnKey && p.generation);
  if (!photo || binding?.worldId !== target.worldId) throw new ImageApiError("changed");
  const illustrationId = selfieIllustrationId(photo);
  const existing = await repo.get<Illustration>("illustration", illustrationId);
  if (existing && existing.worldId === target.worldId && existing.chatId === target.chatId && existing.messageKey === target.messageKey && existing.entityId === entityId) {
    await finishSelfie(repo, target, photo, { status: "ready", illustrationId, error: undefined, ticketId: undefined });
    return { photo, existing };
  }
  const until = (await browser.storage.session.get(approvalKey(target, photo)))[approvalKey(target, photo)];
  if (!retry && !(typeof until === "number" && until > Date.now())) {
    if (photo.createdAt + 30_000 > Date.now()) throw new ImageApiError("busy");
    await finishSelfie(repo, target, photo, { status: "failed", error: "expired" });
    throw new ImageApiError("expired");
  }
  const claimed = await repo.updateRecords(records => {
    const current = records.find(r => r.kind === "binding" && r.id === binding.id)?.data as ChatBinding | undefined;
    const nextPhoto = current?.scenePhotos?.find(p => p.imageKey === photo.imageKey && p.worldId === target.worldId && p.turnKey === turnKey && p.entityId === entityId);
    if (current?.worldId !== target.worldId || !nextPhoto?.generation) throw new ImageApiError("changed");
    if (nextPhoto.generation.status === "working") {
      if (nextPhoto.generation.updatedAt + 5 * 60_000 > Date.now()) throw new ImageApiError("busy");
      const failed = { ...nextPhoto, generation: { ...nextPhoto.generation, status: "failed" as const, error: "timeout", updatedAt: Date.now() } };
      return { records: [{ kind: "binding" as const, id: current.id, data: { ...current, scenePhotos: current.scenePhotos!.map(p => p === nextPhoto ? failed : p) } }], removed: [], result: null };
    }
    if (nextPhoto.generation.status !== "queued" && !(retry && nextPhoto.generation.status === "failed" && !nextPhoto.generation.ticketId)) throw new ImageApiError("changed");
    const people = records.filter(r => r.kind === "entity" && (r.data as SceneEntity).worldId === target.worldId).map(r => r.data as SceneEntity);
    const person = people.find(e => e.id === entityId), hero = people.find(e => e.characterSheet?.protagonist);
    if (!person || !["allowed", "story"].includes(selfieGate(person, generatedSelfieCategory(person.characterSheet), hero, current.characterScenes?.[target.worldId], tracking))) throw new ImageApiError("changed");
    const claimed = { ...nextPhoto, generation: { ...nextPhoto.generation, status: "working" as const, illustrationId, error: undefined, ticketId: undefined, updatedAt: Date.now() } };
    return { records: [{ kind: "binding" as const, id: current.id, data: { ...current, scenePhotos: current.scenePhotos!.map(p => p === nextPhoto ? claimed : p) } }], removed: [], result: claimed };
  }).catch(async error => {
    if (!(error instanceof ImageApiError) || error.code !== "busy") await finishSelfie(repo, target, photo, { status: "failed", error: error instanceof ImageApiError ? error.code : "failed" }).catch(() => undefined);
    throw error;
  });
  if (!claimed) throw new ImageApiError("timeout");
  return { photo: claimed, existing: undefined };
}
export async function finishSelfie(repo: DeepRoleRepository, target: ImageTarget, photo: ScenePhoto, patch: Partial<SelfieGeneration>): Promise<void> {
  await repo.updateRecords(records => {
    const current = records.find(r => r.kind === "binding" && (r.data as ChatBinding).chatId === target.chatId)?.data as ChatBinding | undefined;
    if (!current) return { records: [], removed: [], result: undefined };
    let changed = false;
    const scenePhotos = current.scenePhotos?.map(p => {
      if (p.worldId !== target.worldId || p.messageKey !== target.messageKey || p.entityId !== photo.entityId || p.turnKey !== photo.turnKey || !p.generation) return p;
      changed = true; return { ...p, generation: { ...p.generation, ...patch, updatedAt: Date.now() } };
    });
    if (!validateWorldImageBudgets(records.map(r => r.kind === "binding" && r.id === current.id ? { ...r, data: { ...current, scenePhotos } } : r))) throw new ImageApiError("full");
    return { records: changed ? [{ kind: "binding" as const, id: current.id, data: { ...current, scenePhotos } }] : [], removed: [], result: undefined };
  });
}
