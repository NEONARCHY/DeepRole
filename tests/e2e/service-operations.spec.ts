import { expect, test, type Page } from "@playwright/test";

async function open(page: Page, dbName: string) {
 await page.goto("/tests/fixtures/deepseek.html"); await page.addScriptTag({ url: "/tests/fixtures/portrait-storage.js" });
 await page.evaluate(async dbName => {
  const session = new Map<string, unknown>();
  (window as any).chrome.storage.session = { get: async (key: string) => ({ [key]: session.get(key) }), set: async (values: Record<string, unknown>) => { for (const [key, value] of Object.entries(values)) session.set(key, value); }, remove: async (key: string) => { session.delete(key); } };
  const dbUrl = "/src/storage/database.ts", repoUrl = "/src/storage/repository.ts", auditUrl = "/src/storage/service-operations.ts";
  const { DeepRoleDatabase } = await import(dbUrl), { DeepRoleRepository } = await import(repoUrl), audit = await import(auditUrl);
  const db = new DeepRoleDatabase(dbName); (window as any).serviceFixture = { db, repo: new DeepRoleRepository(db), ...audit };
 }, dbName);
}
test("service audit survives two tabs, reload, encrypted backup and explicit world purge", async ({ page, context }) => {
 const name = "service-audit-browser-" + crypto.randomUUID(); let sibling: Page | undefined;
 await open(page, name);
 try {
  await page.evaluate(async () => {
   const f = (window as any).serviceFixture, fixtureUrl = "/tests/fixtures/cast-data.ts"; const { castRecords } = await import(fixtureUrl); await f.repo.mergeRecords(castRecords());
  });
  sibling = await context.newPage(); await open(sibling, name);
  const begin = (p: Page) => p.evaluate(() => { const f = (window as any).serviceFixture; return f.beginServiceOperation({ id: "field_browser", worldId: "w", sourceChatId: "game", mode: "history", fieldScope: "profile", createdAt: 1 }, f.repo); });
  const [a, b] = await Promise.all([begin(page), begin(sibling)]); expect(a).toEqual(b);
  await sibling.evaluate(async () => { const f = (window as any).serviceFixture; await f.updateServiceOperation("field_browser", { phase: "result", workerChatId: "owned", cleanup: "done", error: null, at: 2 }, f.repo); await f.db.close(); });
  await sibling.close(); sibling = undefined;
  await page.evaluate(() => (window as any).serviceFixture.db.close()); await open(page, name);
  const result = await page.evaluate(async () => {
   const f = (window as any).serviceFixture, backupUrl = "/src/storage/backup.ts", worldsUrl = "/src/storage/worlds.ts";
   const { createBackup, parseBackup, restoreBackup } = await import(backupUrl), { removeWorld, exportWorld } = await import(worldsUrl);
   const records = await f.repo.list("service"); await f.repo.enableVault("synthetic-password");
   const row = await f.db.records.get("service:field_browser"); await f.repo.lockVault(); let locked = false;
   try { await f.repo.get("service", "field_browser"); } catch { locked = true; }
   await f.repo.unlockVault("synthetic-password");
   const backup = await parseBackup(JSON.stringify(await createBackup("synthetic-backup", f.repo)), "synthetic-backup");
   const portable = await exportWorld("w", f.repo); await restoreBackup(backup, "replace", f.repo); const restored = await f.repo.get("service", "field_browser");
   await removeWorld("w", f.repo, { deleteLore: true }); const late = await f.updateServiceOperation("field_browser", { phase: "result", workerChatId: "owned", cleanup: "done", error: null, at: 3 }, f.repo);
   return { count: records.length, audit: records[0], encrypted: !!row.encrypted && row.data === undefined, locked, version: backup.version, restored: restored.origin, portable: portable.records.some((r: any) => r.kind === "service"), late, kept: (await f.repo.list("service")).length };
  });
  expect(result).toMatchObject({ count: 1, audit: { purpose: "service", phase: "result", cleanup: "done" }, encrypted: true, locked: true, version: 3, restored: "restored", portable: false, late: null, kept: 0 });
 } finally {
  if (sibling) { await sibling.evaluate(() => (window as any).serviceFixture?.db.close()); await sibling.close(); }
  await page.evaluate(async () => { const f = (window as any).serviceFixture; if (f) await f.db.delete(); });
 }
});

for (const locale of ["ru", "en"]) test(`isolated field keeps a text-free service audit after acknowledgement in ${locale}`, async ({ page }) => {
 await page.goto("/tests/fixtures/character-queue.html?locale=" + locale);
 const field = page.locator('[data-character-text-field="appearance"]');
 await field.locator(".dr-character-generate").click();
 await field.getByRole("button", { name: locale === "ru" ? "Предложить новое описание" : "Suggest a new description", exact: true }).click();
 await expect.poll(() => page.evaluate(() => (window as any).activeField)).toBe("appearance");
 const read = () => page.evaluate(async () => { const url = "/src/storage/repository.ts"; const { repository } = await import(url); return repository.list("service"); });
 expect(await read()).toMatchObject([{ phase: "dispatching", cleanup: "pending", origin: "local" }]);
 await page.getByRole("button", { name: "Finish reply", exact: true }).click();
 await expect(field.getByRole("textbox")).toHaveValue("Prepared appearance");
 await expect.poll(async () => (await read())[0]?.cleanup).toBe("done");
 const values = await read(); expect(values).toMatchObject([{ phase: "result", cleanup: "done", purpose: "service" }]);
 const metadata = JSON.stringify(values); for (const privateText of ["Mira", "Prepared appearance", "waits by the gate", "https://"]) expect(metadata).not.toContain(privateText);
 expect(await page.evaluate(() => ({ draft: (window as any).mainDraft, saved: (window as any).queueSaved, events: (window as any).queueEvents.filter((v: string) => /^(create|remove):/u.test(v)) }))).toEqual({ draft: "Unsent main chat draft", saved: 0, events: ["create:2", "remove:2"] });
});

test("locked service outcome survives loss of every session and drains from two tabs without resending", async ({ page, context }) => {
 const dbName = "service-outbox-browser-" + crypto.randomUUID(); let sibling: Page | undefined;
 await open(page, dbName);
 try {
  const id = await page.evaluate(async () => {
   const f = (window as any).serviceFixture, fixtureUrl = "/tests/fixtures/cast-data.ts", outboxUrl = "/src/storage/service-outbox.ts";
   const { castRecords } = await import(fixtureUrl), { ServiceAuditOutbox } = await import(outboxUrl); await f.repo.mergeRecords(castRecords());
   const id = "field_" + crypto.randomUUID();
   await f.beginServiceOperation({ id, worldId: "w", sourceChatId: "game", mode: "suggest", fieldScope: "profile", createdAt: 1 }, f.repo);
   await f.updateServiceOperation(id, { phase: "dispatching", workerChatId: "owned", cleanup: "pending", error: null, at: 2 }, f.repo);
   await f.repo.enableVault("synthetic-password"); await f.repo.lockVault();
   const result = await new ServiceAuditOutbox(f.repo).record(id, { phase: "failed", workerChatId: "owned", cleanup: "done", error: "vault-locked", at: 3 });
   if (result !== "queued") throw new Error("outcome-not-queued");
   const stored = JSON.stringify(await (window as any).chrome.storage.local.get());
   if (["sourceChatId", "workerChatId", "owned", "https://"].some(text => stored.includes(text))) throw new Error("private-outbox-data");
   await f.db.close(); return id;
  });
  // Recreate both JS contexts/session shims: only the IndexedDB journal and opaque
  // local queue remain. No field worker, composer, model or native chat is opened.
  await open(page, dbName); sibling = await context.newPage(); await open(sibling, dbName);
  for (const target of [page, sibling]) await target.evaluate(() => (window as any).serviceFixture.repo.unlockVault("synthetic-password"));
  const drain = (target: Page) => target.evaluate(async () => { const url = "/src/storage/service-outbox.ts"; const { ServiceAuditOutbox } = await import(url); return new ServiceAuditOutbox((window as any).serviceFixture.repo).flush(); });
  const reports = await Promise.all([drain(page), drain(sibling)]); expect(reports.reduce((n, r) => n + r.recorded, 0)).toBe(1);
  expect(await page.evaluate(async id => { const f = (window as any).serviceFixture; return f.repo.get("service", id); }, id)).toMatchObject({ phase: "failed", cleanup: "done", error: "vault-locked", workerChatId: "owned" });
  expect(await page.evaluate(async () => Object.keys(await (window as any).chrome.storage.local.get()).filter(k => k.startsWith("deeprole_service_pending:")).length)).toBe(0);
 } finally {
  if (sibling) { await sibling.evaluate(() => (window as any).serviceFixture?.db.close()); await sibling.close(); }
  await page.evaluate(async () => { const f = (window as any).serviceFixture; if (f) await f.db.delete(); });
 }
});

test("an acknowledged field outcome drains after repository recovery without creating another chat", async ({ page }) => {
 await page.goto("/tests/fixtures/character-queue.html");
 const field = page.locator('[data-character-text-field="appearance"]'); await field.locator(".dr-character-generate").click(); await field.getByRole("button", { name: "Suggest a new description", exact: true }).click();
 await expect.poll(() => page.evaluate(() => (window as any).activeField)).toBe("appearance");
 await page.evaluate(async () => {
  const url = "/src/storage/repository.ts"; const { repository } = await import(url); const update = repository.updateRecords.bind(repository);
  (window as any).restoreAuditRepository = () => { repository.updateRecords = update; }; repository.updateRecords = async () => { throw new Error("synthetic-transient"); };
 });
 await page.getByRole("button", { name: "Finish reply", exact: true }).click(); await expect(field.getByRole("textbox")).toHaveValue("Prepared appearance");
 const result = await page.evaluate(async () => {
  const url = "/src/storage/repository.ts", outboxUrl = "/src/storage/service-outbox.ts"; const { repository } = await import(url), { ServiceAuditOutbox } = await import(outboxUrl);
  const pending = Object.entries(await (window as any).chrome.storage.local.get()).filter(([key]) => key.startsWith("deeprole_service_pending:"));
  (window as any).restoreAuditRepository(); const report = await new ServiceAuditOutbox(repository).flush();
  return { pending, report, audit: (await repository.list("service"))[0], events: (window as any).queueEvents.filter((v: string) => /^(create|remove):/u.test(v)), saved: (window as any).queueSaved, draft: (window as any).mainDraft };
 });
 expect(result.pending).toHaveLength(1); expect(JSON.stringify(result.pending)).not.toMatch(/Mira|Prepared appearance|workerChatId|worldId|https:\/\//u);
 expect(result).toMatchObject({ report: { recorded: 1, pending: 0 }, audit: { phase: "result", cleanup: "done" }, events: ["create:2", "remove:2"], saved: 0, draft: "Unsent main chat draft" });
});
