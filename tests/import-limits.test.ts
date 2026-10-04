import { describe, expect, it } from "vitest";
import { importFileTooLarge, MAX_BACKUP_CIPHERTEXT_BYTES, MAX_BACKUP_FILE_BYTES, MAX_WORLD_FILE_BYTES } from "../src/core/import-limits";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { parseBackup } from "../src/storage/backup";
import { sceneText } from "../src/core/scene-i18n";
import { translate } from "../src/core/i18n";
import { exportText } from "../src/core/export-i18n";

describe("portable image-heavy imports", () => {
  it("accepts larger worlds and backups while retaining finite limits", () => {
    expect(MAX_WORLD_FILE_BYTES).toBe(100_000_000);
    expect(MAX_BACKUP_FILE_BYTES).toBe(200_000_000);
    expect(MAX_BACKUP_CIPHERTEXT_BYTES).toBeGreaterThan(50_000_000);
    expect(importFileTooLarge(11_000_000, "world")).toBe(false);
    expect(importFileTooLarge(51_000_000, "backup")).toBe(false);
    expect(importFileTooLarge(MAX_WORLD_FILE_BYTES + 1, "world")).toBe(true);
    expect(importFileTooLarge(MAX_BACKUP_FILE_BYTES + 1, "backup")).toBe(true);
    expect(importFileTooLarge(Number.POSITIVE_INFINITY, "backup")).toBe(true);
  });
  it("parses a valid full backup larger than the old 50 MB ceiling", async () => {
    const payload = { format: "deeprole-backup", version: 1, exportedAt: new Date().toISOString(), records: [], settings: DEFAULT_SETTINGS };
    const text = JSON.stringify(payload) + " ".repeat(51_000_000);
    expect(new Blob([text]).size).toBeGreaterThan(50_000_000);
    expect((await parseBackup(text)).records).toEqual([]);
  }, 20_000);
  it.each(["ru", "en"] as const)("explains the new limit in %s", locale => {
    expect(sceneText(locale, "worldTooLarge")).toContain("100");
    expect(translate(locale, "backupTooLarge")).toContain("200");
    expect(exportText(locale, "worldTooLarge")).toContain("100");
    expect(exportText(locale, "backupTooLarge")).toContain("200");
  });
});
