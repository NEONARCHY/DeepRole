import type { ChatBinding } from "../core/types";
import type { ImageTarget } from "../core/image-messages";
import type { ImageAttempt } from "../core/image-plan";
import { ImageApiError } from "../adapters/image/transport";
import { createId } from "../core/id";
import type { DeepRoleRepository } from "./repository";
import { validateWorldImageBudgets } from "./illustrations";

export async function startImageAttempt(repo: DeepRoleRepository, target: ImageTarget): Promise<ImageAttempt> {
  return repo.updateRecords(records => {
    const binding = records.find(r => r.kind === "binding" && (r.data as ChatBinding).chatId === target.chatId)?.data as ChatBinding | undefined;
    if (binding?.worldId !== target.worldId) throw new ImageApiError("changed");
    const same = binding.illustrationAttempts?.filter(a => a.worldId === target.worldId && a.messageKey === target.messageKey) ?? [];
    if (same.some(a => a.status !== "failed" && a.updatedAt + 5 * 60_000 > Date.now())) throw new ImageApiError("busy");
    const retained = (binding.illustrationAttempts ?? []).filter(a => !same.includes(a));
    if (retained.length >= 8) throw new ImageApiError("busy");
    const now = Date.now(), attempt: ImageAttempt = { ...target, id: createId("image-attempt"), status: "preparing", createdAt: now, updatedAt: now };
    return { records: [{ kind: "binding" as const, id: binding.id, data: { ...binding, illustrationAttempts: [...retained, attempt] } }], removed: [], result: attempt };
  });
}
export async function imageAttempt(repo: DeepRoleRepository, target: ImageTarget, id: string): Promise<ImageAttempt> {
  const binding = (await repo.list<ChatBinding>("binding")).find(b => b.chatId === target.chatId);
  const value = binding?.illustrationAttempts?.find(a => a.id === id && a.worldId === target.worldId && a.messageKey === target.messageKey);
  if (!value || binding?.worldId !== target.worldId) throw new ImageApiError("changed"); return value;
}
export async function patchImageAttempt(repo: DeepRoleRepository, target: ImageTarget, id: string, patch: Partial<ImageAttempt> | null, expected?: ImageAttempt["status"]): Promise<void> {
  await repo.updateRecords(records => {
    const row = records.find(r => r.kind === "binding" && (r.data as ChatBinding).chatId === target.chatId), binding = row?.data as ChatBinding | undefined;
    if (!binding) throw new ImageApiError("changed");
    const attempt = binding.illustrationAttempts?.find(a => a.id === id && a.worldId === target.worldId && a.messageKey === target.messageKey);
    if (!attempt || expected && (attempt.status !== expected || binding.worldId !== target.worldId)) throw new ImageApiError("changed");
    const illustrationAttempts = binding.illustrationAttempts!.flatMap(a => a !== attempt ? [a] : patch ? [{ ...a, ...patch, updatedAt: Date.now() }] : []);
    const data = { ...binding, illustrationAttempts };
    if (!validateWorldImageBudgets(records.map(r => r === row ? { ...r, data } : r))) throw new ImageApiError("full");
    return { records: [{ kind: "binding" as const, id: binding.id, data }], removed: [], result: undefined };
  });
}
