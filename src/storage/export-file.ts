import { createBackupContent } from "./backup";
import { createWorldContent } from "./worlds";
import { repository, type DeepRoleRepository } from "./repository";
import { packPortablePhotos } from "../core/portable-photos";
import { jsonFileBlob } from "../core/json-file";
import { encryptJson } from "./crypto";
import type { BackupPayload } from "../core/types";
import type { WorldPackage } from "./worlds";
export type ExportStage = "records" | "photos" | "file";
export async function createExportFile(scope: "world" | "backup",worldId: string,password?: string,repo: DeepRoleRepository = repository,onProgress?: (stage: ExportStage,done?: number,total?: number) => void): Promise<Blob> {
  onProgress?.("records");
  const content = scope === "world" ? await createWorldContent(worldId,repo,false) : await createBackupContent(repo,false);
  return portableContentFile(content,password,repo,onProgress);
}
/** Also used by individual character/template exports after their scope is selected. */
export async function portableContentFile(content: WorldPackage | BackupPayload,password?: string,repo: DeepRoleRepository = repository,onProgress?: (stage: ExportStage,done?: number,total?: number) => void): Promise<Blob> {
  const packed = await packPortablePhotos(content.records,id=>repo.readPhoto(id),(done,total)=>onProgress?.("photos",done,total));
  const value = packed.photos.length ? { ...content, version:content.format === "deeprole-world" ? 2 : 5, ...packed } : content;
  onProgress?.("file");
  const protectedValue = password ? await encryptJson(value,password) : value;
  return jsonFileBlob(protectedValue);
}
