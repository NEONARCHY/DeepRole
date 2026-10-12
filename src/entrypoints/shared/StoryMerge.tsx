import { useEffect, useId, useRef, useState } from "react";
import type { Locale } from "../../core/types";
import { validMergePage, type MergeAction, type MergeChoices, type MergePage } from "../../core/story-character-merge";
import { storyMergeText } from "../../core/story-merge-i18n";
import "./story-merge.css";
export function StoryMerge({ locale, scope, onAction, onChanged, disabled }: { locale: Locale; scope: { worldId: string; chatId: string }; onAction: (action: MergeAction) => Promise<MergePage>; onChanged: () => void; disabled: boolean }) {
 const t = (k: Parameters<typeof storyMergeText>[1]) => storyMergeText(locale, k), id = useId();
 const [page, setPage] = useState<MergePage | null>(null), [busy, setBusy] = useState(false), [query, setQuery] = useState(""), [first, setFirst] = useState(""), [second, setSecond] = useState("");
 const [choices, setChoices] = useState<MergeChoices>({ profile: "a", state: "a", incoming: "a", name: "", aliases: [], protagonist: false }), [confirmed, setConfirmed] = useState(false), [undo, setUndo] = useState<string | null>(null);
 const [notice, setNotice] = useState<Parameters<typeof t>[0] | null>(null);
 const mounted = useRef(false), running = useRef(false);
 useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
 async function run(action: MergeAction) {
  if (running.current || disabled && action.action !== "read") return;
  running.current = true; setBusy(true); setNotice(null); setConfirmed(false); setUndo(null);
  try {
   const next = await onAction(action); if (!validMergePage(next) || next.worldId !== scope.worldId || next.chatId !== scope.chatId) throw Error("story-review-invalid");
   if (mounted.current) {
    setPage(next);
    if (next.preview) { const { a, b } = next.preview; setChoices({ profile: "a", state: "a", incoming: "a", name: a.name, aliases: [...new Set([b.name, ...a.aliases, ...b.aliases])].filter(n => n !== a.name), protagonist: a.protagonist || b.protagonist }); }
    if (action.action !== "read") { setFirst(""); setSecond(""); setNotice("saved"); onChanged(); }
   }
  } catch (e) { if (mounted.current) { setPage(null); const code = e instanceof Error ? e.message : ""; setNotice(code === "story-profile-conflict" || code === "story-manual-conflict" ? "protected" : code === "merge-state-incompatible" ? "incompatible" : code === "merge-protagonist-conflict" ? "heroConflict" : code === "identity-ambiguous" ? "collision" : "error"); } }
  finally { running.current = false; if (mounted.current) setBusy(false); }
 }
 const read = (offset = 0, pair: [string, string] | null = null) => void run({ action: "read", input: { ...scope, query, offset, pair } });
 const change = (value: Partial<MergeChoices>) => { setChoices(c => ({ ...c, ...value })); setConfirmed(false); };
 const blocked = busy || disabled || !!page?.paused;
 return <section className="dr-story-review-preview dr-story-merge"><p className="setting-copy">{t("hint")}</p><p className="setting-copy">{t("scope")}</p>
  <button className="button secondary" type="button" disabled={busy} onClick={() => read()}>{t(busy ? "busy" : page ? "refresh" : "read")}</button><p role="status" aria-live="polite">{notice ? t(notice) : null}</p>
  {page && <>{page.paused && <p>{t("paused")}</p>}<form onSubmit={e => { e.preventDefault(); read(); }}><label htmlFor={id + "-search"}>{t("search")}</label><div className="dr-story-review-actions"><input id={id + "-search"} value={query} maxLength={80} disabled={busy} onChange={e => setQuery(e.target.value)} /><button className="button secondary" disabled={busy}>{t("search")}</button></div></form>
   {!page.people.length && <p>{t("empty")}</p>}
   <div className="dr-story-merge-pickers">{(["first", "second"] as const).map((kind, index) => <fieldset key={kind}><legend>{t(kind)}</legend>{page.people.map(p => <label className="dr-story-merge-option" key={p.id}><input type="radio" name={id + kind} checked={(index ? second : first) === p.id} disabled={busy || p.id === (index ? first : second)} onChange={() => { (index ? setSecond : setFirst)(p.id); setConfirmed(false); setPage(v => v && ({ ...v, preview: null })); }} /><span><strong>{p.name}</strong><small>{p.summary}</small></span></label>)}</fieldset>)}</div>
   <div className="dr-story-review-actions">{page.offset > 0 && <button type="button" className="button secondary" disabled={busy} onClick={() => read(Math.max(0, page.offset - 40))}>{t("prev")}</button>}{page.next !== null && <button type="button" className="button secondary" disabled={busy} onClick={() => read(page.next!)}>{t("next")}</button>}<button type="button" className="button secondary" disabled={busy || !first || !second || first === second} onClick={() => read(0, [first, second])}>{t("preview")}</button></div>
   {page.preview && <div className="dr-story-review-preview"><div className="dr-story-merge-pickers">{(["a", "b"] as const).map(k => { const p = page.preview![k]; return <article key={k}><h4>{p.name}</h4>{(["appearance", "personality", "goals", "background"] as const).map(field => <p key={field}><strong>{t(field)}: </strong>{p.profile[field] || "—"}</p>)}<p>{t(p.images ? "images" : "noImages")}</p><p>{t("condition")}: {p.state.condition || "—"}</p><p>{t("goal")}: {p.state.goal || "—"}</p><p>{t("relationships")}: {p.state.relationship || "—"}</p>{Object.entries(p.state.attributes?.values ?? {}).map(([key, value]) => <p key={key}>{key}: {value}</p>)}{p.state.stats.map((s, i) => <p key={i}>{s.label}: {s.value}</p>)}{Object.entries(p.state.bonds ?? {}).map(([target, bond]) => <p key={target}>{page.people.find(p => p.id === target)?.name ?? target}: {t("trust")} {bond.trust}/100 · {t("affinity")} {bond.affinity}/100</p>)}</article>; })}</div>
    <label htmlFor={id + "-name"}>{t("name")}</label><input id={id + "-name"} maxLength={80} value={choices.name} disabled={blocked} onChange={e => change({ name: e.target.value })} />
    <label htmlFor={id + "-aliases"}>{t("aliases")}</label><textarea id={id + "-aliases"} value={choices.aliases.join("\n")} disabled={blocked} onChange={e => change({ aliases: e.target.value.split("\n") })} />
    <p className="setting-copy">{t("profileHint")}</p>{(["profile", "state", "incoming"] as const).map(field => <fieldset key={field}><legend>{t(field)}</legend>{(["a", "b"] as const).map(k => <label className="dr-story-merge-option" key={k}><input type="radio" name={id + field} checked={choices[field] === k} disabled={blocked} onChange={() => change({ [field]: k })} /><span>{page.preview![k].name}</span></label>)}</fieldset>)}
    <p className="setting-copy">{t("stateHint")}</p><p>{t("conflicts")}: {page.preview.incomingConflicts}</p>
    <label className="dr-story-merge-option"><input type="checkbox" checked={choices.protagonist} disabled={blocked} onChange={e => change({ protagonist: e.target.checked })} />{t("hero")}</label>
    <label className="dr-story-merge-option"><input type="checkbox" checked={confirmed} disabled={blocked} onChange={e => setConfirmed(e.target.checked)} />{t("confirm")}</label>
    <button type="button" className="button primary" disabled={blocked || !confirmed || !choices.name.trim()} onClick={() => void run({ action: "approve", input: { ...scope, query: page.query, offset: page.offset, pair: [page.preview!.a.id, page.preview!.b.id], guard: page.guard, versions: [page.preview!.a.updatedAt, page.preview!.b.updatedAt], choices: { ...choices, name: choices.name.trim(), aliases: choices.aliases.map(n => n.trim()).filter(Boolean) } } })}>{t("merge")}</button>
   </div>}
   {!!page.merges.length && <section><h4>{t("history")}</h4>{page.merges.map(m => <article className="dr-story-review-entry" key={m.id}><strong>{m.sources.join(" + ")} → {m.name}</strong>{m.inherited ? <p>{t("inherited")}</p> : undo === m.id ? <><p>{t(m.dropsLaterScenes ? "undoLater" : "undoConfirm")}</p><div className="dr-story-review-actions"><button type="button" className="button secondary" disabled={blocked} onClick={() => setUndo(null)}>{t("cancel")}</button><button type="button" className="button danger" disabled={blocked} onClick={() => void run({ action: "undo", input: { ...scope, query: page.query, offset: page.offset, guard: page.guard, eventId: m.id } })}>{t("undoConfirm")}</button></div></> : <button type="button" className="button secondary" disabled={blocked} onClick={() => setUndo(m.id)}>{t("undo")}</button>}</article>)}</section>}
  </>}
 </section>;
}
