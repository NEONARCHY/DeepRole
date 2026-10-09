import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page, locale: string, width: number, nested: boolean) {
  await page.setViewportSize({ width, height: 850 });
  await page.goto(`/tests/fixtures/scene-choices.html?pins&locale=${locale}`);
  await page.evaluate(({ nested, width }) => {
    const form = document.querySelector('form')!; document.body.append(form);
    Object.assign(form.style, { position: 'fixed', bottom: '20px', left: width > 900 ? '300px' : '20px', width: width > 900 ? '776px' : 'calc(100% - 40px)', borderRadius: '20px', background: '#303030', padding: '12px', boxSizing: 'border-box', zIndex: '9999' });
    if (nested) {
      const scroll = document.createElement('div'); scroll.id = 'native-scroll';
      Object.assign(scroll.style, { position: 'fixed', inset: '54px 0 0', overflowY: 'auto', overflowX: 'hidden' });
      const conversation = document.querySelector<HTMLElement>('#conversation')!;
      Object.assign(conversation.style, { maxWidth: '690px', margin: '0 auto' });
      scroll.append(conversation); document.body.append(scroll);
    }
    const options = ['positive', 'neutral', 'negative', 'surprise'].map((kind, i) => ({ kind, label: `Move ${i}`, text: 'I examine the sealed letter.' }));
    (window as any).choicesTest.setHistory(`<article data-role="assistant" data-message-id="latest"><div class="ds-markdown"><p>${'Mira waits by the door. '.repeat(600)}</p>&lt;deeprole_choices&gt;${JSON.stringify({ version: 1, options })}&lt;/deeprole_choices&gt;</div></article>`);
    (window as any).choicesTest.update({ pinSceneChoices: true });
  }, { nested, width });
  await expect(page.locator('[data-deeprole-choices-host]')).toHaveAttribute('data-deeprole-choices-pinned', 'true');
  await bottom(page);
  await expect.poll(() => position(page).then(p => p.gap)).toBeLessThan(1);
  await page.waitForTimeout(100);
}
function bottom(page: Page) {
  return page.evaluate(() => { const scroll = document.querySelector('#native-scroll') ?? document.scrollingElement!; scroll.scrollTop = scroll.scrollHeight; });
}
function position(page: Page) {
  return page.evaluate(() => {
    const scroll = document.querySelector('#native-scroll') ?? document.scrollingElement!;
    return { top: scroll.scrollTop, gap: scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop };
  });
}

for (const locale of ['ru', 'en']) for (const nested of [true, false]) {
  test(`first small upward wheel releases the chat ${locale} nested=${nested}`, async ({ page }) => {
    await setup(page, locale, 1280, nested);
    const before = await position(page);
    await page.mouse.move(900, 100); await page.mouse.wheel(0, -8);
    await expect.poll(() => position(page).then(p => p.top)).toBeLessThan(before.top - 1);
    await page.waitForTimeout(200);
    const reading = await position(page);
    expect(reading.gap).toBeGreaterThan(1); expect(reading.gap).toBeLessThan(48);
    // Composer geometry changes while reading must not pull the chat down again.
    await page.locator('textarea').evaluate(node => { node.style.height = `${node.getBoundingClientRect().height + 30}px`; });
    await page.waitForTimeout(150);
    expect((await position(page)).top).toBeCloseTo(reading.top, 0);
    await page.mouse.wheel(0, 500);
    await expect.poll(() => position(page).then(p => p.gap)).toBeLessThan(1);
    await page.locator('textarea').evaluate(node => { node.style.height = `${node.getBoundingClientRect().height + 20}px`; });
    await expect.poll(() => position(page).then(p => p.gap)).toBeLessThan(1);
  });
}

for (const locale of ['ru', 'en']) for (const width of [360, 1280]) {
  test(`wheel on the fixed options scrolls the actual chat ${locale} ${width}`, async ({ page }, info) => {
    await setup(page, locale, width, true);
    const host = page.locator('[data-deeprole-choices-host]');
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('MY OWN DRAFT');
    const before = await position(page), box = (await host.locator('section').boundingBox())!;
    await page.mouse.move(box.x + 40, box.y + 20); await page.mouse.wheel(0, -8);
    await expect.poll(() => position(page).then(p => p.top)).toBeLessThan(before.top - 1);
    await page.waitForTimeout(200);
    expect((await position(page)).gap).toBeGreaterThan(1);
    await page.mouse.wheel(0, -200);
    await expect.poll(() => position(page).then(p => p.top)).toBeLessThan(before.top - 100);
    await page.mouse.wheel(0, 1000);
    await expect.poll(() => position(page).then(p => p.gap)).toBeLessThan(1);
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('MY OWN DRAFT');
    expect(await page.evaluate(() => [(window as any).sent, (window as any).requests])).toEqual([0, 0]);
    await page.screenshot({ path: info.outputPath('fixed-options-scroll.png') });
  });
}

test('a tall options card scrolls internally, then hands its edge to the chat', async ({ page }) => {
  await setup(page, 'en', 360, true);
  await page.setViewportSize({ width: 360, height: 430 });
  const section = page.locator('[data-deeprole-choices-host]').locator('section');
  await expect.poll(() => section.evaluate(node => node.scrollHeight - node.clientHeight)).toBeGreaterThan(20);
  await bottom(page); await page.waitForTimeout(100);
  const before = await position(page), box = (await section.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 40); await page.mouse.wheel(0, 40);
  await expect.poll(() => section.evaluate(node => node.scrollTop)).toBeGreaterThan(10);
  expect((await position(page)).top).toBeCloseTo(before.top, 0);
  await section.evaluate(node => { node.scrollTop = 0; }); await page.waitForTimeout(150);
  await page.mouse.wheel(0, -8);
  await expect.poll(() => position(page).then(p => p.top)).toBeLessThan(before.top - 1);
  await page.mouse.wheel(0, -100); await page.waitForTimeout(200);
  const reading = await position(page);
  await section.evaluate(node => { node.scrollTop = node.scrollHeight; }); await page.waitForTimeout(150);
  await page.mouse.wheel(0, 1000);
  await expect.poll(() => position(page).then(p => p.top)).toBeGreaterThan(reading.top + 20);
});
