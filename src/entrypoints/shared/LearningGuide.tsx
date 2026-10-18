import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, ChevronLeft, ChevronRight, Minimize2, X } from 'lucide-react';
import type { Locale } from '../../core/types';
import { initialLearning, learningChapters, learningText, normalizeLearning, type ChapterId, type LearningProgress, type LearningRun } from '../../core/learning';
import { readLearning, saveLearning } from '../../storage/learning';
import { startupDeadline } from '../../core/startup';
import { Modal } from './Modal';
import './learning.css';

export function useLearning() {
  const [progress, setProgress] = useState(initialLearning);
  const [ready, setReady] = useState(false), [error, setError] = useState(false);
  const current = useRef(progress), pending = useRef(Promise.resolve()), mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    void startupDeadline(readLearning()).then(value => { if (mounted.current) { current.current = value; setProgress(value); } })
      .catch(() => { if (mounted.current) setError(true); })
      .finally(() => { if (mounted.current) setReady(true); });
    return () => { mounted.current = false; };
  }, []);
  function update(patch: Partial<LearningProgress>) {
    const next = normalizeLearning({ ...current.current, ...patch });
    current.current = next; setProgress(next);
    pending.current = pending.current.catch(() => undefined).then(() => saveLearning(next))
      .then(() => { if (mounted.current) setError(false); })
      .catch(() => { if (mounted.current) setError(true); });
  }
  return { progress, ready, error, update };
}

export function WelcomeFlow({ locale, step, animations, onStep, onLocale, onFinish }: {
  locale: Locale; step: number; animations: boolean; onStep: (step: number) => void;
  onLocale: (locale: Locale) => Promise<void>; onFinish: (guided: boolean) => Promise<void>;
}) {
  const t = (key: Parameters<typeof learningText>[1]) => learningText(locale, key);
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null), first = useRef(true);
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => { if (first.current) { first.current = false; return; } heading.current?.focus(); }, [step]);
  async function perform(task: () => Promise<void>) {
    if (busy) return; setBusy(true); setError(false);
    try { await task(); } catch { setError(true); } finally { setBusy(false); }
  }
  return <main lang={locale} className="onboarding dr-welcome" data-motion={animations ? 'on' : 'off'} data-keyboard={keyboard}
    onKeyDown={() => setKeyboard(true)} onPointerDown={() => setKeyboard(false)}>
    <header className="dr-welcome-brand"><div className="brand-mark" aria-hidden="true"><span/></div><strong>DeepRole</strong>
      <label className="dr-welcome-language"><span className="sr-only">{locale === 'ru' ? 'Язык' : 'Language'}</span>
        <select value={locale} disabled={busy} onChange={e => void perform(() => onLocale(e.target.value as Locale))}><option value="ru">Русский</option><option value="en">English</option></select>
      </label>
    </header>
    <div className="dr-welcome-body" key={step}>
      <p className="dr-learning-count">{t('progress').replace('{step}', String(step + 1)).replace('{total}', '3')}</p>
      <h1 ref={heading} tabIndex={-1}>{t((['welcome1Title', 'welcome2Title', 'welcome3Title'] as const)[step]!)}</h1>
      <p className="dr-welcome-lead">{t((['welcome1Text', 'welcome2Text', 'welcome3Text'] as const)[step]!)}</p>
      <ol className="dr-welcome-path" aria-label={t('welcome2Title')}>
        {(['world', 'chat', 'memory'] as const).map((key, i) => <li key={key}><span aria-hidden="true">{i + 1}</span>{t(key)}</li>)}
      </ol>
      <p className="dr-learning-note">{t(step === 2 ? 'privacy' : 'limits')}</p>
    </div>
    <footer className="dr-welcome-footer">
      {error && <p className="error-text" role="alert">{t('welcomeError')}</p>}
      <div className="dr-welcome-actions">
        {step > 0 && <button className="button secondary" disabled={busy} onClick={() => onStep(step - 1)}><ChevronLeft size={16}/>{t('back')}</button>}
        <button className="button primary" disabled={busy} onClick={() => step < 2 ? onStep(step + 1) : void perform(() => onFinish(true))}>
          {busy ? t('saving') : t(step < 2 ? 'welcomeNext' : 'guided')}<ChevronRight size={16}/>
        </button>
      </div>
      <button className="button ghost" disabled={busy} onClick={() => void perform(() => onFinish(false))}>{t('self')}</button>
      <p className="dr-learning-note">{t('later')}</p>
    </footer>
  </main>;
}

/** Never uses element.click(), dispatches form events, changes tabs, or sends model requests. */
export function LearningGuide({ locale, progress, storageError, update, hub, onHub, blocked, requested, onStarted }: {
  locale: Locale; progress: LearningProgress; storageError: boolean; update: (patch: Partial<LearningProgress>) => void;
  hub: boolean; onHub: (open: boolean) => void; blocked: boolean; requested?: boolean; onStarted?: () => void;
}) {
  const t = (key: Parameters<typeof learningText>[1]) => learningText(locale, key);
  const [active, setActive] = useState(false), [collapsed, setCollapsed] = useState(false), [notice, setNotice] = useState(false);
  const launcher = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const keyboard = () => { document.documentElement.dataset.drLearningKeyboard = 'true'; };
    const pointer = () => { document.documentElement.dataset.drLearningKeyboard = 'false'; };
    document.addEventListener('keydown', keyboard, true); document.addEventListener('pointerdown', pointer, true);
    return () => { document.removeEventListener('keydown', keyboard, true); document.removeEventListener('pointerdown', pointer, true); delete document.documentElement.dataset.drLearningKeyboard; };
  }, []);
  // Saved position is offered as Resume. Reopening a menu never forces an old tour.
  const run = active ? progress.run : null;
  function start(chapter: ChapterId, resume = false) {
    if (blocked || document.querySelector('dialog[open], .dr-loremap, .dr-map-workspace, form.rp-editor')) { setNotice(true); return; }
    launcher.current = document.activeElement as HTMLElement | null;
    update({ run: resume && progress.run?.chapter === chapter ? progress.run : { chapter, step: 0 } });
    setNotice(false); setCollapsed(false); setActive(true); onHub(false);
  }
  function pause() {
    setActive(false);
    (launcher.current?.isConnected ? launcher.current : document.querySelector<HTMLElement>('.dr-guide-launch'))?.focus();
  }
  function move(next: number) {
    if (!run) return;
    const chapter = learningChapters.find(c => c.id === run.chapter)!;
    if (next >= chapter.steps.length) {
      update({ completed: [...progress.completed.filter(id => id !== chapter.id), chapter.id], run: null });
      setActive(false); onHub(true);
    } else update({ run: { ...run, step: Math.max(0, next) } });
  }
  // The final welcome action explicitly starts the first route, unlike a menu reload.
  useEffect(() => { if (requested) { setActive(true); setCollapsed(false); onStarted?.(); } }, [requested, onStarted]);
  return <>
    {hub && <Modal title={t('guide')} closeLabel={t('close')} returnFocus={document.querySelector<HTMLElement>('.dr-guide-launch')} onClose={() => { onHub(false); setNotice(false); }} plainClose>
      <div lang={locale} className="dr-learning-hub"><p>{t('intro')}</p><p className="dr-learning-note">{t('later')}</p>
        {notice && <p role="status" className="dr-learning-notice">{t('blocked')}</p>}
        {storageError && <p role="alert" className="error-text">{t('savedError')}</p>}
        {progress.run && <button className="button primary" onClick={() => start(progress.run!.chapter, true)}>{t('resume')}<ChevronRight size={16}/></button>}
        <ol className="dr-learning-chapters">{learningChapters.map((chapter, index) => <li key={chapter.id}>
          <button onClick={() => start(chapter.id)}><span className="dr-learning-number" aria-hidden="true">{progress.completed.includes(chapter.id) ? <Check size={17}/> : index + 1}</span>
            <span><strong>{chapter.title[locale]}</strong><small>{t(progress.completed.includes(chapter.id) ? 'restart' : 'start')}</small></span><ChevronRight size={17} aria-hidden="true"/>
          </button>
        </li>)}</ol>
        <p className="dr-learning-note">{t('limits')}</p>
      </div>
    </Modal>}
    {run && !hub && !blocked && <TourCard key={run.chapter + ':' + run.step} locale={locale} run={run} collapsed={collapsed}
      onCollapse={() => setCollapsed(value => !value)} onPause={pause} onMove={move} storageError={storageError}/ >}
  </>;
}

export function visibleGuideElement(selector: string): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(selector)].find(el => {
    if (el.closest('[hidden], [inert], [aria-hidden="true"]') || !el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') return false;
    // Chromium may retain layout boxes in a closed <details> subtree. The first
    // summary is visible, but its siblings are not a confirmed destination.
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement && !parent.open) {
        const summary = [...parent.children].find(child => child.tagName === 'SUMMARY');
        if (!summary?.contains(el)) return false;
      }
    }
    return true;
  }) ?? null;
}

function TourCard({ locale, run, collapsed, onCollapse, onPause, onMove, storageError }: {
  locale: Locale; run: LearningRun; collapsed: boolean; onCollapse: () => void; onPause: () => void; onMove: (step: number) => void; storageError: boolean;
}) {
  const t = (key: Parameters<typeof learningText>[1]) => learningText(locale, key);
  const chapter = learningChapters.find(c => c.id === run.chapter)!;
  const current = chapter.steps[run.step]!;
  const [rect, setRect] = useState<DOMRect | null>(null), [targetExists, setTargetExists] = useState<boolean | null>(null);
  const [directory, setDirectory] = useState(false), [viewport, setViewport] = useState({ width: innerWidth, height: innerHeight });
  const [foreignDialog, setForeignDialog] = useState(false);
  const root = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null), target = useRef<HTMLElement | null>(null);
  const onMoveRef = useRef(onMove); onMoveRef.current = onMove;
  useEffect(() => {
    let frame = 0, stopped = false, revealed = false;
    function refresh() {
      frame = 0; if (stopped) return;
      const dialog = [...document.querySelectorAll<HTMLElement>('[aria-modal="true"], .dr-map-workspace, .dr-loremap, form.rp-editor')].some(el => !el.closest('.dr-learning-tour') && el.getClientRects().length > 0 && !el.closest('[hidden]'));
      setForeignDialog(dialog);
      if (dialog) { setRect(null); return; }
      if (current.arrived && visibleGuideElement(current.arrived)) { onMoveRef.current(run.step + 1); return; }
      target.current = visibleGuideElement(current.target);
      const needsDirectory = !target.current && current.target.includes('settings-');
      if (needsDirectory) target.current = visibleGuideElement('[data-dr-guide="settings-home"]');
      setDirectory(!!target.current && needsDirectory);
      setTargetExists(!!target.current);
      setViewport({ width: innerWidth, height: innerHeight });
      if (target.current && !revealed) {
        revealed = true;
        const initial = target.current.getBoundingClientRect();
        if (!target.current.dataset.drGuide?.startsWith('page-') && (initial.top < 0 || initial.bottom > innerHeight - 82)) target.current.scrollIntoView({ block: 'center', behavior: 'instant' });
      }
      const box = target.current?.getBoundingClientRect();
      setRect(box && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth ? box : null);
    }
    function schedule() { if (!frame && !stopped) frame = requestAnimationFrame(refresh); }
    // Observe only the application, not our own overlay: no render/observer loop.
    const observer = new MutationObserver(records => {
      if (records.some(record => !root.current?.contains(record.target))) schedule();
    });
    observer.observe(document.querySelector('.app-shell') ?? document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'aria-current', 'aria-pressed', 'open', 'data-dr-guide'] });
    const resize = new ResizeObserver(schedule); resize.observe(document.documentElement);
    document.addEventListener('scroll', schedule, true); window.addEventListener('resize', schedule);
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !document.querySelector('[aria-modal="true"]')) { event.preventDefault(); event.stopPropagation(); onPause(); }
    }
    document.addEventListener('keydown', escape);
    schedule();
    return () => { stopped = true; cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect(); document.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); document.removeEventListener('keydown', escape); };
  }, [current, run.step, onPause]);
  useEffect(() => { if (!collapsed && !foreignDialog) heading.current?.focus({ preventScroll: true }); }, [collapsed, foreignDialog]);
  const margin = 10, width = Math.min(352, viewport.width - margin * 2);
  const highlight: CSSProperties | undefined = rect ? { left: Math.max(3, rect.left - 3), top: Math.max(3, rect.top - 3), width: Math.min(innerWidth - Math.max(3, rect.left - 3) - 3, rect.width + 6), height: Math.min(innerHeight - Math.max(3, rect.top - 3) - 3, rect.height + 6) } : undefined;
  // Keep bottom navigation usable; large targets get a docked hint that can be minimized.
  const topRoom = (rect?.top ?? 0) - margin * 2, bottomRoom = viewport.height - 82 - (rect?.bottom ?? viewport.height) - margin * 2;
  const room = Math.max(topRoom, bottomRoom);
  const anchored = rect && room >= 150;
  const position: CSSProperties = {
    width, left: Math.max(margin, Math.min(viewport.width - width - margin, rect?.left ?? (viewport.width - width) / 2)),
    ...(anchored ? topRoom > bottomRoom ? { bottom: viewport.height - rect.top + margin, maxHeight: Math.min(viewport.height * .55, topRoom) } : { top: rect.bottom + margin, maxHeight: Math.min(viewport.height * .55, bottomRoom) } : { bottom: 82 }),
  };
  if (foreignDialog) return null;
  return <div ref={root} className="dr-learning-tour">
    {highlight && !collapsed && <div className="dr-learning-highlight" style={highlight} aria-hidden="true"/>}
    <section lang={locale} className="dr-learning-popover" style={position} role="dialog" aria-label={t('guide')} aria-describedby="dr-learning-step-copy">
      <header><span className="dr-learning-count">{t('progress').replace('{step}', String(run.step + 1)).replace('{total}', String(chapter.steps.length))}</span>
        <button className="icon-button" onClick={onCollapse} aria-label={t(collapsed ? 'expand' : 'collapse')}><Minimize2 size={16}/></button>
        <button className="icon-button" onClick={onPause} aria-label={t('pause')}><X size={17}/></button>
      </header>
      <h2 ref={heading} tabIndex={-1}>{current.title[locale]}</h2>
      {!collapsed && <>
        <p id="dr-learning-step-copy">{current.text[locale]}</p>
        {(current.arrived || targetExists === false) && <p className="dr-learning-instruction" role="status">{t(directory ? 'directory' : targetExists === false ? 'unavailable' : 'waiting')}</p>}
        {storageError && <p role="alert" className="error-text">{t('savedError')}</p>}
        <footer><button className="button secondary small" disabled={!run.step} onClick={() => onMove(run.step - 1)}><ChevronLeft size={15}/>{t('back')}</button>
          {current.arrived ? <button className="button secondary small" onClick={() => target.current?.scrollIntoView({ block: 'center', behavior: 'instant' })}>{t('reveal')}</button>
            : <button className="button primary small" onClick={() => onMove(run.step + 1)}>{t(run.step === chapter.steps.length - 1 ? 'finish' : 'next')}</button>}
        </footer>
        {current.arrived && <button className="dr-learning-pause" onClick={onPause}>{t('pause')}</button>}
      </>}
      {collapsed && <span id="dr-learning-step-copy" className="sr-only">{current.text[locale]}</span>}
    </section>
  </div>;
}
