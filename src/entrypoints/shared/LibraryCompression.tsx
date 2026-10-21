import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CharacterSheet, Locale } from "../../core/types";
import { libraryImages } from "../../core/portrait-library";
import { compressPortraitLibrary } from "./portrait-file";
import { Modal } from "./Modal";

const copy = {
  ru: { open:"Сжать всю библиотеку", title:"Сжатие библиотеки", hint:"Обработаем все картинки этой библиотеки, включая назначенные эмоциям. Назначения, подборки селфи и привязки двух референсов сохранятся. Картинки, которые не станут меньше, оставим как есть.", warning:"Сжатие может убрать мелкие детали. Изменения применятся к персонажу после «Сохранить персонажа». До этого можно закрыть карточку без сохранения. Для возврата качества после сохранения нужны исходники.", high:"Высокое качество", highHint:"WebP · до размера из настроек · качество 92%", compact:"Меньше места", compactHint:"WebP · до 1280 px с учётом настроек · качество 82%", cancel:"Отмена", cancelling:"Отменяем…", running:"Сжимаем", failed:"Не удалось обработать всю библиотеку. Картинки в карточке не заменены. Можно повторить.", done:"Сжато: {count}. Объём изображений: {before} → {after}. Нажмите «Сохранить персонажа», чтобы применить.", unchanged:"Картинки уже достаточно компактные. Библиотека не изменена." },
  en: { open:"Compress entire library", title:"Library compression", hint:"Process every image in this library, including emotion assignments. Assignments, selfie collections and both reference links are preserved. Images that do not become smaller are kept unchanged.", warning:"Compression can remove fine detail. Changes apply when you Save character. Until then, close the card without saving to discard edits. Restoring quality after saving requires the originals.", high:"High quality", highHint:"WebP · up to the size in settings · 92% quality", compact:"Save space", compactHint:"WebP · up to 1280 px, respecting settings · 82% quality", cancel:"Cancel", cancelling:"Cancelling…", running:"Compressing", failed:"Could not process the whole library. Images in the card were not replaced. You can retry.", done:"Compressed: {count}. Image size: {before} → {after}. Save character to apply.", unchanged:"Images are already compact enough. The library is unchanged." },
};
export function LibraryCompression({ sheet, locale, saved, onChange, onBusy }: { sheet: CharacterSheet; locale: Locale; saved?: boolean; onChange: (sheet: CharacterSheet) => void; onBusy: (busy: boolean) => void }) {
  const t = copy[locale], anchor = useRef<HTMLButtonElement>(null), abort = useRef<AbortController | null>(null), mounted = useRef(true);
  const [open, setOpen] = useState(false), [progress, setProgress] = useState<{ done: number; total: number } | null>(null), [cancelling, setCancelling] = useState(false), [status, setStatus] = useState("");
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; abort.current?.abort(); }; }, []);
  useEffect(() => { if (saved) setStatus(""); }, [saved]);
  const close = () => { if (abort.current) { abort.current.abort(); setCancelling(true); } else { setOpen(false); onBusy(false); } };
  const run = async (mode: "configured" | "compact") => {
    if (abort.current) return;
    const controller = new AbortController(); abort.current = controller; setProgress({ done:0, total:libraryImages(sheet).length });
    try {
      const result = await compressPortraitLibrary(sheet, mode, (done, total) => { if (mounted.current) setProgress({ done, total }); }, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      if (result.changed) onChange(result.sheet);
      const size = (bytes: number) => `${(bytes / 1048576).toLocaleString(locale, { maximumFractionDigits:2 })} ${locale === "ru" ? "МБ" : "MB"}`;
      setStatus(result.changed ? t.done.replace("{count}", String(result.changed)).replace("{before}", size(result.beforeBytes)).replace("{after}", size(result.afterBytes)) : t.unchanged);
    } catch { if (mounted.current && !controller.signal.aborted) setStatus(t.failed); }
    finally { abort.current = null; if (mounted.current) { setProgress(null); setOpen(false); setCancelling(false); onBusy(false); } }
  };
  const target = anchor.current?.closest(".dr-character-dialog-layer,.dr-character-editor-view") ?? anchor.current?.closest("fieldset")?.parentElement ?? anchor.current?.parentElement;
  return <><button ref={anchor} type="button" disabled={!libraryImages(sheet).length} onClick={() => { setStatus(""); setOpen(true); onBusy(true); }}>{t.open}</button>
    {status && <p className="dr-character-hint" role="status">{status}</p>}
    {open && target && createPortal(<div className="dr-upload-modal"><Modal plainClose title={t.title} closeLabel={t.cancel} onClose={close}><div className="dr-upload-choice">
      {progress ? <><p role="status">{cancelling ? t.cancelling : `${t.running}: ${progress.done} / ${progress.total}`}</p><progress max={progress.total} value={progress.done}/><button type="button" disabled={cancelling} onClick={close}>{t.cancel}</button></> : <><p>{t.hint}</p><p>{t.warning}</p><button type="button" onClick={() => void run("configured")}><strong>{t.high}</strong><span>{t.highHint}</span></button><button type="button" onClick={() => void run("compact")}><strong>{t.compact}</strong><span>{t.compactHint}</span></button><button type="button" onClick={close}>{t.cancel}</button></>}
    </div></Modal></div>, target)}
  </>;
}
