import { isPhotoAddress, isPhotoData, mapRecordPhotos } from "../core/photo-assets";
import { portablePhotoId } from "../core/portable-photos";
import type { DeepRoleDatabase, StoredPhoto } from "./database";
import { decryptJsonWithKey, encryptJsonWithKey, importKey, decodeSalt } from "./crypto";
import { getSessionKey, getVaultConfig } from "./settings";

/** No unbounded in-memory image cache. The caller releases each requested image. */
export class PhotoAssets {
  constructor(private readonly db: DeepRoleDatabase) {}
  async store(image: string,expectedId?: string): Promise<string> {
    if (isPhotoAddress(image)) { if (!await this.db.photos.where("id").equals(image).count()) throw new Error("photo-missing"); return image; }
    if (!isPhotoData(image)) throw new Error("photo-invalid");
    const id = await portablePhotoId(image);
    if (expectedId && id !== expectedId) throw Error("photo-invalid");

    if (await this.db.photos.where("id").equals(id).count()) return id;
    const config = await getVaultConfig();
    let row: StoredPhoto;
    if (config.enabled) {
      const raw = await getSessionKey(); if (!raw || !config.salt || !config.iterations) throw new Error("vault-locked");
      row = { id, encrypted: await encryptJsonWithKey(image, await importKey(raw), decodeSalt(config.salt), config.iterations) };
    } else row = { id, data: new Blob([image], { type: "text/plain" }) };
    await this.db.photos.put(row); return id;
  }
  async read(id: string): Promise<string> {
    if (!isPhotoAddress(id)) { if (isPhotoData(id)) return id; throw new Error("photo-invalid"); }
    const config = await getVaultConfig();
    const raw = config.enabled ? await getSessionKey() : null;
    if (config.enabled && !raw) throw new Error("vault-locked");
    const row = await this.db.photos.get(id); if (!row) throw new Error("photo-missing");
    if (config.enabled) { if (!raw || !row.encrypted) throw new Error("vault-locked"); return decryptJsonWithKey<string>(row.encrypted, await importKey(raw)); }
    if (!row.data) throw new Error("photo-missing"); return row.data.text();
  }
  compact<T>(kind: string, data: T) { return mapRecordPhotos(kind, data, image => this.store(image)); }
  expand<T>(kind: string, data: T) { return mapRecordPhotos(kind, data, image => this.read(image)); }

  /** Stage the alternate representation without discarding the committed one.
   * A failed/aborted switch can be retried; one photo is encoded at a time. */
  async prepareEncryption(key: CryptoKey, salt: Uint8Array, iterations: number): Promise<void> {
    for (const id of await this.db.photos.toCollection().primaryKeys()) {
      const row = await this.db.photos.get(id); if (!row?.data) throw new Error("photo-missing");
      const encrypted = await encryptJsonWithKey(await row.data.text(), key, salt, iterations);
      await this.db.photos.put({ ...row, encrypted });
    }
  }
  async preparePlaintext(): Promise<void> {
    for (const id of await this.db.photos.toCollection().primaryKeys()) {
      const row = await this.db.photos.get(id); if (!row) continue;
      const data = new Blob([await this.read(id)], { type: "text/plain" });
      await this.db.photos.put({ ...row, data });
    }
  }
  async finalizeMode(encrypted: boolean): Promise<void> {
    await this.db.transaction("rw", this.db.photos, () => this.db.photos.toCollection().modify(row => {
      if (encrypted) { if (!row.encrypted) throw new Error("photo-missing"); delete row.data; }
      else { if (!row.data) throw new Error("photo-missing"); delete row.encrypted; }
    }));
  }
}
