import type { Table } from "dexie";
import { validDataRecord } from "../../src/core/record-validation";
import { normalizeActionRecordData } from "../../src/core/action-compat";
import type { CharacterScene, ChatBinding, DataRecord, EncryptedEnvelope, RecordValue } from "../../src/core/types";
import { DeepRoleDatabase, type StoredPhoto, type StoredRecord } from "../../src/storage/database";
import { decodeSalt, decryptJsonWithKey, encryptJsonWithKey, importKey } from "../../src/storage/crypto";
import { DeepRoleRepository } from "../../src/storage/repository";
import { withLibraryLock } from "../../src/storage/library-lock";
import { getSessionKey, getVaultConfig } from "../../src/storage/settings";

/** Test-only rehearsal, NOT an installed database migration or runtime API. */
export class StoryMigrationRehearsalDatabase extends DeepRoleDatabase {
  rehearsal!: Table<RehearsalRow, string>;
  constructor(name: string) {
    super(name);
    this.version(3).stores({ rehearsal: "&id" });
  }
}

export interface LegacyBaseline {
  contractVersion: 1;
  id: string;
  playthroughId: string;
  branchId: string;
  bindingId: string;
  worldId: string | null;
  chatId: string;
  parentBranchId: null;
  lineage: "unknown-legacy";
  historyBeforeBaseline: "unknown";
  currentScene: CharacterScene | null;
  events: [];
  /** Existing entries are not retroactively asserted to be world canon. */
  legacyEntryScope: "unclassified";
}
export interface RehearsalRow {
  id: string;
  data?: unknown;
  encrypted?: EncryptedEnvelope;
}
interface Snapshot { records: StoredRecord[]; photos: StoredPhoto[] }
interface Manifest { contractVersion: 1; status: "complete"; sourceFingerprint: string; baselineIds: string[] }
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const fingerprint = async (value: unknown) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value))))).map(byte => byte.toString(16).padStart(2, "0")).join("");
const sortedRows = (rows: StoredRecord[]) => [...rows].sort((a, b) => a.pk.localeCompare(b.pk));
const sortedRecords = (records: DataRecord[]) => [...records].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));

export async function decodeRehearsal<T>(row: RehearsalRow): Promise<T> {
  if (row.data !== undefined) return structuredClone(row.data) as T;
  const rawKey = await getSessionKey();
  if (!rawKey || !row.encrypted) throw new Error("rehearsal-vault-locked");
  return decryptJsonWithKey<T>(row.encrypted, await importKey(rawKey));
}

export async function prepareStoryMigration(db: StoryMigrationRehearsalDatabase, repo: DeepRoleRepository) {
  // All decoding, validation and encryption finish BEFORE the IDB transaction.
  const vault = await getVaultConfig(), rawKey = vault.enabled ? await getSessionKey() : null;
  if (vault.enabled && !rawKey) throw new Error("rehearsal-vault-locked");
  const key = rawKey ? await importKey(rawKey) : null;
  const wrap = async (id: string, data: unknown): Promise<RehearsalRow> => key
    ? { id, encrypted: await encryptJsonWithKey(data, key, decodeSalt(vault.salt!), vault.iterations!) }
    : { id, data: structuredClone(data) };
  const original: Snapshot = { records: sortedRows(await db.records.toArray()), photos: await db.photos.toArray() };
  const sourceFingerprint = await fingerprint(original.records);
  const records: DataRecord[] = await repo.rawRecords();
  const captured: DataRecord[] = await Promise.all(original.records.map(async row => {
    if (row.encrypted && !key) throw new Error("rehearsal-invalid-source");
    const data = row.encrypted ? await decryptJsonWithKey<RecordValue>(row.encrypted, key!) : row.data as RecordValue;
    return { kind: row.kind, id: row.id, data: normalizeActionRecordData(row.kind, data) as RecordValue };
  }));
  // A source edit followed by a revert could pass the later stored-row guard.
  // Also compare decoded input with the snapshot before deriving any baseline.
  if (canonical(sortedRecords(records)) !== canonical(sortedRecords(captured))) throw new Error("rehearsal-source-changed");
  // Service jobs are opaque snapshot data, not story facts.
  if (records.some(r => r.kind !== "cast" && !validDataRecord(r))) throw new Error("rehearsal-invalid-source");
  const worlds = new Set(records.filter(r => r.kind === "world").map(r => r.id));
  const baselines: LegacyBaseline[] = [];
  for (const row of records.filter(r => r.kind === "binding").sort((a, b) => a.id.localeCompare(b.id))) {
    const binding = row.data as ChatBinding;
    const worldIds = [...new Set([binding.worldId ?? null, ...Object.keys(binding.characterScenes ?? {})])];
    for (const worldId of worldIds) {
      if (worldId !== null && !worlds.has(worldId)) throw new Error("rehearsal-missing-world");
      const identity = await fingerprint([1, binding.id, worldId]);
      baselines.push({ contractVersion: 1, id: `baseline:${identity}`, playthroughId: `playthrough:${identity}`, branchId: `branch:${identity}`, bindingId: binding.id, worldId, chatId: binding.chatId,
        parentBranchId: null, lineage: "unknown-legacy", historyBeforeBaseline: "unknown", currentScene: worldId === null ? null : structuredClone(binding.characterScenes?.[worldId] ?? null), events: [], legacyEntryScope: "unclassified" });
    }
  }
  const manifest: Manifest = { contractVersion: 1, status: "complete", sourceFingerprint, baselineIds: baselines.map(b => b.id) };
  const payloads = new Map<string, unknown>([["snapshot", original], ...baselines.map(b => [b.id, b] as [string, unknown]), ["manifest", manifest]]);
  const expectedPayloads = new Map([...payloads].map(([id, value]) => [id, canonical(value)]));
  const rows: RehearsalRow[] = await Promise.all([...payloads].map(([id, value]) => wrap(id, value)));
  const expectedRecords = canonical(original.records);

  return {
    baselines,
    async commit(failAt?: "after-snapshot" | "after-baselines") {
      // Compare-and-commit catches concurrent record edits, including another
      // tab between prepare and commit. The rehearsal never rewrites photos.
      return withLibraryLock("exclusive", async () => {
        if (canonical(await getVaultConfig()) !== canonical(vault) || (vault.enabled && await getSessionKey() !== rawKey)) throw new Error("rehearsal-vault-changed");
        const targetBefore = await db.rehearsal.toArray();
        if (targetBefore.length) {
          if (targetBefore.length !== rows.length || targetBefore.some(row => !expectedPayloads.has(row.id))) throw new Error("rehearsal-incomplete-target");
          for (const row of targetBefore) {
            if (vault.enabled ? row.data !== undefined || !row.encrypted : row.data === undefined || !!row.encrypted) throw new Error("rehearsal-target-protection");
            if (canonical(await decodeRehearsal(row)) !== expectedPayloads.get(row.id)) throw new Error("rehearsal-target-mismatch");
          }
        }
        return db.transaction("rw", db.records, db.rehearsal, async () => {
          if (canonical(sortedRows(await db.records.toArray())) !== expectedRecords) throw new Error("rehearsal-source-changed");
          if (canonical(await db.rehearsal.toArray()) !== canonical(targetBefore)) throw new Error("rehearsal-target-changed");
          if (targetBefore.length) return "already-complete" as const;
          await db.rehearsal.put(rows[0]!);
          if (failAt === "after-snapshot") throw new Error("rehearsal-injected-failure");
          await db.rehearsal.bulkPut(rows.slice(1, -1));
          if (failAt === "after-baselines") throw new Error("rehearsal-injected-failure");
          await db.rehearsal.put(rows.at(-1)!);
          return "committed" as const;
        });
      });
    },
  };
}
