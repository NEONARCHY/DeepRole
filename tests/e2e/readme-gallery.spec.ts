import { expect, test } from "@playwright/test";
import { setEnglish } from "./helpers/settings";

test("current English scene is ready for README screenshots", async ({ page }, info) => {
  await page.setViewportSize({ width: 1400, height: 700 });
  await page.goto("/tests/fixtures/characters.html?locale=en");
  await page.evaluate(() => {
    document.querySelector("h1")?.remove();
    const app = document.querySelector("#app") as HTMLElement;
    app.style.position = "absolute";
    app.style.left = "-10000px";
    const conversation = document.querySelector("#conversation") as HTMLElement;
    Object.assign(conversation.style, { width: "690px", maxWidth: "690px", margin: "70px auto 0", padding: "0" });
    const cast = (window as any).getCast();
    (window as any).setCast({ scene: { ...cast.scene, partnerIds: ["mira"], partnerId: "mira", states: { ...cast.scene.states, mira: { ...cast.scene.states.mira, stats: [{ label: "Energy", value: "Rested" }, { label: "Trust", value: "Cautious" }] } } } });
  });
  const choices = page.locator("[data-deeprole-choices-host] section");
  const portraits = page.locator("[data-deeprole-portrait-layer] .dr-cast-widget");
  await expect(choices.getByRole("button")).toHaveCount(5);
  await expect(portraits).toHaveCount(2);
  await expect(page.getByText("Your move", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("scene-en.png"), clip: { x: 0, y: 58, width: 1400, height: 480 }, animations: "disabled" });
  await choices.screenshot({ path: info.outputPath("choices-en.png"), animations: "disabled" });
});

test("current English world map is ready for README screenshots", async ({ page }, info) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await setEnglish(page);
  await page.evaluate(async () => {
    const { repository } = await import("/src/storage/repository.ts" as string);
    const now = Date.now();
    await repository.put("world", { id: "demo", name: "The Observatory", description: "", color: "#64b5f6", contextBudget: 2000, relevanceThreshold: 6, createdAt: now, updatedAt: now });
    for (const [index, title, content] of [
      [1, "Mira — keeper", "Mira protects the observatory."],
      [2, "The brass key", "The key opens the north door."],
      [3, "Nightfall", "The city gates close at dusk."],
      [4, "Observatory rule", "Do not enter the tower alone."],
    ] as const) await repository.put("entry", { id: `demo-${index}`, worldId: "demo", bookId: null, title, content, keywords: [], activation: "smart", priority: "normal", enabled: true, source: { type: "manual" }, createdAt: now, updatedAt: now });
  });
  await page.getByRole("button", { name: "Lore", exact: true }).click();
  await page.getByRole("button", { name: /^World library:/ }).click();
  await page.getByRole("menuitemradio", { name: "The Observatory", exact: true }).click();
  await page.getByRole("button", { name: "Open world map", exact: true }).click();
  const map = page.getByRole("dialog", { name: "World map", exact: true });
  await map.getByRole("button", { name: "Expand to full screen", exact: true }).click();
  await expect(map.locator(".lm-node.node-entry")).toHaveCount(4);
  await page.screenshot({ path: info.outputPath("map-en.png"), animations: "disabled" });
});

test("current English review is ready for README screenshots", async ({ page }, info) => {
  await page.setViewportSize({ width: 900, height: 760 });
  await page.goto("/tests/fixtures/page-widget.html?assistant=1&locale=en");
  await page.evaluate(() => {
    const entry = { id: "m1", bookId: null, title: "Mira's oath", content: "Mira will stay in town until sunrise.", keywords: ["Mira"], activation: "smart", priority: "high", enabled: true, source: { type: "manual" }, createdAt: 1, updatedAt: 1 };
    (window as any).setWidgetState({ proposals: [{ id: "batch", worldId: null, bookId: null, chatId: "chat", focusIds: [], requestType: "memory-analysis", createdAt: 1, updatedAt: 1, items: [{ id: "c", title: "Mira's oath", content: "The promise now expires at noon.", keywords: [], activation: "smart", priority: "normal", bookId: null, selected: true, targetEntryId: entry.id, expectedEntry: entry }] }] });
  });
  await page.getByRole("button", { name: "Review changes", exact: true }).click();
  const review = page.getByRole("region", { name: "Review changes", exact: true });
  await review.locator(".dr-proposal-summary").click();
  await review.getByRole("checkbox").check();
  await expect(review.getByRole("button", { name: "Save selected changes · 1", exact: true })).toBeVisible();
  await review.screenshot({ path: info.outputPath("review-en.png"), animations: "disabled" });
});
