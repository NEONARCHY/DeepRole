import { expect, test } from "@playwright/test";
for (const locale of ["ru","en"]) for (const width of [320,770,1280]) test(`cast progress docks, moves and stays readable: ${locale} ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/tests/fixtures/cast.html?compact=1&phase=analyzing&locale=${locale}`);
  const ru = locale === "ru", popup = page.locator(".dr-cast-status.is-floating"), panel = page.locator(".dr-characters");
  await expect(popup).toBeVisible();
  await expect.poll(() => popup.evaluate(e => getComputedStyle(e).transform)).toBe("matrix(1, 0, 0, 1, 0, 0)");
  const p = (await panel.boundingBox())!, b = (await popup.boundingBox())!;
  if (width >= 770) { expect(b.x).toBeCloseTo(p.x + p.width + 10, 0); expect(b.y).toBeCloseTo(p.y, 0); }
  else { expect(b.x).toBeGreaterThanOrEqual(8); expect(b.x + b.width).toBeLessThanOrEqual(width - 8); }
  expect(await popup.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
  await expect(popup.getByText(ru ? "Финальный ответ DeepSeek" : "Final DeepSeek reply", { exact:true })).toBeVisible();
  await expect(popup.getByText("1/1", { exact:true })).toHaveCount(0);
  const hint = popup.locator(".dr-cast-waiting-hint"), first = await hint.textContent();
  await expect.poll(() => hint.textContent(), { timeout:6000 }).not.toBe(first);
  const grip = popup.getByRole("button", { name: ru ? "Переместить окно подготовки" : "Move preparation window", exact:true });
  const g = (await grip.boundingBox())!;
  await page.mouse.move(g.x+30,g.y+g.height/2); await page.mouse.down(); await page.mouse.move(g.x+30+22,g.y+g.height/2+100,{steps:6}); await page.mouse.up();
  const moved = (await popup.boundingBox())!; expect(moved.y).toBeGreaterThan(b.y+90);
  await panel.evaluate(e => { e.style.left="8px"; e.style.top="40px"; });
  await expect.poll(async () => (await popup.boundingBox())!.y).toBeCloseTo(moved.y, 0);
  await grip.focus(); await page.keyboard.press("ArrowUp"); expect((await popup.boundingBox())!.y).toBeCloseTo(moved.y-8,0);
  await popup.getByRole("button",{name:ru ? "Вернуть справа от персонажей" : "Return beside Characters",exact:true}).click();
  const docked = (await popup.boundingBox())!, updatedPanel = (await panel.boundingBox())!;
  if(width>=770) { expect(docked.x).toBeCloseTo(updatedPanel.x+updatedPanel.width+10,0);expect(docked.y).toBeCloseTo(updatedPanel.y,0); }
  await page.screenshot({path:test.info().outputPath("cast-progress.png")});
  await page.evaluate(() => (window as any).castUpdate("ready"));
  await expect(popup.locator(".dr-cast-spinner")).toHaveCount(0); await expect(popup.locator(".dr-cast-activity")).toHaveCount(0);
  await expect(popup.getByRole("button",{name:ru ? "Подготовить заново" : "Prepare again",exact:true})).toBeVisible();
});
test("cast popup follows its panel until moved and clamps when resizing",async({page})=>{
  await page.setViewportSize({width:1280,height:850});await page.goto("/tests/fixtures/cast.html?compact=1&phase=reading&left=680px&top=150px");
  const popup=page.locator(".dr-cast-status.is-floating"),panel=page.locator(".dr-characters");await expect(popup).toBeVisible();
  await panel.evaluate(e=>{e.style.left="20px";e.style.top="80px";});
  await expect.poll(async()=>(await popup.boundingBox())!.y-(await panel.boundingBox())!.y).toBeCloseTo(0,0);
  await expect.poll(async()=>(await popup.boundingBox())!.x-((await panel.boundingBox())!.x+(await panel.boundingBox())!.width+10)).toBeCloseTo(0,0);
  await page.setViewportSize({width:320,height:480});await expect.poll(async()=>{const b=(await popup.boundingBox())!;return b.x+b.width<=312&&b.y+b.height<=472;}).toBe(true);const b=(await popup.boundingBox())!;
  expect(b.x+b.width).toBeLessThanOrEqual(312);expect(b.y+b.height).toBeLessThanOrEqual(472);
});
test("cast waiting animation respects reduced motion and cancel remains usable",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});await page.goto("/tests/fixtures/cast.html?compact=1&phase=reading");
  const popup=page.locator(".dr-cast-status.is-floating");await expect(popup).toBeVisible();
  expect(await popup.locator(".dr-cast-spinner").evaluate(e=>getComputedStyle(e).animationName)).toBe("none");
  expect(await popup.evaluate(e=>getComputedStyle(e).transitionDuration)).toBe("0s");
  await expect(popup.getByRole("button",{name:"Отменить подготовку",exact:true})).toBeEnabled();
});

for (const locale of ["ru", "en"]) for (const width of [320, 1280]) test(`stale deleted-chat popup can hide, survive refresh and unblock retry: ${locale} ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 700 });
  await page.goto(`/tests/fixtures/cast.html?compact=1&phase=error&cleanup=failed&persist=1&locale=${locale}`);
  const ru = locale === "ru", popup = page.locator(".dr-cast-status.is-floating"), wand = page.locator(".dr-cast-trigger");
  await expect(popup).toBeVisible();
  const before = await page.evaluate(() => (window as any).castSnapshot());
  const retry = popup.getByRole("button", { name: ru ? "Повторить" : "Retry", exact: true });
  await expect(retry).toBeDisabled();
  await popup.getByRole("button", { name: ru ? "Повторить удаление" : "Retry deletion", exact: true }).click();
  await expect(popup.getByRole("alert")).toContainText(ru ? "Служебная вкладка недоступна" : "The service tab is unavailable");
  expect(await page.locator(".dr-cast-setup").evaluate(e => e.getBoundingClientRect().width)).toBeLessThan(50);
  await popup.getByRole("button", { name: ru ? "Скрыть окно подготовки" : "Hide preparation window", exact: true }).click();
  await expect(popup).toHaveCount(0); await expect(wand).toBeFocused();
  await expect.poll(async () => (await page.evaluate(() => (window as any).castSnapshot())).job.statusHidden).toBe(true);
  const statusCount = await page.evaluate(() => (window as any).castMessages.filter((m: any) => m.action === "status").length);
  await expect.poll(() => page.evaluate(() => (window as any).castMessages.filter((m: any) => m.action === "status").length), { timeout: 8000 }).toBeGreaterThan(statusCount);
  await expect(popup).toHaveCount(0);
  await page.reload(); await expect(wand).toHaveAccessibleName(ru ? "Показать подготовку персонажей" : "Show character preparation");
  await expect(popup).toHaveCount(0);
  await wand.click(); await expect(popup).toBeVisible();
  expect(await popup.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("cast-stale-cleanup.png") });
  await popup.getByRole("button", { name: ru ? "Чат уже удалён" : "Chat already deleted", exact: true }).click();
  await expect(retry).toBeEnabled();
  await expect(popup.getByRole("button", { name: ru ? "Повторить удаление" : "Retry deletion", exact: true })).toHaveCount(0);
  const after = await page.evaluate(() => (window as any).castSnapshot());
  expect(after.job.cleanup).toBe("done"); expect(after.job.phase).toBe("error");
  expect(after.job.draft).toEqual(before.job.draft); expect(after.records).toEqual(before.records);
  expect(await page.evaluate(() => (window as any).castMessages.filter((m: any) => ["start", "cancel", "apply"].includes(m.action)))).toEqual([]);
  await wand.click(); await expect(popup).toHaveCount(0); await wand.click(); await expect(popup).toBeVisible();
  await popup.getByRole("button", { name: ru ? "Скрыть окно подготовки" : "Hide preparation window", exact: true }).focus();
  await page.keyboard.press("Escape"); await expect(popup).toHaveCount(0); await expect(wand).toBeFocused();
});

for (const locale of ["ru", "en"]) test(`hidden preparation keeps running and a ready draft stays recoverable: ${locale}`, async ({ page }) => {
  await page.goto(`/tests/fixtures/cast.html?compact=1&phase=analyzing&locale=${locale}`);
  const ru = locale === "ru", popup = page.locator(".dr-cast-status.is-floating"), wand = page.locator(".dr-cast-trigger");
  await expect(popup).toBeVisible();
  await popup.getByRole("button", { name: ru ? "Скрыть окно подготовки" : "Hide preparation window", exact: true }).click();
  await expect(popup).toHaveCount(0);
  await expect.poll(async () => (await page.evaluate(() => (window as any).castSnapshot())).job.statusHidden).toBe(true);
  expect((await page.evaluate(() => (window as any).castSnapshot())).job.phase).toBe("analyzing");
  await page.evaluate(() => (window as any).castUpdate("ready"));
  await expect.poll(async () => (await page.evaluate(() => (window as any).castSnapshot())).job.phase).toBe("ready");
  await expect.poll(() => page.evaluate(() => (window as any).castMessages.filter((m: any) => m.action === "status").length)).toBeGreaterThanOrEqual(2);
  await expect(popup).toHaveCount(0); await wand.click(); await expect(popup).toBeVisible();
  await popup.getByRole("button", { name: ru ? "Проверить персонажей" : "Review characters", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => (window as any).castMessages.filter((m: any) => ["start", "cancel", "cleanup", "apply"].includes(m.action)))).toEqual([]);
});

test("a delayed status response cannot reopen a hidden popup", async ({ page }) => {
  await page.goto("/tests/fixtures/cast.html?compact=1&phase=error&cleanup=failed");
  const popup = page.locator(".dr-cast-status.is-floating"); await expect(popup).toBeVisible();
  await page.evaluate(() => { (window as any).castDelayStatus = true; });
  await expect.poll(() => page.evaluate(() => !!(window as any).castHeld)).toBe(true);
  await popup.getByRole("button", { name: "Скрыть окно подготовки", exact: true }).click();
  await expect.poll(async () => (await page.evaluate(() => (window as any).castSnapshot())).job.statusHidden).toBe(true);
  await page.evaluate(() => (window as any).castReleaseStatus());
  await expect(page.locator(".dr-cast-trigger")).toHaveAccessibleName("Показать подготовку персонажей");
  await expect(popup).toHaveCount(0);
});

test("close remains usable during an acknowledgement and its late result cannot reopen the popup", async ({ page }) => {
  await page.goto("/tests/fixtures/cast.html?compact=1&phase=error&cleanup=failed");
  const popup = page.locator(".dr-cast-status.is-floating"); await expect(popup).toBeVisible();
  await page.evaluate(() => { (window as any).castDelayAction = "confirm-cleanup"; });
  const acknowledge = popup.getByRole("button", { name: "Чат уже удалён", exact: true }); await acknowledge.click();
  await expect.poll(() => page.evaluate(() => !!(window as any).castHeldAction)).toBe(true); await expect(acknowledge).toBeDisabled();
  const close = popup.getByRole("button", { name: "Скрыть окно подготовки", exact: true }); await expect(close).toBeEnabled(); await close.click();
  await expect(popup).toHaveCount(0);
  await expect.poll(async () => (await page.evaluate(() => (window as any).castSnapshot())).job.statusHidden).toBe(true);
  await page.evaluate(() => (window as any).castReleaseAction());
  await expect(page.locator(".dr-cast-trigger")).toHaveAccessibleName("Показать подготовку персонажей");
  await expect(popup).toHaveCount(0);
  expect((await page.evaluate(() => (window as any).castSnapshot())).job.cleanup).toBe("done");
});
