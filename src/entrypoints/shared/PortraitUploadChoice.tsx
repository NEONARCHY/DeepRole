import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Locale } from "../../core/types";
import type { PortraitUploadMode } from "./portrait-file";
import { Modal } from "./Modal";
import { portraitUploadText } from "../../core/portrait-upload-i18n";

export function usePortraitUploadChoice(locale: Locale) {
  const [files, setFiles] = useState<File[] | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const resolve = useRef<((mode: PortraitUploadMode | undefined) => void) | null>(null);
  const finish = (mode?: PortraitUploadMode) => { const done = resolve.current; resolve.current = null; setFiles(null); done?.(mode); };
  useEffect(() => () => { resolve.current?.(undefined); resolve.current = null; }, []);
  const choose = (next: File[]) => new Promise<PortraitUploadMode | undefined>(done => {
    if (!next.length || resolve.current) { done(undefined); return; }
    resolve.current = done; setFiles(next);
  });
  const t = (key: Parameters<typeof portraitUploadText>[1]) => portraitUploadText(locale, key);
  const bytes = files?.reduce((sum, f) => sum + f.size, 0) ?? 0;
  const size = (bytes / (bytes < 1048576 ? 1024 : 1048576)).toLocaleString(locale, { maximumFractionDigits: 1 });
  const unit = bytes < 1048576 ? locale === "ru" ? "КБ" : "KB" : locale === "ru" ? "МБ" : "MB";
  const content = files && <div className="dr-upload-modal"><Modal plainClose title={t("compressTitle")} closeLabel={t("cancel")} onClose={() => finish()}>
    <div className="dr-upload-choice">
      <p>{files.length} · {size} {unit}</p>
      <p className="dr-character-hint">{t("compressHint")}</p>
      {(["original", "configured", "compact"] as const).map(mode => <button type="button" key={mode} onClick={() => finish(mode)}><strong>{t(mode)}</strong><span>{t(mode === "original" ? "originalHint" : mode === "configured" ? "configuredHint" : "compactHint")}</span></button>)}
      <button type="button" onClick={() => finish()}>{t("cancel")}</button>
    </div>
  </Modal></div>;
  // Keep the choice outside disabled upload fieldsets, within the extension's styled root.
  const target = anchor.current?.closest(".dr-character-dialog-layer,.dr-character-editor-view") ?? anchor.current?.closest("fieldset")?.parentElement ?? anchor.current?.parentElement;
  const dialog = <><span hidden ref={anchor} />{content && target && createPortal(content, target)}</>;
  return { choose, dialog };
}
