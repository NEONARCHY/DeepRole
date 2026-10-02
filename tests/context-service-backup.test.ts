import { afterEach, describe, expect, it, vi } from "vitest";
import { formatMemoryContext, injectContextIntoPrompt } from "../src/core/context";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { handoffPrompt, loreDraftPrompt, memoryAnalysisPrompt, parseServiceData, SERVICE_END, SERVICE_START } from "../src/core/service-protocol";
import type { BackupPayload, ContextSelection, MemoryEntry } from "../src/core/types";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
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

  it("exports and reads a password-protected file", async () => {
    const source = repo();
    await source.put("entry", record);
    const encrypted = await createBackup("backup password", source);
    const parsed = await parseBackup(JSON.stringify(encrypted), "backup password");
    expect(parsed.records[0]?.id).toBe("hero");
    await expect(parseBackup(JSON.stringify(encrypted), "wrong")).rejects.toThrow();
  });
});
