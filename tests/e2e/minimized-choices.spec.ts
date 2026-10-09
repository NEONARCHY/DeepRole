import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const locale of ['ru', 'en']) for (const width of [360, 1057]) for (const pinned of [false, true]) {
  test(`minimize and restore choices ${locale} ${width} pinned ${pinned}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto(`/tests/fixtures/scene-choices.html?pins&locale=${locale}`);
    await page.evaluate(({ pinned }) => {
      const form = document.querySelector('form')!; document.body.append(form);
      Object.assign(form.style, { position: 'fixed', left: '20px', bottom: '20px', width: 'calc(100vw - 40px)', padding: '12px', boxSizing: 'border-box', background: '#303030', borderRadius: '20px' });
      const options = ['positive', 'neutral', 'negative', 'surprise'].map((kind, i) => ({ kind, label: `Move ${i}`, text: 'I examine the sealed letter carefully. '.repeat(10) }));
      (window as any).choicesTest.update({ adaptiveLayout: true, pinSceneChoices: pinned });
      (window as any).choicesTest.setHistory(`<article data-role="assistant" data-message-id="latest"><div class="ds-markdown"><p>${'Mira waits by the door. '.repeat(400)}</p>&lt;deeprole_choices&gt;${JSON.stringify({ version: 1, options })}&lt;/deeprole_choices&gt;</div></article>`);
      window.scrollTo(0, document.documentElement.scrollHeight);
    }, { pinned });
    const host = page.locator('[data-deeprole-choices-host]');
    const minimize = host.getByRole('button', { name: locale === 'ru' ? 'Свернуть варианты' : 'Minimize options', exact: true });
    const restore = host.getByRole('button', { name: locale === 'ru' ? 'Развернуть варианты' : 'Restore options', exact: true });
    await host.getByRole('button', { name: locale === 'ru' ? 'Текст целиком' : 'Full text', exact: true }).click();
    const expandedHeight = (await host.boundingBox())!.height;
    await page.getByRole('textbox', { name: 'Message' }).fill('My unchanged draft');
    await minimize.focus(); await page.keyboard.press('Enter');
    await expect(restore).toBeFocused(); await expect(host.locator('.grid')).toBeHidden(); await expect(minimize).toBeHidden();
    await page.evaluate(() => (window as any).choicesTest.sync());
    await expect.poll(async () => (await host.boundingBox())!.height).toBeLessThan(65);
    await expect.poll(async () => (await host.boundingBox())!.width - (await page.locator('form').boundingBox())!.width).toBeCloseTo(0, 0);
    if (pinned) {
      const smallReserve = await page.locator('[data-deeprole-choices-anchor]').evaluate(node => node.getBoundingClientRect().height);
      expect(smallReserve).toBeLessThan(expandedHeight + 180);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(restore).toBeInViewport();
    }
    const audit = await new AxeBuilder({ page }).include('[data-deeprole-choices-host]').analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({ path: info.outputPath('choices-minimized.png') });
    await restore.focus(); await page.keyboard.press('Enter');
    await expect(minimize).toBeFocused(); await expect(host.locator('.grid')).toBeVisible();
    await expect(host.locator('.grid')).toHaveAttribute('data-expanded', 'true');
    await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue('My unchanged draft');
    expect(await page.evaluate(() => ({ requests: (window as any).requests, sent: (window as any).sent }))).toEqual({ requests: 0, sent: 0 });
    if (pinned) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect.poll(() => page.evaluate(() => document.querySelector('[data-deeprole-choices-host]')!.getBoundingClientRect().top - document.querySelector('[data-message-id="latest"]')!.getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(11);
    }
    await page.screenshot({ path: info.outputPath('choices-restored.png') });
    await page.getByRole('textbox', { name: 'Message' }).fill('');
    await host.locator('.grid button').first().click();
    await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue('I examine the sealed letter carefully. '.repeat(10));
  });
}
