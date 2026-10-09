import { useEffect, useRef, useState } from "react";
import type { Locale } from "../../core/types";
import { DEFAULT_PORTRAIT_PREVIEW_SIZE, validPortraitPreviewSize } from "../../core/portrait-upload";
import { portraitUploadText } from "../../core/portrait-upload-i18n";
import { getSettings, updateSettings } from "../../storage/settings";

export function ReferencePreviewSize({ locale, onSize }: { locale: Locale; onSize(size: number): void }) {
  const [size, setSize] = useState(DEFAULT_PORTRAIT_PREVIEW_SIZE), [error, setError] = useState("");
  const touched = useRef(false), mounted = useRef(true), saving = useRef(false), pending = useRef<number | undefined>(undefined), saved = useRef(DEFAULT_PORTRAIT_PREVIEW_SIZE);
  useEffect(() => { mounted.current = true; void getSettings().then(settings => {
    if (mounted.current && !touched.current && validPortraitPreviewSize(settings.referencePreviewSize)) { saved.current = settings.referencePreviewSize; setSize(settings.referencePreviewSize); onSize(settings.referencePreviewSize); }
  }).catch(() => {}); return () => { mounted.current = false; }; }, []);
  const persist = async () => {
    pending.current = size; if (saving.current) return; saving.current = true;
    try { while (pending.current !== undefined) { const next = pending.current; pending.current = undefined; if (next !== saved.current) { await updateSettings({ referencePreviewSize: next }); saved.current = next; } } if (mounted.current) setError(""); }
    catch { if (mounted.current) setError(portraitUploadText(locale, "previewFailed")); }
    finally { saving.current = false; }
  };
  return <div className="dr-library-size"><span>{portraitUploadText(locale, "referencePreview")}</span><output>{size} px</output><input data-portrait-preview aria-label={portraitUploadText(locale, "referencePreview")} type="range" min={96} max={280} value={size} onChange={e => { const next = Number(e.target.value); touched.current = true; setSize(next); onSize(next); }} onPointerUp={() => void persist()} onKeyUp={() => void persist()} onBlur={() => void persist()} />{error && <small role="alert">{error}</small>}</div>;
}
