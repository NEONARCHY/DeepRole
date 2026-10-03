import { expect, test } from "@playwright/test";

for (const height of [600, 700, 900]) test(`selected map card remains reachable in a 360x${height} window`, async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Лор", exact: true }).click();
  await page.getByRole("button", { name: "Загрузить готовый лор", exact: true }).click();
  await page.getByLabel("Выбрать JSON", { exact: true }).setInputFiles({ name: "QA geometry.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ entries: [{ title: "Mira_portrait", content: "Mira wears a blue coat." }, { title: "Mira_personality", content: "Mira is patient." }] })) });
  await page.getByRole("button", { name: "Подтвердить импорт", exact: true }).click();
  await page.getByRole("button", { name: "Открыть карту мира", exact: true }).click();
  await page.setViewportSize({ width: 360, height });
  const map = page.getByRole("dialog", { name: "Карта мира", exact: true });
  await map.getByRole("textbox", { name: "Найти запись или ветвь…", exact: true }).fill("Mira");
  await map.locator(".lm-results").getByRole("button", { name: "Mira", exact: true }).click();
  const node = map.locator('[data-lore-id="branch:person:mira"]');
  await expect(node).toHaveAttribute("aria-expanded", "true");
  const geometry = await map.evaluate(el => {
    const node = el.querySelector('[data-lore-id="branch:person:mira"]')!.getBoundingClientRect();
    const popup = el.querySelector(".lm-popover")!.getBoundingClientRect();
    const viewport = el.querySelector(".lm-viewport")!.getBoundingClientRect();
    return { node: node.toJSON(), popup: popup.toJSON(), viewport: viewport.toJSON() };
  });
  await info.attach("geometry", { body: JSON.stringify(geometry), contentType: "application/json" });
  await page.screenshot({ path: info.outputPath(`map-card-${height}.png`) });
  await expect.poll(() => node.evaluate(el => {
    const box = el.getBoundingClientRect();
    return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest("button") === el;
  })).toBe(true);
  const camera = await map.locator(".lm-space").getAttribute("style");
  await node.dblclick();
  await expect(node).toHaveAttribute("aria-expanded", "false");
  expect(await map.locator(".lm-space").getAttribute("style")).toBe(camera);
});
