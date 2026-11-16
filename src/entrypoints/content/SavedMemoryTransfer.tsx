import { useId, useRef, useState } from "react";
import { savedMemoryText, type SavedMemoryPreview } from "../../core/saved-memory-continuation";
import type { Locale } from "../../core/types";
import { PageMemoryDialog } from "./PageMemoryDialog";

export function SavedMemoryTransfer({ locale, disabled, onPreview, onOpen }: {
  locale: Locale;
  disabled: boolean;
  onPreview: () => Promise<SavedMemoryPreview>;
  onOpen: (version: string) => Promise<void>;
}) {
  const t = savedMemoryText(locale), id = useId();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<SavedMemoryPreview>(), [error, setError] = useState("");
  const running = useRef(false);
  async function run(version?: string) {
    if (running.current || disabled) return;
    running.current = true; setBusy(true); setError("");
    try {
      if (version === undefined) { setPreview(undefined); setOpen(true); setPreview(await onPreview()); }
      else await onOpen(version);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      if (code === "handoff-stale") setPreview(undefined);
      setError(code === "handoff-stale" ? t.stale : code === "draft-not-empty" ? t.draft : t.failed);
    } finally { running.current = false; setBusy(false); }
  }
  return <>
    <button type="button" className="dr-meter-transfer" aria-haspopup="dialog" disabled={disabled || busy} onClick={() => void run()}>{t.title}</button>
    <PageMemoryDialog open={open} title={t.title} closeLabel={t.close} dialogId={id} onClose={() => { if (!running.current) setOpen(false); }}>
      <div className="dr-saved-memory-review" aria-busy={busy}>
        {preview?.scene ? <><strong>{t.last}</strong>{preview.savedAt !== null && <time dateTime={new Date(preview.savedAt).toISOString()}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(preview.savedAt)}</time>}<blockquote>{preview.scene}</blockquote></> : preview && <p>{t.empty}</p>}
        <p>{t.hint}</p>
        {error && <p role="alert">{error}</p>}
        <button type="button" className="dr-meter-transfer" disabled={disabled || busy || !preview} onClick={() => { if (preview) void run(preview.version); }}>{t.open}</button>
      </div>
    </PageMemoryDialog>
  </>;
}
