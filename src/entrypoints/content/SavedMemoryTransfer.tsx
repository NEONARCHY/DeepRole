import { useId, useLayoutEffect, useRef, useState } from "react";
import { History } from "lucide-react";
import { isBackgroundBuildFailure, savedMemoryText, type SavedMemoryPreview } from "../../core/saved-memory-continuation";
import type { Locale, WorldProfile } from "../../core/types";
import { PageMemoryDialog } from "./PageMemoryDialog";

type WorldOption = Pick<WorldProfile, "id" | "name">;

export function SavedMemoryTransfer({ locale, disabled, worlds, quickResume, actionClassName, onPreview, onOpen }: {
  locale: Locale;
  disabled: boolean;
  worlds?: WorldOption[];
  quickResume?: boolean;
  actionClassName?: string;
  onPreview: (worldId?: string) => Promise<SavedMemoryPreview>;
  onOpen: (version: string, worldId?: string) => Promise<void>;
}) {
  const t = savedMemoryText(locale), id = useId();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<SavedMemoryPreview>(), [error, setError] = useState("");
  const [world, setWorld] = useState<WorldOption>();
  const chooseBetweenWorlds = (worlds?.length ?? 0) > 1;
  const singleGame = quickResume && worlds?.length === 1 ? worlds[0] : undefined;
  const secondary = actionClassName ? "button secondary" : "dr-meter-transfer";
  const primary = actionClassName ? "button primary" : "dr-meter-transfer";
  const running = useRef(false), worldHeading = useRef<HTMLElement>(null);
  useLayoutEffect(() => { if (open) worldHeading.current?.focus({ preventScroll: true }); }, [world, open]);

  async function run(action: () => Promise<void>) {
    if (running.current || disabled) return;
    running.current = true; setBusy(true); setError("");
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
    return run(async () => {
      choose(selected); setOpen(true);
      setPreview(await onPreview(selected?.id));
    });
  }
  async function confirm(current: SavedMemoryPreview, selected?: WorldOption) {
    try {
      await onOpen(current.version, selected?.id);
      setOpen(false);
    } catch (cause) {
      if (!(cause instanceof Error) || cause.message !== "handoff-stale") throw cause;
      // Only refresh the preview. A different save needs its own confirmation.
      choose(selected);
      setOpen(true);
      setPreview(await onPreview(selected?.id));
      setError(t.updated);
    }
  }
  const choosing = !!worlds && !world;
  const confirmation = !choosing && <button type="button" className={`${primary} dr-saved-memory-action`} disabled={disabled || busy || !preview} onClick={() => {
    if (preview) void run(() => confirm(preview, world));
  }}>{worlds ? t.connect : t.open}</button>;

  const previewButton = <button type="button" className={`${singleGame ? secondary : actionClassName ?? "dr-meter-transfer"} dr-saved-memory-action`} aria-haspopup="dialog" disabled={disabled || busy} onClick={() => {
    if (chooseBetweenWorlds) { choose(); setOpen(true); }
    else void loadPreview(worlds?.[0]);
  }}>{!actionClassName && <History size={16} aria-hidden="true"/>}{singleGame ? t.viewScene : t.title}</button>;

  return <>
    {singleGame ? <>
      <div className="dr-play-actions">
        <button type="button" className={`${primary} dr-saved-memory-action`} disabled={disabled || busy} onClick={() => void run(async () => {
          const current = await onPreview(singleGame.id);
          await confirm(current, singleGame);
        })}>{t.resumeGame(singleGame.name)}</button>
        {previewButton}
      </div>
      {!open && busy && <p role="status">{t.preparing}</p>}
      {!open && error && <p className="error-text" role="alert">{error}</p>}
    </> : previewButton}
    <PageMemoryDialog open={open} title={t.title} closeLabel={t.close} dialogId={id} footer={confirmation} onClose={() => {
      if (!running.current) { setOpen(false); setError(""); }
    }}>
      <div className="dr-saved-memory-review" aria-busy={busy}>
        {choosing ? <div className="dr-saved-memory-review">
          <strong ref={worldHeading} tabIndex={-1}>{t.chooseWorld}</strong>
          {worlds.map(item => <button type="button" key={item.id} className={`${secondary} dr-saved-memory-action`} disabled={disabled || busy} onClick={() => void loadPreview(item)}>{item.name}</button>)}
        </div> : <>
          {world && <strong ref={worldHeading} tabIndex={-1}>{world.name}</strong>}
          <p>{worlds ? t.homeHint : t.hint}</p>
          {error && <p role="alert">{error}</p>}
          {busy && !preview && <p role="status">{t.loading}</p>}
          {error && !preview && <button type="button" className={`${secondary} dr-saved-memory-action`} disabled={disabled || busy} onClick={() => void loadPreview(world)}>{t.retry}</button>}
          {world && chooseBetweenWorlds && <button type="button" className={`${secondary} dr-saved-memory-action`} disabled={busy} onClick={() => choose()}>{t.changeWorld}</button>}
          {preview?.scene ? <><strong>{t.last}</strong>{preview.savedAt !== null && <time dateTime={new Date(preview.savedAt).toISOString()}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(preview.savedAt)}</time>}<blockquote>{preview.scene}</blockquote></> : preview && <p>{t.empty}</p>}
        </>}
      </div>
    </PageMemoryDialog>
  </>;
}
