import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { relationshipText } from "../../src/core/relationship-i18n";

for (const locale of ["ru", "en"] as const) for (const width of [360, 1280]) test(`relationship editing, locked sync and display ${locale} ${width}`, async ({ page }, info) => {
  const t = (key: Parameters<typeof relationshipText>[1]) => relationshipText(locale, key);
  await page.setViewportSize({ width, height: 900 }); await page.goto(`/tests/fixtures/relationships.html?locale=${locale}`);
  await expect(page.getByRole("switch", { name: t("enabled"), exact: true })).toBeChecked();
  const mira = page.locator(".dr-character-row").filter({ hasText: "Mira" }); await expect(mira).toContainText(t("trusting")); await expect(mira).toContainText("65");
  await mira.click(); const dialog = page.getByRole("dialog"); await dialog.getByRole("tab", { name: t("title"), exact: true }).click();
  const current = dialog.getByRole("region", { name: t("current"), exact: true });
  await current.getByLabel(t("trust"), { exact: true }).fill(""); await expect(current.getByLabel(t("trust"), { exact: true })).toHaveValue("");
  await dialog.getByRole("tab", { name: locale === "ru" ? "Анкета" : "Profile", exact: true }).click(); await dialog.getByRole("button", { name: locale === "ru" ? "Сохранить персонажа" : "Save character", exact: true }).click(); await expect(dialog.getByRole("tab", { name: t("title"), exact: true })).toHaveAttribute("aria-selected", "true");
  await current.getByLabel(t("trust"), { exact: true }).fill("80"); await current.getByLabel(t("affinity"), { exact: true }).fill("77");
  await current.getByRole("switch", { name: t("locked") }).check();
  await dialog.getByLabel(t("boundaries"), { exact: true }).fill("Values honesty; no pressure. 🌿"); await dialog.getByRole("switch", { name: t("romance"), exact: true }).check();
  await dialog.getByRole("button", { name: t("addEvent"), exact: true }).click(); await dialog.getByLabel(`${t("eventLabel")} 1`, { exact: true }).fill("Kept a promise"); await dialog.getByRole("switch", { name: t("completed"), exact: true }).check();
  await expect(dialog).toContainText(t("eligible"));
  await dialog.getByRole("button", { name: locale === "ru" ? "Сохранить персонажа" : "Save character", exact: true }).click(); await expect(dialog.locator("footer [role=status]")).toBeVisible();
  await dialog.locator('[data-editor-section="relationships"] .dr-bond-history summary').click(); await expect(dialog.locator('[data-editor-section="relationships"] .dr-bond-history')).toContainText(t("manual"));
  await expect(dialog).toHaveJSProperty("scrollWidth", await dialog.evaluate(el => el.clientWidth));
  expect((await new AxeBuilder({ page }).include(".dr-character-dialog").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath(`relationships-${locale}-${width}.png`) });
  await dialog.getByRole("button", { name: locale === "ru" ? "Закрыть" : "Close", exact: true }).last().click();
  await page.evaluate(() => (window as any).playEvent());
  const stored = await page.evaluate(async () => (await (window as any).records()).find((r: any) => r.kind === "binding").data.characterScenes.world.states.mira.bonds.hero);
  expect(stored).toMatchObject({ trust: 80, affinity: 77, locked: true }); expect(stored.history).toHaveLength(1); expect(stored.history[0].before).toEqual({ trust: 65, affinity: 55 });
  await page.getByLabel(t("display"), { exact: true }).selectOption("stages"); await expect(mira).toContainText(t("close")); await expect(mira.locator(".dr-bond-summary")).not.toContainText("80");
  await page.getByLabel(t("display"), { exact: true }).selectOption("numbers"); await expect(mira.locator(".dr-bond-summary")).toContainText("80"); await expect(mira.locator(".dr-bond-summary")).not.toContainText(t("close"));
  await page.getByRole("switch", { name: t("enabled"), exact: true }).uncheck(); await expect(mira.locator(".dr-bond-summary")).toHaveCount(0); await page.evaluate(() => (window as any).playEvent());
  expect(await page.evaluate(async () => (await (window as any).records()).find((r: any) => r.kind === "binding").data.characterScenes.world.states.mira.bonds.hero.trust)).toBe(80);
  expect((await page.evaluate(() => (window as any).exportWorld())).records.find((r: any) => r.id === "mira").data.characterSheet.relationships.boundaries).toContain("🌿");
});

for (const locale of ["ru", "en"] as const) for (const width of [360, 1280]) test(`new world with relationship starting cast ${locale} ${width}`, async ({ page }, info) => {
  const t = (key: Parameters<typeof relationshipText>[1]) => relationshipText(locale, key);
  await page.setViewportSize({ width, height: 900 }); await page.goto(`/tests/fixtures/relationships.html?locale=${locale}`); await page.getByRole("button", { name: locale === "ru" ? "Новый мир" : "New world", exact: true }).click();
  const create = page.locator(".lm-create-dialog"); await create.getByLabel(locale === "ru" ? "Название" : "Name", { exact: true }).fill("Quiet harbor");
  await create.locator("summary").filter({ hasText: t("setupTitle") }).click(); await create.getByLabel(t("heroName"), { exact: true }).fill("Leon"); await create.getByRole("button", { name: t("addPerson"), exact: true }).click();
  await create.getByLabel(`${t("personName")} 1`, { exact: true }).fill("Mira"); await create.getByLabel(t("preset"), { exact: true }).selectOption("attracted");
  await expect(create.getByRole("switch", { name: /18|adult|совершеннолет/i })).toHaveCount(0);
  await expect(create.getByLabel(t("trust"), { exact: true })).toHaveValue("25"); await expect(create.getByLabel(t("affinity"), { exact: true })).toHaveValue("80");
  const overflow = await create.evaluate(root => [...root.querySelectorAll<HTMLElement>("*")].filter(el => el.getBoundingClientRect().right > root.getBoundingClientRect().right + 1).map(el => ({ tag: el.tagName, class: el.className, text: el.textContent?.slice(0, 50) })));
  expect(overflow).toEqual([]);
  await expect.poll(() => create.evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
  expect((await new AxeBuilder({ page }).include(".lm-create-dialog").withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath(`relationship-world-${locale}-${width}.png`) }); await create.getByRole("button", { name: t("createWorld"), exact: true }).click(); await expect(create).toHaveCount(0);
  const created = await page.evaluate(async () => { const world = (window as any).createdWorld; return (await (window as any).records()).filter((r: any) => r.data.worldId === world.id); });
  expect(created.find((r: any) => r.kind === "entity" && r.data.name === "Leon").data.characterSheet.protagonist).toBe(true);
  expect(created.find((r: any) => r.kind === "entity" && r.data.name === "Mira").data.characterSheet).toMatchObject({ relationships: { initial: { trust: 25, affinity: 80 }, romance: false } });
  expect(created.find((r: any) => r.kind === "entry").data.activation).toBe("always");
});

test("unlocked relationship updates come from narrative, not option previews", async ({ page }) => {
  await page.goto("/tests/fixtures/relationships.html?locale=en"); await expect(page.locator(".dr-character-row").filter({ hasText: "Mira" })).toBeVisible(); await page.evaluate(() => (window as any).playEvent());
  let state = await page.evaluate(async () => (await (window as any).records()).find((r: any) => r.kind === "binding").data.characterScenes.world.states.mira);
  expect(state.bonds.hero).toMatchObject({ trust: 68, affinity: 57 }); expect(state.bonds.hero.history[0].quote).toContain("keeping his promise");
  await page.evaluate(() => (window as any).playEvent({}, '<deeprole_choices>{"quote":"Mira thanked Leon for keeping his promise."}</deeprole_choices>'));
  state = await page.evaluate(async () => (await (window as any).records()).find((r: any) => r.kind === "binding").data.characterScenes.world.states.mira); expect(state.bonds.hero).toMatchObject({ trust: 68, affinity: 57 }); expect(state.bonds.hero.history).toHaveLength(1);
});

test("new conditions do not inherit an old event's completion and duplicate names keep the draft", async ({ page }) => {
  const t = (key: Parameters<typeof relationshipText>[1]) => relationshipText("en", key);
  await page.goto("/tests/fixtures/relationships.html?locale=en"); await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click(); const dialog = page.getByRole("dialog"); await dialog.getByRole("tab", { name: t("title"), exact: true }).click();
  await dialog.getByRole("button", { name: t("addEvent"), exact: true }).click(); const event = dialog.getByLabel(`${t("eventLabel")} 1`, { exact: true }); await event.fill("Kept a promise"); await dialog.getByRole("switch", { name: t("completed"), exact: true }).check(); await dialog.getByRole("button", { name: "Save character", exact: true }).click(); await expect(dialog.locator("footer [role=status]")).toBeVisible();
  const oldId = await page.evaluate(async () => (await (window as any).records()).find((r: any) => r.id === "mira").data.characterSheet.relationships.milestones[0].id);
  await event.fill("Resolved a disagreement"); await expect(dialog.getByRole("switch", { name: t("completed"), exact: true })).not.toBeChecked(); await expect(event).toHaveValue("Resolved a disagreement"); await dialog.getByRole("button", { name: "Save character", exact: true }).click(); await expect.poll(() => page.evaluate(async () => (await (window as any).records()).find((r: any) => r.id === "mira").data.characterSheet.relationships.milestones[0].id)).not.toBe(oldId); await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
  await page.getByRole("button", { name: "New world", exact: true }).click(); const form = page.locator(".lm-create-dialog"); await form.getByLabel("Name", { exact: true }).fill("Harbor"); await form.locator("summary").filter({ hasText: t("setupTitle") }).click(); await form.getByLabel(t("heroName"), { exact: true }).fill("Leon"); await form.getByRole("button", { name: t("addPerson"), exact: true }).click(); await form.getByLabel(`${t("personName")} 1`, { exact: true }).fill("LEON"); await form.getByRole("button", { name: t("createWorld"), exact: true }).click(); await expect(form.getByRole("alert")).toHaveText(t("duplicateNames")); expect(await page.evaluate(() => (window as any).createdWorld)).toBeUndefined(); await expect(form.getByLabel(t("heroName"), { exact: true })).toHaveValue("Leon");
  await form.getByLabel(`${t("personName")} 1`, { exact: true }).fill("Mira"); await form.getByRole("button", { name: t("createWorld"), exact: true }).click(); await expect(form).toHaveCount(0);
});
