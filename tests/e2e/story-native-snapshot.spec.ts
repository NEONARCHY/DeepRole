import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const locale of ["ru", "en"] as const) for (const width of [320, 900]) test(`native snapshot diagnostic ${locale} at ${width}px`, async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width, height: 1000 }); await page.goto(`/tests/fixtures/story-diagnostics.html?locale=${locale}`);
  const check = page.getByRole("button", { name: locale === "ru" ? "Проверить текущий чат" : "Check current chat", exact: true });
  await expect(check).toBeVisible();
  await page.evaluate(() => {
    const f = (window as any).diagnosticFixture;
    f.payload = { code: 0, data: { biz_code: 0, biz_data: { chat_session: { id: "diagnostic-fixture", current_message_id: 2 }, chat_messages: [
      { message_id: 1, parent_id: null, role: "USER", status: "FINISHED", has_pending_fragment: false, content: "PRIVATE_USER" },
      { message_id: 2, parent_id: 1, role: "ASSISTANT", status: "FINISHED", has_pending_fragment: false, fragments: [{ type: "RESPONSE", content: "PRIVATE_REPLY" }] },
      { message_id: 99, parent_id: 1, role: "ASSISTANT", status: "INCOMPLETE", has_pending_fragment: false, content: "PRIVATE_ALTERNATIVE" },
    ] } } };
    const row = document.querySelector("[data-message-id]")!; row.removeAttribute("data-message-id"); row.setAttribute("data-virtual-list-item-key", "2");
  });
  await check.click();
  const region = page.getByRole("region", { name: locale === "ru" ? "Ответ в серверной истории" : "Reply in server history", exact: true });
  await expect(region).toBeVisible();
  await expect(page.getByText(locale === "ru" ? "Связи сообщений согласованы. Состояние ответа и ветка сервера показаны ниже. Игровую историю проверяйте в разделе «История событий»." : "Message links are consistent. The reply state and server branch are shown below. Check story tracking in Story history.", { exact: true })).toBeVisible();
  await expect(region.getByText(locale === "ru" ? "Совпадает с концом ветки" : "Matches the branch end", { exact: true })).toBeVisible();
  await expect(region.getByText(locale === "ru" ? "Завершён, нет ожидающих фрагментов" : "Finished, no pending fragments", { exact: true })).toBeVisible();
  const copy = page.getByRole("button", { name: locale === "ru" ? "Скопировать отчёт" : "Copy report", exact: true }); await copy.click();
  let report = await page.evaluate(() => (window as any).diagnosticFixture.copied.at(-1));
  expect(JSON.parse(report)).toMatchObject({ diagnosticVersion: 4, automaticStoryIngestion: "not-checked", result: { diagnostics: { nativeSnapshot: { session: "matched", selection: "anchor", anchorCompletion: "complete" } } } });
  expect(report).not.toMatch(/PRIVATE|diagnostic-fixture|message_id|nativeMessageKey|chatId|fragments/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.evaluate(() => (window as any).diagnosticFixture.payload.data.biz_data.chat_session.current_message_id = 99);
  await page.getByRole("button", { name: locale === "ru" ? "Проверить ещё раз" : "Check again", exact: true }).click();
  await expect(region.getByText(locale === "ru" ? "Другая ветка" : "Different branch", { exact: true })).toBeVisible();
  await page.evaluate(() => { const f = (window as any).diagnosticFixture; f.payload.data.biz_data.chat_messages[1].status = "CONTENT_FILTER"; });
  await page.getByRole("button", { name: locale === "ru" ? "Проверить ещё раз" : "Check again", exact: true }).click();
  await expect(region.getByText(locale === "ru" ? "Фильтрация или предел контекста" : "Filtered or context limit reached", { exact: true })).toBeVisible();
  await copy.click(); report = await page.evaluate(() => (window as any).diagnosticFixture.copied.at(-1));
  expect(JSON.parse(report)).toMatchObject({ result: { diagnostics: { nativeSnapshot: { selection: "different", anchorCompletion: "unusable" } } } });
  expect(await page.evaluate(() => (window as any).diagnosticFixture.calls)).toEqual(Array(3).fill({ url: "/api/v0/chat/history_messages?chat_session_id=diagnostic-fixture", method: "GET" }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(errors).toEqual([]);
});

for (const mode of ["success", "no-finish", "refusal"] as const) test(`native XHR metadata ${mode} leaves the original reply untouched`, async ({ page }) => {
  const body = 'event: ready\ndata: {"request_message_id":43,"response_message_id":44}\n\ndata: {"v":"PRIVATE_REPLY_PRIVATE_THOUGHTS"}\n\n'
    + (mode === "refusal" ? 'event: hint\ndata: {"content":"PRIVATE_REFUSAL"}\n\n' : "")
    + (mode !== "no-finish" ? 'event: finish\ndata: {}\n\n' : "") + 'event: close\ndata: {}\n\n';
  let calls = 0;
  await page.route("**/api/v0/chat/completion", route => { calls++; expect(route.request().postDataJSON()).toEqual({ prompt: "PRIVATE_DRAFT", chat_session_id: "fixture-chat", parent_message_id: 42 }); return route.fulfill({ contentType: "text/event-stream", body }); });
  await page.goto("/tests/fixtures/deepseek.html");
  await page.evaluate(async () => {
    const state = { packets: [] as any[], invalid: false }; (window as any).nativeStreamFixture = state;
    const url = "/src/core/story-native-stream.ts", bridgeUrl = "/src/entrypoints/injected.ts";
    const { validNativeStoryStreamPacket } = await import(url);
    window.addEventListener("message", event => {
      if (event.source !== window || event.data?.source !== "deeprole-page-bridge") return;
      if (event.data.type === "REQUEST_CONTEXT") window.postMessage({ source: "deeprole-extension", type: "CONTEXT_READY", id: event.data.id, ok: true, context: "" }, location.origin);
      if (event.data.type === "NATIVE_STORY_STREAM") { const { source, type, ...packet } = event.data; state.invalid ||= !validNativeStoryStreamPacket(packet); state.packets.push(packet); }
    });
    (window as any).defineUnlistedScript = (install: () => void) => install; (await import(bridgeUrl)).default();
  });
  const response = await page.evaluate(() => new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest(); xhr.open("POST", "/api/v0/chat/completion"); xhr.onload = () => resolve(xhr.responseText); xhr.onerror = () => reject(Error("Request failed"));
    xhr.send(JSON.stringify({ prompt: "PRIVATE_DRAFT", chat_session_id: "fixture-chat", parent_message_id: 42 }));
  }));
  expect(response).toBe(body); expect(calls).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).nativeStreamFixture.packets.length)).toBe(mode === "success" ? 3 : 2);
  const state = await page.evaluate(() => (window as any).nativeStreamFixture);
  expect(state.invalid).toBe(false); expect(state.packets[0].link).toMatchObject({ chatId: "fixture-chat", userMessageKey: '["message","43"]', assistantMessageKey: '["message","44"]' });
  expect(state.packets.at(-1)).toMatchObject(mode === "refusal" ? { phase: "failed", issue: "native-hint", sawFinish: false } : { phase: "closed", issue: null, sawFinish: mode === "success" });
  expect(JSON.stringify(state)).not.toMatch(/PRIVATE|content|fragments|completion|selected/);
});
