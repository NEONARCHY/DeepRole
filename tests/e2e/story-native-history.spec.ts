import { expect, test } from "@playwright/test";

async function installProbe(page: import("@playwright/test").Page) {
  await page.goto("/tests/fixtures/deepseek.html");
  await page.evaluate(async () => {
    history.replaceState(null, "", "/a/chat/s/probe-chat");
    localStorage.setItem("userToken", JSON.stringify({ value: "PRIVATE_AUTH_TOKEN" }));
    const state = { calls: [] as { url: string; method?: string; credentials?: RequestCredentials }[], results: [] as any[],
      payload: { data: { biz_data: { chat_session_id: "probe-chat", messages: [
        { message_id: 2, parent_message_id: 1, role: "ASSISTANT", status: "FINISHED", content: "PRIVATE_STORY: Мира передала ключ.", fragments: [{ type: "THINK", content: "PRIVATE_REASONING" }] },
        { message_id: 1, parent_message_id: null, role: "USER", content: "PRIVATE_DRAFT: Continue" },
      ] } } } as any };
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = String(input);
      if (!url.startsWith("/api/v0/chat/")) return originalFetch(input, init);
      state.calls.push({ url, method: init?.method, credentials: init?.credentials });
      if (!url.startsWith("/api/v0/chat/history_messages?")) throw new Error("A diagnostic must not send a model request");
      return new Response(JSON.stringify(state.payload), { headers: { "content-type": "application/json" } });
    };
    window.addEventListener("message", event => { if (event.source === window && event.data?.type === "NATIVE_STORY_METADATA_RESULT") state.results.push(event.data); });
    (window as any).probeTest = state;
    (window as any).defineUnlistedScript = (install: () => void) => install;
    const moduleUrl = "/src/entrypoints/injected.ts";
    const bridge = await import(moduleUrl); bridge.default();
  });
}
async function request(page: import("@playwright/test").Page, requestId: string, chatId = "probe-chat") {
  await page.evaluate(({ requestId, chatId }) => window.postMessage({ source: "deeprole-extension", type: "NATIVE_STORY_METADATA_REQUEST", requestId, chatId }, location.origin), { requestId, chatId });
}

test("page bridge probes explicit history capabilities without exposing text or claiming completion", async ({ page }) => {
  await installProbe(page);
  expect(await page.evaluate(() => (window as any).probeTest.calls.length)).toBe(0);
  await request(page, "probe-1");
  await expect.poll(() => page.evaluate(() => (window as any).probeTest.results.length)).toBe(1);
  const state = await page.evaluate(() => (window as any).probeTest);
  expect(state.calls).toEqual([{ url: "/api/v0/chat/history_messages?chat_session_id=probe-chat", method: "GET", credentials: "same-origin" }]);
  expect(state.results[0]).toMatchObject({ requestId: "probe-1", chatId: "probe-chat", probe: { status: "read", diagnostics: { ancestry: "complete", completion: "unknown", identityCount: 2, rootCount: 1, completionFields: [{ field: "status", types: { string: 1 } }] } } });
  expect(state.results[0].probe.diagnostics).toMatchObject({ diagnosticVersion: 3, replyProbe: { anchor: "not-supplied", selection: "unknown" }, statusCounts: [{ field: "status", role: "assistant", state: "FINISHED", count: 1 }] });
  expect(JSON.stringify(state.results)).not.toMatch(/PRIVATE|nativeMessageKey|fragments/);
  expect(await page.evaluate(() => localStorage.getItem("userToken"))).toContain("PRIVATE_AUTH_TOKEN");
});

test("page bridge rejects missing/contradictory native ancestry and never guesses a new branch", async ({ page }) => {
  await installProbe(page);
  await request(page, "foreign", "another-chat");
  // A same-chat request provides a deterministic barrier after the ignored foreign request.
  await page.evaluate(() => { (window as any).probeTest.payload.data.biz_data.messages = [{ message_id: 1, role: "USER" }, { message_id: 2, role: "ASSISTANT" }]; });
  await request(page, "missing");
  await expect.poll(() => page.evaluate(() => (window as any).probeTest.results.length)).toBe(1);
  let state = await page.evaluate(() => (window as any).probeTest);
  expect(state.calls).toHaveLength(1);
  expect(state.results[0].probe.diagnostics).toMatchObject({ ancestry: "invalid", completion: "unknown", issueCount: 2, issues: [{ code: "missing-parent" }, { code: "missing-parent" }] });
  await page.evaluate(() => { (window as any).probeTest.payload.data.biz_data.messages = [
    { message_id: 1, parent_message_id: 2, role: "USER" }, { message_id: 2, parent_message_id: 1, role: "ASSISTANT" },
  ]; });
  await request(page, "cycle");
  await expect.poll(() => page.evaluate(() => (window as any).probeTest.results.length)).toBe(2);
  state = await page.evaluate(() => (window as any).probeTest);
  expect(state.results[1].probe.diagnostics).toMatchObject({ ancestry: "invalid", completion: "unknown", issues: [{ code: "parent-cycle" }] });
  expect(state.calls.every((call: any) => call.method === "GET")).toBe(true);
});
