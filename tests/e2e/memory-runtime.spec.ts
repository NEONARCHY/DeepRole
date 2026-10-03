import { chromium, expect, test, type Page } from "@playwright/test";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";

async function records(page: Page) {
  return page.evaluate(async () => new Promise<any[]>((resolve, reject) => {
    const request = indexedDB.open("deeprole"); request.onerror = () => reject(request.error);
    request.onsuccess = () => { const db = request.result; const all = db.transaction("records").objectStore("records").getAll(); all.onsuccess = () => { resolve(all.result); db.close(); }; };
  }));
}

test("canonical memory stays synchronized through editing, sending, proposals and undo", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Installed Chrome MV3 runtime; shared UI tested separately in Firefox");
  test.setTimeout(90000);
  const profiles = path.join(testInfo.project.outputDir, "profiles"); await mkdir(profiles, { recursive: true });
  const profile = await mkdtemp(path.join(profiles, "deeprole-memory-test-"));
  const context = await chromium.launchPersistentContext(profile, { channel: "msedge", headless: true, args: [`--disable-extensions-except=${path.resolve(".output/chrome-mv3")}`, `--load-extension=${path.resolve(".output/chrome-mv3")}`] });
  context.setDefaultTimeout(10000);
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"); const id = new URL(worker.url()).host;
    const html = `<!doctype html><html><head><title>Mock DeepSeek</title></head><body style="background:#161b22;color:white"><main><header><h1>RP</h1></header><div id="conversation"><article data-message-id="user">Mira arrived at the gate.</article><article data-message-id="answer">The gate is closed.</article></div><form><textarea aria-label="Message"></textarea><button type="submit">Send</button></form></main><script>
      document.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); const box = document.querySelector('textarea'); const text = box.value; const user = document.createElement('article'); user.dataset.messageId = 'service-user'; user.textContent = text; const reply = document.createElement('article'); reply.dataset.messageId = 'service-reply'; document.querySelector('#conversation').append(user, reply); box.value = ''; window.serviceReply = reply; fetch('/api/v0/chat/completion', { method:'POST', body:JSON.stringify({ prompt:text }) }); });
    </script></body></html>`;
    await context.route("https://chat.deepseek.com/**", (route) => route.fulfill({ contentType: "text/html", body: html }));
    const sent: string[] = [];
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", (route) => { sent.push(route.request().postDataJSON().prompt ?? ""); return route.fulfill({ contentType: "application/json", body: "{}" }); });
    const panel = await context.newPage(); await panel.goto(`chrome-extension://${id}/sidepanel.html`);
    await expect(panel.locator(".onboarding")).toBeVisible();
    await panel.evaluate(async () => {
      const now = Date.now(); const world = { id: "w", name: "Test World", description: "World description is approved.", useDescriptionInContext: true, color: "#64b5f6", contextBudget: 2000, relevanceThreshold: 6, createdAt: now, updatedAt: now };
      const entry = (id: string, activation: string, content: string) => ({ id, worldId: "w", bookId: null, title: id, content, activation, priority: "normal", enabled: true, keywords: [], source: { type: "manual" }, createdAt: now, updatedAt: now });
      await new Promise<void>((resolve) => { const request = indexedDB.open("deeprole"); request.onsuccess = () => { const db = request.result; const tx = db.transaction("records", "readwrite"); for (const [kind, data] of [["world", world], ["entry", entry("Rule", "always", "Always keep third person.")], ["entry", entry("Optional thread", "manual", "OLD_CANON")]] as const) tx.objectStore("records").put({ pk: kind + ":" + data.id, kind, id: data.id, data, updatedAt: now }); tx.oncomplete = () => { db.close(); resolve(); }; }; });
      await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale: "en", onboardingComplete: true }, deeprole_library_change: { token: "seed" } });
    });
    await panel.reload();
    const chat = await context.newPage(); await chat.goto("https://chat.deepseek.com/chat/s/game");
    await chat.getByRole("combobox", { name: "World", exact: true }).selectOption("w");
    await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", /World description is approved/);
    await expect(chat.locator("html")).not.toHaveAttribute("data-deeprole-context", /OLD_CANON/);
    await panel.bringToFront(); await panel.getByRole("button", { name: "Lore", exact: true }).click();
    await panel.getByRole("button", { name: "Memory list", exact: true }).click();
    await panel.getByRole("button", { name: /^World library:/ }).click();
    await panel.getByRole("menuitemradio", { name: "Test World", exact: true }).click();
    const optional = panel.locator(".memory-card").filter({ has: panel.getByRole("heading", { name: "Optional thread", exact: true }) });
    // Context actions act on the active DeepSeek tab, not this extension tab.
    await chat.bringToFront();
    
    await optional.getByRole("button", { name: "Always here", exact: true }).click();
    await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", /OLD_CANON/);
    await optional.getByRole("button", { name: "Edit", exact: true }).click();
    await panel.getByRole("textbox", { name: "What should be remembered", exact: true }).fill("PRECISE_NEW_CANON");
    await panel.getByRole("button", { name: "Save", exact: true }).click();
    await expect(panel.locator(".modal-backdrop")).toHaveCount(0);
    await chat.bringToFront();
    await chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Continue the RP" }) }));
    expect(sent.at(-1)).toContain("PRECISE_NEW_CANON"); expect(sent.at(-1)).not.toContain("OLD_CANON");
    await chat.reload(); await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", /PRECISE_NEW_CANON/);
    // Map and list share exactly the same activation and chat override.
    await panel.getByRole("button", { name: "Lore", exact: true }).click();
    await panel.getByRole("button", { name: /^World library:/ }).click();
    await panel.getByRole("menuitemradio", { name: "Test World", exact: true }).click();
    await panel.getByRole("button", { name: "World map", exact: true }).click();
    await panel.getByRole("button", { name: "Open world map", exact: true }).click();
    await panel.getByRole("textbox", { name: "Find a record or branch…", exact: true }).fill("Optional thread");
    await panel.locator(".lm-results").getByRole("button", { name: "Optional thread", exact: true }).click();
    const inspector = panel.locator(".lm-details");
    await expect(inspector.getByRole("button", { name: "Manual", exact: true })).toHaveAttribute("aria-pressed", "true");
    await inspector.getByRole("textbox", { name: "Entry text", exact: true }).fill("PRECISE_NEW_CANON — MAP_EDITOR_SYNC");
    await inspector.getByRole("button", { name: "Save entry", exact: true }).click();
    await expect(inspector.locator(".lm-memory-editor [role=status]")).toHaveText("Text saved");
    await chat.bringToFront();
    await chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Continue after map editing" }) }));
    expect(sent.at(-1)).toContain("MAP_EDITOR_SYNC"); expect(sent.at(-1)).not.toContain("OLD_CANON");
    await inspector.getByRole("button", { name: "Don’t send", exact: true }).click();
    await expect(chat.locator("html")).not.toHaveAttribute("data-deeprole-context", /PRECISE_NEW_CANON/);
    await inspector.getByRole("button", { name: "Use mode", exact: true }).click();
    await inspector.getByRole("button", { name: "Always", exact: true }).click();
    await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", /PRECISE_NEW_CANON/);
    // Analysis is explicit, never overwrites the chat draft, and opens the review when proposals arrive.
    await chat.getByRole("button", { name: /^Context/ }).click();
    await chat.evaluate(() => { const stop = document.createElement("button"); stop.id = "mock-stop"; stop.setAttribute("aria-label", "Stop generating"); stop.textContent = "Stop"; document.querySelector("form")!.append(stop); });
    const beforeBusy = sent.length;
    await expect(chat.getByRole("button", { name: "Update lore", exact: true })).toBeDisabled();
    await expect(chat.locator(".dr-inline-note")).toContainText("DeepSeek is still replying");
    expect(sent).toHaveLength(beforeBusy);
    await chat.evaluate(() => document.querySelector("#mock-stop")!.remove());
    await chat.getByRole("textbox", { name: "Message", exact: true }).fill("Unsent message");
    await chat.getByRole("button", { name: "Update lore", exact: true }).click();
    await expect(chat.locator(".dr-toast")).toContainText("Your message is still in the chat box");
    await expect(chat.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("Unsent message");
    expect(sent).toHaveLength(beforeBusy);
    expect(sent.at(-1)).not.toContain("[DeepRole Service]");
    await chat.getByRole("textbox", { name: "Message", exact: true }).fill("");
    // Hold the background's preparation write: typing and another click must
    // remain safe even after the command has passed its initial checks.
    await worker.evaluate(() => {
      const runtime = (globalThis as any).chrome;
      const original = runtime.storage.session.set.bind(runtime.storage.session);
      runtime.storage.session.set = (values: Record<string, any>) => {
        if (Object.entries(values).some(([key, value]) => key.startsWith("deeprole_tab_state_") && value.service)) {
          runtime.storage.session.set = original;
          (globalThis as any).preparationHeld = true;
          return new Promise<void>((resolve, reject) => { (globalThis as any).releasePreparation = () => original(values).then(resolve, reject); });
        }
        return original(values);
      };
    });
    await chat.getByRole("button", { name: "Update lore", exact: true }).click();
    await expect.poll(() => worker.evaluate(() => (globalThis as any).preparationHeld === true)).toBe(true);
    await expect(chat.getByRole("button", { name: "Update lore", exact: true })).toBeDisabled();
    await expect(chat.locator(".dr-service-state")).toContainText("Preparing the request");
    await chat.getByRole("textbox", { name: "Message", exact: true }).fill("Typed during preparation");
    await worker.evaluate(() => (globalThis as any).releasePreparation());
    // The identical toast from the previous attempt may still be visible.
    // Wait for this cancellation before clearing the draft for the next attempt.
    await expect(chat.locator(".dr-service-state")).toHaveClass(/is-error/);
    await expect(chat.getByRole("button", { name: "Update lore", exact: true })).toBeEnabled();
    await expect(chat.locator(".dr-toast")).toContainText("Your message is still in the chat box");
    await expect(chat.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("Typed during preparation");
    expect(sent).toHaveLength(beforeBusy);
    await chat.getByRole("textbox", { name: "Message", exact: true }).fill("");
    await chat.getByRole("button", { name: "Update lore", exact: true }).click();
    await expect.poll(() => sent.at(-1)).toContain("[Existing approved entries]");
    const afterAnalysis = sent.length;
    await expect(chat.getByRole("button", { name: "Update lore", exact: true })).toBeDisabled();
    await expect(chat.locator(".dr-service-state")).toContainText("DeepSeek is preparing suggestions");
    expect(sent).toHaveLength(afterAnalysis);
    expect(sent.at(-1)).not.toContain("<deeprole_context");
    await expect(chat.locator("[data-message-id='service-user']")).toBeVisible();
    await expect(chat.locator("[data-message-id='user']")).toBeVisible();
    await chat.evaluate(() => { (window as any).serviceReply.textContent = '<deeprole_data>{"type":"memory-suggestions","items":[{"targetEntryId":"Optional thread","title":"Optional thread","content":"REVIEWED_NEW_CANON","keywords":[]}]}</deeprole_data>'; });
    await expect(chat.getByRole("button", { name: "Review changes", exact: true })).toBeVisible();
    await expect(chat.locator(".dr-memory-review")).toBeVisible();
    await expect(chat.locator("[data-message-id='service-reply']")).toContainText("Review the records in DeepRole, then choose Save selected changes.");
    await expect(chat.locator("[data-message-id='service-reply']")).not.toContainText("<deeprole_data>");
    await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", /PRECISE_NEW_CANON/);
    await expect(chat.getByRole("button", { name: "Save selected changes · 0", exact: true })).toBeDisabled();
    await chat.locator(".dr-proposal-summary").click();
    await expect(chat.locator(".dr-proposal-before p")).toHaveText("PRECISE_NEW_CANON — MAP_EDITOR_SYNC");
    await chat.getByRole("checkbox", { name: "Save this change: Optional thread", exact: true }).check();
    await chat.getByRole("button", { name: /^Save selected changes · \d+$/ }).click();
    await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", /REVIEWED_NEW_CANON/);
    const canonical = (await records(panel)).filter((r) => r.kind === "entry");
    expect(canonical).toHaveLength(2); expect(canonical.find((r) => r.id === "Optional thread").data.activation).toBe("always");
    await chat.getByRole("button", { name: "Undo last saved changes", exact: true }).click();
    await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", /PRECISE_NEW_CANON/);
    // Unknown request format passes unchanged.
    let unknown = ""; await context.route("https://chat.deepseek.com/api/v0/chat/completion", (route) => { unknown = route.request().postData() ?? ""; return route.fulfill({ contentType: "application/json", body: "{}" }); });
    await chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ changed_format: "ordinary message" }) }));
    expect(JSON.parse(unknown)).toEqual({ changed_format: "ordinary message" });
    await chat.getByRole("button", { name: "Remember", exact: true }).click();
    await chat.getByRole("textbox", { name: "What should stay in memory?", exact: true }).fill("Quiet new fact");
    await chat.getByRole("button", { name: "Save to lore", exact: true }).click();
    await expect.poll(async () => (await records(panel)).filter((r) => r.kind === "entry").length).toBe(3);
    await chat.screenshot({ path: testInfo.outputPath("unified-memory-assistant.png") });
    // Closing the vault drops cached context, including on the actual next send.
    await panel.keyboard.press("Escape");
    await panel.keyboard.press("Escape");
    await expect(panel.locator(".dr-loremap")).toHaveCount(0);
    await panel.getByRole("button", { name: "Settings", exact: true }).click();
    await panel.getByRole("button", { name: "Files & security", exact: true }).click();
    await panel.getByLabel("New vault password", { exact: true }).fill("runtime-test-password");

    await panel.getByRole("button", { name: "Enable local vault", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Disable vault", exact: true })).toBeVisible();
    await chat.getByRole("button", { name: "Remember", exact: true }).click();
    await chat.getByRole("textbox", { name: "What should stay in memory?", exact: true }).fill("PRIVATE_UNSAVED_RUNTIME_DRAFT");
    await chat.getByRole("textbox", { name: "Message", exact: true }).fill("Keep this ordinary DeepSeek draft");
    await panel.getByRole("button", { name: "Lock vault", exact: true }).click();
    await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", "");
    await expect(chat.locator(".dr-assistant textarea")).toHaveCount(0);
    await expect(chat.getByRole("button", { name: /Vault locked/ })).toBeVisible();
    await expect(chat.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("Keep this ordinary DeepSeek draft");
    await chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Ordinary message while locked" }) }));
    expect(JSON.parse(unknown)).toEqual({ prompt: "Ordinary message while locked" });
    expect((await records(panel)).every((row) => row.data === undefined && !!row.encrypted)).toBe(true);
    await chat.getByRole("button", { name: /Vault locked/ }).click();
    const lockedMenu = chat.frameLocator("iframe");
    await expect(lockedMenu.getByRole("button", { name: "Unlock", exact: true })).toBeVisible();
    await lockedMenu.getByRole("button", { name: "Close", exact: true }).click();
    await expect(chat.locator("iframe")).toHaveCount(0);
    await chat.getByRole("button", { name: /Vault locked/ }).click();
    await expect(lockedMenu.getByRole("button", { name: "Unlock", exact: true })).toBeVisible();
    await lockedMenu.getByPlaceholder("Password", { exact: true }).focus();
    await chat.keyboard.press("Escape");
    await expect(chat.locator("iframe")).toHaveCount(0);
    await panel.getByPlaceholder("Password", { exact: true }).fill("runtime-test-password");
    await panel.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", /PRECISE_NEW_CANON/);
    await chat.getByRole("button", { name: /^Context / }).click();
    await chat.getByRole("button", { name: "Remember", exact: true }).click();
    await expect(chat.getByRole("textbox", { name: "What should stay in memory?", exact: true })).toHaveValue("");
  } finally { await context.close(); }
});

test("new-chat lore drafting stays a proposal and preserves manual choices through the first SPA send", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Installed Chrome MV3 runtime; shared UI tested separately in Firefox");
  test.setTimeout(90000);
  const profiles = path.join(testInfo.project.outputDir, "profiles"); await mkdir(profiles, { recursive: true });
  const profile = await mkdtemp(path.join(profiles, "deeprole-new-chat-test-"));
  const context = await chromium.launchPersistentContext(profile, { channel: "msedge", headless: true, args: [`--disable-extensions-except=${path.resolve(".output/chrome-mv3")}`, `--load-extension=${path.resolve(".output/chrome-mv3")}`] });
  context.setDefaultTimeout(10000);
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"); const id = new URL(worker.url()).host;
    const html = `<!doctype html><html><head><title>Mock DeepSeek</title></head><body><main><div id="conversation"></div><form><textarea aria-label="Message"></textarea><button type="submit">Send</button></form></main><script>
      document.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); const box = document.querySelector('textarea'); const text = box.value; box.value = ''; history.pushState({}, '', '/chat/s/new-roleplay'); const user = document.createElement('article'); user.dataset.messageId = 'service-user'; user.textContent = text; const reply = document.createElement('article'); reply.dataset.messageId = 'service-reply'; document.querySelector('#conversation').append(user, reply); window.serviceReply = reply; fetch('/api/v0/chat/completion', {method:'POST', body:JSON.stringify({prompt:text})}); });
    </script></body></html>`;
    await context.route("https://chat.deepseek.com/**", (route) => route.fulfill({ contentType: "text/html", body: html }));
    const sent: string[] = [];
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", (route) => { sent.push(route.request().postDataJSON().prompt); return route.fulfill({ contentType: "application/json", body: "{}" }); });
    const panel = await context.newPage(); await panel.goto(`chrome-extension://${id}/sidepanel.html`);
    await expect(panel.locator(".onboarding")).toBeVisible();
    await panel.evaluate(async () => {
      const now = Date.now(); const entry = { id: "manual", worldId: null, bookId: null, title: "Optional route", content: "PINNED_DRAFT_MEMORY", activation: "manual", priority: "normal", enabled: true, keywords: [], source: { type: "manual" }, createdAt: now, updatedAt: now };
      await new Promise<void>((resolve) => { const request = indexedDB.open("deeprole"); request.onsuccess = () => { const db = request.result; const tx = db.transaction("records", "readwrite"); tx.objectStore("records").put({ pk: "entry:manual", kind: "entry", id: entry.id, data: entry, updatedAt: now }); tx.oncomplete = () => { db.close(); resolve(); }; }; });
      await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale: "en", onboardingComplete: true }, deeprole_library_change: { token: "seed" } });
    });
    const chat = await context.newPage(); await chat.goto("https://chat.deepseek.com/");
    await chat.getByRole("button", { name: /^Context/ }).click();
    await chat.getByRole("button", { name: /Attach manually/ }).click();
    await chat.getByRole("button", { name: /Optional route/ }).click();
    await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", /PINNED_DRAFT_MEMORY/);
    // Analysis of an empty conversation is refused without sending anything.
    await expect(chat.getByRole("button", { name: "Update lore", exact: true })).toBeDisabled(); expect(sent).toEqual([]);
    await chat.getByRole("button", { name: "Remember", exact: true }).click();
    await chat.locator(".dr-assistant summary").filter({ hasText: "Ask DeepSeek to propose lore" }).click();
    await chat.getByRole("textbox", { name: "Describe your world or the rules you want", exact: true }).fill("Create a small spaceport world with no magic.");
    await chat.getByRole("button", { name: "Ask DeepSeek to propose lore", exact: true }).click();
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]).toContain("[User brief]"); expect(sent[0]).not.toContain("<deeprole_context");
    await expect(chat).toHaveURL(/new-roleplay$/);
    await expect.poll(async () => (await records(panel)).find((row) => row.kind === "binding")?.data.memoryOverrides.includedIds).toEqual(["manual"]);
    const session = await panel.evaluate(async () => (globalThis as any).chrome.storage.session.get(null));
    expect(JSON.stringify(session)).not.toContain("Create a small spaceport");
    await expect(chat.locator("[data-message-id='service-user']")).toBeVisible();
    await chat.evaluate(() => { (window as any).serviceReply.textContent = '<deeprole_data>{"type":"memory-suggestions","items":[{"title":"No magic","content":"APPROVED_RULE: This world has no magic.","activation":"always","keywords":[]}]}</deeprole_data>'; });
    await expect(chat.getByRole("button", { name: "Review changes", exact: true })).toBeVisible();
    await expect(chat.locator(".dr-memory-review")).toBeVisible();
    expect((await records(panel)).filter((row) => row.kind === "entry")).toHaveLength(1);
    await expect(chat.locator("html")).not.toHaveAttribute("data-deeprole-context", /APPROVED_RULE/);
    await expect(chat.getByRole("button", { name: "Save selected changes · 0", exact: true })).toBeDisabled();
    await chat.getByRole("checkbox", { name: "Save this change: No magic", exact: true }).check();
    await chat.getByRole("button", { name: /^Save selected changes · \d+$/ }).click();
    await chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Start the game" }) }));
    expect(sent.at(-1)).toContain("APPROVED_RULE"); expect(sent.at(-1)).toContain("PINNED_DRAFT_MEMORY");
    await chat.reload();
    await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", /PINNED_DRAFT_MEMORY/);
    await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", /APPROVED_RULE/);
    // A handoff remains queued if the server rejects the send, then clears on acceptance.
    await panel.evaluate(async () => {
      const api = (globalThis as any).chrome;
      const [tab] = await api.tabs.query({ url: "https://chat.deepseek.com/*" });
      const now = Date.now(); const snapshot = { id: "handoff-test", worldId: null, bookId: null, title: "Test handoff", summary: "HANDOFF_UNTIL_ACCEPTED", sourceChatId: "previous", sourceChatUrl: "https://chat.deepseek.com/chat/s/previous", createdAt: now };
      await new Promise<void>((resolve) => { const request = indexedDB.open("deeprole"); request.onsuccess = () => { const db = request.result; const tx = db.transaction("records", "readwrite"); tx.objectStore("records").put({ pk: "snapshot:handoff-test", kind: "snapshot", id: snapshot.id, data: snapshot, updatedAt: now }); tx.oncomplete = () => { db.close(); resolve(); }; }; });
      await api.storage.session.set({ [`deeprole_tab_state_${tab.id}`]: { snapshotId: snapshot.id } });
      await api.storage.local.set({ deeprole_library_change: { token: "queue-handoff" } });
    });
    await expect(chat.locator("html")).toHaveAttribute("data-deeprole-context", /HANDOFF_UNTIL_ACCEPTED/);
    let status = 503;
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", (route) => { sent.push(route.request().postDataJSON().prompt); return route.fulfill({ status, contentType: "application/json", body: "{}" }); });
    await chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Continue after transfer" }) }));
    expect(sent.at(-1)).toContain("HANDOFF_UNTIL_ACCEPTED");
    const snapshotQueued = () => panel.evaluate(async () => {
      const api = (globalThis as any).chrome; const [tab] = await api.tabs.query({ url: "https://chat.deepseek.com/*" });
      return (await api.storage.session.get(`deeprole_tab_state_${tab.id}`))[`deeprole_tab_state_${tab.id}`]?.snapshotId;
    });
    expect(await snapshotQueued()).toBe("handoff-test");
    status = 200;
    await chat.evaluate(() => fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "Retry transfer" }) }));
    await expect.poll(snapshotQueued).toBeNull();
  } finally { await context.close(); }
});
