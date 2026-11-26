import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronRight, History, ListChecks } from "lucide-react";
import { isBackgroundBuildFailure, savedMemoryText, type SavedMemoryPreview } from "../../core/saved-memory-continuation";
import type { Locale, WorldProfile } from "../../core/types";
import { PageMemoryDialog } from "./PageMemoryDialog";
import { continuationPickerText, continuationText } from "../../core/continuation-i18n";

type WorldOption = Pick<WorldProfile, "id" | "name">;

export function SavedMemoryTransfer({ locale, disabled, worlds, quickResume, actionClassName, onPreview, onOpen, review, openSignal, triggerTarget }: {
  locale: Locale;
  disabled: boolean;
  worlds?: WorldOption[];
  quickResume?: boolean;
  actionClassName?: string;
  onPreview?: (worldId?: string) => Promise<SavedMemoryPreview>;
  onOpen?: (version: string, worldId?: string) => Promise<void>;
  review?: { disabled: boolean; onStart: () => void };
  openSignal?: number;
  triggerTarget?: HTMLElement | null;
}) {
  const t = savedMemoryText(locale), id = useId();
  const picker = continuationPickerText(locale);
  const continueLabel = continuationText(locale, "continue");
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [chooseMethod, setChooseMethod] = useState(false);
  const [preview, setPreview] = useState<SavedMemoryPreview>(), [error, setError] = useState("");
  const [updated, setUpdated] = useState(false);
  const [world, setWorld] = useState<WorldOption>();
  const chooseBetweenWorlds = (worlds?.length ?? 0) > 1;
  const singleGame = !review && quickResume && worlds?.length === 1 && onPreview && onOpen ? worlds[0] : undefined;
  const savedDisabled = disabled || busy || !onPreview || !onOpen;
  const secondary = actionClassName ? "button secondary" : "dr-meter-transfer";
  const primary = actionClassName ? "button primary" : "dr-meter-transfer";
  const running = useRef(false), stepHeading = useRef<HTMLElement>(null);
  const updatedNotice = useRef<HTMLParagraphElement>(null);
  const setStepHeading = (element: HTMLElement | null) => { stepHeading.current = element; };
  const previousOpenSignal = useRef(openSignal);
  useLayoutEffect(() => {
    if (previousOpenSignal.current === openSignal) return;
    previousOpenSignal.current = openSignal;
    if (review && !running.current) { setChooseMethod(true); setOpen(true); }
  }, [openSignal, review]);
  useLayoutEffect(() => { if (open) stepHeading.current?.focus({ preventScroll: true }); }, [world, open, chooseMethod]);
  useLayoutEffect(() => { if (open && updated && !chooseMethod) updatedNotice.current?.focus(); }, [open, updated, chooseMethod]);

  async function run(action: () => Promise<void>) {
    if (running.current || disabled) return;
    running.current = true; setBusy(true); setError(""); setUpdated(false);
    try { await action(); }
    catch (e) {
      const code = e instanceof Error ? e.message : "";
      if (code === "handoff-stale" || code === "handoff-scope" || code === "story-game-inactive") setPreview(undefined);
      setError(isBackgroundBuildFailure(e) ? t.transferMismatch : code === "handoff-tab-inactive" ? t.inactiveTab : code === "story-game-inactive" ? t.movedSource : code === "handoff-stale" || code === "handoff-scope" ? t.stale : code === "draft-not-empty" ? t.draft : code === "busy" ? t.busy : t.failed);
    } finally { running.current = false; setBusy(false); }
  }

  function choose(selected?: WorldOption) {
    setWorld(selected); setPreview(undefined); setError("");
  }
  function loadPreview(selected?: WorldOption) {
    if (!onPreview) return;
    return run(async () => {
      choose(selected); setOpen(true);
      setPreview(await onPreview(selected?.id));
    });
  }
  async function confirm(current: SavedMemoryPreview, selected?: WorldOption) {
    if (!onOpen || !onPreview) return;
    try {
      await onOpen(current.version, selected?.id);
      setOpen(false);
    } catch (cause) {
      if (!(cause instanceof Error) || cause.message !== "handoff-stale") throw cause;
      // Keep the previous excerpt visible until its replacement is available.
      const latest = await onPreview(selected?.id);
      setWorld(selected);
      setPreview(latest);
      setUpdated(true);
      setOpen(true);
    }
  }
  const choosing = !!worlds && !world;
  const confirmation = !chooseMethod && !choosing && <button type="button" className={`${primary} dr-saved-memory-action`} disabled={savedDisabled || !preview} onClick={() => {
    if (preview) void run(() => confirm(preview, world));
  }}>{updated ? t.openUpdated : worlds ? t.connect : t.open}</button>;

  function startSaved() {
    setChooseMethod(false);
    if (chooseBetweenWorlds) { choose(); setOpen(true); }
    else void loadPreview(worlds?.[0]);
  }
  const previewButton = <button type="button" className={`${singleGame ? secondary : actionClassName ?? "dr-meter-transfer"} dr-saved-memory-action`} aria-haspopup="dialog" aria-controls={id}
    disabled={savedDisabled && (!review || review.disabled)} onClick={() => {
      if (review) { setChooseMethod(true); setOpen(true); }
      else startSaved();
    }}>{!actionClassName && !review && <History size={16} aria-hidden="true"/>}{review ? continueLabel : singleGame ? t.viewScene : t.title}</button>;

  return <>
    {singleGame ? <>
      <div className="dr-play-actions">
        <button type="button" className={`${primary} dr-saved-memory-action`} disabled={disabled || busy} onClick={() => void run(async () => {
          const current = await onPreview!(singleGame.id);
          await confirm(current, singleGame);
        })}>{t.resumeGame(singleGame.name)}</button>
        {previewButton}
      </div>
      {!open && busy && <p role="status">{t.preparing}</p>}
      {!open && error && <p className="error-text" role="alert">{error}</p>}
    </> : triggerTarget === undefined ? previewButton : triggerTarget && createPortal(previewButton, triggerTarget)}
    <PageMemoryDialog open={open} title={chooseMethod ? continueLabel : t.title} closeLabel={t.close} dialogId={id} footer={confirmation} onClose={() => {
      if (!running.current) { setOpen(false); setError(""); }
    }}>
      <div className="dr-saved-memory-review" aria-busy={busy}>
        {review && !chooseMethod && <button type="button" className="dr-continuation-back" disabled={busy} onClick={() => setChooseMethod(true)}>
          <ArrowLeft size={16} strokeWidth={1.5} aria-hidden="true" />{picker.back}
        </button>}
        {review && chooseMethod ? <div className="dr-continuation-methods">
          <p ref={setStepHeading} tabIndex={-1}>{picker.intro}</p>
          {[
            { key: "review", Icon: ListChecks, title: picker.review, detail: review.disabled ? picker.reviewUnavailable : picker.reviewDetail,
              firstTurn: picker.reviewFirstTurn, disabled: review.disabled || busy, select: () => { setOpen(false); review.onStart(); } },
            { key: "saved", Icon: History, title: picker.saved, detail: savedDisabled ? picker.savedUnavailable : picker.savedDetail,
              firstTurn: picker.savedFirstTurn, disabled: savedDisabled, select: startSaved },
          ].map(({ key, Icon, title, detail, firstTurn, disabled, select }) => <button key={key} type="button"
            className="dr-continuation-option" disabled={disabled} onClick={select}
            aria-labelledby={id + "-" + key + "-title"} aria-describedby={id + "-" + key + "-description"}>
            <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
            <span className="dr-continuation-option-copy">
              <strong id={id + "-" + key + "-title"}>{title}</strong>
              <span id={id + "-" + key + "-description"} className="dr-continuation-option-description">
                <span>{detail}</span>
                {!disabled && <strong>{firstTurn}</strong>}
              </span>
            </span>
            <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>)}
        </div> : choosing ? <div className="dr-saved-memory-review">
          <strong ref={setStepHeading} tabIndex={-1}>{t.chooseWorld}</strong>
          {worlds.map(item => <button type="button" key={item.id} className={`${secondary} dr-saved-memory-action`} disabled={disabled || busy} onClick={() => void loadPreview(item)}>{item.name}</button>)}
        </div> : <div className="dr-saved-memory-preview" ref={setStepHeading} tabIndex={-1}>
          {world && <strong>{world.name}</strong>}
          {error && <p role="alert">{error}</p>}
          {updated && <p className="dr-saved-memory-updated" ref={updatedNotice} tabIndex={-1} role="status">{t.updated}</p>}
          {busy && !preview && <p role="status">{t.loading}</p>}
          {error && !preview && <button type="button" className={`${secondary} dr-saved-memory-action`} disabled={disabled || busy} onClick={() => void loadPreview(world)}>{t.retry}</button>}
          {world && chooseBetweenWorlds && <button type="button" className={`${secondary} dr-saved-memory-action`} disabled={busy} onClick={() => choose()}>{t.changeWorld}</button>}
          {preview?.scene ? <figure className="dr-saved-scene">
            <figcaption>
              <strong>{t.last}</strong>
              {preview.savedAt !== null && <time dateTime={new Date(preview.savedAt).toISOString()}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(preview.savedAt)}</time>}
            </figcaption>
            <blockquote>{preview.scene}</blockquote>
          </figure> : preview && <p>{t.empty}</p>}
          <p className="dr-saved-memory-hint">{worlds ? t.homeHint : t.hint}</p>
        </div>}
      </div>
    </PageMemoryDialog>
  </>;
}
