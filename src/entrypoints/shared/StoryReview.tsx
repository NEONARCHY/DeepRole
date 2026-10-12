import { useEffect, useId, useRef, useState } from "react";
import { manageActiveStoryMerge, manageActiveStoryIdentities, readActiveStoryReview, previewActiveStoryReview, runActiveStoryGame, approveActiveStoryFact, repairActiveStory, discoverActiveStory, supplementActiveStory, type ActiveStoryReview, type StoryReviewTabs } from "../../adapters/story-review-client";
import { ProfileSupplements } from "./ProfileSupplements";
import type { SupplementAction, SupplementPage } from "../../core/profile-supplements";
import { CharacterDiscovery } from "./CharacterDiscovery";
import { StoryIdentities } from "./StoryIdentities";
import { StoryMerge } from "./StoryMerge";
import { storyMergeText } from "../../core/story-merge-i18n";
import type { MergeAction, MergePage } from "../../core/story-character-merge";
import { storyIdentityText } from "../../core/story-identity-i18n";
import type { IdentityAction, IdentityPage } from "../../core/story-identity-management";
import type { CharacterDiscoveryAction, CharacterDiscoveryPage } from "../../core/story-character-discovery";
import { StoryFacts } from "./StoryFacts";
import { CastSetup } from "./CastSetup";
import { storyUxText } from "../../core/story-ux-i18n";
import "./story-workspace.css";
import { storyUpdateText } from "../../core/story-update-i18n";
import { validStoryReviewPage, validStoryReviewPreview, type StoryReviewPage, type StoryReviewPreview } from "../../core/story-review";
import { sameStoryValue } from "../../core/story-value";
import { storyReviewText, storyReviewError, type StoryReviewTextKey } from "../../core/story-review-i18n";
import type { Locale } from "../../core/types";
import "./story-review.css";

export function ActiveStoryReviewCard({ locale, tabs, guided = false, operationBlocked = false, scope }: { locale: Locale; tabs: StoryReviewTabs; guided?: boolean; operationBlocked?: boolean; scope?: { worldId: string; chatId: string } }) {
  const target = useRef<ActiveStoryReview | null>(null);
  return <StoryReview locale={locale} guided={guided} operationBlocked={operationBlocked} onRead={async previous => {
    const old = target.current; target.current = null;
    if (previous && old?.page !== previous) throw Error("story-binding-conflict");
    const next = await readActiveStoryReview(tabs, previous ? old! : undefined);
    if (scope && (next.page.worldId !== scope.worldId || next.page.chatId !== scope.chatId)) throw Error("story-binding-conflict");
    target.current = next; return next.page;
  }} onPreview={async (page, head) => {
    if (!target.current || target.current.page !== page) throw Error("story-binding-conflict");
    return previewActiveStoryReview(tabs, target.current, head);
  }} onGame={async (operation, manual) => { await runActiveStoryGame(tabs, operation, manual, scope); target.current = null; }} onFact={async (page, event, text, accept) => { await approveActiveStoryFact(tabs, page, event, text, accept); target.current = null; }} onRepair={async page => { await repairActiveStory(tabs, page); target.current = null; }} onSupplement={action => supplementActiveStory(tabs, action)} onIdentities={action => manageActiveStoryIdentities(tabs, action)} onMerge={action => manageActiveStoryMerge(tabs, action)} onDiscovery={action => discoverActiveStory(tabs, action)} />;
}
export function StoryReview({ locale, onRead, onPreview, onGame, onFact, onRepair, onDiscovery, onSupplement, onIdentities, onMerge, guided = false, operationBlocked = false }: { locale: Locale; guided?: boolean; operationBlocked?: boolean; onMerge?: (action: MergeAction) => Promise<MergePage>; onIdentities?: (action: IdentityAction) => Promise<IdentityPage>; onRead: (previous: StoryReviewPage | null) => Promise<StoryReviewPage>; onPreview: (page: StoryReviewPage, head: string | null) => Promise<StoryReviewPreview>; onGame?: (operation: "start" | "restart" | "sync" | "undo" | "out-of-character", manual: "stop" | "keep") => Promise<void>; onFact?: (page: StoryReviewPage, eventId: string, text: string, accept: boolean) => Promise<void>; onRepair?: (page: StoryReviewPage) => Promise<void>; onDiscovery?: (action: CharacterDiscoveryAction) => Promise<CharacterDiscoveryPage | null>; onSupplement?: (action: SupplementAction) => Promise<SupplementPage | null> }) {
  const [page, setPage] = useState<StoryReviewPage | null>(null), [preview, setPreview] = useState<StoryReviewPreview | null>(null);
  const [busy, setBusy] = useState<"read" | "preview" | "repair" | null>(null), [notice, setNotice] = useState<StoryReviewTextKey | null>(null);
  const [section, setSection] = useState<"memory" | "people" | "timeline">("memory"), [visited, setVisited] = useState({ memory: true, people: false, timeline: false }), [restartConfirmed, setRestartConfirmed] = useState(false);
  const ux = (key: Parameters<typeof storyUxText>[1]) => storyUxText(locale, key);
  const running = useRef(false), mounted = useRef(false), generation = useRef(0), previewHeading = useRef<HTMLHeadingElement>(null), id = useId();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  useEffect(() => { if (preview) previewHeading.current?.focus(); }, [preview]);
  const t = (key: StoryReviewTextKey) => storyReviewText(locale, key), n = (v: number) => new Intl.NumberFormat(locale).format(v);
  useEffect(() => { if (!guided || operationBlocked) return; const timer = setTimeout(() => void run("read"), 0); return () => clearTimeout(timer); }, [guided, operationBlocked]);
  async function memory(task: () => Promise<void>, repair = false) {
    if (running.current || operationBlocked) return; running.current = true; const token = ++generation.current; setBusy(repair ? "repair" : "read"); setNotice(null);
    try { await task(); const value = await onRead(null); if (!validStoryReviewPage(value)) throw Error("story-review-invalid"); if (mounted.current && token === generation.current) setPage(value); }
    catch (error) { if (mounted.current && token === generation.current) setNotice(storyReviewError(error)); }
    finally { running.current = false; if (mounted.current && token === generation.current) setBusy(null); }
  }
  async function game(operation: "start" | "restart" | "sync" | "undo" | "out-of-character", manual: "stop" | "keep" = "stop") {
    if (running.current || !onGame || operationBlocked) return;
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
        const previous = action === "next" ? page : null; if (!guided) setPage(null);
        const value = await onRead(previous);
        if (!validStoryReviewPage(value) || previous && (value.chatId !== previous.chatId || value.worldId !== previous.worldId || value.bindingId !== previous.bindingId || value.offset !== previous.next!.offset || !sameStoryValue(value.guard, previous.guard)) || !previous && value.offset !== 0) throw Error("story-review-invalid");
        if (mounted.current && generation.current === token) setPage(value);
      }
    } catch (error) {
      if (mounted.current && generation.current === token) { setNotice(storyReviewError(error)); setPage(null); setPreview(null); }
    } finally { if (mounted.current && generation.current === token) setBusy(null); running.current = false; }
  }
  const blocked = !!busy || operationBlocked;
  return <section className={"settings-card dr-story-review" + (guided ? " is-guided" : "")} aria-labelledby={id + "-title"}><header><h2 id={id + "-title"}>{guided ? ux("recordingTitle") : t("title")}</h2></header><div>
    {!guided && <><p className="setting-copy">{t("hint")}</p><p className="setting-copy">{t("limit")}</p></>}
    {guided && <div className="dr-story-state" data-state={!page ? "loading" : page.paused ? "paused" : page.managed ? "active" : "inactive"}><strong>{ux(!page ? notice && !busy ? "unavailable" : "loading" : page.paused ? "paused" : page.managed ? "active" : "inactive")}</strong>{page && <p className="setting-copy">{ux(page.paused ? "pauseHint" : page.managed ? "activeHint" : "inactiveHint")}</p>}</div>}
    {operationBlocked && <p role="status" className="setting-copy">{ux("pending")}</p>}
    {onGame && (!guided || page) && <div className="dr-story-review-actions">
      <button type="button" className={"button " + (guided && page?.managed && !page.paused ? "secondary" : "")} disabled={blocked} onClick={() => void game(page?.managed ? "sync" : "start")}>{guided ? ux(page?.managed ? page.paused ? "resume" : "sync" : "start") : t(page?.managed ? "syncGame" : "startGame")}</button>
      {guided && <button type="button" className="button secondary" disabled={!!busy} onClick={() => void run("read")}>{busy === "read" ? t("reading") : ux("refresh")}</button>}
      {!guided && <p className="setting-copy">{t("gameHint")}</p>}
      {page?.paused && <p role="status">{t("paused")}</p>}
      {page?.nextOutOfCharacter && <p role="status">{t("nonStoryOn")}</p>}
      {notice === "conflict" && <><p>{t("keepHint")}</p><button type="button" className="button secondary" disabled={blocked} onClick={() => void game("sync", "keep")}>{t("keepManual")}</button></>}
      <details className="dr-story-tools" open={!guided}><summary>{ux("options")}</summary>
        {page?.managed && <button type="button" className="button secondary" disabled={blocked || page.guard?.headRevisionId == null} onClick={() => void game("undo")}>{t("undo")}</button>}
        {page?.managed && <details><summary>{t("nonStory")}</summary><p className="setting-copy">{t("nonStoryHint")}</p><button type="button" className="button secondary" disabled={blocked} onClick={() => void game("out-of-character")}>{t(page.nextOutOfCharacter ? "clearNonStory" : "markNonStory")}</button></details>}
        <details><summary>{t("newStart")}</summary><p className="setting-copy">{t("newStartHint")}</p>{guided && <label className="checkbox-row"><input type="checkbox" checked={restartConfirmed} disabled={blocked} onChange={e => setRestartConfirmed(e.target.checked)}/><span>{ux("restartConfirm")}</span></label>}<button type="button" className="button secondary" disabled={blocked || guided && !restartConfirmed} onClick={() => { setRestartConfirmed(false); void game("restart"); }}>{t("restart")}</button></details>
      </details>
    </div>}
    {(!guided || !page || !onGame) && <button type="button" className="button secondary" disabled={!!busy} onClick={() => void run("read")}>{busy === "read" ? t("reading") : guided ? ux("refresh") : t(page || notice ? "refresh" : "read")}</button>}
    <div role="status" aria-live="polite" aria-atomic="true">{busy === "repair" ? storyUpdateText(locale, "repairing") : busy === "preview" ? t("checking") : notice ? t(notice) : null}</div>
    {page && <>{!guided && <p>{t("world").replace("{name}", page.worldName)}</p>}
      {guided && <nav className="dr-story-sections" aria-label={ux("sections")}>{(["memory", "people", "timeline"] as const).map(key => <button key={key} type="button" aria-pressed={section === key} onClick={() => { setSection(key); setVisited(v => ({ ...v, [key]: true })); }}>{ux(key)}</button>)}</nav>}
      {(!guided || visited.people) && <section hidden={guided && section !== "people"}>
        {page.managed && onMerge && <details className="dr-story-tool"><summary>{storyMergeText(locale, "title")}</summary><StoryMerge key={page.worldId + ":" + page.chatId} locale={locale} scope={{ chatId: page.chatId, worldId: page.worldId }} onAction={onMerge} onChanged={() => void memory(async () => {})} disabled={blocked}/></details>}
        {page.managed && onIdentities && <details className="dr-story-tool"><summary>{storyIdentityText(locale, "title")}</summary><StoryIdentities key={page.worldId + ":" + page.chatId} locale={locale} scope={{ chatId: page.chatId, worldId: page.worldId }} onAction={onIdentities} onChanged={() => void memory(async () => {})} disabled={blocked}/></details>}
        {guided && <details className="dr-story-tool"><summary>{ux("worldCast")}</summary><p className="setting-copy">{ux("worldCastHint")}</p><CastSetup worldId={page.worldId} locale={locale} hideHeading/></details>}
        {page.managed && page.guard && onDiscovery && <CharacterDiscovery locale={locale} scope={{ chatId: page.chatId, worldId: page.worldId, guard: page.guard }} onAction={onDiscovery} onChanged={() => void memory(async () => {})} disabled={blocked} compact={guided} autoRead={guided}/>}
        {page.managed && page.guard && onSupplement && <details className="dr-story-tool"><summary>{ux("supplements")}</summary><p className="setting-copy">{ux("supplementsHint")}</p><ProfileSupplements locale={locale} scope={{ chatId: page.chatId, worldId: page.worldId }} onAction={onSupplement} onChanged={() => void memory(async () => {})} disabled={blocked}/></details>}
        {guided && !page.managed && <p>{ux("initial")}</p>}
      </section>}
      <section hidden={guided && section !== "memory"}>{page.managed && <StoryFacts locale={locale} page={page} busy={blocked} compact={guided} onSave={onFact ? (event, text, accept) => void memory(() => onFact(page, event, text, accept)) : undefined} onRepair={onRepair ? () => void memory(() => onRepair(page), true) : undefined}/>}
        {guided && !page.managed && <p>{ux("initial")}</p>}
      </section>
      {(!guided || visited.timeline) && <section hidden={guided && section !== "timeline"}>{guided && <p className="setting-copy">{ux("timelineHint")}</p>}
      {!page.guard ? <p>{guided ? ux("initial") : t("missing")}</p> : <>
        {!page.entries.length ? <p>{t("empty")}</p> : <><p className="setting-copy">{t("order").replace("{from}", n(page.offset + 1)).replace("{to}", n(page.offset + page.entries.length)).replace("{total}", n(page.guard.revisionCount))}</p>
          {page.entries.map((entry, index) => <article className="dr-story-review-entry" key={entry.id}>
            <h3>{n(page.offset + index + 1)}. {t(entry.role)}</h3><p className="dr-story-review-meta">{t(entry.completion)} · {t(entry.selected ? "selected" : "observed")}</p>
            <p>{entry.parentExcerpt === null ? t("fromBaseline") : t("parent").replace("{text}", entry.parentExcerpt)}</p>
            <p className="dr-story-review-source">{entry.content.length > 280 ? entry.content.slice(0, 280) + "…" : entry.content}</p>
            <details><summary>{t("full")}</summary><p tabIndex={0} className="dr-story-review-source dr-story-review-full">{entry.content}</p></details>
            <p className="setting-copy">{t("events").replace("{candidates}", n(entry.candidateCount)).replace("{applied}", n(entry.appliedCount))}</p>
            {entry.role === "assistant" && <button type="button" className="button secondary" disabled={!!busy || entry.completion !== "complete"} onClick={() => void run("preview", entry.id)}>{t("preview")}</button>}
          </article>)}</>}
        <div className="dr-story-review-actions">{page.next && <button type="button" className="button secondary" disabled={!!busy} onClick={() => void run("next")}>{t("next")}</button>}
          <button type="button" className="button secondary" disabled={!!busy} onClick={() => void run("preview")}>{t("baseline")}</button></div>
      </>}
      </section>}
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
