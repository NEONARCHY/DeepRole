import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemoryEntry } from "../src/core/types";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository, VaultLockedError } from "../src/storage/repository";
import { browser } from "wxt/browser";
import { getVaultConfig, getSessionKey } from "../src/storage/settings";

function entry(id: string): MemoryEntry {
  return { id, bookId: null, title: id, content: `content ${id}`, keywords: [], activation: "smart", priority: "normal", enabled: true, source: { type: "manual" }, createdAt: 1, updatedAt: 1 };
}

describe("memory repository and vault", () => {
  const databases: DeepRoleDatabase[] = [];
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(databases.map((db) => db.delete()));
    databases.length = 0;
  });

  function createRepository() {
    const db = new DeepRoleDatabase(`deeprole-test-${crypto.randomUUID()}`);
    databases.push(db);
    return { db, repo: new DeepRoleRepository(db) };
  }

  it("starts with a completely empty user library", async () => {
    const { repo } = createRepository();
    expect(await repo.rawRecords()).toEqual([]);
  });

  it("creates, renames, deletes and clears individual record kinds", async () => {
    const { repo } = createRepository();
    await repo.put("entry", entry("one"));
    await repo.put("entry", { ...entry("one"), title: "Renamed", updatedAt: 2 });
    await repo.put("entry", entry("two"));
    expect((await repo.get<MemoryEntry>("entry", "one"))?.title).toBe("Renamed");
    await repo.delete("entry", "one");
    expect(await repo.list<MemoryEntry>("entry")).toHaveLength(1);
    await repo.clearKind("entry");
    expect(await repo.list<MemoryEntry>("entry")).toEqual([]);
  });

  it("encrypts records at rest and unlocks them only for the browser session", async () => {
    const { db, repo } = createRepository();
    await repo.put("entry", entry("secret"));
    await repo.enableVault("vault password");
    const stored = await db.records.toArray();
    expect(stored[0]?.data).toBeUndefined();
    expect(stored[0]?.encrypted?.ciphertext).toBeTruthy();
    await repo.lockVault();
    await expect(repo.list("entry")).rejects.toBeInstanceOf(VaultLockedError);
    await repo.unlockVault("vault password");
    expect((await repo.list<MemoryEntry>("entry"))[0]?.content).toBe("content secret");
  });

  it("does not return an apparently usable empty library while the vault is locked", async () => {
    const { repo } = createRepository();
    await repo.enableVault("password"); await repo.lockVault();
    await expect(repo.rawRecords()).rejects.toBeInstanceOf(VaultLockedError);
    await expect(repo.list("entry")).rejects.toBeInstanceOf(VaultLockedError);
    await expect(repo.get("entry", "missing")).rejects.toBeInstanceOf(VaultLockedError);
  });

  it("refuses to enable or unlock a vault when session storage is unavailable", async () => {
    const { db, repo } = createRepository(); await repo.put("entry", entry("safe"));
    const storage = browser.storage as { -readonly [K in keyof typeof browser.storage]?: (typeof browser.storage)[K] };
    const session = storage.session;
    try {
      delete storage.session;
      await expect(repo.enableVault("password")).rejects.toThrow("Session storage unavailable");
      expect((await getVaultConfig()).enabled).toBe(false);
      expect((await db.records.toArray())[0]?.data).toBeDefined();
      storage.session = session;
      await repo.enableVault("password"); await repo.lockVault();
      delete storage.session;
      await expect(repo.unlockVault("password")).rejects.toThrow("Session storage unavailable");
      expect(await repo.isLocked()).toBe(true);
      expect((await db.records.toArray())[0]?.data).toBeUndefined();
    } finally { storage.session = session; }
  });

  for (const direction of ["enable", "disable"] as const) {
    it(`keeps a concurrent edit and new record while ${direction} runs in another window`, async () => {
      const { db, repo } = createRepository();
      const otherWindow = new DeepRoleRepository(db);
      await repo.put("entry", entry("existing"));
      if (direction === "disable") await repo.enableVault("password");
      let release!: () => void;
      let captured!: () => void;
      const ready = new Promise<void>((resolve) => { captured = resolve; });
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const original = db.records.toArray.bind(db.records);
      vi.spyOn(db.records, "toArray").mockImplementationOnce(() => original().then(async (rows) => {
        captured(); await gate; return rows;
      }));
      const transition = direction === "enable" ? repo.enableVault("password") : repo.disableVault();
      await ready;
      const edit = otherWindow.put("entry", { ...entry("existing"), content: "Newer approved text", updatedAt: 2 });
      const addition = otherWindow.put("entry", entry("added"));
      // Give an uncoordinated writer enough time to finish before migration.
      // A coordinated writer waits until release, then commits in the new format.
      await new Promise((resolve) => setTimeout(resolve, 30));
      release(); await Promise.all([transition, edit, addition]);
      expect((await repo.get<MemoryEntry>("entry", "existing"))?.content).toBe("Newer approved text");
      expect(await repo.get("entry", "added")).not.toBeNull();
      expect((await original()).every((row) => direction === "enable" ? row.data === undefined && !!row.encrypted : row.data !== undefined && !row.encrypted)).toBe(true);
    });
  }

  it("does not claim encryption succeeded when storing the session key fails", async () => {
    const { db, repo } = createRepository();
    await repo.put("entry", entry("safe"));
    vi.spyOn(browser.storage.session, "set").mockRejectedValueOnce(new Error("session-unavailable"));
    await expect(repo.enableVault("password")).rejects.toThrow("session-unavailable");
    expect((await getVaultConfig()).enabled).toBe(false);
    expect((await db.records.toArray())[0]?.data).toBeDefined();
  });

  it("rolls back vault settings when the encrypted transaction fails", async () => {
    const { db, repo } = createRepository();
    await repo.put("entry", entry("safe"));
    vi.spyOn(db.records, "bulkPut").mockRejectedValueOnce(new Error("idb-unavailable"));
    await expect(repo.enableVault("password")).rejects.toThrow("idb-unavailable");
    expect((await getVaultConfig()).enabled).toBe(false);
    expect(await getSessionKey()).toBeNull();
    expect(await repo.get("entry", "safe")).toEqual(entry("safe"));
  });

  it("restores encrypted records if disabling the vault cannot save its settings", async () => {
    const { db, repo } = createRepository();
    await repo.put("entry", entry("safe")); await repo.enableVault("password");
    const original = browser.storage.local.set.bind(browser.storage.local);
    vi.spyOn(browser.storage.local, "set").mockImplementationOnce(async (value) => { if ("deeprole_vault" in value) throw new Error("settings-unavailable"); await original(value); });
    await expect(repo.disableVault()).rejects.toThrow("settings-unavailable");
    expect((await getVaultConfig()).enabled).toBe(true);
    expect((await db.records.toArray())[0]?.data).toBeUndefined();
    expect(await repo.get("entry", "safe")).toEqual(entry("safe"));
  });

  it("does not deadlock a committed write when fallback notification reads the library", async () => {
    const { repo } = createRepository();
    vi.spyOn(browser.storage.local, "set").mockRejectedValueOnce(new Error("notification-unavailable"));
    const read = vi.mocked(browser.runtime.sendMessage).mockImplementationOnce(() => repo.rawRecords() as any);
    await repo.put("entry", entry("safe"));
    expect(read).toHaveBeenCalled();
    expect(await repo.get("entry", "safe")).toEqual(entry("safe"));
  });
});
