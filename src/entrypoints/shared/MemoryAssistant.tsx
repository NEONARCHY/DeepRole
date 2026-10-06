import { useState } from "react";
import { AlertCircle, ChevronDown, X } from "lucide-react";
import { assistantText } from "../../core/assistant-i18n";
import type { ActivationMode, Locale, MemoryCandidate, MemoryProposalBatch, MemoryOverrides, ContextSelection } from "../../core/types";
import { MemoryModeControl } from "./MemoryModeControl";
import { uiText } from "../../core/ui-i18n";
import { experienceText } from "../../core/experience-i18n";
import { TooltipButton } from "./TooltipButton";
import { relationshipText } from "../../core/relationship-i18n";

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
    <details><summary>{t("draft")}</summary><p>{t("draftHelp")}</p><p>{relationshipText(props.locale, "loreHelp")}</p><label>{t("brief")}<textarea disabled={busy} rows={3} maxLength={6000} value={brief} onChange={(e) => setBrief(e.target.value)} /></label><button type="button" disabled={busy || brief.length + relationshipText(props.locale, "loreSample").length > 6000} onClick={() => setBrief(value => value + relationshipText(props.locale, "loreSample"))}>{relationshipText(props.locale, "loreExample")}</button><button disabled={busy || !brief.trim()} onClick={() => void act(() => props.onDraft(brief))}>{t("draft")}</button></details>
    {error && <p role="alert">{error}</p>}
  </section>;
}

type ProfileChoice = { description: string; appearance: string; personality: string; goals: string; background: string };
const profileFields = ["description", "appearance", "personality", "goals", "background"] as const;
const profileLabels = { ru: { description: "Описание", appearance: "Внешность", personality: "Характер", goals: "Цели", background: "О персонаже" }, en: { description: "Description", appearance: "Appearance", personality: "Personality", goals: "Goals", background: "Background" } } as const;

export function MemoryReview(props: { locale: Locale; batch: MemoryProposalBatch; onSave: (items: MemoryCandidate[], profileChoice?: ProfileChoice) => Promise<void>; onDiscard: () => Promise<void>; onClose: () => void }) {
  const t = (key: Parameters<typeof assistantText>[1]) => assistantText(props.locale, key);
  const [items, setItems] = useState(() => structuredClone(props.batch.items).map((item) => ({ ...item, selected: false })));
  const [profileSelected, setProfileSelected] = useState(false);
  const [profileValues, setProfileValues] = useState<ProfileChoice>({ description: props.batch.profileChange?.afterDescription ?? "", appearance: props.batch.profileChange?.afterAppearance ?? "", personality: props.batch.profileChange?.afterPersonality ?? "", goals: props.batch.profileChange?.afterGoals ?? "", background: props.batch.profileChange?.afterBackground ?? "" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const invalid = items.some((item) => item.selected && !item.issue && (!item.title.trim() || !item.content.trim()));
  const selectedCount = items.filter((item) => item.selected && !item.issue).length + Number(profileSelected);
  const availableCount = items.filter((item) => !item.issue).length + Number(!!props.batch.profileChange);
  const changedProfileFields = props.batch.profileChange ? profileFields.filter((key) => props.batch.profileChange![`before${key[0]!.toUpperCase()}${key.slice(1)}` as "beforeAppearance"] !== props.batch.profileChange![`after${key[0]!.toUpperCase()}${key.slice(1)}` as "afterAppearance"]) : [];
  const patch = (id: string, values: Partial<MemoryCandidate>) => setItems((all) => all.map((item) => item.id === id ? { ...item, ...values } : item));
  async function act(task: () => Promise<void>) { if (busy) return; setBusy(true); setError(""); try { await task(); props.onClose(); } catch { setError(t("conflict")); } finally { setBusy(false); } }
  return <section className="dr-assistant dr-memory-review" aria-label={t("review")} aria-busy={busy}>
    <header><div className="dr-review-heading"><strong>{t("review")}</strong><small>{t("reviewCount").replace("{selected}", String(selectedCount)).replace("{total}", String(items.length + Number(!!props.batch.profileChange)))}</small></div><button type="button" disabled={busy} aria-label={t("close")} onClick={props.onClose}><X aria-hidden="true" size={18} /></button></header>
    <p className="dr-review-intro">{props.batch.scanVersions ? props.locale === "ru" ? `DeepRole проверил все ${Object.keys(props.batch.scanVersions).length} записей этого мира. Сравните предложения DeepSeek: он может пропустить косвенное упоминание.` : `DeepRole checked all ${Object.keys(props.batch.scanVersions).length} records in this world. Review DeepSeek's suggestions: it may miss indirect mentions.` : experienceText(props.locale, "reviewHint")}</p>
    <div className="dr-review-selection"><button type="button" disabled={busy || !availableCount} onClick={() => { setItems((all) => all.map((item) => ({ ...item, selected: !item.issue }))); setProfileSelected(!!props.batch.profileChange); }}>{experienceText(props.locale, "reviewAll")}</button><button type="button" disabled={busy || !selectedCount} onClick={() => { setItems((all) => all.map((item) => ({ ...item, selected: false }))); setProfileSelected(false); }}>{experienceText(props.locale, "reviewNone")}</button></div>
    {props.batch.profileChange && <article className={`dr-proposal${profileSelected ? " is-selected" : ""}`}>
      <div className="dr-proposal-top"><label className="dr-proposal-check"><input type="checkbox" checked={profileSelected} disabled={busy} aria-label={`${t("select")}: ${props.batch.profileChange.name}`} onChange={(event) => setProfileSelected(event.target.checked)} /></label><div className="dr-proposal-summary"><span className="dr-proposal-type">{props.locale === "ru" ? "Карточка персонажа" : "Character profile"}</span><strong>{props.batch.profileChange.name}</strong></div></div>
      <div className="dr-proposal-body"><section className="dr-proposal-before"><span>{t("before")}</span>{changedProfileFields.map((key) => <p key={key}>{profileLabels[props.locale][key]}: {props.batch.profileChange![`before${key[0]!.toUpperCase()}${key.slice(1)}` as "beforeAppearance"] || "—"}</p>)}</section>
        <div className="dr-proposal-after"><span>{t("after")}</span>{changedProfileFields.map((key) => <label key={key}>{profileLabels[props.locale][key]}<textarea rows={3} maxLength={key === "description" ? 30000 : 1200} disabled={busy} value={profileValues[key]} onChange={(event) => setProfileValues((old) => ({ ...old, [key]: event.target.value }))} /></label>)}</div></div>
    </article>}
    <div className="dr-review-list">{items.map((item, index) => {
      const expanded = openId === item.id;
      const missing = item.selected && !item.issue && (!item.title.trim() || !item.content.trim());
      const summary = item.content.trim().replace(/\s+/gu, " ");
      return <article key={item.id} className={`dr-proposal${item.selected ? " is-selected" : ""}${item.issue ? " has-issue" : ""}${missing ? " is-invalid" : ""}`}>
        <div className="dr-proposal-top">
          <label className="dr-proposal-check"><input type="checkbox" disabled={busy || !!item.issue} checked={item.selected} aria-label={`${t("select")}: ${item.title || index + 1}`} onChange={(e) => patch(item.id, { selected: e.target.checked })} /></label>
          <button type="button" className="dr-proposal-summary" disabled={busy} aria-expanded={expanded} onClick={() => setOpenId(expanded ? null : item.id)}>
            <span className="dr-proposal-type">{missing ? t("reviewMissingFields") : item.issue ? t("reviewNeedsReview") : item.targetEntryId ? t("update") : t("newEntry")}</span>
            <strong>{item.title.trim() || t("newEntry")}</strong>
            <small>{summary.slice(0, 110)}{summary.length > 110 ? "…" : ""}</small>
            <ChevronDown aria-hidden="true" size={17} />
          </button>
        </div>
        {item.issue && <div className="dr-proposal-issue" role="note"><AlertCircle aria-hidden="true" size={16} /><p>{t("issue")}</p>{!props.batch.scanVersions && <button type="button" disabled={busy} onClick={() => { patch(item.id, { targetEntryId: undefined, expectedEntry: undefined, issue: undefined, selected: true }); setOpenId(item.id); }}>{t("asNew")}</button>}</div>}
        {expanded && <div className="dr-proposal-body">
          {item.targetEntryId && item.expectedEntry && <section className="dr-proposal-before"><span>{t("before")}</span><strong>{item.expectedEntry.title}</strong><p>{item.expectedEntry.content}</p></section>}
          <div className="dr-proposal-after"><span>{item.targetEntryId ? t("after") : t("newEntry")}</span>
            <label>{experienceText(props.locale, "reviewTitle")}<input required maxLength={240} disabled={busy} value={item.title} onChange={(e) => patch(item.id, { title: e.target.value })} /></label>
            <label>{t("content")}<textarea rows={5} maxLength={30000} disabled={busy} value={item.content} onChange={(e) => patch(item.id, { content: e.target.value })} /></label>
            {item.targetEntryId ? <p className="dr-inline-note">{experienceText(props.locale, "reviewKeptMode", { mode: uiText(props.locale, item.activation) })}</p> : <MemoryModeControl locale={props.locale} value={item.activation} onChange={(activation) => patch(item.id, { activation })} disabled={busy} />}
            {item.selected && (!item.title.trim() || !item.content.trim()) && <p role="alert">{experienceText(props.locale, "reviewRequired")}</p>}
          </div>
        </div>}
      </article>;
    })}</div>
    {invalid && <p role="alert">{experienceText(props.locale, "reviewRequired")}</p>}
    {error && <p role="alert">{error}</p>}
    <div className="dr-assistant-actions dr-review-actions">{confirmDiscard ? <><p className="dr-review-confirm" role="alert">{t("reviewDiscardConfirm")}</p><div className="dr-review-confirm-actions"><button type="button" disabled={busy} onClick={() => setConfirmDiscard(false)}>{t("reviewCancel")}</button><button type="button" className="dr-review-discard-final" disabled={busy} onClick={() => void act(props.onDiscard)}>{t("reviewDiscardFinal")}</button></div></> : <><button className="dr-assistant-primary" disabled={busy || invalid || !selectedCount} onClick={() => void act(() => profileSelected ? props.onSave(items, profileValues) : props.onSave(items))}>{t("saveChanges")} · {selectedCount}</button><button className="dr-review-discard" disabled={busy} onClick={() => setConfirmDiscard(true)}>{t("discard")}</button></>}</div>
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
