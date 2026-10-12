import type {
  EncryptedEnvelope,
  RecordKind,
  RecordValue,
  VaultConfig,
} from "../core/types";
import { normalizeActionRecordData } from "../core/action-compat";
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
import { PhotoAssets } from "./photo-assets";
import { photoAddresses } from "../core/photo-assets";
import { sharedGameCommit } from "./world-game";

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
  private async stagePortablePhotos(photos?: import("../core/portable-photos").PortablePhoto[]) {
    for (const photo of photos ?? []) await this.photos.store(photo.image,photo.id);
  }
  private readonly photos: PhotoAssets;
  constructor(private readonly db: DeepRoleDatabase = database, private readonly compactPhotos = false) { this.photos = new PhotoAssets(db); }

  async readPhoto(id: string): Promise<string> { return withLibraryLock("shared", async () => { await this.requireUnlocked(); return this.photos.read(id); }); }
  async storePhoto(image: string): Promise<string> { return withLibraryLock("exclusive", async () => { await this.requireUnlocked(); return this.photos.store(image); }); }
  private async encodeRecords(records: DataRecord[], config: VaultConfig): Promise<StoredRecord[]> {
    const rows: StoredRecord[] = [];
    for (const record of records) rows.push(await this.encode(record.kind, record.id, record.data, config));
    return rows;
  }

  /** Explicit startup migration, one record at a time; timestamps and image bytes stay unchanged. */
  async migratePhotos(): Promise<void> {
    return withLibraryLock("exclusive", async () => {
      await this.requireUnlocked();
      const keys = await this.db.records.where("kind").equals("entity").primaryKeys();
      const config = await getVaultConfig();
      for (const pk of keys) {
        const row = await this.db.records.get(pk); if (!row || row.photosVersion === 1) continue;
        const data = await this.decode<RecordValue>(row, false);
        const compact = await this.photos.compact(row.kind, data);
        const next = await this.encode(row.kind, row.id, compact, config);
        next.updatedAt = row.updatedAt; await this.db.records.put(next);
      }
    });
  }

  async portableRecords(records?: DataRecord[]): Promise<DataRecord[]> {
    const values = records ?? await this.rawRecords();
    return withLibraryLock("shared", async () => {
      await this.requireUnlocked(); const result: DataRecord[] = [];
      for (const row of values) result.push({ ...row, data: await this.photos.expand(row.kind, row.data) });
      return result;
    });
  }

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
      await this.db.transaction("rw", this.db.records, this.db.photos, async () => { await this.db.records.clear(); await this.db.photos.clear(); });
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

  async replaceRecords(records: DataRecord[], finish?: () => Promise<void>, photos?: import("../core/portable-photos").PortablePhoto[]): Promise<void> {
    return withLibraryLock("exclusive", async () => {
      await this.requireUnlocked();
      const config = await getVaultConfig();
      await this.stagePortablePhotos(photos);
      const rows = await this.encodeRecords(records, config);
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
  async updateRecords<T>(transform: (current: DataRecord[]) => { records: DataRecord[]; removed: { kind: RecordKind; id: string }[]; result: T; deleteOrphanedPhotos?: boolean }, finish?: () => Promise<void>, readKinds?: RecordKind[], photos?: import("../core/portable-photos").PortablePhoto[]): Promise<T> {
    return withLibraryLock("exclusive", async () => {
      await this.requireUnlocked();
      if (readKinds?.some(k => ["binding", "story", "entity"].includes(k))) readKinds = [...new Set([...readKinds, "world", "binding", "story", "entity"])] as RecordKind[];
      const stored = readKinds ? await this.db.records.where("kind").anyOf(readKinds).toArray() : await this.db.records.toArray();
      const current = await Promise.all(stored.map(async (row) => ({ kind: row.kind, id: row.id, data: await this.decode<RecordValue>(row) })));
      const plan = transform(current);
      plan.records = sharedGameCommit(current, plan.records, plan.removed);
      if (readKinds && [...plan.records, ...plan.removed].some(row => !readKinds!.includes(row.kind))) throw new Error("repository-scope");
      const config = await getVaultConfig();
      await this.stagePortablePhotos(photos);
      const rows = await this.encodeRecords(plan.records, config);
      let photoRemovals: string[] = [];
      if (plan.deleteOrphanedPhotos) {
        if (finish || readKinds) throw new Error("repository-scope");
        const before = new Set<string>(), kept = new Set<string>();
        const removedKeys = new Set(plan.removed.map(r => recordKey(r.kind,r.id)));
        const replacements = new Map(rows.map(r => [r.pk,r]));
        for (const old of stored) {
          const data = await this.decode<RecordValue>(old,false);
          for (const id of photoAddresses(data)) before.add(id);
          if (!removedKeys.has(old.pk) && !replacements.has(old.pk)) for(const id of photoAddresses(data)) kept.add(id);
        }
        for(const row of rows) for(const id of photoAddresses(await this.decode<RecordValue>(row,false))) kept.add(id);
        photoRemovals = [...before].filter(id => !kept.has(id));
      }
      await this.db.transaction("rw", this.db.records, this.db.photos, async () => {
        await this.db.records.bulkDelete(plan.removed.map((r) => recordKey(r.kind, r.id)));
        await this.db.records.bulkPut(rows);
        if(photoRemovals.length) await this.db.photos.bulkDelete(photoRemovals);
      });
      try { await finish?.(); }
      catch (error) {
        const touched = new Set([...rows.map(row => row.pk), ...plan.removed.map(row => recordKey(row.kind, row.id))]);
        await this.db.transaction("rw", this.db.records, async () => {
          await this.db.records.bulkDelete([...touched]);
          await this.db.records.bulkPut(stored.filter(row => touched.has(row.pk)));
        });
        throw error;
      }
      if (plan.records.length || plan.removed.length) await announceLibraryChange([...plan.records, ...plan.removed].map((r) => r.kind));
      return plan.result;
    });
  }

  async mergeRecords(records: Array<{ kind: RecordKind; id: string; data: RecordValue }>, photos?: import("../core/portable-photos").PortablePhoto[]): Promise<void> {
    return withLibraryLock("exclusive", async () => {
      await this.requireUnlocked();
      await this.stagePortablePhotos(photos);
      const config = await getVaultConfig();
      const rows = await this.encodeRecords(records, config);
      await this.db.transaction("rw", this.db.records, () => this.db.records.bulkPut(rows));
      await announceLibraryChange(records.map((r) => r.kind));
    });
  }

  async changeRecords(records: Array<{ kind: RecordKind; id: string; data: RecordValue }>, removed: Array<{ kind: RecordKind; id: string }>): Promise<void> {
    return withLibraryLock("exclusive", async () => {
      await this.requireUnlocked();
      const config = await getVaultConfig();
      const rows = await this.encodeRecords(records, config);
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
      if ([...records, ...removed].some(r => ["world", "binding", "entity", "story"].includes(r.kind))) {
        const gameRows = await this.db.records.where("kind").anyOf(["world", "binding", "entity", "story"]).toArray();
        const gameRecords = await Promise.all(gameRows.map(async r => ({ kind: r.kind, id: r.id, data: await this.decode<RecordValue>(r) })));
        records = sharedGameCommit(gameRecords, records, removed);
      }
      const config = await getVaultConfig();
      const rows = await this.encodeRecords(records, config);
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
      const encryptedRows: StoredRecord[] = [];
      for (const row of rows) encryptedRows.push(await this.encodeWithKey(row.kind, row.id, row.data as RecordValue, key, salt, DEFAULT_KDF_ITERATIONS));
      const config: VaultConfig = {
        enabled: true,
        salt: encodeSalt(salt),
        iterations: DEFAULT_KDF_ITERATIONS,
        verifier,
      };
      await saveSessionKey(await exportKey(key));
      try {
        await this.photos.prepareEncryption(key, salt, DEFAULT_KDF_ITERATIONS);
        await saveVaultConfig(config);
        await this.db.transaction("rw", this.db.records, this.db.photos, async () => { await this.db.records.bulkPut(encryptedRows); await this.photos.finalizeMode(true); });
      } catch (error) {
        await saveVaultConfig(current);
        await this.photos.finalizeMode(false);
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
      await this.photos.preparePlaintext();
      try {
        await saveVaultConfig({ enabled: false });
        await this.db.transaction("rw", this.db.records, this.db.photos, async () => { await this.db.records.bulkPut(plainRows); await this.photos.finalizeMode(false); });
      }
      catch (error) {
        await saveVaultConfig(config);
        await this.photos.finalizeMode(true);
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
    data = normalizeActionRecordData(kind, data) as RecordValue;
    if (!config.enabled) {
      if (this.compactPhotos) data = await this.photos.compact(kind, data);
      return { pk: recordKey(kind, id), kind, id, data, ...(this.compactPhotos ? { photosVersion: 1 as const } : {}), updatedAt: Date.now() };
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
    data = normalizeActionRecordData(kind, data) as RecordValue;
    if (this.compactPhotos) data = await this.photos.compact(kind, data);
    const encrypted = await encryptJsonWithKey(data, key, salt, iterations);
    return { pk: recordKey(kind, id), kind, id, encrypted, ...(this.compactPhotos ? { photosVersion: 1 as const } : {}), updatedAt: Date.now() };
  }

  private async decode<T extends RecordValue>(row: StoredRecord, expand = !this.compactPhotos): Promise<T> {
    if (row.data !== undefined) {
      const data = normalizeActionRecordData(row.kind, row.data) as T;
      return expand ? this.photos.expand(row.kind, data) : data;
    }
    if (!row.encrypted) throw new Error("Invalid DeepRole record");
    const rawKey = await getSessionKey();
    if (!rawKey) throw new VaultLockedError();
    const data = normalizeActionRecordData(row.kind, await decryptJsonWithKey<T>(row.encrypted as EncryptedEnvelope, await importKey(rawKey))) as T;
    return expand ? this.photos.expand(row.kind, data) : data;
  }
}

export const repository = new DeepRoleRepository(database, true);
