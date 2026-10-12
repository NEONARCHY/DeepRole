import { useEffect, useId, useRef, useState } from "react";
import { readActiveStoryCheckpoint, saveActiveStoryCheckpoint, type ActiveCheckpointReview, type StoryCheckpointTabs } from "../../adapters/story-checkpoint-client";
import { validStoryCheckpointReview, type StoryCheckpointReview } from "../../core/story-checkpoint";
import { storyCheckpointError, storyCheckpointText, type StoryCheckpointTextKey } from "../../core/story-checkpoint-i18n";
import type { Locale } from "../../core/types";
import "./story-checkpoint.css";

export function ActiveStoryCheckpoint({ locale, tabs }: { locale: Locale; tabs: StoryCheckpointTabs }) {
  const target = useRef<ActiveCheckpointReview | null>(null);
  return <StoryCheckpoint locale={locale} onRead={async () => { target.current = null; const next = await readActiveStoryCheckpoint(tabs); target.current = next; return next.review; }}
    onSave={async (review, requestId) => {
      if (!target.current || target.current.review !== review) throw Error("story-binding-conflict");
      await saveActiveStoryCheckpoint(tabs, target.current, requestId);
    }} />;
}

export function StoryCheckpoint({ locale, onRead, onSave }: { locale: Locale; onRead: () => Promise<StoryCheckpointReview>; onSave: (review: StoryCheckpointReview, requestId: string) => Promise<void> }) {
  const [review, setReview] = useState<StoryCheckpointReview | null>(null), [selected, setSelected] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"read" | "save" | null>(null), [notice, setNotice] = useState<StoryCheckpointTextKey | null>(null), [saved, setSaved] = useState(false);
  const running = useRef(false), mounted = useRef(false), generation = useRef(0), id = useId();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  const t = (key: StoryCheckpointTextKey) => storyCheckpointText(locale, key), number = (n: number) => new Intl.NumberFormat(locale).format(n);
  async function run(action: "read" | "save") {
    if (running.current || action === "save" && (!review || !selected || !confirmed || saved || review.checkpoint)) return;
    running.current = true; const token = ++generation.current; setBusy(action); setNotice(null);
    try {
      if (action === "read") {
        setReview(null); setSelected(""); setConfirmed(false); setSaved(false);
        const next = await onRead(); if (!validStoryCheckpointReview(next)) throw Error("story-checkpoint-failed");
        if (mounted.current && generation.current === token) setReview(next);
      } else {
        await onSave(review!, selected);
        if (mounted.current && generation.current === token) { setSaved(true); setNotice("saved"); }
      }
    } catch (error) {
      if (mounted.current && generation.current === token) { setNotice(storyCheckpointError(error)); setReview(null); setSelected(""); setConfirmed(false); }
    } finally { if (mounted.current && generation.current === token) setBusy(null); running.current = false; }
  }
  const chosen = review?.candidates.find(c => c.requestId === selected), states = review ? Object.entries(review.snapshot.states) : [];
  return <section className="settings-card dr-story-checkpoint" aria-labelledby={`${id}-title`}>
    <header><h2 id={`${id}-title`}>{t("title")}</h2></header><div>
      <p className="setting-copy">{t("hint")}</p><p className="setting-copy">{t("limit")}</p>
      <button type="button" className="button secondary" disabled={!!busy} onClick={() => void run("read")}>{busy === "read" ? t("reading") : t(review || notice ? "again" : "read")}</button>
      <div role="status" aria-live="polite" aria-atomic="true">{busy === "save" ? t("saving") : notice ? t(notice) : null}</div>
      {review && <>
        <p>{t("world").replace("{name}", review.worldName)}</p><p className="setting-copy">{t("scene").replace("{count}", number(review.snapshot.presentIds.length))}</p>
        <details><summary>{t("sceneDetails")}</summary>{states.length ? <ul>{states.map(([person, state]) => <li key={person}><strong>{review.snapshot.names[person] ?? t("unnamed")}</strong>
          {state.condition && <p>{t("condition").replace("{text}", state.condition)}</p>}{state.goal && <p>{t("goal").replace("{text}", state.goal)}</p>}
          {state.stats.map((stat, index) => <p key={index}>{stat.label}: {stat.value}</p>)}
        </li>)}</ul> : <p>{t("noPeople")}</p>}</details>
        {review.checkpoint ? <p>{t("existing")}</p> : !review.candidates.length ? <p>{t("empty")}</p> : <>
          <p className="setting-copy">{t("recent").replace("{shown}", number(review.candidates.length)).replace("{total}", number(review.availableCount))}</p>
          <fieldset disabled={!!busy || saved}><legend>{t("choose")}</legend>{review.candidates.map(candidate => <div className="dr-story-checkpoint-candidate" key={candidate.requestId}>
            <label><input type="radio" name={`${id}-reply`} checked={selected === candidate.requestId} onChange={() => { setSelected(candidate.requestId); setConfirmed(false); }} />
              <span>{t("date").replace("{date}", new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "medium" }).format(candidate.observedAt))}</span></label>
            <p className="dr-story-checkpoint-excerpt">{candidate.answer.length > 280 ? `${candidate.answer.slice(0, 280)}…` : candidate.answer}</p>
            <details><summary>{t("full")}</summary><h3>{t("draft")}</h3><p tabIndex={0} className="dr-story-checkpoint-source">{candidate.draft}</p><h3>{t("answer")}</h3><p tabIndex={0} className="dr-story-checkpoint-source">{candidate.answer}</p></details>
          </div>)}</fieldset>
          {chosen && chosen.serverSelection !== "anchor" && <p className="setting-copy">{t(chosen.serverSelection)}</p>}
          <label className="dr-story-checkpoint-confirm"><input type="checkbox" disabled={!!busy || !chosen || saved} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>{t("confirm")}</span></label>
          <button type="button" className="button primary" disabled={!!busy || !chosen || !confirmed || saved} onClick={() => void run("save")}>{busy === "save" ? t("saving") : t("save")}</button>
        </>}
      </>}
    </div>
  </section>;
}
