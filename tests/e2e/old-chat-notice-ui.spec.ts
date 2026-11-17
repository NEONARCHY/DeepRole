import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { oldChatNoticeText } from "../../src/core/old-chat-notice";
for (const locale of ["ru", "en"] as const) for (const width of [320, 900]) test("previous chat notice " + locale + " " + width + ": optional, accessible and nonblocking", async ({ page }, info) => {
 const t = oldChatNoticeText(locale); await page.setViewportSize({ width, height: width === 320 ? 460 : 900 });
 await page.emulateMedia({ colorScheme: locale === "ru" ? "dark" : "light" });
 await page.goto("/tests/fixtures/old-chat-notice.html?locale=" + locale);
 if (width === 320) await page.addStyleTag({ content: "html { font-size: 125%; }" });
 const card = page.getByRole("region", { name: t.title }); await expect(card).toBeVisible();
 const open = card.getByRole("link", { name: t.open, exact: true });
 await expect(open).toHaveAttribute("href", "https://chat.deepseek.com/a/chat/s/new-chat");
 for (const control of [open, card.getByRole("button", { name: t.stay })]) {
  const bounds = (await control.boundingBox())!;
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  expect(bounds.width).toBeGreaterThanOrEqual(44);
  await expect(control).toBeInViewport({ ratio: 1 });
 }
 await page.getByRole("textbox").fill("Author draft"); await page.getByRole("button", { name: locale === "ru" ? "Отправить" : "Send", exact: true }).click();
 expect(await page.getAttribute("body", "data-sent")).toBe("true"); await expect(card).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
 if (info.project.name === "chromium") await page.screenshot({ path: info.outputPath("old-chat-" + locale + "-" + width + ".png") });
 await page.evaluate(() => { (window as any).oldChatFixture.failed = true; });
 const stay = card.getByRole("button", { name: t.stay }); await stay.focus(); await page.keyboard.press("Enter"); await expect(card.getByText(t.failed)).toBeVisible(); await expect(page.getByRole("textbox")).toHaveValue("Author draft");
 await page.evaluate(() => { (window as any).oldChatFixture.failed = false; }); await stay.click(); await expect(card).toHaveCount(0); await expect(page.getByRole("textbox")).toHaveValue("Author draft");
});
