import Dexie, { type EntityTable } from "dexie";
import type { EncryptedEnvelope, RecordKind } from "../core/types";

export interface StoredRecord {
  pk: string;
  kind: RecordKind;
  id: string;
  data?: unknown;
  encrypted?: EncryptedEnvelope;
  updatedAt: number;
}

export class DeepRoleDatabase extends Dexie {
  records!: EntityTable<StoredRecord, "pk">;

  constructor(name = "deeprole") {
    super(name);
    this.version(1).stores({
      records: "&pk, kind, id, updatedAt",
    });
  }
}

export const database = new DeepRoleDatabase();

export function recordKey(kind: RecordKind, id: string): string {
  return `${kind}:${id}`;
}
