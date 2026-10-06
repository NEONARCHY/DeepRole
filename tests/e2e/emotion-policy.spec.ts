import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { characterTab } from "./character-helpers";
import { emotionOptionLabel, EMPTY_CHARACTER } from "../../src/core/characters";
import { emotionPolicyText } from "../../src/core/emotion-policy-i18n";
import { setEnglish } from "./helpers/settings";

for (const locale of ["ru", "en"] as const) for (const width of [360, 1280]) test(`personal emotion rules keep images and use safe moods ${locale} ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto(`/tests/fixtures/characters.html?locale=${locale}`);
  const images = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 24; c.height = 32; const ctx = c.getContext("2d")!; ctx.fillStyle = "#557799"; ctx.fillRect(0, 0, 24, 32); const neutral = c.toDataURL(); ctx.fillStyle = "#995577"; ctx.fillRect(0, 0, 24, 32); const happy = c.toDataURL(); const cast = (window as any).getCast(); const entities = cast.entities.map((person: any) => person.id === "mira" ? { ...person, characterSheet: { ...person.characterSheet, sprites: { neutral, happy }, portraitLibrary: [happy] } } : person); (window as any).setCast({ entities }); return { neutral, happy }; });
  await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click(); const dialog = page.getByRole("dialog"); const policy = dialog.locator(".dr-emotion-policy");
  await expect(policy).toContainText(emotionPolicyText(locale, "count", { count: 6, total: 6 })); await policy.locator("summary").first().click();
  const allowed = (key: string) => policy.getByRole("switch", { name: emotionPolicyText(locale, "allow", { emotion: emotionOptionLabel(locale, key) }), exact: true });
  await expect(allowed("neutral")).toBeChecked(); await expect(allowed("neutral")).toBeDisabled(); await allowed("happy").focus(); await allowed("happy").press("Space"); await expect(allowed("happy")).not.toBeChecked();
  const search = policy.getByRole("searchbox"); await search.fill("happy"); await expect(policy.getByRole("switch")).toHaveCount(1); await search.fill("");
  expect((await new AxeBuilder({ page }).include(".dr-emotion-policy").withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
  expect(await policy.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true); await policy.evaluate(el => el.scrollIntoView({ block: "start" })); await page.screenshot({ path: info.outputPath(`emotion-policy-${locale}-${width}.png`) });
  await characterTab(dialog, "scene", locale); await expect(dialog.getByLabel(locale === "ru" ? "Настроение" : "Mood", { exact: true })).toHaveValue("neutral");
  expect(await dialog.getByLabel(locale === "ru" ? "Настроение" : "Mood", { exact: true }).locator("option").evaluateAll(nodes => nodes.map(node => (node as HTMLOptionElement).value))).not.toContain("happy");
  await characterTab(dialog, "images", locale); await expect(dialog.locator(".dr-character-portrait-editor img")).toHaveAttribute("src", images.happy); await expect(dialog.locator(".dr-emotion-policy-notice")).toContainText(emotionPolicyText(locale, "unavailable"));
  await dialog.getByRole("button", { name: emotionPolicyText(locale, "manage"), exact: true }).click();
  await expect(dialog.getByRole("tab", { name: locale === "ru" ? "Анкета" : "Profile", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(policy.getByRole("searchbox")).toBeFocused(); await characterTab(dialog, "images", locale);
  await dialog.getByRole("button", { name: locale === "ru" ? "Сохранить персонажа" : "Save character", exact: true }).click(); await expect(dialog.locator("footer [role=status]")).toHaveText(locale === "ru" ? "Сохранено" : "Saved");
  const stored = await page.evaluate(() => { const cast = (window as any).getCast(); return { sheet: cast.entities.find((p: any) => p.id === "mira").characterSheet, state: cast.scene.states.mira }; });
  expect(stored.sheet).toMatchObject({ blockedEmotions: ["happy"], sprites: images }); expect(stored.state).toMatchObject({ emotion: "neutral", condition: "Safe" });
  await expect(dialog.locator(".dr-character-portrait-editor img")).toHaveAttribute("src", images.happy); await expect(dialog).toBeVisible();
  await dialog.locator("header").getByRole("button", { name: locale === "ru" ? "Закрыть" : "Close", exact: true }).click();
  await expect(page.locator('.dr-cast-widget[data-character-id="mira"] img')).toHaveAttribute("src", images.neutral);
  await page.locator(".dr-character-row").filter({ hasText: "Mira" }).click(); await dialog.locator(".dr-emotion-policy summary").first().click(); await dialog.getByRole("button", { name: emotionPolicyText(locale, "all"), exact: true }).click();
  await characterTab(dialog, "scene", locale); expect(await dialog.getByLabel(locale === "ru" ? "Настроение" : "Mood", { exact: true }).locator("option").evaluateAll(nodes => nodes.map(node => (node as HTMLOptionElement).value))).toContain("happy");
  await dialog.getByRole("button", { name: locale === "ru" ? "Сохранить персонажа" : "Save character", exact: true }).click();
  expect(await page.evaluate(() => (window as any).getCast().entities.find((p: any) => p.id === "mira").characterSheet.blockedEmotions)).toBeUndefined();
});

for (const locale of ["ru", "en"] as const) test(`world library emotion rules work without a connected chat ${locale}`, async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 }); await page.goto("/tests/fixtures/sidepanel.html"); if (locale === "en") { await page.getByRole("button", { name: "Настройки", exact: true }).click(); await setEnglish(page); }
  await page.getByRole("button", { name: locale === "ru" ? "Лор" : "Lore", exact: true }).click();
  const world = { id: "w", name: "Harbor", description: "Keep all lore", color: "#123456", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
  const person = { id: "mira", name: "Mira", worldId: "w", kind: "character", description: "Original profile", aliases: [], memberIds: [], characterSheet: EMPTY_CHARACTER, createdAt: 1, updatedAt: 1 };
  await page.getByRole("button", { name: locale === "ru" ? "Загрузить готовый лор" : "Import existing lore", exact: true }).click();
  await page.getByLabel(locale === "ru" ? "Выбрать JSON" : "Choose JSON", { exact: true }).setInputFiles({ name: "world.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ format: "deeprole-world", version: 1, records: [{ kind: "world", id: "w", data: world }, { kind: "entity", id: person.id, data: person }] })) });
  await page.getByRole("button", { name: locale === "ru" ? "Подтвердить импорт" : "Confirm import", exact: true }).click();
  await page.getByRole("button", { name: locale === "ru" ? "Мир и профили" : "World & profiles", exact: true }).click();
  await page.locator(".rp-card").filter({ hasText: "Mira" }).getByRole("button", { name: locale === "ru" ? "Изменить" : "Edit", exact: true }).click();
  const policy = page.locator(".rp-editor .dr-emotion-policy"); await policy.locator("summary").first().click();
  await policy.getByRole("switch", { name: emotionPolicyText(locale, "allow", { emotion: emotionOptionLabel(locale, "angry") }), exact: true }).uncheck();
  await page.locator(".rp-editor").getByRole("button", { name: locale === "ru" ? "Сохранить" : "Save", exact: true }).click();
  await expect(page.locator(".rp-editor")).toHaveCount(0);
  expect(await page.evaluate(async () => { const { repository } = await import("/src/storage/repository.ts" as string); return (await repository.list("entity")).find((person: any) => person.name === "Mira")?.characterSheet.blockedEmotions; })).toEqual(["angry"]);
});
