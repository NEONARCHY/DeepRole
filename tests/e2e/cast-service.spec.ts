import { expect, test, type Page } from "@playwright/test";

async function open(page: Page, name: string, seed = true) {
 await page.goto("/tests/fixtures/deepseek.html"); await page.addScriptTag({ url: "/tests/fixtures/portrait-storage.js" });
 await page.evaluate(async ({ name, seed }) => {
  const session = new Map<string, unknown>(), chrome = (window as any).chrome;
  chrome.storage.session = { get: async (key: string) => ({ [key]: session.get(key) }), set: async (values: Record<string, unknown>) => { for (const [key, value] of Object.entries(values)) session.set(key, value); }, remove: async (key: string) => { session.delete(key); } };
  const dbUrl = "/src/storage/database.ts", repoUrl = "/src/storage/repository.ts", castUrl = "/src/adapters/cast-coordinator.ts", fixtureUrl = "/tests/fixtures/cast-data.ts";
  const { DeepRoleDatabase } = await import(dbUrl), { DeepRoleRepository } = await import(repoUrl), { CastCoordinator } = await import(castUrl), fixture = await import(fixtureUrl);
  const db = new DeepRoleDatabase(name), repo = new DeepRoleRepository(db); if (seed) await repo.mergeRecords(fixture.castRecords());
  const events: string[] = [], tabs = new Map<number, any>(), runtime = { id: "fixture", getURL: (path: string) => "chrome-extension://fixture/" + path };
  const api = { storage: chrome.storage, runtime, tabs: { create: async (value: any) => { events.push("create:5"); const tab = { id: 5, ...value }; tabs.set(5, tab); return tab; }, get: async (id: number) => { if (!tabs.has(id)) throw new Error("missing"); return tabs.get(id); }, update: async (id: number, values: any) => { const tab = { ...tabs.get(id), ...values }; tabs.set(id, tab); return tab; }, remove: async (id: number) => { events.push("remove:" + id); tabs.delete(id); }, sendMessage: async () => { events.push("message"); return { ok: true }; } } };
  const coordinator = new CastCoordinator(repo, api), ui = { id: "fixture", url: runtime.getURL("sidepanel.html") };
  (window as any).castAudit = { db, repo, coordinator, events, tabs, fixture, run: (message: any, worker = false) => coordinator.handle(message, worker ? { id: "fixture", url: tabs.get(5)?.url, tab: { id: 5 } } : ui) };
 }, { name, seed });
}

for (const partial of [false, true]) test(`cast service ${partial ? "partial" : "complete"} audit survives reload and failed journal delivery`, async ({ page }) => {
 const name = "cast-audit-browser-" + crypto.randomUUID(); await open(page, name);
 try {
  const result = await page.evaluate(async partial => {
   const f = (window as any).castAudit, started = await f.run({ type: "DR_CAST", action: "start", worldId: "w", locale: "en" }); if (!started.ok) throw new Error(started.error);
   const id = started.job.id, initial = await f.repo.get("service", id), send = (message: any) => f.run({ type: "DR_CAST_WORKER", id, ...message }, true);
   await send({ action: "sent", step: 0 }); f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/chat/s/owned" }); await send({ action: "bound", chatId: "owned" });
   await send({ action: "reply", step: 0, chatId: "owned", raw: "received" }); await send({ action: "sent", step: 1 });
   await send({ action: "reply", step: 1, chatId: "owned", raw: JSON.stringify(f.fixture.castBatch(id, 0)) }); await send({ action: "sent", step: 2 });
   const update = f.repo.updateRecords.bind(f.repo); f.repo.updateRecords = (operation: any, scope: any, kinds: string[]) => kinds?.length === 1 && kinds[0] === "service" ? Promise.reject(new Error("synthetic-journal-failure")) : update(operation, scope, kinds);
   const raw = partial ? JSON.stringify({ ...f.fixture.castDraft(id), characters: [f.fixture.castDraft(id).characters[1]], partial: true }) : JSON.stringify(f.fixture.castBatch(id, 1));
   await send({ action: "reply", step: 2, chatId: "owned", raw }); f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/" }); await send({ action: "cleaned", chatId: "owned", ok: true });
   const pending = Object.entries(await (window as any).chrome.storage.local.get()).filter(([key]) => key.startsWith("deeprole_service_pending:"));
   const job = await f.repo.get("cast", id), entities = (await f.repo.list("entity")).length; await f.db.close();
   return { id, initial, pending, phase: job.phase, prepared: job.draft.characters.length, events: f.events, entities };
  }, partial);
  expect(result).toMatchObject({ initial: { operation: "cast-preparation", phase: "prepared", sourceChatId: null }, phase: partial ? "error" : "ready", prepared: 2, events: ["create:5", "remove:5"], entities: 0 });
  expect(result.pending).toHaveLength(1); expect(JSON.stringify(result.pending)).not.toMatch(/Leon|Mira|owned|worldId|chatId|sources|draft|https:\/\//u);
  await open(page, name, false);
  const restored = await page.evaluate(async id => { const f = (window as any).castAudit; await f.coordinator.reconcilePending(); return { audit: await f.repo.get("service", id), pending: Object.keys(await (window as any).chrome.storage.local.get()).filter(key => key.startsWith("deeprole_service_pending:")).length, events: f.events, entities: (await f.repo.list("entity")).length }; }, result.id);
  expect(restored).toMatchObject({ audit: { phase: partial ? "failed" : "result", error: partial ? "partial-reply" : null, cleanup: "done", workerChatId: "owned" }, pending: 0, events: [], entities: 0 });
 } finally { await page.evaluate(async () => { const f = (window as any).castAudit; if (f) await f.db.delete(); }); }
});

test("exact cast rejection reasons survive temporary chat and job deletion, then a reload", async ({ page }) => {
 const name = "cast-validation-browser-" + crypto.randomUUID(); await open(page, name);
 try {
  const before = await page.evaluate(async () => {
   const f = (window as any).castAudit, start = await f.run({ type: "DR_CAST", action: "start", worldId: "w", locale: "en" }), id = start.job.id;
   const send = (value: any) => f.run({ type: "DR_CAST_WORKER", id, ...value }, true);
   await send({ action: "sent", step: 0 }); f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/chat/s/owned" }); await send({ action: "bound", chatId: "owned" });
   await send({ action: "reply", step: 0, chatId: "owned", raw: "received" }); await send({ action: "sent", step: 1 });
   const first = f.fixture.castBatch(id, 0); first.characters[0].evidence[0].quote = "PRIVATE_INVALID_QUOTE";
   await send({ action: "reply", step: 1, chatId: "owned", raw: JSON.stringify(first) });
   const during = await f.repo.get("service", id); await send({ action: "sent", step: 1, repair: true });
   const second = f.fixture.castBatch(id, 0); second.present = ["PRIVATE_CHARACTER"];
   await send({ action: "reply", step: 1, repair: true, chatId: "owned", raw: JSON.stringify(second) });
   f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/" }); await send({ action: "cleaned", chatId: "owned", ok: true });
   await f.repo.delete("cast", id); const saved = await f.repo.get("service", id); await f.db.close(); return { id, during, saved, events: f.events };
  });
  expect(before).toMatchObject({ during: { phase: "dispatching", validation: { events: [{ repair: false }] } }, saved: { phase: "failed", error: "invalid-result", cleanup: "done", validation: { events: [{ repair: false }, { repair: true }] } }, events: ["create:5", "remove:5"] });
  await open(page, name, false);
  const after = await page.evaluate(async id => {
   const f = (window as any).castAudit; await f.coordinator.reconcilePending(); const storagePath = "/src/storage/service-diagnostics.ts", corePath = "/src/core/service-diagnostics.ts";
   const { readServiceDiagnostics } = await import(storagePath), { serviceDiagnosticReport } = await import(corePath);
   return { job: await f.repo.get("cast", id), saved: await f.repo.get("service", id), report: serviceDiagnosticReport(await readServiceDiagnostics(f.repo), Date.now()), events: f.events, entities: (await f.repo.list("entity")).length };
  }, before.id);
  expect(after).toMatchObject({ job: null, saved: before.saved, events: [], entities: 0 }); expect(after.report).not.toMatch(/PRIVATE|Leon|Mira|owned|worldId|ChatId|sources|"token"/u);
  const events = JSON.parse(after.report).result.journal.entries[0].validation.events;
  expect(events[0].issues[0].path).toBe("characters[0].evidence[0].quote"); expect(events[1].issues[0].path).toBe("present[0]");
 } finally { await page.evaluate(async () => { const f = (window as any).castAudit; if (f) await f.db.delete(); }); }
});

test("an active cast without ownership never creates a second temporary chat", async ({ page }) => {
 const name = "cast-lost-browser-" + crypto.randomUUID(); await open(page, name);
 try {
  const id = await page.evaluate(async () => { const f = (window as any).castAudit, result = await f.run({ type: "DR_CAST", action: "start", worldId: "w", locale: "en" }); await f.run({ type: "DR_CAST_WORKER", action: "sent", id: result.job.id, step: 0 }, true); await f.db.close(); return result.job.id; });
  await open(page, name, false);
  const result = await page.evaluate(async id => { const f = (window as any).castAudit, result = await f.run({ type: "DR_CAST", action: "start", worldId: "w", locale: "en" }); return { result, audit: await f.repo.get("service", id), events: f.events }; }, id);
  expect(result).toMatchObject({ result: { ok: true, job: { phase: "error", error: "interrupted", cleanup: "failed" } }, audit: { phase: "failed", error: "interrupted" }, events: [] });
 } finally { await page.evaluate(async () => { const f = (window as any).castAudit; if (f) await f.db.delete(); }); }
});

for (const outcome of ["active", "complete", "partial"]) test(`locked cast cleanup preserves ${outcome} and delivers after reload`, async ({ page }) => {
 const name = "cast-locked-browser-" + crypto.randomUUID(); await open(page, name);
 try {
  const result = await page.evaluate(async outcome => {
   const f = (window as any).castAudit, started = await f.run({ type: "DR_CAST", action: "start", worldId: "w", locale: "en" }), id = started.job.id;
   const send = (message: any) => f.run({ type: "DR_CAST_WORKER", id, ...message }, true);
   await send({ action: "sent", step: 0 }); f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/chat/s/owned" }); await send({ action: "bound", chatId: "owned" });
   await send({ action: "reply", step: 0, chatId: "owned", raw: "received" }); await send({ action: "sent", step: 1 }); await send({ action: "reply", step: 1, chatId: "owned", raw: JSON.stringify(f.fixture.castBatch(id, 0)) }); await send({ action: "sent", step: 2 });
   if (outcome !== "active") await send({ action: "reply", step: 2, chatId: "owned", raw: outcome === "partial" ? JSON.stringify({ ...f.fixture.castDraft(id), characters: [f.fixture.castDraft(id).characters[1]], partial: true }) : JSON.stringify(f.fixture.castBatch(id, 1)) });
   await f.repo.enableVault("synthetic-password"); await f.repo.lockVault();
   const claim = await send({ action: "claim" }), rejected = await send({ action: "sent", step: 2 });
   f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/chat/s/personal" }); const foreign = await send({ action: "authorize-cleanup", chatId: "owned" });
   f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/chat/s/owned" }); const authorized = await send({ action: "authorize-cleanup", chatId: "owned" });
   f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/" }); const cleaned = await send({ action: "cleaned", chatId: "owned", ok: true }); await f.coordinator.removed(5);
   const pending = Object.entries(await (window as any).chrome.storage.local.get()).filter(([key]) => key.startsWith("deeprole_service_pending:")); await f.db.close();
   return { id, claim, rejected, foreign, authorized, cleaned, pending, events: f.events };
  }, outcome);
  expect(result).toMatchObject({ claim: { ok: true, cleanupOnly: true, prompt: "", chatId: "owned" }, rejected: { ok: false, error: "vault-locked" }, foreign: { ok: false, error: "chat-changed" }, authorized: { ok: true, chatId: "owned" }, cleaned: { ok: true }, events: ["create:5", "remove:5"] });
  expect(result.pending).toHaveLength(1); expect(JSON.stringify(result.pending)).not.toMatch(/Leon|Mira|owned|worldId|chatId|sources|draft|https:\/\//u);
  await open(page, name, false);
  const delivered = await page.evaluate(async id => {
   const f = (window as any).castAudit; await f.repo.unlockVault("synthetic-password"); await f.coordinator.reconcilePending();
   const once = await f.repo.rawRecords(); await f.coordinator.reconcilePending();
   return { job: await f.repo.get("cast", id), audit: await f.repo.get("service", id), entities: (await f.repo.list("entity")).length, events: f.events, unchanged: JSON.stringify(once) === JSON.stringify(await f.repo.rawRecords()) };
  }, result.id);
  expect(delivered).toMatchObject({ job: { cleanup: "done", phase: outcome === "complete" ? "ready" : "error", awaiting: false }, audit: { cleanup: "done", phase: outcome === "complete" ? "result" : "failed", error: outcome === "complete" ? null : outcome === "partial" ? "partial-reply" : "vault-locked" }, entities: 0, events: [], unchanged: true });
  expect(delivered.job.draft.characters).toHaveLength(outcome === "active" ? 1 : 2);
 } finally { await page.evaluate(async () => { const f = (window as any).castAudit; if (f) await f.db.delete(); }); }
});

test("worker cancellation during the pre-submit pause never sends a prompt", async ({ page }) => {
 await page.goto("/tests/fixtures/cast-worker.html?scenario=cancel-before-send");
 await page.waitForFunction(() => (window as any).workerFinished === true);
 expect(await page.evaluate(() => (window as any).sentPrompts)).toEqual([]);
 expect(await page.evaluate(async () => (await (window as any).workerSnapshot()).phase)).toBe("cancelled");
});
test("worker automatic navigation during the pre-submit pause never sends into a personal chat", async ({ page }) => {
 await page.goto("/tests/fixtures/cast-worker.html?scenario=navigate-before-send");
 await page.waitForFunction(() => (window as any).workerFinished === true);
 expect(await page.evaluate(() => (window as any).sentPrompts)).toEqual([]);
 expect(await page.evaluate(async () => (await (window as any).workerSnapshot()).error)).toBe("not-empty-chat");
 expect(new URL(page.url()).pathname).toBe("/chat/s/personal");
});

// Shared review controls, not persistent extension profiles or saved screenshots.
for (const locale of ["ru", "en"]) for (const width of [320, 1100]) test(`cast review still preserves manual edits ${locale} ${width}`, async ({ page }) => {
 await page.setViewportSize({ width, height: 900 }); await page.goto("/tests/fixtures/cast.html?locale=" + locale);
 const label = (ru: string, en: string) => locale === "ru" ? ru : en;
 await page.getByRole("button", { name: label("Проверить персонажей", "Review characters"), exact: true }).click(); const dialog = page.getByRole("dialog");
 expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
 await dialog.locator(".dr-cast-member").nth(1).getByText(label("Проверить персонажей", "Review characters"), { exact: true }).click();
 await dialog.getByRole("textbox", { name: label("Внешность: Mira", "Appearance: Mira"), exact: true }).fill("Manually edited coat");
 await page.screenshot(); await dialog.getByRole("button", { name: label("Сохранить выбранных · 2", "Save selected · 2"), exact: true }).click();
 await expect(dialog).not.toBeVisible();
 expect((await page.evaluate(() => (window as any).saved)).find((person: any) => person.name === "Mira").characterSheet.appearance).toBe("Manually edited coat");
});
