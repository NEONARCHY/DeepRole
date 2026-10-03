import type {
  EncryptedEnvelope,
  RecordKind,
  RecordValue,
  VaultConfig,
} from "../core/types";
import {
  decodeSalt,
  decryptJsonWithKey,
  deriveVaultKey,
  encodeSalt,
  encryptJsonWithKey,
  exportKey,
  importKey,
  DEFAULT_KDF_ITERATIONS,
} from "./crypto";
import { database, recordKey, type DeepRoleDatabase, type StoredRecord } from "./database";
import {
  clearSessionKey,
  getSessionKey,
  getVaultConfig,
  saveSessionKey,
  saveVaultConfig,
} from "./settings";
import { announceLibraryChange } from "./changes";
import type { DataRecord } from "../core/types";
import { withLibraryLock } from "./library-lock";

export class MemoryConflictError extends Error {
  constructor() { super("memory-conflict"); this.name = "MemoryConflictError"; }
}

export class VaultLockedError extends Error {
  constructor() {
    super("DeepRole vault is locked");
    this.name = "VaultLockedError";
  }
}

export class DeepRoleRepository {
  constructor(private readonly db: DeepRoleDatabase = database) {}

  async list<T extends RecordValue>(kind: RecordKind): Promise<T[]> {
    return withLibraryLock("shared", async () => {
      await this.requireUnlocked();
      const rows = await this.db.records.where("kind").equals(kind).toArray();
      const values = await Promise.all(rows.map((row) => this.decode<T>(row)));
      return values.sort((a, b) => {
        const aTime = "updatedAt" in a ? Number(a.updatedAt) : Number(a.createdAt);
        const bTime = "updatedAt" in b ? Number(b.updatedAt) : Number(b.createdAt);
        return bTime - aTime;
      });
    });
  }

  async get<T extends RecordValue>(kind: RecordKind, id: string): Promise<T | null> {
    return withLibraryLock("shared", async () => {
      await this.requireUnlocked();
      const row = await this.db.records.get(recordKey(kind, id));
      return row ? this.decode<T>(row) : null;
    });
  }

  async put<T extends RecordValue>(kind: RecordKind, value: T): Promise<void> {
    return withLibraryLock("exclusive", async () => {
      const config = await getVaultConfig();
      const row = await this.encode(kind, value.id, value, config);
      await this.db.records.put(row);
      await announceLibraryChange([kind]);
    });
  }

  async delete(kind: RecordKind, id: string): Promise<void> {
    return withLibraryLock("exclusive", async () => {
      await this.requireUnlocked();
      await this.db.records.delete(recordKey(kind, id));
      await announceLibraryChange([kind]);
    });
  }

  async clear(): Promise<void> {
    return withLibraryLock("exclusive", async () => {
      await this.requireUnlocked();
      await this.db.records.clear();
      await announceLibraryChange();
    });
  }

  async clearKind(kind: RecordKind): Promise<void> {
    return withLibraryLock("exclusive", async () => {
      await this.requireUnlocked();
      await this.db.records.where("kind").equals(kind).delete();
      await announceLibraryChange([kind]);
    });
  }

  async rawRecords(): Promise<Array<{ kind: RecordKind; id: string; data: RecordValue }>> {
    return withLibraryLock("shared", async () => {
      await this.requireUnlocked();
      const rows = await this.db.records.toArray();
      return Promise.all(
        rows.map(async (row) => ({
          kind: row.kind,
          id: row.id,
          data: await this.decode<RecordValue>(row),
        })),
      );
    });
  }

  async replaceRecords(records: DataRecord[], finish?: () => Promise<void>): Promise<void> {
    return withLibraryLock("exclusive", async () => {
      await this.requireUnlocked();
      const config = await getVaultConfig();
      const rows = await Promise.all(records.map((record) => this.encode(record.kind, record.id, record.data, config)));
      const before = finish ? await this.db.records.toArray() : [];
      await this.db.transaction("rw", this.db.records, async () => {
        await this.db.records.clear();
        await this.db.records.bulkPut(rows);
      });
      try { await finish?.(); }
      catch (error) {
        // Readers/writers remain behind the common lock until rollback finishes.
        await this.db.transaction("rw", this.db.records, async () => {
          await this.db.records.clear(); await this.db.records.bulkPut(before);
        });
        throw error;
      }
      await announceLibraryChange(records.map((r) => r.kind));
    });
  }

  /** Pure transform of the current library under one cross-window write lock.
   * Do not call repository methods inside the transform (they acquire this lock).
   */
  async updateRecords<T>(transform: (current: DataRecord[]) => { records: DataRecord[]; removed: { kind: RecordKind; id: string }[]; result: T }): Promise<T> {
    return withLibraryLock("exclusive", async () => {
      await this.requireUnlocked();
      const stored = await this.db.records.toArray();
      const current = await Promise.all(stored.map(async (row) => ({ kind: row.kind, id: row.id, data: await this.decode<RecordValue>(row) })));
      const plan = transform(current);
      const config = await getVaultConfig();
      const rows = await Promise.all(plan.records.map((r) => this.encode(r.kind, r.id, r.data, config)));
      await this.db.transaction("rw", this.db.records, async () => {
        await this.db.records.bulkDelete(plan.removed.map((r) => recordKey(r.kind, r.id)));
        await this.db.records.bulkPut(rows);
      });
      if (plan.records.length || plan.removed.length) await announceLibraryChange([...plan.records, ...plan.removed].map((r) => r.kind));
      return plan.result;
    });
  }

  async mergeRecords(records: Array<{ kind: RecordKind; id: string; data: RecordValue }>): Promise<void> {
    return withLibraryLock("exclusive", async () => {
      const config = await getVaultConfig();
      const rows = await Promise.all(records.map((record) => this.encode(record.kind, record.id, record.data, config)));
      await this.db.transaction("rw", this.db.records, () => this.db.records.bulkPut(rows));
      await announceLibraryChange(records.map((r) => r.kind));
    });
  }

  async changeRecords(records: Array<{ kind: RecordKind; id: string; data: RecordValue }>, removed: Array<{ kind: RecordKind; id: string }>): Promise<void> {
    return withLibraryLock("exclusive", async () => {
      await this.requireUnlocked();
      const config = await getVaultConfig();
      const rows = await Promise.all(records.map((record) => this.encode(record.kind, record.id, record.data, config)));
      await this.db.transaction("rw", this.db.records, async () => {
        await this.db.records.bulkDelete(removed.map((record) => recordKey(record.kind, record.id)));
        await this.db.records.bulkPut(rows);
      });
      await announceLibraryChange([...records, ...removed].map((r) => r.kind));
    });
  }

  /** Optimistic atomic commit. Encryption is prepared outside the IDB transaction. */
  async commitChecked(records: DataRecord[], removed: { kind: RecordKind; id: string }[], expected: { kind: RecordKind; id: string; data: RecordValue | null }[], membership?: { kind: RecordKind; ids: string[] }): Promise<void> {
    return withLibraryLock("exclusive", async () => {
      await this.requireUnlocked();
      const keys = expected.map((r) => recordKey(r.kind, r.id));
      if (new Set(keys).size !== keys.length) throw new MemoryConflictError();
      const before = await this.db.records.bulkGet(keys);
      const decoded = await Promise.all(before.map((row) => row ? this.decode<RecordValue>(row) : null));
      if (decoded.some((value, i) => JSON.stringify(value) !== JSON.stringify(expected[i]!.data))) throw new MemoryConflictError();
      const config = await getVaultConfig();
      const rows = await Promise.all(records.map((r) => this.encode(r.kind, r.id, r.data, config)));
      await this.db.transaction("rw", this.db.records, async () => {
        if (membership) {
          const ids = (await this.db.records.where("kind").equals(membership.kind).toArray()).map((row) => row.id).sort();
          if (JSON.stringify(ids) !== JSON.stringify([...membership.ids].sort())) throw new MemoryConflictError();
        }
        const current = await this.db.records.bulkGet(keys);
        if (current.some((value, i) => JSON.stringify(value) !== JSON.stringify(before[i]))) throw new MemoryConflictError();
        await this.db.records.bulkDelete(removed.map((r) => recordKey(r.kind, r.id)));
        await this.db.records.bulkPut(rows);
      });
      await announceLibraryChange([...records, ...removed].map((r) => r.kind));
    });
  }

  async putIfUnchanged<T extends RecordValue>(kind: RecordKind, value: T, expected: T | null): Promise<void> {
    await this.commitChecked([{ kind, id: value.id, data: value }], [], [{ kind, id: value.id, data: expected }]);
  }

  async enableVault(password: string): Promise<void> {
    return withLibraryLock("exclusive", async () => {
      const current = await getVaultConfig();
      if (current.enabled) return;
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await deriveVaultKey(password, salt, DEFAULT_KDF_ITERATIONS);
      const verifier = await encryptJsonWithKey({ ok: true }, key, salt, DEFAULT_KDF_ITERATIONS);
      const rows = await this.db.records.toArray();
      const encryptedRows = await Promise.all(
        rows.map(async (row) => {
          const data = row.data as RecordValue;
          return this.encodeWithKey(row.kind, row.id, data, key, salt, DEFAULT_KDF_ITERATIONS);
        }),
      );
      const config: VaultConfig = {
        enabled: true,
        salt: encodeSalt(salt),
        iterations: DEFAULT_KDF_ITERATIONS,
        verifier,
      };
      await saveSessionKey(await exportKey(key));
      try {
        await saveVaultConfig(config);
        await this.db.transaction("rw", this.db.records, () => this.db.records.bulkPut(encryptedRows));
      } catch (error) {
        await saveVaultConfig(current);
        await clearSessionKey();
        throw error;
      }
      await announceLibraryChange();
    });
  }

  async unlockVault(password: string): Promise<void> {
    return withLibraryLock("exclusive", async () => {
      const config = await getVaultConfig();
      if (!config.enabled || !config.salt || !config.verifier) return;
      const key = await deriveVaultKey(password, decodeSalt(config.salt), config.iterations);
      const result = await decryptJsonWithKey<{ ok: boolean }>(config.verifier, key);
      if (!result.ok) throw new Error("Invalid vault verifier");
      await saveSessionKey(await exportKey(key));
      await announceLibraryChange();
    });
  }

  async lockVault(): Promise<void> {
    return withLibraryLock("exclusive", async () => {
      await clearSessionKey();
      await announceLibraryChange();
    });
  }

  async disableVault(): Promise<void> {
    return withLibraryLock("exclusive", async () => {
      const config = await getVaultConfig();
      if (!config.enabled) return;
      const rows = await this.db.records.toArray();
      const decoded = await Promise.all(rows.map((row) => this.decode<RecordValue>(row)));
      const plainRows = rows.map((row, index) => ({
        pk: row.pk,
        kind: row.kind,
        id: row.id,
        data: decoded[index],
        updatedAt: Date.now(),
      } satisfies StoredRecord));
      await this.db.transaction("rw", this.db.records, () => this.db.records.bulkPut(plainRows));
      try { await saveVaultConfig({ enabled: false }); }
      catch (error) {
        await this.db.transaction("rw", this.db.records, () => this.db.records.bulkPut(rows));
        throw error;
      }
      await clearSessionKey();
      await announceLibraryChange();
    });
  }

  async isLocked(): Promise<boolean> {
    return withLibraryLock("shared", () => this.locked());
  }

  private async locked(): Promise<boolean> {
    const config = await getVaultConfig();
    return config.enabled && !(await getSessionKey());
  }

  private async requireUnlocked() { if (await this.locked()) throw new VaultLockedError(); }

  private async encode(
    kind: RecordKind,
    id: string,
    data: RecordValue,
    config: VaultConfig,
  ): Promise<StoredRecord> {
    if (!config.enabled) {
      return { pk: recordKey(kind, id), kind, id, data, updatedAt: Date.now() };
    }
    if (!config.salt || !config.iterations) throw new VaultLockedError();
    const rawKey = await getSessionKey();
    if (!rawKey) throw new VaultLockedError();
    const key = await importKey(rawKey);
    return this.encodeWithKey(kind, id, data, key, decodeSalt(config.salt), config.iterations);
  }

  private async encodeWithKey(
    kind: RecordKind,
    id: string,
    data: RecordValue,
    key: CryptoKey,
    salt: Uint8Array,
    iterations: number,
  ): Promise<StoredRecord> {
    const encrypted = await encryptJsonWithKey(data, key, salt, iterations);
    return { pk: recordKey(kind, id), kind, id, encrypted, updatedAt: Date.now() };
  }

  private async decode<T extends RecordValue>(row: StoredRecord): Promise<T> {
    if (row.data !== undefined) return row.data as T;
    if (!row.encrypted) throw new Error("Invalid DeepRole record");
    const rawKey = await getSessionKey();
    if (!rawKey) throw new VaultLockedError();
    return decryptJsonWithKey<T>(row.encrypted as EncryptedEnvelope, await importKey(rawKey));
  }
}

export const repository = new DeepRoleRepository();
