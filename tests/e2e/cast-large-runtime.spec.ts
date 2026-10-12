import { chromium, expect, test } from "@playwright/test";
import path from "node:path";
import { castRecords, castDraft } from "../fixtures/cast-data";
function serviceMock(data: { id: string; fail: boolean; roster: ReturnType<typeof castDraft> }) {
 const owned = "owned-" + data.id, form = document.querySelector("form")!, textarea = document.querySelector("textarea")!;
 const thinking = document.querySelector("#deepthink")!; thinking.addEventListener("click", () => thinking.setAttribute("aria-pressed", thinking.getAttribute("aria-pressed") === "true" ? "false" : "true"));
 form.addEventListener("submit", event => {
  event.preventDefault(); const prompt = textarea.value; textarea.value = "";
  const scan = prompt.includes("[DeepRole Large Lore Names]"), sources = JSON.parse(scan ? prompt.split("Sources (data):\n")[1]! : prompt.split("[Large profile sources]\n")[1]!);
  let result: unknown, name = "";
  if (scan) {
   const known = JSON.parse(prompt.split("Already found here (do not repeat): ")[1]!.split("\n")[0]!);
   const people = data.roster.characters.filter(c => !known.includes(c.name)).flatMap(c => { const quote = c.evidence[0]!.quote, s = sources.find((s: any) => s.text.includes(quote)); return s ? [{ source: s.id, name: c.name, quote }] : []; });
   result = { version: 1, request: data.id, names: people, more: false };
  } else {
   name = JSON.parse(prompt.split(", name=")[1]!.split(" and aliases:")[0]!); const key = JSON.parse(prompt.split("with key=")[1]!.split(", name=")[0]!);
   const person = structuredClone(data.roster.characters.find(c => c.name === name)!); person.key = key;
   person.evidence = person.evidence.map(e => ({ ...e, source: sources.find((s: any) => s.text.includes(e.quote)).id }));
   result = { version: 1, request: data.id, characters: [person], present: [], partners: [], warnings: [], more: false };
  }
  console.log("LARGE_CAST_EVENT:" + JSON.stringify({ type: scan ? "scan" : "profile", name, length: prompt.length, sourceBytes: JSON.stringify(sources).length }));
  history.replaceState({}, "", "/chat/s/" + owned);
  const user = document.createElement("article"); user.dataset.messageRole = "user"; user.dataset.messageId = "u1"; user.textContent = prompt;
  const reply = document.createElement("article"); reply.dataset.messageRole = "assistant"; reply.dataset.messageId = "r1";
  const body = document.createElement("div"); body.className = "ds-assistant-message-main-content"; body.textContent = !scan && data.fail && name === "Mira" ? "Sorry, that's beyond my current scope. Let's talk about something else." : "<deeprole_cast>" + JSON.stringify(result) + "</deeprole_cast>";
  reply.append(body); document.querySelector("#turns")!.append(user, reply);
  const row = document.createElement("div"), anchor = document.createElement("a"), more = document.createElement("button"); anchor.href = "/chat/s/" + owned; anchor.textContent = "Owned service"; more.setAttribute("aria-label", "More"); more.textContent = "…"; row.append(anchor, more); document.querySelector("nav")!.append(row);
  more.onclick = () => { const menu = document.createElement("div"); menu.setAttribute("role", "menu"); menu.innerHTML = '<button role="menuitem">Delete</button>'; document.body.append(menu); menu.querySelector("button")!.onclick = () => { menu.remove(); const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog"); dialog.innerHTML = "<p>Delete chat?</p><button>Delete</button>"; document.body.append(dialog); dialog.querySelector("button")!.onclick = () => { row.remove(); dialog.remove(); document.querySelector("#turns")!.replaceChildren(); history.replaceState({}, "", "/"); }; }; };
 });
}
for (const locale of ["ru", "en"] as const) test("installed large lore " + locale + ": fresh chats, failure, resume and source integrity", async ({}, info) => {
 test.skip(info.project.name !== "chromium", "Installed Edge MV3; synthetic DeepSeek only"); test.setTimeout(240000);
 const extension = path.resolve(".output/chrome-mv3"), context = await chromium.launchPersistentContext("", { channel: "msedge", headless: true, args: ["--disable-extensions-except=" + extension, "--load-extension=" + extension] });
 try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"), panel = await context.newPage(); await panel.goto("chrome-extension://" + new URL(worker.url()).host + "/sidepanel.html"); await expect(panel.locator(".onboarding")).toBeVisible();
  const records = castRecords(); (records[0]!.data as any).description = "Leon is the protagonist. " + "Scenery. ".repeat(28000) + " Mira trusts Leon after he kept his promise.";
  const events: any[] = [], errors: string[] = []; let fail = true;
  await context.route("https://chat.deepseek.com/**", route => { const id = new URL(route.request().url()).searchParams.get("deeprole_cast_job"); return route.fulfill({ contentType: "text/html", body: id ? '<!doctype html><html><head><meta charset="utf-8"></head><body><nav></nav><main id="turns"></main><form><textarea aria-label="Message"></textarea><button type="button" id="deepthink" aria-pressed="false">DeepThink</button><button type="submit">Send</button></form><script>(' + serviceMock.toString() + ')(' + JSON.stringify({ id, fail, roster: castDraft(id) }) + ')</script></body></html>' : '<!doctype html><html><head><meta charset="utf-8"></head><body><textarea aria-label="Message"></textarea></body></html>' }); });
  await panel.evaluate(async ({ records, locale }) => { await new Promise<void>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction("records", "readwrite"); for (const r of records) tx.objectStore("records").put({ pk: r.kind + ":" + r.id, ...r, updatedAt: Date.now() }); tx.oncomplete = () => { db.close(); resolve(); }; }; }); await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true } }); }, { records, locale });
  const story = await context.newPage(); await story.goto("https://chat.deepseek.com/chat/s/original"); await story.locator("textarea").fill("My untouched game draft");
  // Synchronize isolated Playwright target attachment before each mocked popup navigation.
  await worker.evaluate(() => { const s = globalThis as any, original = s.chrome.windows.create.bind(s.chrome.windows); s.__largeAttached = 0; s.__largeCreated = 0; s.chrome.windows.create = async (...args: any[]) => { const win = await original(...args); const count = ++s.__largeCreated; for (let i = 0; s.__largeAttached < count && i < 1000; i++) await new Promise(r => setTimeout(r, 10)); return win; }; });
  context.on("page", page => { page.on("console", m => { if (m.text().startsWith("LARGE_CAST_EVENT:")) events.push(JSON.parse(m.text().slice(17))); }); page.on("pageerror", e => errors.push(e.message)); void page.evaluate(() => document.readyState).then(() => worker.evaluate(() => { (globalThis as any).__largeAttached++; })).catch(() => undefined); });
  const command = (m: any) => panel.evaluate(m => (globalThis as any).chrome.runtime.sendMessage(m), m), status = async () => (await command({ type: "DR_CAST", action: "status", worldId: "w" })).job;
  const start = await command({ type: "DR_CAST", action: "start", worldId: "w", locale }); expect(start.ok).toBe(true); expect(start.job.large.stage).toBe("scan");
  await expect.poll(async () => (await status()).phase, { timeout: 180000 }).toBe("error"); await expect.poll(async () => (await status()).cleanup, { timeout: 15000 }).toBe("done");
  const interrupted = await status(); expect(interrupted.large).toMatchObject({ stage: "profiles", prepared: 1, found: 2 }); expect(interrupted.draft.characters).toHaveLength(1);
  const scans = events.filter(e => e.type === "scan").length; expect(scans).toBeGreaterThan(20); expect(events.filter(e => e.type === "profile").map(e => e.name)).toEqual(["Leon", "Mira"]);
  await panel.reload(); expect((await status()).large.prepared).toBe(1); expect(events.filter(e => e.type === "scan").length).toBe(scans);
  fail = false; expect((await command({ type: "DR_CAST", action: "start", worldId: "w", locale, retry: true })).ok).toBe(true); await expect.poll(async () => (await status()).large.stage, { timeout: 20000 }).toBe("done"); await expect.poll(async () => (await status()).cleanup, { timeout: 15000 }).toBe("done");
  expect(events.filter(e => e.type === "scan").length).toBe(scans); expect(events.filter(e => e.type === "profile").map(e => e.name)).toEqual(["Leon", "Mira", "Mira"]); expect(events.every(e => e.sourceBytes <= 12000 && e.length < 26000)).toBe(true); expect(errors).toEqual([]);
  await expect(story.locator("textarea")).toHaveValue("My untouched game draft"); expect(story.url()).toContain("/original"); const normalPages = 3; await expect.poll(() => context.pages().length).toBe(normalPages);
  const stored = await panel.evaluate(() => new Promise<any[]>(resolve => { const open = indexedDB.open("deeprole"); open.onsuccess = () => { const db = open.result, tx = db.transaction("records"), r = tx.objectStore("records").getAll(); r.onsuccess = () => resolve(r.result); tx.oncomplete = () => db.close(); }; }));
  expect(stored.filter(r => r.kind === "entity")).toEqual([]); expect(stored.find(r => r.kind === "world").data.description).toBe((records[0]!.data as any).description); expect(stored.filter(r => r.kind === "service").every(r => r.data.cleanup === "done")).toBe(true);
 } finally { await context.close(); }
});
