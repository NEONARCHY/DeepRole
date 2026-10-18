import { expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { initialLearning, learningChapters, learningCopy, normalizeLearning } from '../src/core/learning';
import { shouldOpenWelcome } from '../src/core/first-run';
import { LEARNING_KEY, readLearning, saveLearning } from '../src/storage/learning';

it('offers first-install welcome, never an update or completed installation', () => {
  expect(shouldOpenWelcome('install', false)).toBe(true);
  for (const reason of ['update', 'chrome_update', 'shared_module_update']) expect(shouldOpenWelcome(reason, false)).toBe(false);
  expect(shouldOpenWelcome('install', true)).toBe(false);
});
it.each([null, 'hello', [], { version: 2, completed: ['first-play'] }])('ignores unsupported progress %j', input => {
  expect(normalizeLearning(input)).toEqual(initialLearning());
});
it('bounds progress, rejects invalid routes, deduplicates valid chapter IDs', () => {
  expect(normalizeLearning({ version: 1, welcomeStep: 900, run: { chapter: 'missing', step: 0 }, completed: ['missing', 'images', 'images'] }))
    .toEqual({ version: 1, welcomeStep: 2, run: null, completed: ['images'] });
  for (const step of [-1, 100, NaN, 0.5]) expect(normalizeLearning({ version: 1, run: { chapter: 'first-play', step } }).run).toBeNull();
});
it('keeps progress in a separate key without preferences, lore, identifiers or requests', async () => {
  await browser.storage.local.set({ deeprole_settings: { onboardingComplete: true }, world: { name: 'Do not touch' } });
  const value = { ...initialLearning(), welcomeStep: 2, run: { chapter: 'images' as const, step: 1 } };
  await saveLearning(value); expect(await readLearning()).toEqual(value);
  expect(await browser.storage.local.get()).toEqual({ deeprole_settings: { onboardingComplete: true }, world: { name: 'Do not touch' }, [LEARNING_KEY]: value });
});
it('has unique bounded bilingual chapters and real-navigation destinations', () => {
  expect(new Set(learningChapters.map(c => c.id)).size).toBe(learningChapters.length);
  for (const chapter of learningChapters) {
    expect(chapter.steps.length).toBeGreaterThanOrEqual(3); expect(chapter.steps.length).toBeLessThanOrEqual(5);
    expect(chapter.steps[0].arrived).toBeTruthy();
    for (const locale of ['ru', 'en'] as const) {
      expect(chapter.title[locale].trim()).not.toBe('');
      for (const step of chapter.steps) { expect(step.title[locale].trim()).not.toBe(''); expect(step.text[locale].trim()).not.toBe(''); expect(step.target).toMatch(/^\[data-dr-guide=/); }
    }
  }
  for (const entry of Object.values(learningCopy)) { expect(entry.ru.trim()).not.toBe(''); expect(entry.en.trim()).not.toBe(''); }
});
