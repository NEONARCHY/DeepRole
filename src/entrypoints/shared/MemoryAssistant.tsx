import { useState } from "react";
import { X } from "lucide-react";
import { assistantText } from "../../core/assistant-i18n";
import type { ActivationMode, Locale, MemoryCandidate, MemoryProposalBatch, MemoryOverrides, ContextSelection } from "../../core/types";
import { MemoryModeControl } from "./MemoryModeControl";
import { uiText } from "../../core/ui-i18n";
import { experienceText } from "../../core/experience-i18n";
import { TooltipButton } from "./TooltipButton";

export function QuickMemory(props: { locale: Locale; worldName?: string; onSave: (text: string, mode: ActivationMode, title: string) => Promise<void>; onDraft: (brief: string) => Promise<void>; onClose: () => void }) {
  const t = (key: Parameters<typeof assistantText>[1]) => assistantText(props.locale, key);
  const [text, setText] = useState(""); const [title, setTitle] = useState(""); const [mode, setMode] = useState<ActivationMode>("smart");
  const [brief, setBrief] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function act(task: () => Promise<void>) {
    if (busy) return; setBusy(true); setError("");
    try { await task(); props.onClose(); }
    catch (cause) { setError(t(cause instanceof Error && cause.message === "draft-not-empty" ? "draftProtected" : cause instanceof Error && cause.message === "busy" ? "busy" : cause instanceof Error && cause.message === "scene-changed" ? "sceneChanged" : "failed")); }
    finally { setBusy(false); }
  }
  return <section className="dr-assistant" aria-label={t("remember")} aria-busy={busy}>
    <header><strong>{t("remember")}</strong><button type="button" disabled={busy} aria-label={t("close")} onClick={props.onClose}><X aria-hidden="true" size={18} /></button></header>
    <p className="dr-inline-note">{experienceText(props.locale, props.worldName ? "quickScope" : "quickScopeGlobal", { name: props.worldName ?? "" })}</p>
    <label>{t("content")}<textarea disabled={busy} placeholder={experienceText(props.locale, "contentPlaceholder")} maxLength={30000} rows={4} value={text} onChange={(e) => setText(e.target.value)} /></label>
    <label>{t("title")}<input disabled={busy} maxLength={240} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
    <MemoryModeControl locale={props.locale} value={mode} onChange={setMode} disabled={busy} />
    <button className="dr-assistant-primary" disabled={busy || !text.trim()} onClick={() => void act(() => props.onSave(text, mode, title))}>{t("save")}</button>
    <details><summary>{t("draft")}</summary><p>{t("draftHelp")}</p><label>{t("brief")}<textarea disabled={busy} rows={3} maxLength={6000} value={brief} onChange={(e) => setBrief(e.target.value)} /></label><button disabled={busy || !brief.trim()} onClick={() => void act(() => props.onDraft(brief))}>{t("draft")}</button></details>
    {error && <p role="alert">{error}</p>}
  </section>;
}

export function MemoryReview(props: { locale: Locale; batch: MemoryProposalBatch; onSave: (items: MemoryCandidate[]) => Promise<void>; onDiscard: () => Promise<void>; onClose: () => void }) {
  const t = (key: Parameters<typeof assistantText>[1]) => assistantText(props.locale, key);
  const [items, setItems] = useState(() => structuredClone(props.batch.items));
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const invalid = items.some((item) => item.selected && !item.issue && (!item.title.trim() || !item.content.trim()));
  const patch = (id: string, values: Partial<MemoryCandidate>) => setItems((all) => all.map((item) => item.id === id ? { ...item, ...values } : item));
  async function act(task: () => Promise<void>) { if (busy) return; setBusy(true); setError(""); try { await task(); props.onClose(); } catch { setError(t("conflict")); } finally { setBusy(false); } }
  return <section className="dr-assistant dr-memory-review" aria-label={t("review")} aria-busy={busy}>
    <header><strong>{t("review")}</strong><button type="button" disabled={busy} aria-label={t("close")} onClick={props.onClose}><X aria-hidden="true" size={18} /></button></header>
    <p>{experienceText(props.locale, "reviewHint")}</p>
    <div className="dr-review-selection"><button disabled={busy} onClick={() => setItems((all) => all.map((item) => ({ ...item, selected: !item.issue })))}>{experienceText(props.locale, "reviewAll")}</button><button disabled={busy} onClick={() => setItems((all) => all.map((item) => ({ ...item, selected: false })))}>{experienceText(props.locale, "reviewNone")}</button></div>
    {items.map((item) => <article key={item.id} className={`dr-proposal ${item.selected ? "is-selected" : ""}`}>
      <label className="dr-proposal-check"><input type="checkbox" disabled={busy || !!item.issue} checked={item.selected} onChange={(e) => patch(item.id, { selected: e.target.checked })} /><strong>{item.targetEntryId ? t("update") : t("newEntry")}</strong></label>
      {item.issue && <><p role="note">{t("issue")}</p><button disabled={busy} onClick={() => patch(item.id, { targetEntryId: undefined, expectedEntry: undefined, issue: undefined, selected: false })}>{t("asNew")}</button></>}
      {item.targetEntryId && item.expectedEntry && <details open><summary>{t("before")}</summary><strong>{item.expectedEntry.title}</strong><p className="dr-proposal-before">{item.expectedEntry.content}</p></details>}
      <label>{experienceText(props.locale, "reviewTitle")}<input required maxLength={240} disabled={busy} value={item.title} onChange={(e) => patch(item.id, { title: e.target.value })} /></label>
      <label>{t("content")}<textarea rows={5} maxLength={30000} disabled={busy} value={item.content} onChange={(e) => patch(item.id, { content: e.target.value })} /></label>
      {item.targetEntryId ? <p className="dr-inline-note">{experienceText(props.locale, "reviewKeptMode", { mode: uiText(props.locale, item.activation) })}</p> : <MemoryModeControl locale={props.locale} value={item.activation} onChange={(activation) => patch(item.id, { activation })} disabled={busy} />}
    </article>)}
    {invalid && <p role="alert">{experienceText(props.locale, "reviewRequired")}</p>}
    {error && <p role="alert">{error}</p>}
    <div className="dr-assistant-actions dr-review-actions"><button className="dr-assistant-primary" disabled={busy || invalid || !items.some((item) => item.selected && !item.issue)} onClick={() => void act(() => props.onSave(items))}>{t("saveChanges")} · {items.filter((item) => item.selected && !item.issue).length}</button><button disabled={busy} onClick={() => void act(props.onDiscard)}>{t("discard")}</button></div>
  </section>;
}

/** Same controls in list and RPG-map inspector; never a second memory store. */
export function MemoryUse(props: { locale: Locale; compact?: boolean; id: string; selection?: ContextSelection; overrides?: MemoryOverrides; onChange?: (id: string, action: "include" | "exclude" | "reset") => Promise<void> }) {
  const t = (key: Parameters<typeof assistantText>[1]) => assistantText(props.locale, key);
  const [busy, setBusy] = useState(false); const [failed, setFailed] = useState("");
  const included = props.overrides?.includedIds.includes(props.id); const excluded = props.overrides?.excludedIds.includes(props.id);
  async function change(action: "include" | "exclude" | "reset") {
    if (busy) return;
    setBusy(true); setFailed("");
    try { await props.onChange?.(props.id, action); }
    catch (cause) {
      const code = cause instanceof Error ? cause.message : "failed";
      const key = ["out-of-scope", "unknown-world", "unknown-book"].includes(code) ? "memoryUnavailable"
        : code === "scene-changed" ? "sceneChanged"
          : code === "vault-locked" ? "vaultLocked"
            : code === "memory-conflict" ? "conflict" : "failed";
      setFailed(t(key));
    } finally { setBusy(false); }
  }
  return <div className="dr-memory-use">
    {props.onChange ? <>
      <div className="dr-use-heading"><strong>{uiText(props.locale, "chatSetting")}</strong><small>{t(excluded ? "excluded" : included ? "attached" : props.selection?.entries.some((item) => item.entry.id === props.id) ? "inContext" : "notSelected")}</small></div>
      <div className="dr-chat-choices" role="group" aria-label={uiText(props.locale, "chatSetting")}>{(["reset", "include", "exclude"] as const).map((action) => <TooltipButton type="button" key={action} disabled={busy} aria-label={uiText(props.locale, action === "include" ? "useAlways" : action === "exclude" ? "useNever" : "useDefault")} tooltip={uiText(props.locale, action === "include" ? "includedHint" : action === "exclude" ? "excludedHint" : "defaultHint")} aria-pressed={action === "include" ? !!included : action === "exclude" ? !!excluded : !included && !excluded} onClick={() => void change(action)}>{uiText(props.locale, action === "include" ? "useAlways" : action === "exclude" ? "useNever" : "useDefault")}</TooltipButton>)}</div>
      {(!props.compact || included || excluded) && <p className="dr-memory-use-help">{uiText(props.locale, included ? "includedHint" : excluded ? "excludedHint" : "defaultHint")}</p>}
      {excluded && <p className="dr-memory-use-help">{experienceText(props.locale, "pastMessagesHint")}</p>}
    </> : <small>{t("offWorld")}</small>}
    {failed && <small role="alert">{failed}</small>}
  </div>;
}
