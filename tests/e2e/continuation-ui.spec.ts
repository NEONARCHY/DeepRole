import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { continuationText } from "../../src/core/continuation-i18n";

for(const locale of ["ru","en"] as const)for(const width of [320,900])test(`accepted transfer local-save notice, ${locale}, ${width}px`,async({page},info)=>{
 await page.setViewportSize({width,height:820});await page.goto(`/tests/fixtures/page-widget.html?locale=${locale}`);
 await page.locator("#underlying-chat-control").focus();
 await page.evaluate(()=>(window as any).setWidgetState({continuationCommitPending:true}));
 const button=page.getByRole("button",{name:continuationText(locale,"commitRetry"),exact:true});await expect(button).toBeVisible();
 await expect(page.locator("#underlying-chat-control")).toBeFocused();
 const alert=page.locator(".dr-alert").filter({has:button});await expect(alert).toContainText(continuationText(locale,"commitPending"));
 const box=await alert.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width);
 await button.focus();await page.keyboard.press("Enter");await expect(button).toBeFocused();
 const results=await new AxeBuilder({page}).include(".dr-alert").analyze();expect(results.violations).toEqual([]);
 await page.screenshot({path:info.outputPath(`accepted-local-save-${locale}-${width}.png`)});
 await page.evaluate(()=>(window as any).setWidgetState({vaultLocked:true}));await expect(button).toHaveCount(0);
});

for (const locale of ["ru", "en"] as const) for (const width of [360, 1280]) {
  test(`continuation stages and hidden recap, ${locale}, ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 820 });
    await page.goto(`/tests/fixtures/page-widget.html?locale=${locale}`);
    const title = locale === "ru" ? "Продолжение истории" : "Continue your story";
    await page.evaluate(() => (window as any).setWidgetState({ continuation: { id: "flow", chatId: "a", chatUrl: "https://chat.deepseek.com/chat/s/a", scene: { worldId: null, focusIds: [], bookId: null }, phase: "ready", requestId: "r", createdAt: 1 } }));
    const progress = page.getByRole("region", { name: title, exact: true });
    await expect(progress).toBeVisible();
    const box = await progress.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await progress.getByRole("button", { name: locale === "ru" ? "Подготовить сжимку и продолжить" : "Prepare summary and continue", exact: true }).click();
    expect(await page.evaluate(() => (window as any).continued)).toBe(true);
    await page.screenshot({ path: info.outputPath(`continuation-${locale}-${width}.png`) });
    await progress.getByRole("button", { name: locale === "ru" ? "Отменить перенос" : "Cancel transfer", exact: true }).click();
    await expect(progress).toHaveCount(0);
    await page.evaluate(async () => {
      const { presentHiddenHandoffs } = await import(String("/src/adapters/deepseek-handoff-dom.ts"));
      const { formatMemoryContext, injectContextIntoPrompt } = await import(String("/src/core/context.ts"));
      const snapshot = { id: "s", title: "Scene", summary: "PRIVATE SUMMARY", sourceChatId: "a", sourceChatUrl: "", bookId: null, createdAt: 1 };
      const row = document.createElement("article"); row.dataset.role = "user"; row.dataset.messageId = "handoff";
      row.textContent = injectContextIntoPrompt("Continue here.", formatMemoryContext({ entries: [], estimatedTokens: 0, omittedCount: 0 }, snapshot));
      document.body.append(row); presentHiddenHandoffs();
      (window as any).handoffRaw = row.textContent;
    });
    await expect(page.locator("[data-deeprole-handoff-visible]")).toHaveText("Continue here.");
    expect(await page.locator('[data-message-id="handoff"]').innerText()).not.toContain("PRIVATE SUMMARY");
    expect(await page.evaluate(() => (window as any).handoffRaw)).toContain("PRIVATE SUMMARY");
  });
}
