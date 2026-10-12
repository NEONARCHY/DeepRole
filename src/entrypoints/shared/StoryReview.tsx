import { useEffect, useId, useRef, useState } from "react";
import { readActiveStoryReview, previewActiveStoryReview, runActiveStoryGame, approveActiveStoryFact, repairActiveStory, discoverActiveStory, supplementActiveStory, type ActiveStoryReview, type StoryReviewTabs } from "../../adapters/story-review-client";
import { ProfileSupplements } from "./ProfileSupplements";
import type { SupplementAction, SupplementPage } from "../../core/profile-supplements";
import { CharacterDiscovery } from "./CharacterDiscovery";
import type { CharacterDiscoveryAction, CharacterDiscoveryPage } from "../../core/story-character-discovery";
import { StoryFacts } from "./StoryFacts";
import { storyUpdateText } from "../../core/story-update-i18n";
import { validStoryReviewPage, validStoryReviewPreview, type StoryReviewPage, type StoryReviewPreview } from "../../core/story-review";
import { sameStoryValue } from "../../core/story-value";
import { storyReviewText, storyReviewError, type StoryReviewTextKey } from "../../core/story-review-i18n";
import type { Locale } from "../../core/types";
import "./story-review.css";

export function ActiveStoryReviewCard({ locale, tabs }: { locale: Locale; tabs: StoryReviewTabs }) {
  const target = useRef<ActiveStoryReview | null>(null);
  return <StoryReview locale={locale} onRead={async previous => {
    const old = target.current; target.current = null;
    if (previous && old?.page !== previous) throw Error("story-binding-conflict");
    const next = await readActiveStoryReview(tabs, previous ? old! : undefined); target.current = next; return next.page;
  }} onPreview={async (page, head) => {
    if (!target.current || target.current.page !== page) throw Error("story-binding-conflict");
    return previewActiveStoryReview(tabs, target.current, head);
  }} onGame={async (operation, manual) => { await runActiveStoryGame(tabs, operation, manual); target.current = null; }} onFact={async (page, event, text, accept) => { await approveActiveStoryFact(tabs, page, event, text, accept); target.current = null; }} onRepair={async page => { await repairActiveStory(tabs, page); target.current = null; }} onSupplement={action => supplementActiveStory(tabs, action)} onDiscovery={action => discoverActiveStory(tabs, action)} />;
}
export function StoryReview({ locale, onRead, onPreview, onGame, onFact, onRepair, onDiscovery, onSupplement }: { locale: Locale; onRead: (previous: StoryReviewPage | null) => Promise<StoryReviewPage>; onPreview: (page: StoryReviewPage, head: string | null) => Promise<StoryReviewPreview>; onGame?: (operation: "start" | "restart" | "sync" | "undo" | "out-of-character", manual: "stop" | "keep") => Promise<void>; onFact?: (page: StoryReviewPage, eventId: string, text: string, accept: boolean) => Promise<void>; onRepair?: (page: StoryReviewPage) => Promise<void>; onDiscovery?: (action: CharacterDiscoveryAction) => Promise<CharacterDiscoveryPage | null>; onSupplement?: (action: SupplementAction) => Promise<SupplementPage | null> }) {
  const [page, setPage] = useState<StoryReviewPage | null>(null), [preview, setPreview] = useState<StoryReviewPreview | null>(null);
  const [busy, setBusy] = useState<"read" | "preview" | "repair" | null>(null), [notice, setNotice] = useState<StoryReviewTextKey | null>(null);
  const running = useRef(false), mounted = useRef(false), generation = useRef(0), previewHeading = useRef<HTMLHeadingElement>(null), id = useId();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  useEffect(() => { if (preview) previewHeading.current?.focus(); }, [preview]);
  const t = (key: StoryReviewTextKey) => storyReviewText(locale, key), n = (v: number) => new Intl.NumberFormat(locale).format(v);
  async function memory(task: () => Promise<void>, repair = false) {
    if (running.current) return; running.current = true; const token = ++generation.current; setBusy(repair ? "repair" : "read"); setNotice(null);
    try { await task(); const value = await onRead(null); if (!validStoryReviewPage(value)) throw Error("story-review-invalid"); if (mounted.current && token === generation.current) setPage(value); }
    catch (error) { if (mounted.current && token === generation.current) setNotice(storyReviewError(error)); }
    finally { running.current = false; if (mounted.current && token === generation.current) setBusy(null); }
  }
  async function game(operation: "start" | "restart" | "sync" | "undo" | "out-of-character", manual: "stop" | "keep" = "stop") {
    if (running.current || !onGame) return;
    running.current = true; const token = ++generation.current; setBusy("read"); setNotice(null); setPreview(null);
    try {
      await onGame(operation, manual);
      const value = await onRead(null);
      if (!validStoryReviewPage(value)) throw Error("story-review-invalid");
      if (mounted.current && token === generation.current) { setPage(value); setNotice(operation === "undo" ? "undoDone" : operation === "out-of-character" ? value.nextOutOfCharacter ? "nonStoryOn" : "nonStoryOff" : "synced"); }
    } catch (error) { if (mounted.current && token === generation.current) setNotice(storyReviewError(error)); }
    finally { if (mounted.current && token === generation.current) setBusy(null); running.current = false; }
  }
  async function run(action: "read" | "next" | "preview", head: string | null = null) {
    if (running.current || action === "next" && !page?.next || action === "preview" && (!page?.guard || head !== null && !page.entries.some(e => e.id === head && e.role === "assistant" && e.completion === "complete"))) return;
    running.current = true; const token = ++generation.current; setBusy(action === "preview" ? "preview" : "read"); setNotice(null); setPreview(null);
    try {
      if (action === "preview") {
        const value = await onPreview(page!, head);
        if (!validStoryReviewPreview(value) || value.chatId !== page!.chatId || value.worldId !== page!.worldId || value.headRevisionId !== head || !sameStoryValue(value.guard, page!.guard)) throw Error("story-review-invalid");
        if (mounted.current && generation.current === token) setPreview(value);
      } else {
        const previous = action === "next" ? page : null; setPage(null);
        const value = await onRead(previous);
        if (!validStoryReviewPage(value) || previous && (value.chatId !== previous.chatId || value.worldId !== previous.worldId || value.bindingId !== previous.bindingId || value.offset !== previous.next!.offset || !sameStoryValue(value.guard, previous.guard)) || !previous && value.offset !== 0) throw Error("story-review-invalid");
        if (mounted.current && generation.current === token) setPage(value);
      }
    } catch (error) {
      if (mounted.current && generation.current === token) { setNotice(storyReviewError(error)); setPage(null); setPreview(null); }
    } finally { if (mounted.current && generation.current === token) setBusy(null); running.current = false; }
  }
  return <section className="settings-card dr-story-review" aria-labelledby={`${id}-title`}><header><h2 id={`${id}-title`}>{t("title")}</h2></header><div>
    <p className="setting-copy">{t("hint")}</p><p className="setting-copy">{t("limit")}</p>
    {onGame && <div className="dr-story-review-actions">
      <button type="button" className="button" disabled={!!busy} onClick={() => void game(page?.managed ? "sync" : "start")}>{t(page?.managed ? "syncGame" : "startGame")}</button>
      <p className="setting-copy">{t("gameHint")}</p>
      {page?.managed && <button type="button" className="button secondary" disabled={!!busy || page.guard?.headRevisionId == null} onClick={() => void game("undo")}>{t("undo")}</button>}
      {page?.paused && <p role="status">{t("paused")}</p>}
      {page?.nextOutOfCharacter && <p role="status">{t("nonStoryOn")}</p>}
      {page?.managed && <details><summary>{t("nonStory")}</summary><p className="setting-copy">{t("nonStoryHint")}</p><button type="button" className="button secondary" disabled={!!busy} onClick={() => void game("out-of-character")}>{t(page.nextOutOfCharacter ? "clearNonStory" : "markNonStory")}</button></details>}
      {notice === "conflict" && <><p>{t("keepHint")}</p><button type="button" className="button secondary" disabled={!!busy} onClick={() => void game("sync", "keep")}>{t("keepManual")}</button></>}
      <details><summary>{t("newStart")}</summary><p className="setting-copy">{t("newStartHint")}</p><button type="button" className="button secondary" disabled={!!busy} onClick={() => void game("restart")}>{t("restart")}</button></details>
    </div>}
    <button type="button" className="button secondary" disabled={!!busy} onClick={() => void run("read")}>{busy === "read" ? t("reading") : t(page || notice ? "refresh" : "read")}</button>
    <div role="status" aria-live="polite" aria-atomic="true">{busy === "repair" ? storyUpdateText(locale, "repairing") : busy === "preview" ? t("checking") : notice ? t(notice) : null}</div>
    {page && <><p>{t("world").replace("{name}", page.worldName)}</p>
      {page.managed && page.guard && onDiscovery && <CharacterDiscovery locale={locale} scope={{ chatId: page.chatId, worldId: page.worldId, guard: page.guard }} onAction={onDiscovery} onChanged={() => void memory(async () => {})} disabled={!!busy} />}
      {page.managed && page.guard && onSupplement && <ProfileSupplements locale={locale} scope={{ chatId: page.chatId, worldId: page.worldId }} onAction={onSupplement} onChanged={() => void memory(async () => {})} disabled={!!busy} />}
      {page.managed && <StoryFacts key={page.guard?.selectionVersion} locale={locale} page={page} busy={!!busy} onSave={onFact ? (event, text, accept) => void memory(() => onFact(page, event, text, accept)) : undefined} onRepair={onRepair ? () => void memory(() => onRepair(page), true) : undefined} />}
      {!page.guard ? <p>{t("missing")}</p> : <>
        {!page.entries.length ? <p>{t("empty")}</p> : <><p className="setting-copy">{t("order").replace("{from}", n(page.offset + 1)).replace("{to}", n(page.offset + page.entries.length)).replace("{total}", n(page.guard.revisionCount))}</p>
          {page.entries.map((entry, index) => <article className="dr-story-review-entry" key={entry.id}>
            <h3>{n(page.offset + index + 1)}. {t(entry.role)}</h3><p className="dr-story-review-meta">{t(entry.completion)} · {t(entry.selected ? "selected" : "observed")}</p>
            <p>{entry.parentExcerpt === null ? t("fromBaseline") : t("parent").replace("{text}", entry.parentExcerpt)}</p>
            <p className="dr-story-review-source">{entry.content.length > 280 ? `${entry.content.slice(0, 280)}…` : entry.content}</p>
            <details><summary>{t("full")}</summary><p tabIndex={0} className="dr-story-review-source dr-story-review-full">{entry.content}</p></details>
            <p className="setting-copy">{t("events").replace("{candidates}", n(entry.candidateCount)).replace("{applied}", n(entry.appliedCount))}</p>
            {entry.role === "assistant" && <button type="button" className="button secondary" disabled={!!busy || entry.completion !== "complete"} onClick={() => void run("preview", entry.id)}>{t("preview")}</button>}
          </article>)}</>}
        <div className="dr-story-review-actions">{page.next && <button type="button" className="button secondary" disabled={!!busy} onClick={() => void run("next")}>{t("next")}</button>}
          <button type="button" className="button secondary" disabled={!!busy} onClick={() => void run("preview")}>{t("baseline")}</button></div>
      </>}
    </>}
    {preview && <section className="dr-story-review-preview" aria-labelledby={`${id}-preview`}><h3 ref={previewHeading} tabIndex={-1} id={`${id}-preview`}>{t("previewTitle")}</h3>
      <p>{t("previewLimit")}</p><p>{t("delta").replace("{added}", n(preview.addedEvents)).replace("{removed}", n(preview.removedEvents))}</p>
      <p>{t(preview.manualConflict ? "conflict" : "unchanged")}</p>
      <details><summary>{t("snapshot")}</summary>{Object.keys(preview.snapshot.states).length ? <ul>{Object.entries(preview.snapshot.states).map(([person, state]) => <li key={person}><strong>{preview.snapshot.names[person] ?? t("unnamed")}</strong>
        {state.condition && <p>{t("condition").replace("{text}", state.condition)}</p>}{state.goal && <p>{t("goal").replace("{text}", state.goal)}</p>}{state.stats.map((stat, index) => <p key={index}>{stat.label}: {stat.value}</p>)}
      </li>)}</ul> : <p>{t("noPeople")}</p>}</details>
    </section>}
  </div></section>;
}
