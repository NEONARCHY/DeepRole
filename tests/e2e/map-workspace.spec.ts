import { setEnglish } from "./helpers/settings";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function setup(page: Page, locale: "ru" | "en") {
  await page.setViewportSize({ width: 1400, height: 950 }); await page.goto("/tests/fixtures/sidepanel.html");
  const l = (ru: string, en: string) => locale === "ru" ? ru : en;
  if (locale === "en") { await page.getByRole("button", { name: "Настройки", exact: true }).click(); await setEnglish(page); }
  await page.evaluate(async () => {
    const { repository } = await import("/src/storage/repository.ts" as string);
    const world = (id: string) => ({ id, name: id === "w1" ? "Observatory" : "Harbour", description: "", color: "#64b5f6", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1, mapLayout: { positions: Object.fromEntries([1, 2, 3].map((i) => ["entry:" + id + i, { x: 2350 + (i - 2) * 450, y: 2700 }])), customCategories: [], expandedIds: [] } });
    await repository.mergeRecords([...["w1", "w2"].map((id) => ({ kind: "world", id, data: world(id) })), ...["w1", "w2"].flatMap((worldId) => [1, 2, 3].map((i) => ({ kind: "entry", id: worldId + i, data: { id: worldId + i, worldId, bookId: null, title: `${worldId} Fact ${i}`, content: `Neutral fact ${i} of ${worldId}.`, keywords: [], activation: "smart", enabled: true, priority: "normal", source: { type: "manual" }, createdAt: 1, updatedAt: 1 } })))]);
  });
  await page.getByRole("button", { name: l("Лор", "Lore"), exact: true }).click();
  await page.getByRole("button", { name: new RegExp("^" + l("Библиотека мира", "World library") + ":") }).click();
  await page.getByRole("menuitemradio", { name: "Observatory", exact: true }).click();
  await page.getByRole("button", { name: l("Открыть карту мира", "Open world map"), exact: true }).click();
  const map = page.getByRole("dialog", { name: l("Карта мира", "World map"), exact: true }); const pane = (i: number) => map.locator(`[data-map-pane="${i}"]`);
  // The default is a floating window. These gesture tests explicitly use the large canvas.
  await map.getByRole("button", { name: l("Развернуть на весь экран", "Expand to full screen"), exact: true }).click();
  await expect.poll(async () => Math.round((await map.boundingBox())!.width)).toBe(1400);
  await expect.poll(async () => { const canvas = (await pane(0).locator(".lm-viewport").boundingBox())!; const root = (await pane(0).locator(".node-world").boundingBox())!; return Math.abs(root.x + root.width / 2 - canvas.x - canvas.width / 2) + Math.abs(root.y + root.height / 2 - canvas.y - canvas.height / 2); }).toBeLessThan(1);
  return { map, pane, l };
}
async function rows(page: Page) { return page.evaluate(async () => (await import("/src/storage/repository.ts" as string)).repository.rawRecords()); }
async function points(page: Page, pane = 0) { return page.locator(`[data-map-pane="${pane}"] .lm-node-wrap`).evaluateAll((elements) => Object.fromEntries(elements.map((node) => [(node.querySelector("[data-lore-id]") as HTMLElement).dataset.loreId, { x: parseFloat((node as HTMLElement).style.left), y: parseFloat((node as HTMLElement).style.top) }]))); }
for (const locale of ["ru", "en"] as const) {
  test(`frame selection moves only chosen cards with stable neighbours and one undo (${locale})`, async ({ page }) => {
    const { map, pane, l } = await setup(page, locale); const left = pane(0);
    const camera = await left.locator(".lm-space").getAttribute("style"); const before = await points(page); const records = await rows(page);
    const a = (await left.locator('[data-lore-id="entry:w11"]').boundingBox())!; const b = (await left.locator('[data-lore-id="entry:w12"]').boundingBox())!;
    const start = { x: a.x - 10, y: a.y + a.height / 2 - 3 }; const end = { x: b.x + b.width + 10, y: b.y + b.height / 2 + 3 };
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 10 }); await expect(left.locator(".lm-marquee")).toBeVisible(); await page.mouse.up();
    await expect(left.locator(".is-box-selected")).toHaveCount(2); expect(await left.locator(".lm-space").getAttribute("style")).toBe(camera);
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down(); await page.mouse.move(a.x + a.width / 2 + 65, a.y + a.height / 2 + 35, { steps: 12 }); await page.mouse.up();
    await expect(left.getByRole("button", { name: l("Отменить", "Undo"), exact: true })).toBeEnabled(); const moved = await points(page);
    for (const [id, point] of Object.entries(before) as [string, any][]) { if (["entry:w11", "entry:w12"].includes(id)) { expect(moved[id].x).toBeGreaterThan(point.x); expect(moved[id].y).toBeGreaterThan(point.y); } else expect(moved[id]).toEqual(point); }
    expect(moved["entry:w12"].x - moved["entry:w11"].x).toBeCloseTo(before["entry:w12"].x - before["entry:w11"].x, 5);
    expect((await rows(page)).filter((row: any) => row.kind === "entry")).toEqual(records.filter((row: any) => row.kind === "entry"));
    await left.locator(".lm-viewport").focus(); await page.keyboard.press("Control+z"); await expect(left.getByRole("button", { name: l("Повторить", "Redo"), exact: true })).toBeEnabled(); expect(await points(page)).toEqual(before);
    await page.keyboard.press("Control+Shift+z"); await expect(left.getByRole("button", { name: l("Отменить", "Undo"), exact: true })).toBeEnabled(); expect(await points(page)).toEqual(moved);
    await left.locator('[data-lore-id="entry:w13"]').click({ modifiers: ["Control"] }); await expect(left.locator(".is-box-selected")).toHaveCount(3);
    await left.locator(".lm-viewport").focus(); await page.keyboard.press("Control+a"); await expect(left.locator(".is-box-selected")).toHaveCount(await left.locator(".lm-node").count());
  });
  test(`middle drag and scrolling pan, left drag does not, wheel zoom still works (${locale})`, async ({ page }) => {
    const { pane } = await setup(page, locale); const left = pane(0); const canvas = left.locator(".lm-viewport"); const box = (await canvas.boundingBox())!; const transform = () => left.locator(".lm-space").getAttribute("style"); const initial = await transform();
    await page.mouse.move(box.x + 15, box.y + 15); await page.mouse.down({ button: "middle" }); await page.mouse.move(box.x + 85, box.y + 55, { steps: 8 }); await page.mouse.up({ button: "middle" }); expect(await transform()).not.toBe(initial);
    const node = (await left.locator(".node-world").boundingBox())!; const beforeNodePan = await points(page); const beforeNodeCamera = await transform();
    await page.mouse.move(node.x + node.width / 2, node.y + node.height / 2); await page.mouse.down({ button: "middle" }); await page.mouse.move(node.x + node.width / 2 + 30, node.y + node.height / 2 + 20, { steps: 5 }); await page.mouse.up({ button: "middle" }); expect(await transform()).not.toBe(beforeNodeCamera); expect(await points(page)).toEqual(beforeNodePan);
    const panned = await transform(); await page.mouse.move(box.x + 18, box.y + 18); await page.mouse.wheel(0, 40); await expect.poll(transform).not.toBe(panned);
    const scale = await left.locator("output").textContent(); await page.keyboard.down("Control"); await page.mouse.wheel(0, -80); await page.keyboard.up("Control"); await expect(left.locator("output")).not.toHaveText(scale!);
  });
  test(`split panes edit independently, protect drafts and create an actually empty world (${locale})`, async ({ page }, info) => {
    const { map, pane, l } = await setup(page, locale); const before = await rows(page); await map.getByRole("button", { name: "Splitscreen Edit", exact: true }).click(); await expect(map.locator(".lm-workspace-pane")).toHaveCount(2);
    const left = pane(0); const right = pane(1); await expect(left.getByRole("combobox", { name: l("Редактируемый мир", "Editing world") })).toHaveValue("w1"); await expect(right.getByRole("combobox", { name: l("Редактируемый мир", "Editing world") })).toHaveValue("w2");
    const rightCamera = await right.locator(".lm-space").getAttribute("style"); const rightPoints = await points(page, 1);
    await left.locator('[data-lore-id="branch:locations"]').press("Alt+ArrowRight"); await expect(left.getByRole("button", { name: l("Отменить", "Undo"), exact: true })).toBeEnabled(); await expect(right.getByRole("button", { name: l("Отменить", "Undo"), exact: true })).toBeDisabled();
    expect(await right.locator(".lm-space").getAttribute("style")).toBe(rightCamera); expect(await points(page, 1)).toEqual(rightPoints);
    await right.getByRole("textbox", { name: l("Найти запись или ветвь…", "Find a record or branch…"), exact: true }).fill("w2 Fact 1"); await right.locator(".lm-results button").click(); const text = right.locator(".lm-memory-editor textarea"); await text.fill("Private unsaved draft");
    page.once("dialog", (dialog) => dialog.dismiss()); await map.getByRole("button", { name: "Splitscreen Edit", exact: true }).click(); await expect(map.locator(".lm-workspace-pane")).toHaveCount(2); await expect(text).toHaveValue("Private unsaved draft");
    await right.locator(".lm-viewport").focus(); await page.keyboard.press("Control+z"); await expect(left.getByRole("button", { name: l("Отменить", "Undo"), exact: true })).toBeEnabled();
    await map.getByRole("button", { name: l("Создать пустой мир", "Create empty world"), exact: true }).click(); const create = map.locator(".lm-create-dialog"); await create.getByRole("textbox", { name: l("Название", "Name"), exact: true }).fill("New empty world");
    page.once("dialog", (dialog) => dialog.dismiss()); await create.getByRole("button", { name: l("Создать мир", "Create world"), exact: true }).click(); await expect(text).toHaveValue("Private unsaved draft"); await expect(create).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept()); await create.getByRole("button", { name: l("Создать мир", "Create world"), exact: true }).click(); await expect(create).toHaveCount(0); await expect(map).toHaveClass(/is-full/); await expect(map.locator(".lm-workspace-pane")).toHaveCount(2); await expect(right.locator(".lm-world-picker select option:checked")).toHaveText("New empty world"); await expect(right.locator(".lm-node.node-entry")).toHaveCount(0);
    const all = await rows(page); const created = all.find((row: any) => row.kind === "world" && row.data.name === "New empty world").data; expect(created.description).toBe(""); expect(created.useDescriptionInContext).toBe(false); expect(all.filter((row: any) => row.kind !== "world")).toEqual(before.filter((row: any) => row.kind !== "world"));
    await page.screenshot({ path: info.outputPath(`split-worlds-${locale}.png`) });
    const audit = await new AxeBuilder({ page }).include(".dr-map-workspace").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze(); expect(audit.violations).toEqual([]);
    await page.setViewportSize({ width: 420, height: 900 }); await expect(right.getByRole("combobox", { name: l("Редактируемый мир", "Editing world") })).toBeVisible();
    expect((await right.locator(".lm-viewport").boundingBox())!.height).toBeGreaterThan(140);
    await right.getByRole("combobox", { name: l("Редактируемый мир", "Editing world") }).scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`split-narrow-${locale}.png`) });
  });
}
