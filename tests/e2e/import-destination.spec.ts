import { expect, test } from "@playwright/test";
import { menuText } from "../../src/core/menu-i18n";
import { sceneText } from "../../src/core/scene-i18n";
import { experienceText } from "../../src/core/experience-i18n";
import { navigationText } from "../../src/core/navigation-i18n";
import { mapText } from "../../src/core/map-i18n";

for (const locale of ["ru", "en"] as const) test(`preview an existing world's book with the keyboard (${locale})`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 420 });
  await page.emulateMedia({ colorScheme: locale === "ru" ? "light" : "dark" });
  await page.goto("/tests/fixtures/sidepanel.html?world&locale=" + locale);
  await page.addStyleTag({ content: "html { font-size: 125% }" });
  await page.getByRole("button", { name: navigationText(locale, "worlds"), exact: true }).click();
  const open = page.getByRole("button", { name: experienceText(locale, "import"), exact: true });
  await open.press("Enter");
  const dialog = page.getByRole("dialog", { name: sceneText(locale, "importFile") });
  const fileName = "Archive".repeat(18) + ".json";
  await dialog.locator('input[type="file"]').setInputFiles({
    name: fileName, mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify([{ title: "Harbor", content: "The lens is in the lighthouse." }])),
  });
  await expect(dialog.getByText(fileName, { exact: true })).toBeVisible();
  const destination = dialog.getByRole("combobox", { name: sceneText(locale, "destination") });
  await destination.press("Enter");
  await expect(dialog.getByRole("listbox")).toBeVisible();
  await destination.press("Escape");
  await expect(dialog.getByRole("listbox")).toHaveCount(0);
  await expect(destination).toBeFocused();
  await destination.selectOption("world-a");
  const confirm = dialog.getByRole("button", { name: sceneText(locale, "confirmImport"), exact: true });
  await expect(confirm).toHaveAccessibleDescription(sceneText(locale, "importExistingLibrary", { world: "Observatory" }));
  await expect(dialog.getByRole("checkbox", { name: menuText(locale, "attachImport") })).not.toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: menuText(locale, "attachImport") })).toHaveAccessibleDescription(new RegExp(sceneText(locale, "importAlreadyActive")));
  await dialog.getByRole("textbox", { name: sceneText(locale, "importBookName") }).fill("Lighthouse log");
  await expect(dialog.getByRole("button", { name: sceneText(locale, "changeFile") })).toBeVisible();
  expect(await dialog.locator(".modal-body").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await confirm.press("Enter");
  await expect(dialog).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const { repository } = await import("/src/storage/repository.ts" as string);
    const books = await repository.list("book");
    const worlds = await repository.list("world");
    return { bookWorld: books.find((book: { name: string }) => book.name === "Lighthouse log")?.worldId, worlds: worlds.length };
  });
  expect(result).toEqual({ bookWorld: "world-a", worlds: 2 });
});

for (const locale of ["ru", "en"] as const) test(`create in the library and explicitly connect from the map (${locale})`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 420 });
  await page.emulateMedia({ colorScheme: locale === "ru" ? "dark" : "light", reducedMotion: "reduce" });
  await page.goto("/tests/fixtures/sidepanel.html?play=first&locale=" + locale);
  await page.addStyleTag({ content: "html { font-size: 125% }" });
  await page.getByRole("button", { name: navigationText(locale, "worlds"), exact: true }).click();
  await page.getByRole("button", { name: experienceText(locale, "create"), exact: true }).press("Enter");
  const form = page.getByRole("dialog", { name: mapText(locale, "createWorldTitle"), exact: true });
  const name = form.getByRole("textbox", { name: sceneText(locale, "name"), exact: true });
  await name.fill("Lighthouse");
  await form.locator(".dr-bond-setup summary").press("Enter");
  expect(await form.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  for (const control of await form.locator(".lm-create-colors label, .lm-create-check, .dr-bond-setup summary, button:not(:disabled)").all()) {
    const box = await control.boundingBox();
    if (box) { expect(box.height).toBeGreaterThanOrEqual(44); expect(box.width).toBeGreaterThanOrEqual(44); }
  }
  await form.getByRole("button", { name: mapText(locale, "createEmpty"), exact: true }).press("Enter");
  const connect = page.getByRole("button", { name: mapText(locale, "attachWorld"), exact: true });
  await expect(connect).toBeVisible();
  expect(await page.evaluate(() => (window as any).playSceneChanges)).toHaveLength(0);
  await connect.press("Enter");
  await expect.poll(() => page.evaluate(() => (window as any).playSceneChanges.length)).toBe(1);
});
