import { afterEach, describe, expect, it, vi } from "vitest";
import { formatMemoryContext, injectContextIntoPrompt } from "../src/core/context";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { handoffPrompt, loreDraftPrompt, memoryAnalysisPrompt, parseServiceData, SERVICE_END, SERVICE_START } from "../src/core/service-protocol";
import type { BackupPayload, ContextSelection, MemoryEntry } from "../src/core/types";
import { createBackup, parseBackup, parseBackupData, restoreBackup } from "../src/storage/backup";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { saveSettings } from "../src/storage/settings";

const record: MemoryEntry = {
  id: "hero",
  bookId: null,
  title: "Hero",
  content: "Mira fears deep water.",
  keywords: ["Mira"],
  activation: "always",
  priority: "normal",
  enabled: true,
  source: { type: "manual" },
  createdAt: 1,
  updatedAt: 1,
};

describe("formatted context", () => {
  it("keeps memory separate from the user's visible message", () => {
    const selection: ContextSelection = { entries: [{ entry: record, score: 100, reasons: ["always"], estimatedTokens: 12, manuallySelected: false }], estimatedTokens: 12, omittedCount: 0 };
    const context = formatMemoryContext(selection);
    expect(context).toContain("<deeprole_context");
    expect(context).toContain("Hero: Mira fears deep water.");
    expect(injectContextIntoPrompt("Continue", context)).toContain("[User message]\nContinue");
  });

  it("returns no wrapper when there is no selected context", () => {
    expect(formatMemoryContext({ entries: [], estimatedTokens: 0, omittedCount: 0 })).toBe("");
    expect(injectContextIntoPrompt("Hello", "")).toBe("Hello");
  });
});

describe("DeepSeek-assisted service protocol", () => {
  it("builds explicit opt-in prompts", () => {
    expect(memoryAnalysisPrompt("Moonfall")).toContain("Moonfall");
    expect(handoffPrompt()).toContain(SERVICE_START);
  });

  it("asks for a visible explanation before its machine-readable proposals", () => {
    const prompt = memoryAnalysisPrompt("Moonfall", [], "ru");
    expect(prompt).toContain("one brief, user-facing summary in Russian");
    expect(prompt).toContain("nothing is saved until they approve it");
    expect(loreDraftPrompt("a quiet coastal village", "ru")).toContain("how many proposals you prepared");
  });

  it("sanitizes memory suggestions before showing confirmation", () => {
    const text = `${SERVICE_START}{"type":"memory-suggestions","items":[{"title":" Oath ","content":" Never lie ","keywords":["oath","truth"],"activation":"unknown","priority":"high"},{"title":"","content":"bad"}]}${SERVICE_END}`;
    const parsed = parseServiceData(text);
    expect(parsed?.type).toBe("memory-suggestions");
    if (parsed?.type === "memory-suggestions") {
      expect(parsed.items).toHaveLength(1);
      expect(parsed.items[0]).toMatchObject({ title: "Oath", activation: "smart", priority: "high", selected: true });
    }
  });

  it("accepts handoffs and rejects malformed model output", () => {
    expect(parseServiceData(`${SERVICE_START}{"type":"handoff","title":"Arc","summary":"At the gate"}${SERVICE_END}`)).toEqual({ type: "handoff", title: "Arc", summary: "At the gate" });
    expect(parseServiceData(`${SERVICE_START}{oops${SERVICE_END}`)).toBeNull();
  });

  it("accepts the full handoff limit but never silently truncates an oversized summary", () => {
    const summary = "A".repeat(30000);
    const wrap = (value: unknown) => `${SERVICE_START}${JSON.stringify(value)}${SERVICE_END}`;
    expect(parseServiceData(wrap({ type: "handoff", title: "North Tower", summary }))).toEqual({ type: "handoff", title: "North Tower", summary });
    expect(parseServiceData(wrap({ type: "handoff", title: "North Tower", summary: summary + "B" }))).toBeNull();
    expect(parseServiceData(wrap({ type: "handoff", title: "T".repeat(241), summary: "Scene" }))).toBeNull();
    expect(parseServiceData(wrap({ type: "handoff", title: "T".repeat(240), summary: "Scene" }))).toMatchObject({ title: "T".repeat(240) });
  });
});

describe("portable backups", () => {
  const databases: DeepRoleDatabase[] = [];
  afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(databases.map((db) => db.delete()));
    databases.length = 0;
  });

  function repo() {
    const db = new DeepRoleDatabase(`deeprole-backup-${crypto.randomUUID()}`);
    databases.push(db);
    return new DeepRoleRepository(db);
  }

  it("exports plain JSON and restores with replace mode", async () => {
    const source = repo();
    const target = repo();
    await saveSettings({ ...DEFAULT_SETTINGS, contextBudget: 3500 });
    await source.put("entry", record);
    await target.put("entry", { ...record, id: "old", title: "Old" });
    const backup = await createBackup(undefined, source) as BackupPayload;
    const parsed = await parseBackup(JSON.stringify(backup));
    await restoreBackup(parsed, "replace", target);
    expect((await target.list<MemoryEntry>("entry")).map((item) => item.id)).toEqual(["hero"]);
  });

  it("accepts an already parsed full backup above the world limit without altering records", async () => {
    const source = repo(), target = repo();
    await saveSettings({ ...DEFAULT_SETTINGS, locale: "ru", pinPortraitLeft: true });
    await source.put("entry", { ...record, content: "  Mira keeps the key.\n\tОригинальный текст.  " });
    const exported = await createBackup(undefined, source);
    const data = JSON.parse(JSON.stringify(exported));
    const before = structuredClone(data);
    const parsed = await parseBackupData(data, 150_000_000);
    expect(parsed.records).toEqual(before.records);
    expect(parsed.settings.pinPortraitLeft).toBe(true);
    expect(data).toEqual(before);
    await restoreBackup(parsed, "replace", target);
    expect(await target.rawRecords()).toEqual(await source.rawRecords());
  });

  it("decrypts an already parsed backup with the same password contract", async () => {
    const source = repo(); await source.put("entry", record);
    const data = JSON.parse(JSON.stringify(await createBackup("file password", source)));
    const bytes = new Blob([JSON.stringify(data)]).size;
    expect((await parseBackupData(data, bytes, "file password")).records[0]?.data).toEqual(record);
    await expect(parseBackupData(data, bytes, "wrong")).rejects.toThrow();
  });

  it.each([Infinity, NaN, -1])("rejects invalid file size %s before adopting parsed data", async bytes => {
    const source = repo(); await source.put("entry", record);
    const data = await createBackup(undefined, source);
    await expect(parseBackupData(data, bytes)).rejects.toThrow("backupTooLarge");
    expect(await source.get("entry", record.id)).toEqual(record);
  });

  it.each([null, [], { format: "deeprole-backup", records: [] }])("rejects malformed parsed backup %j", async data => {
    await expect(parseBackupData(data, 100)).rejects.toThrow("Invalid DeepRole backup");
  });

  it("exports and reads a password-protected file", async () => {
    const source = repo();
    await source.put("entry", record);
    const encrypted = await createBackup("backup password", source);
    const parsed = await parseBackup(JSON.stringify(encrypted), "backup password");
    expect(parsed.records[0]?.id).toBe("hero");
    await expect(parseBackup(JSON.stringify(encrypted), "wrong")).rejects.toThrow();
  });
});
