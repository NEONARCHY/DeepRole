import { APP_VERSION } from "../core/defaults";
import type { BackupPayload, EncryptedEnvelope } from "../core/types";
import { decryptJson, encryptJson } from "./crypto";
import { repository, type DeepRoleRepository } from "./repository";
import { getSettings, saveSettings } from "./settings";
import { validDataRecord, parseBackupSettings } from "../core/record-validation";
import { importFileTooLarge } from "../core/import-limits";

export async function createBackup(
  password?: string,
  repo: DeepRoleRepository = repository,
): Promise<BackupPayload | EncryptedEnvelope> {
  const payload: BackupPayload = {
    format: "deeprole-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    records: (await repo.rawRecords()).filter(record => record.kind !== "cast"),
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
  const payload = parsed?.format === "deeprole-encrypted"
    ? await decryptJson<BackupPayload>(parsed, password ?? "")
    : parsed;
  validateBackup(payload);
  return { ...payload, settings: parseBackupSettings(payload.settings) };
}

export async function restoreBackup(
  payload: BackupPayload,
  mode: "merge" | "replace",
  repo: DeepRoleRepository = repository,
): Promise<void> {
  validateBackup(payload);
  if (mode === "replace") await repo.replaceRecords(payload.records, () => saveSettings(parseBackupSettings(payload.settings)));
  else await repo.updateRecords((existing) => {
    const keys = new Set(existing.map((r) => `${r.kind}:${r.id}`));
    const incoming = payload.records.filter((r) => !keys.has(`${r.kind}:${r.id}`));
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
    value.version !== 1 ||
    !Array.isArray(value.records) ||
    typeof value.exportedAt !== "string" || !Number.isFinite(Date.parse(value.exportedAt))
  ) {
    throw new Error("Invalid DeepRole backup");
  }
  parseBackupSettings(value.settings);
  const keys = new Set<string>();
  for (const record of value.records) {
    if (!validDataRecord(record)) throw new Error("Invalid DeepRole backup");
    const key = `${record.kind}:${record.id}`;
    if (keys.has(key)) throw new Error("Invalid DeepRole backup");
    keys.add(key);
  }
}
