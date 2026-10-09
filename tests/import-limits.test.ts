import { describe, expect, it } from "vitest";
import { importFileTooLarge } from "../src/core/import-limits";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { parseBackup } from "../src/storage/backup";
import { sceneText } from "../src/core/scene-i18n";
import { translate } from "../src/core/i18n";
import { exportText } from "../src/core/export-i18n";

describe("portable image-heavy imports", () => {
  it("accepts larger worlds and backups without an application size quota", () => {
    expect(importFileTooLarge(11_000_000, "world")).toBe(false);
    expect(importFileTooLarge(51_000_000, "backup")).toBe(false);
    expect(importFileTooLarge(1_000_000_000, "world")).toBe(false);
    expect(importFileTooLarge(2_000_000_000, "backup")).toBe(false);
    expect(importFileTooLarge(Number.POSITIVE_INFINITY, "backup")).toBe(true);
  });
  it("parses a valid full backup larger than the old 50 MB ceiling", async () => {
    const payload = { format: "deeprole-backup", version: 1, exportedAt: new Date().toISOString(), records: [], settings: DEFAULT_SETTINGS };
    const text = JSON.stringify(payload) + " ".repeat(51_000_000);
    expect(new Blob([text]).size).toBeGreaterThan(50_000_000);
    expect((await parseBackup(text)).records).toEqual([]);
  }, 20_000);
  it.each(["ru", "en"] as const)("has no outdated capacity errors in %s", locale => {
    expect(sceneText(locale, "worldTooLarge")).not.toMatch(/100|200/);
    expect(translate(locale, "backupTooLarge")).not.toMatch(/100|200/);
    expect(exportText(locale, "worldTooLarge")).not.toMatch(/100|200/);
    expect(exportText(locale, "backupTooLarge")).not.toMatch(/100|200/);
  });
});
