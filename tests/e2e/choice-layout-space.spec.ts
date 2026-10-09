import { expect, test } from '@playwright/test';

for (const locale of ['ru', 'en']) test(`full native width above 1000px in both modes ${locale}`, async ({ page }, info) => {
  await page.setViewportSize({ width: 1800, height: 950 });
  await page.goto(`/tests/fixtures/scene-choices.html?pins&locale=${locale}`);
  await page.evaluate(() => {
    const form = document.querySelector('form')!; document.body.append(form);
    Object.assign(form.style, { position: 'fixed', bottom: '20px', left: '300px', width: '1200px', borderRadius: '20px', background: '#303030', padding: '12px', boxSizing: 'border-box' });
    const options = ['positive', 'neutral', 'negative', 'surprise'].map((kind, i) => ({ kind, label: `Move ${i}`, text: 'I examine the sealed letter.' }));
    (window as any).choicesTest.setHistory(`<article data-role="assistant" data-message-id="latest"><div class="ds-markdown"><p>${'Mira waits by the door. '.repeat(350)}</p>&lt;deeprole_choices&gt;${JSON.stringify({ version: 1, options })}&lt;/deeprole_choices&gt;</div></article>`);
  });
  const host = page.locator('[data-deeprole-choices-host]');
  const widthError = () => host.locator('section').evaluate(node => node.getBoundingClientRect().width - document.querySelector('form')!.getBoundingClientRect().width);
  await expect.poll(widthError).toBeCloseTo(0, 0);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await host.getByRole('button', { name: locale === 'ru' ? 'Закрепить варианты на экране' : 'Pin options on screen', exact: true }).click();
  await expect.poll(widthError).toBeCloseTo(0, 0);
  await expect.poll(() => page.evaluate(() => document.querySelector('[data-deeprole-choices-host]')!.getBoundingClientRect().top - document.querySelector('[data-message-id="latest"]')!.getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(11);
  await page.screenshot({ path: info.outputPath('wide-native-width.png') });
});

test('adaptive portrait magnets survive scrolling and keep the input width', async ({ page }, info) => {
  await page.setViewportSize({ width: 2400, height: 950 });
  await page.goto('/tests/fixtures/adaptive-scene.html');
  await page.evaluate(() => {
    const form = document.createElement('form');
    Object.assign(form.style, { position: 'fixed', bottom: '20px', left: '800px', width: '800px', borderRadius: '20px', background: '#303030', padding: '12px', boxSizing: 'border-box' });
    form.append(document.querySelector('textarea')!); document.body.append(form);
  });
  const host = page.locator('[data-deeprole-choices-host]');
  const mira = page.locator('.dr-cast-widget[data-character-id="1"]');
  const hero = page.locator('.dr-cast-widget[data-character-id="0"]');
  await expect.poll(() => host.locator('section').evaluate(node => node.getBoundingClientRect().width)).toBeCloseTo(800, 0);
  await page.waitForTimeout(100);
  const target = (await host.locator('section').boundingBox())!, handle = (await mira.locator('.dr-cast-move').boundingBox())!;
  await page.mouse.move(handle.x + 20, handle.y + 20); await page.mouse.down();
  await page.mouse.move(target.x - 40, target.y + 24, { steps: 8 }); await page.mouse.up();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('poses') ?? '{}').positions?.['1']?.dock)).toBe('left');
  await expect.poll(async () => { const box = (await mira.boundingBox())!; return target.x - box.x - box.width; }).toBeGreaterThanOrEqual(24);
  const boxes = await Promise.all([hero.boundingBox(), mira.boundingBox()]);
  expect(boxes[0]!.x - boxes[1]!.x - boxes[1]!.width).toBeCloseTo(6, 0);
  await page.screenshot({ path: info.outputPath('adaptive-magnet-left.png') });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => host.evaluate(node => node.getBoundingClientRect().bottom < 0)).toBe(true);
  for (const [i, portrait] of [hero, mira].entries()) {
    await expect.poll(async () => (await portrait.boundingBox())!.x).toBeCloseTo(boxes[i]!.x, 0);
    await expect.poll(async () => (await portrait.boundingBox())!.y).toBeCloseTo(boxes[i]!.y, 0);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  const right = (await host.locator('section').boundingBox())!, nextHandle = (await mira.locator('.dr-cast-move').boundingBox())!;
  await page.mouse.move(nextHandle.x + 20, nextHandle.y + 20); await page.mouse.down();
  await page.mouse.move(right.x + right.width - 40, right.y + 24, { steps: 8 }); await page.mouse.up();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('poses') ?? '{}').positions?.['1']?.dock)).toBe('right');
  await expect.poll(async () => (await mira.boundingBox())!.x - right.x - right.width).toBeCloseTo(24, 0);
  await page.screenshot({ path: info.outputPath('adaptive-magnet-right.png') });
});
