import { APP_VERSION } from "../core/defaults";
import { normalizeActionRecord } from "../core/action-compat";
import { hasInternalPhotoAddresses } from "../core/photo-assets";
import type { BackupPayload, EncryptedEnvelope } from "../core/types";
import { decryptJson, encryptJson } from "./crypto";
import { repository, type DeepRoleRepository } from "./repository";
import { getSettings, saveSettings } from "./settings";
import { validDataRecord, parseBackupSettings } from "../core/record-validation";
import { importFileTooLarge } from "../core/import-limits";
import { assertStoryGraph, canonicalStoryValue } from "../core/story-records";
import { ServiceAuditOutbox } from "./service-outbox";
import { assertDispatchCaptureGraph } from "./story-dispatch-capture";

export async function createBackup(
  password?: string,
  repo: DeepRoleRepository = repository,
): Promise<BackupPayload | EncryptedEnvelope> {
  // Pending metadata is not itself exported as authority/executable work.
  // Drain accessible outcomes first; unresolved bindings remain explicitly pending.
  await new ServiceAuditOutbox(repo).flush();
  const records = await repo.portableRecords((await repo.rawRecords()).filter(record => record.kind !== "cast"));
  assertStoryGraph(records);
  assertDispatchCaptureGraph(records);
  const payload: BackupPayload = {
    format: "deeprole-backup",
    version: records.some(record => record.kind === "dispatch") ? 4 : records.some(record => record.kind === "service") ? 3 : records.some(record => record.kind === "story") ? 2 : 1,
    exportedAt: new Date().toISOString(),
    records,
    settings: await getSettings(),
  };
  const bytes = new Blob([JSON.stringify(payload)]).size;
  if (importFileTooLarge(bytes, "backup")) throw new Error("backupTooLarge");
  return password ? encryptJson(payload, password) : payload;
}

export async function parseBackup(text: string, password?: string): Promise<BackupPayload> {
  const bytes = new Blob([text]).size;
  if (importFileTooLarge(bytes, "backup")) throw new Error("backupTooLarge");
  return parseBackupData(JSON.parse(text.replace(/^\uFEFF/, "")), bytes, password);
}

/** The unified file picker already parsed JSON; preserve its records without reparsing image data. */
export async function parseBackupData(value: unknown, bytes: number, password?: string): Promise<BackupPayload> {
  if (importFileTooLarge(bytes, "backup")) throw new Error("backupTooLarge");
  const parsed = value as BackupPayload | EncryptedEnvelope;
  const raw = parsed?.format === "deeprole-encrypted"
    ? await decryptJson<BackupPayload>(parsed, password ?? "")
    : parsed;
  const payload = raw && Array.isArray(raw.records) ? { ...raw, records: raw.records.map(normalizeActionRecord) } : raw;
  validateBackup(payload);
  return { ...payload, settings: parseBackupSettings(payload.settings) };
}

export async function restoreBackup(
  payload: BackupPayload,
  mode: "merge" | "replace",
  repo: DeepRoleRepository = repository,
): Promise<void> {
  payload = structuredClone(payload);
  payload = { ...payload, records: payload.records.map(normalizeActionRecord) };
  validateBackup(payload);
  const incomingRecords = payload.records.map(record => record.kind === "service" || record.kind === "dispatch" ? { ...record, data: { ...(record.data as import("../core/service-operations").ServiceOperation | import("../core/story-dispatch-capture").StoryDispatchCapture), origin: "restored" as const } } : record);
  if (mode === "replace") await repo.replaceRecords(incomingRecords, () => saveSettings(parseBackupSettings(payload.settings)));
  else await repo.updateRecords((existing) => {
    for (const record of payload.records.filter(r => r.kind === "service" || r.kind === "dispatch")) {
      const previous = existing.find(r => r.kind === record.kind && r.id === record.id);
      // Origin differs after a prior restore; it cannot grant local authority.
      const audit = (data: unknown) => ({ ...(data as import("../core/service-operations").ServiceOperation), origin: "restored" });
      if (previous && canonicalStoryValue(audit(previous.data)) !== canonicalStoryValue(audit(record.data))) throw new Error(record.kind === "service" ? "service-merge-conflict" : "dispatch-merge-conflict");
    }
    const histories = new Map(existing.filter(r => r.kind === "story").map(r => [r.id, r]));
    for (const record of payload.records.filter(r => r.kind === "story")) {
      const previous = histories.get(record.id);
      if (previous && canonicalStoryValue(previous.data) !== canonicalStoryValue(record.data)) throw new Error("story-merge-conflict");
    }
    const keys = new Set(existing.map((r) => `${r.kind}:${r.id}`));
    const incoming = incomingRecords.filter((r) => !keys.has(`${r.kind}:${r.id}`));
    assertStoryGraph([...existing, ...incoming]);
    assertDispatchCaptureGraph([...existing, ...incoming]);
    return { records: incoming, removed: [], result: undefined };
  });
}

export function backupFileName(encrypted: boolean): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `deeprole-${APP_VERSION}-${stamp}.${encrypted ? "vault.json" : "json"}`;
}

function validateBackup(value: BackupPayload): void {
  if (
    value?.format !== "deeprole-backup" ||
    ![1, 2, 3, 4].includes(value.version) ||
    !Array.isArray(value.records) ||
    typeof value.exportedAt !== "string" || !Number.isFinite(Date.parse(value.exportedAt))
  ) {
    throw new Error("Invalid DeepRole backup");
  }
  parseBackupSettings(value.settings);
  const keys = new Set<string>();
  for (const record of value.records) {
    if (value.version === 1 && record.kind === "story") throw new Error("Invalid DeepRole backup");
    if (value.version < 3 && record.kind === "service" || value.version !== 4 && record.kind === "dispatch") throw new Error("Invalid DeepRole backup");
    if (!validDataRecord(record) || hasInternalPhotoAddresses(record.kind, record.data)) throw new Error("Invalid DeepRole backup");
    const key = `${record.kind}:${record.id}`;
    if (keys.has(key)) throw new Error("Invalid DeepRole backup");
    keys.add(key);
  }
  assertStoryGraph(value.records);
  assertDispatchCaptureGraph(value.records);
}
