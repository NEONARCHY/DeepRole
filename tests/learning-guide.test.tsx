import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { WelcomeFlow, LearningGuide, useLearning, visibleGuideElement } from '../src/entrypoints/shared/LearningGuide';
import { browser } from 'wxt/browser';
import { initialLearning, learningText, type LearningProgress } from '../src/core/learning';
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

for (const locale of ['ru', 'en'] as const) {
  const t = (key: Parameters<typeof learningText>[1]) => learningText(locale, key);
  it(`${locale}: welcome opens Play in one action and never calls finish on mount`, async () => {
    const finish = vi.fn().mockResolvedValue(undefined), language = vi.fn().mockResolvedValue(undefined);
    render(<WelcomeFlow locale={locale} animations onLocale={language} onFinish={finish}/>); expect(finish).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: t('welcomeTitle') })).toBeVisible();
    expect(screen.getByText(t('welcomeMemory'))).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: t('self') })); await waitFor(() => expect(finish).toHaveBeenCalledWith(false));
  });
  it(`${locale}: a failed save stays actionable`, async () => {
    render(<WelcomeFlow locale={locale} animations={false} onLocale={vi.fn()} onFinish={vi.fn().mockRejectedValue(Error('denied'))}/>);
    fireEvent.click(screen.getByRole('button', { name: t('guided') })); expect(await screen.findByRole('alert')).toHaveTextContent(t('welcomeError'));
    expect(screen.getByRole('button', { name: t('guided') })).toBeEnabled();
  });
}
it('chapter hub does not navigate or mutate data just by opening; blocked editor cannot be dismissed by a tour', () => {
  const update = vi.fn(), hub = vi.fn();
  render(<LearningGuide locale="en" progress={initialLearning()} storageError={false} update={update} hub onHub={hub} blocked/>);
  expect(update).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /Your first world and game/ })); expect(update).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toHaveTextContent(learningText('en', 'blocked'));
});
it('replay starts a fresh route and resume uses the saved position', () => {
  const progress: LearningProgress = { ...initialLearning(), run: { chapter: 'images', step: 1 } }, update = vi.fn();
  render(<LearningGuide locale="en" progress={progress} storageError={false} update={update} hub onHub={vi.fn()} blocked={false}/>);
  fireEvent.click(screen.getByRole('button', { name: /Resume tour/ })); expect(update).toHaveBeenLastCalledWith({ run: progress.run });
});

it('interactive route waits for the actual destination, not an unrelated click, and Escape pauses it', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
    return this.hidden ? [] as unknown as DOMRectList : [new DOMRect(10, 100, 200, 30)] as unknown as DOMRectList;
  });
  const next = vi.fn();
  function Example() {
    const [progress, setProgress] = useState<LearningProgress>({ ...initialLearning(), run: { chapter: 'first-play', step: 0 } });
    const [tab, setTab] = useState('overview');
    return <div className="app-shell"><button data-dr-guide="nav-worlds" onClick={() => setTab('worlds')}>Worlds</button><button>Unrelated</button>
      <div data-dr-guide={`page-${tab}`}/><div data-dr-guide="world-start"/>
      <LearningGuide locale="en" progress={progress} storageError={false} update={patch => { next(patch); setProgress(old => ({ ...old, ...patch })); }} hub={false} onHub={vi.fn()} blocked={false} requested/>
    </div>;
  }
  render(<Example/>);
  expect(await screen.findByRole('heading', { name: 'Open Worlds' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Unrelated' })); expect(screen.getByRole('heading', { name: 'Open Worlds' })).toBeVisible(); expect(next).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Got it, next' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Worlds' }));
  expect(await screen.findByRole('heading', { name: 'Create or import' })).toBeVisible();
  expect(next).toHaveBeenCalledWith({ run: { chapter: 'first-play', step: 1 } });
  fireEvent.keyDown(document, { key: 'Escape' }); await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('a layout box inside closed details never confirms a destination; the summary still remains actionable', () => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([new DOMRect(0, 0, 200, 30)] as unknown as DOMRectList);
  const view = render(<details><summary data-dr-guide="toggle">Open</summary><div data-dr-guide="destination">Hidden body</div></details>);
  expect(visibleGuideElement('[data-dr-guide="toggle"]')).not.toBeNull();
  expect(visibleGuideElement('[data-dr-guide="destination"]')).toBeNull();
  view.container.querySelector('details')!.open = true;
  expect(visibleGuideElement('[data-dr-guide="destination"]')).not.toBeNull();
  view.container.querySelector('details')!.hidden = true;
  expect(visibleGuideElement('[data-dr-guide="destination"]')).toBeNull();
});

it('an unanswered optional progress read cannot leave the app loading forever or apply a late result', async () => {
  vi.useFakeTimers(); let finish!: (value: Record<string, unknown>) => void;
  vi.spyOn(browser.storage.local, 'get').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const view = renderHook(() => useLearning()); expect(view.result.current.ready).toBe(false);
  await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
  expect(view.result.current.ready).toBe(true); expect(view.result.current.error).toBe(true);
  await act(async () => { finish({ deeprole_learning_v1: { ...initialLearning(), welcomeStep: 2 } }); });
  expect(view.result.current.progress.welcomeStep).toBe(0);
});
