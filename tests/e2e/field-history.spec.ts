import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function install(page: Page) {
 await page.goto("/tests/fixtures/deepseek.html");
 await page.evaluate(async () => {
  history.replaceState({}, "", "/chat/s/game"); document.body.innerHTML = '<article data-message-id="29" data-role="assistant">Mira closes the gate.</article>';
  const messages: any[] = [{ message_id: "0", parent_message_id: null, role: "user", content: "Mira wears a blue coat and has short dark hair." }];
  for (let n = 1; n < 30; n++) messages.push({ message_id: String(n), parent_message_id: String(n - 1), role: n % 2 ? "assistant" : "user", fragments: [{ type: "THINK", content: "PRIVATE_REASONING" }, { type: "RESPONSE", content: "Unrelated landscape. ".repeat(1000) }] });
  messages.push({ message_id: "foreign", parent_message_id: "0", role: "assistant", content: "Mira has a red coat. FOREIGN_REGENERATION" });
  const state = { messages, calls: [] as any[], result: undefined as any, failed: false, invalid: false }; (window as any).fieldHistoryTest = state;
  const original = window.fetch.bind(window); window.fetch = async (input, init) => {
   if (!String(input).startsWith("/api/v0/chat/")) return original(input, init);
   state.calls.push({ url: String(input), method: init?.method });
   if (state.failed) throw Error("mock-offline");
   const list = state.invalid ? [{ message_id: "29", role: "assistant", content: "Mira" }] : state.messages;
   return new Response(JSON.stringify({ data: { biz_data: { chat_session_id: "game", messages: list } } }), { headers: { "content-type": "application/json" } });
  };
  (window as any).defineUnlistedScript = (fn: () => void) => fn; const url = "/src/entrypoints/injected.ts", bridge = await import(url); bridge.default();
  const clientUrl = "/src/adapters/field-history-client.ts", client = await import(clientUrl);
  (window as any).runFieldRead = async () => { state.result = await client.requestFieldHistory("game", { name: "Mira", aliases: [], field: "appearance" }, () => true); };
 });
}
test("real page bridge supplies old facts from the anchored path only, without model calls or reasoning", async ({ page }) => {
 await install(page); expect(await page.evaluate(() => (window as any).fieldHistoryTest.calls.length)).toBe(0);
 await page.evaluate(() => (window as any).runFieldRead());
 const state = await page.evaluate(() => (window as any).fieldHistoryTest);
 expect(state.calls).toEqual([{ url: "/api/v0/chat/history_messages?chat_session_id=game", method: "GET" }]);
 expect(JSON.stringify(state.result)).toContain("blue coat"); expect(JSON.stringify(state.result)).not.toMatch(/PRIVATE_REASONING|FOREIGN_REGENERATION|nativeMessageKey/);
 expect(state.result).toMatchObject({ origin: "native", partial: true }); expect(JSON.stringify(state.result).length).toBeLessThan(49000);
});
test("native history unavailable or ambiguous returns no fabricated reference", async ({ page }) => {
 await install(page); await page.evaluate(async () => { (window as any).fieldHistoryTest.invalid = true; await (window as any).runFieldRead(); });
 expect(await page.evaluate(() => (window as any).fieldHistoryTest.result)).toBeNull();
 await page.evaluate(async () => { (window as any).fieldHistoryTest.failed = true; await (window as any).runFieldRead(); });
 expect(await page.evaluate(() => (window as any).fieldHistoryTest.result)).toBeNull();
 expect(await page.evaluate(() => (window as any).fieldHistoryTest.calls.every((c: any) => c.method === "GET"))).toBe(true);
});
for (const locale of ["ru", "en"] as const) for (const width of [320, 760]) test("history mode chooser and no-facts result in real editor " + locale + " " + width, async ({ page }) => {
 await page.setViewportSize({ width, height: 850 }); await page.goto(`/tests/fixtures/isolated-fields.html?mode=ui&scenario=missing&locale=${locale}`);
 const area = page.locator('[data-character-text-field="appearance"]'), wand = area.locator(".dr-character-generate");
 await area.locator("textarea").fill("My manually approved coat."); await wand.click();
 expect(await page.evaluate(() => (window as any).fieldRequests.length)).toBe(0);
 expect((await new AxeBuilder({ page }).include("#app").analyze()).violations).toEqual([]);
 const button = area.getByRole("button", { name: locale === "ru" ? "Заполнить по истории" : "Fill from history" }); await button.focus(); await page.keyboard.press("Escape"); await expect(wand).toBeFocused(); await expect(button).toHaveCount(0);
 await wand.click(); await area.getByRole("button", { name: locale === "ru" ? "Заполнить по истории" : "Fill from history" }).click();
 await expect(area.getByRole("status")).toContainText(locale === "ru" ? "Поле не изменено" : "field is unchanged");
 await expect(area.locator("textarea")).toHaveValue("My manually approved coat.");
 expect(await page.evaluate(() => (window as any).fieldRequests[0].field.mode)).toBe("history");
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 expect((await page.screenshot()).length).toBeGreaterThan(1000);
});
