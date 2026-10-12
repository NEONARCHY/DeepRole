import { expect, test } from "@playwright/test";
for (const locale of ["ru", "en"]) test(`metadata repair worker ${locale}: masked single request, independent changes and cleanup`, async ({ page }) => {
  await page.goto(`/tests/fixtures/story-repair-worker.html?locale=${locale}`);
  await expect.poll(() => page.evaluate(() => (window as any).repairFixture?.sent?.length)).toBe(1);
  const screen = page.locator("deeprole-field-screen"); await expect(screen.locator(".brief")).toHaveText(locale === "ru" ? "Исправь данные сохранённого ответа, не меняя сюжет" : "Correct the saved reply metadata without changing the story");
  expect(await screen.evaluate(el => el.shadowRoot!.textContent)).not.toMatch(/PRIVATE_SYNTHETIC|Request ID|copper|worldId/); await expect(page.getByRole("textbox", { name: "Message" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).repairFixture.finished), { timeout: 15000 }).toBe(true);
  const result = await page.evaluate(async () => { const f = (window as any).repairFixture; return { ...f, state: await f.read(), read: undefined }; });
  expect(result.error).toBeUndefined(); expect(result.result.cleanup).toBe("done"); expect(result.sent).toHaveLength(1); expect(result.popup).toMatchObject({ type: "popup", focused: true }); expect(result.removed).toEqual([2]); expect(result.deleted).toBe(1); expect(result.foreignClicks).toBe(0);
  expect(result.state.source.content).toBe(result.original); expect(result.state.binding.characterScenes[result.state.page.worldId].states["person-1"]).toMatchObject({ condition: "At the gate", goal: "Find copper key" }); expect(result.state.page.repair).toMatchObject({ status: "done", cleanup: "done" });
});
test("metadata repair worker cancellation never retries or rewrites the story", async ({ page }) => {
  await page.goto("/tests/fixtures/story-repair-worker.html?hold=true&locale=en"); await expect.poll(() => page.evaluate(() => (window as any).repairFixture?.sent?.length)).toBe(1);
  await page.getByRole("button", { name: "Cancel request", exact: true }).click(); await expect.poll(() => page.evaluate(() => (window as any).repairFixture.finished), { timeout: 15000 }).toBe(true);
  const result = await page.evaluate(async () => { const f = (window as any).repairFixture; return { ...f, state: await f.read(), read: undefined }; }); expect(result.sent).toHaveLength(1); expect(result.state.source.content).toBe(result.original); expect(result.state.page.repair).toMatchObject({ status: "cancelled", cleanup: "done" }); expect(result.foreignClicks).toBe(0);
});
