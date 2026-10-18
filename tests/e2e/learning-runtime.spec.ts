import { chromium, expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { learningChapters, learningText } from '../../src/core/learning';
import { sceneText } from '../../src/core/scene-i18n';

for (const locale of ['ru', 'en'] as const) for (const width of [320, 900]) test(`guided start ${locale}/${width}: real clicks, resume, keyboard, no side effects`, async ({}, info) => {
  test.setTimeout(90000);
  const extension = path.resolve('.output/chrome-mv3');
  const context = await chromium.launchPersistentContext('', { channel: 'msedge', headless: true, viewport: { width, height: 900 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  context.setDefaultTimeout(10000);
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const base = `chrome-extension://${new URL(worker.url()).host}/sidepanel.html`;
    await expect.poll(() => context.pages().filter(p => p.url() === base).length).toBe(1);
    const page = context.pages().find(p => p.url() === base)!;
    const t = (key: Parameters<typeof learningText>[1]) => learningText(locale, key);
    const calls: string[] = []; context.on('request', req => { if (req.method() === 'POST') calls.push(req.url()); });
    await page.goto(base); await expect(page.locator('.onboarding')).toBeVisible();
    await page.evaluate(async locale => { await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: false } }); }, locale);
    await page.reload();
    await expect(page.getByRole('heading', { name: t('welcome1Title') })).toBeVisible();
    const noOverflow = async (selector: string) => expect(await page.locator(selector).evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await noOverflow('.dr-welcome');
    expect((await new AxeBuilder({ page }).include('.dr-welcome').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`welcome-${locale}-${width}.png`), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: t('welcomeNext'), exact: true }).click();
    await expect(page.getByRole('heading', { name: t('welcome2Title') })).toBeVisible();
    await page.reload(); await expect(page.getByRole('heading', { name: t('welcome2Title') })).toBeVisible();
    await page.getByRole('button', { name: t('welcomeNext'), exact: true }).click();
    await page.getByRole('button', { name: t('guided'), exact: true }).click();
    const tour = page.locator('.dr-learning-popover');
    await expect(tour.getByRole('heading')).toHaveText(learningChapters[0].steps[0].title[locale]);
    await expect(tour.getByRole('button', { name: t('next'), exact: true })).toHaveCount(0);
    // An irrelevant click cannot satisfy a navigation step.
    await page.locator('[data-dr-guide="nav-overview"]').click();
    await expect(tour.getByRole('heading')).toHaveText(learningChapters[0].steps[0].title[locale]);
    await page.locator('[data-dr-guide="nav-worlds"]').click();
    await expect(tour.getByRole('heading')).toHaveText(learningChapters[0].steps[1].title[locale]);
    await expect(page.locator('[data-dr-guide="world-start"]')).toBeVisible();
    await noOverflow('.dr-learning-popover');
    expect((await new AxeBuilder({ page }).include('.dr-learning-popover').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`tour-${locale}-${width}.png`), fullPage: true, animations: 'disabled' });
    await page.keyboard.press('Escape'); await expect(tour).toHaveCount(0);
    await page.reload(); await expect(page.locator('.onboarding')).toHaveCount(0); await expect(tour).toHaveCount(0);
    await page.getByRole('button', { name: t('guide'), exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp(t('resume')) })).toBeVisible();
    await expect(page.locator('.modal-backdrop')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: info.outputPath(`guide-${locale}-${width}.png`), fullPage: true, animations: 'disabled' });
    await noOverflow('.dr-learning-hub');
    expect((await new AxeBuilder({ page }).include('.dr-learning-hub').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    // Resume a saved position without forcing a first-install welcome again.
    await page.getByRole('button', { name: new RegExp(t('resume')) }).click();
    await expect(tour.getByRole('heading')).toHaveText(learningChapters[0].steps[1].title[locale]);
    await page.keyboard.press('Escape');
    const route = async (chapter: number) => {
      await page.getByRole('button', { name: t('guide'), exact: true }).click();
      await page.getByRole('button', { name: new RegExp(learningChapters[chapter]!.title[locale]) }).click();
    };
    await route(5); await page.locator('[data-dr-guide="nav-settings"]').click();
    await expect(tour.getByRole('heading')).toHaveText(learningChapters[5].steps[1].title[locale]);
    await page.locator('[data-dr-guide="settings-images"]').click();
    await expect(tour.getByRole('heading')).toHaveText(learningChapters[5].steps[2].title[locale]);
    await expect(page.locator('[data-dr-guide="settings-images-content"]')).toBeVisible();
    await tour.getByRole('button', { name: t('finish'), exact: true }).click();
    await expect(page.locator('.dr-learning-hub')).toBeVisible();
    expect(await page.evaluate(async () => (await (globalThis as any).chrome.storage.local.get('deeprole_learning_v1')).deeprole_learning_v1.completed)).toContain('images');
    await page.keyboard.press('Escape');
    await route(6); // Existing settings section: guide points to the real directory-return button.
    await expect(tour).toContainText(t('directory'));
    await page.locator('[data-dr-guide="settings-home"]').click();
    await page.locator('[data-dr-guide="settings-data"]').click();
    await expect(tour.getByRole('heading')).toHaveText(learningChapters[6].steps[2].title[locale]);
    await page.keyboard.press('Escape');
    await route(2); await page.locator('[data-dr-guide="nav-story"]').click();
    await expect(tour.getByRole('heading')).toHaveText(learningChapters[2].steps[1].title[locale]);
    await tour.getByRole('button', { name: t('next'), exact: true }).click();
    await expect(tour).toContainText(t('unavailable')); // No chat/world: never pretend Tasks is enabled.
    await page.keyboard.press('Escape');
    expect(calls).toEqual([]);
    const records = await page.evaluate(() => new Promise<number>((resolve, reject) => {
      const open = indexedDB.open('deeprole'); open.onerror = () => reject(open.error); open.onsuccess = () => {
        const db = open.result, request = db.transaction('records').objectStore('records').count();
        request.onsuccess = () => { resolve(request.result); db.close(); }; request.onerror = () => reject(request.error);
      };
    }));
    expect(records).toBe(0);
    // Continue-in-a-new-chat is only expanded; its generation button is never pressed.
    await route(3); await page.locator('[data-dr-guide="nav-overview"]').click();
    await expect(tour.getByRole('heading')).toHaveText(learningChapters[3].steps[1].title[locale]);
    await tour.getByRole('button', { name: t('next'), exact: true }).click();
    await expect(tour.getByRole('heading')).toHaveText(learningChapters[3].steps[2].title[locale]);
    await expect(page.locator('.play-continuation')).not.toHaveAttribute('open');
    await page.locator('[data-dr-guide="continuation-toggle"]').click();
    await expect(tour.getByRole('heading')).toHaveText(learningChapters[3].steps[3].title[locale]);
    await page.keyboard.press('Escape');
    await route(7); await page.locator('[data-dr-guide="nav-settings"]').click();
    await expect(tour.getByRole('heading')).toHaveText(learningChapters[7].steps[1].title[locale]);
    await tour.getByRole('button', { name: t('next'), exact: true }).click();
    await page.locator('[data-dr-guide="settings-home"]').click();
    await page.locator('[data-dr-guide="settings-advanced-toggle"]').click();
    await expect(tour.getByRole('heading')).toHaveText(learningChapters[7].steps[3].title[locale]);
    await page.keyboard.press('Escape');
    // A real synthetic world makes the profiles route available. No user profile is accessed.
    await page.evaluate(() => new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('deeprole'); open.onerror = () => reject(open.error); open.onsuccess = () => {
        const db = open.result, tx = db.transaction('records', 'readwrite');
        tx.objectStore('records').put({ pk: 'world:guide-test', id: 'guide-test', kind: 'world', data: { id: 'guide-test', name: 'Guide test', description: '', color: '#58a6ff', contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 }, updatedAt: 1 });
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
    }));
    await page.reload();
    await route(1); await page.locator('[data-dr-guide="nav-worlds"]').click();
    await expect(tour.getByRole('heading')).toHaveText(learningChapters[1].steps[1].title[locale]);
    await tour.getByRole('button', { name: t('next'), exact: true }).click();
    await page.locator('[data-dr-guide="world-manage"]').click();
    await expect(tour.getByRole('heading')).toHaveText(learningChapters[1].steps[3].title[locale]);
    await expect(page.locator('[data-dr-guide="world-profiles"]')).toBeVisible();
    await page.locator('[data-dr-guide="world-profiles"]').getByRole('button', { name: sceneText(locale, 'newEntity'), exact: true }).click();
    await expect(page.locator('form.rp-editor')).toBeVisible();
    await expect(tour).toHaveCount(0);
    await page.locator('form.rp-editor').getByRole('button', { name: sceneText(locale, 'cancel'), exact: true }).click();
    await expect(tour.getByRole('heading')).toHaveText(learningChapters[1].steps[3].title[locale]);
    await page.keyboard.press('Escape');
    expect(calls).toEqual([]);
    // Reduced motion overrides decorative onboarding/tour animation.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await route(0); expect(await tour.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    await page.setViewportSize({ width: 320, height: 520 });
    await expect.poll(async () => { const box = await tour.boundingBox(); return !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 320 && box.y + box.height <= 520; }).toBe(true);
  } finally { await context.close(); }
});
