import Dexie, { type EntityTable } from "dexie";
import type { EncryptedEnvelope, RecordKind } from "../core/types";

export interface StoredRecord {
  photosVersion?: 1;
  pk: string;
  kind: RecordKind;
  id: string;
  data?: unknown;
  encrypted?: EncryptedEnvelope;
  updatedAt: number;
}

export class DeepRoleDatabase extends Dexie {
  records!: EntityTable<StoredRecord, "pk">;
  photos!: EntityTable<StoredPhoto, "id">;

  constructor(name = "deeprole") {
    super(name);
    this.version(1).stores({
      records: "&pk, kind, id, updatedAt",
    });
    this.version(2).stores({ records: "&pk, kind, id, updatedAt", photos: "&id" });
  }
}

export interface StoredPhoto { id: string; data?: Blob; encrypted?: EncryptedEnvelope }

export const database = new DeepRoleDatabase();

export function recordKey(kind: RecordKind, id: string): string {
  return `${kind}:${id}`;
}
