import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { mapText } from "../../core/map-i18n";
import { estimateTokens } from "../../core/text";
import type { Locale, MemoryEntry } from "../../core/types";
import { MemoryConflictError } from "../../storage/repository";
import { MemoryModeControl } from "../shared/MemoryModeControl";

/** Explicit text saves use the same checked repository editor as the memory list. */
export function MapMemoryEditor(props: { locale: Locale; entry: MemoryEntry; isNew?: boolean; modeControl?: ReactNode; guard: MutableRefObject<() => boolean>; onDirty: (dirty: boolean) => void; onSave: (entry: MemoryEntry, expected: MemoryEntry | null) => Promise<void>; onSaved: (entry: MemoryEntry) => void }) {
  const m = (key: Parameters<typeof mapText>[1]) => mapText(props.locale, key);
  const [base, setBase] = useState(props.entry);
  const [title, setTitle] = useState(base.title);
  const [content, setContent] = useState(base.content);
  const [keywords, setKeywords] = useState(base.keywords.join(", "));
  const [activation, setActivation] = useState(base.activation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"editorConflict" | "editorFailed" | null>(null);
  const dirty = title !== base.title || content !== base.content || keywords !== base.keywords.join(", ") || activation !== base.activation;
  const latest = useRef(props); latest.current = props;
  props.guard.current = () => !busy && (!dirty || window.confirm(m("discardDraft")));
  useEffect(() => { props.onDirty(dirty); }, [dirty]);
  useEffect(() => () => { latest.current.guard.current = () => true; latest.current.onDirty(false); }, []);
  useEffect(() => {
    if (dirty || busy || props.isNew) return;
    setBase(props.entry); setTitle(props.entry.title); setContent(props.entry.content); setKeywords(props.entry.keywords.join(", ")); setActivation(props.entry.activation);
  }, [props.entry]);
  async function save() {
    if (busy || !title.trim() || !content.trim()) return;
    setBusy(true); setError(null);
    const next = { ...base, title, content, keywords: keywords === base.keywords.join(", ") ? base.keywords : [...new Set(keywords.split(",").map((key) => key.trim()).filter(Boolean))], activation, updatedAt: Date.now() };
    try { await props.onSave(next, props.isNew ? null : base); setBase(next); setKeywords(next.keywords.join(", ")); props.onSaved(next); }
    catch (cause) { setError(cause instanceof MemoryConflictError ? "editorConflict" : "editorFailed"); }
    finally { setBusy(false); }
  }
  return <form className="lm-memory-editor" aria-label={m("editMemory")} aria-busy={busy} onSubmit={(event) => { event.preventDefault(); void save(); }}>
    <p className="lm-muted">{m(props.isNew ? "writeFirst" : "editTextHint")}</p>
    <label className="lm-field">{m("memoryTitle")}<input maxLength={240} required value={title} disabled={busy} onChange={(event) => setTitle(event.target.value)} /></label>
    <label className="lm-field">{m("memoryContent")}<textarea rows={7} maxLength={100000} required value={content} disabled={busy} placeholder={m("textExample")} onChange={(event) => setContent(event.target.value)} /></label>
    <details className="lm-size-advice"><summary>{m("sizeEstimate").replace("{tokens}", String(estimateTokens(content)))} · {m("sizeHint")}</summary><p className="lm-muted">{m("sizeAdvice")}</p></details>
    {props.isNew && <MemoryModeControl locale={props.locale} value={activation} onChange={setActivation} disabled={busy} />}
    {!props.isNew && props.modeControl}
    <details><summary>{m("searchWords")}</summary><label className="lm-field">{m("searchWords")}<input value={keywords} disabled={busy} onChange={(event) => setKeywords(event.target.value)} /></label><p className="lm-muted">{m("searchWordsHint")}</p></details>
    {error && <p role="alert">{m(error)}</p>}
    <div className="lm-editor-actions"><button className="button primary" type="submit" disabled={busy || !title.trim() || !content.trim() || !props.isNew && !dirty}>{m("saveMemory")}</button>{dirty && <button className="button secondary" type="button" disabled={busy} onClick={() => { if (window.confirm(m("discardDraft"))) { setTitle(base.title); setContent(base.content); setKeywords(base.keywords.join(", ")); setActivation(base.activation); setError(null); } }}>{m("cancel")}</button>}</div>
    <small role="status">{m(dirty || props.isNew ? "textUnsaved" : "textSaved")}</small>
  </form>;
}
