import { expect, test } from "@playwright/test";
for (const transport of ["fetch", "xhr"] as const) test(`strict memory ${transport} never sends after failed preparation and permits one manual retry`, async ({ page }) => {
  let posts = 0; await page.route("**/api/v0/chat/completion", route => { posts++; return route.fulfill({ json: {} }); });
  await page.goto("/tests/fixtures/deepseek.html");
  await page.evaluate(async () => {
    const state = { ready: false, blocked: 0 }; (window as any).strictFixture = state; document.documentElement.dataset.deeproleStrictMemory = "active";
    window.addEventListener("message", e => { if (e.source !== window || e.data?.source !== "deeprole-page-bridge") return; if (e.data.type === "STRICT_MEMORY_BLOCKED") state.blocked++; if (e.data.type === "REQUEST_CONTEXT") window.postMessage({ source: "deeprole-extension", type: "CONTEXT_READY", id: e.data.id, ok: state.ready, context: state.ready ? "<deeprole_context>Memory ready</deeprole_context>" : "" }, location.origin); });
    const url = "/src/entrypoints/injected.ts"; (window as any).defineUnlistedScript = (install: () => void) => install; (await import(url)).default();
  });
  const send = () => page.evaluate(async transport => { const body = JSON.stringify({ chat_session_id: "strict-fixture", parent_message_id: 2, prompt: "My unsent draft" }); if (transport === "fetch") { try { await fetch("/api/v0/chat/completion", { method: "POST", body }); return "sent"; } catch { return "blocked"; } } return new Promise<string>(resolve => { const xhr = new XMLHttpRequest(); xhr.open("POST", "/api/v0/chat/completion"); xhr.onload = () => resolve("sent"); xhr.onerror = () => resolve("blocked"); xhr.send(body); }); }, transport);
  expect(await send()).toBe("blocked"); expect(posts).toBe(0); await expect.poll(() => page.evaluate(() => (window as any).strictFixture.blocked)).toBe(1);
  await page.evaluate(() => { (window as any).strictFixture.ready = true; }); expect(await send()).toBe("sent"); expect(posts).toBe(1);
});
for (const transport of ["fetch", "xhr"] as const) test(`strict memory ${transport} also blocks malformed bodies and navigation during preparation`, async ({ page }) => {
  let posts = 0; const errors: string[] = []; page.on("pageerror", error => errors.push(error.message)); await page.route("**/api/v0/chat/completion", route => { posts++; return route.fulfill({ json: {} }); }); await page.goto("/tests/fixtures/deepseek.html");
  await page.evaluate(async () => {
    document.documentElement.dataset.deeproleStrictMemory = "active";
    window.addEventListener("message", e => { if (e.source === window && e.data?.source === "deeprole-page-bridge" && e.data.type === "REQUEST_CONTEXT") { history.replaceState({}, "", "/chat/s/another"); window.postMessage({ source: "deeprole-extension", type: "CONTEXT_READY", id: e.data.id, ok: true, context: "<deeprole_context>Ready</deeprole_context>" }, location.origin); } });
    const url = "/src/entrypoints/injected.ts"; (window as any).defineUnlistedScript = (install: () => void) => install; (await import(url)).default();
  });
  for (const body of ["{invalid-json", JSON.stringify({ chat_session_id: "strict-fixture", parent_message_id: 2, prompt: "Keep unsent" })]) {
    expect(await page.evaluate(async ({ transport, body }) => { if (transport === "fetch") { try { await fetch("/api/v0/chat/completion", { method: "POST", body }); return "sent"; } catch { return "blocked"; } } return new Promise<string>(resolve => { const xhr = new XMLHttpRequest(); xhr.open("POST", "/api/v0/chat/completion"); xhr.onload = () => resolve("sent"); xhr.onerror = () => resolve("blocked"); xhr.send(body); }); }, { transport, body })).toBe("blocked");
  }
  expect(posts).toBe(0); expect(errors).toEqual([]);
});
