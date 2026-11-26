import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Locale } from "../../core/types";
import type { WorldGame } from "../../core/world-game";
import { createEpisodeReader } from "../../core/story-episodes";
import { createStoryJournal, filterStoryJournal, type JournalActions } from "../../core/story-journal";
import { createStoryTimeReader } from "../../core/story-time";
import type { SceneClockTimeline } from "../../core/story-scene-clock";
import { storyEpisodeText } from "../../core/story-episode-i18n";
import { storyUpdateText } from "../../core/story-update-i18n";
import { storyTaskText } from "../../core/story-task-i18n";
import { createStoryNarrativeReader, narrativeFactKey } from "../../core/story-narrative";
import { storyNarrativeText } from "../../core/story-narrative-i18n";
import { Select } from "./Select";
import { StoryMemoryAction } from "./StoryMemoryAction";
import type { StoryFactApproval } from "../../storage/story-facts";

export function StoryEpisodePanel({ locale, game, sceneClock, actions, onExclude }: {
  locale: Locale; game: WorldGame; sceneClock?: SceneClockTimeline;
  actions?: JournalActions; onExclude?: (input: StoryFactApproval) => Promise<void>;
}) {
  const t = storyEpisodeText(locale), task = storyTaskText(locale), id = useId();
  const [query, setQuery] = useState(""), [limit, setLimit] = useState(6);
  const [timeLimit, setTimeLimit] = useState(6);
  const [personId, setPersonId] = useState(""), [includeRoutine, setIncludeRoutine] = useState(false);
  const [plotKey, setPlotKey] = useState(""), [notice, setNotice] = useState(""), [saving, setSaving] = useState(false);
  const journalRef = useRef<HTMLElement>(null);
  useEffect(() => { setQuery(""); setPersonId(""); setPlotKey(""); setIncludeRoutine(false); setLimit(6); setTimeLimit(6); setNotice(""); }, [game.id]);
  const { facts, factRoleSeeds, episodeSources } = game;
  const journal = useMemo(() => createStoryJournal({ facts, factRoleSeeds, episodeSources }), [facts, factRoleSeeds, episodeSources]);
  const episodeReader = createEpisodeReader(game.factRoleSeeds, game.episodeSources);
  const time = createStoryTimeReader(game.facts, episodeReader, sceneClock);
  const narrator = createStoryNarrativeReader(game.facts,game.factRoleSeeds,game.episodeSources,locale,{episodes:episodeReader,time});
  const n = storyNarrativeText(locale), sourceDetails = useRef(new Map<string,HTMLDetailsElement>());
  const openSource = (key: string) => {
    const detail = sourceDetails.current.get(key); if (!detail) return;
    detail.open = true; detail.querySelector("summary")?.focus(); detail.scrollIntoView?.({block:"nearest"});
  };
  const statusText = { "earlier-scene": t.earlierScene, "last-known": t.lastKnown, persistent: t.persistent, unknown: t.timeUnplaced, ended: t.ended };
  const person = journal.people.some(candidate => candidate.id === personId) ? personId : "";
  const plot = journal.plots.some(candidate => candidate.key === plotKey) ? plotKey : "";
  const matching = filterStoryJournal(journal, query, person, includeRoutine, plot);
  const number = (n: number) => new Intl.NumberFormat(locale).format(n);
  const update = (label: Parameters<typeof storyUpdateText>[1]) => storyUpdateText(locale, label);
  const copyQuote = async (quote: string, source: HTMLElement) => {
    setNotice("");
    try { await navigator.clipboard.writeText(quote); setNotice(t.quoteCopied); }
    catch {
      const quotation = source.querySelector(".dr-story-review-source");
      if (quotation) document.getSelection()?.selectAllChildren(quotation);
      setNotice(t.quoteSelected);
    }
  };
  const exclude = async (eventId: string, text: string) => {
    if (!actions || !onExclude || saving) return;
    setSaving(true); setNotice("");
    try {
      await onExclude({ chatId: actions.chatId, worldId: actions.worldId, guard: actions.guard, eventId, text, accept: false });
      journalRef.current?.focus({ preventScroll: true });
      setNotice(t.excluded);
    } catch { setNotice(t.staleEntry); }
    finally { setSaving(false); }
  };
  return <section ref={journalRef} tabIndex={-1} className="settings-card dr-story-episodes" aria-labelledby={id + "-title"}>
    <h2 id={id + "-title"}>{t.title}</h2><p className="setting-copy">{t.hint}</p>
    <p className="setting-copy dr-story-time">{time.anchor ? <><strong>{t.time}: </strong>{time.anchor.label}</> : t.timeUnknown}</p>
    {time.anchor?.kind === "elapsed" && <p className="setting-copy">{t.elapsed}</p>}
    {!!sceneClock?.transitions.length && <div className="dr-story-clock"><details className="dr-story-tool">
      <summary>{t.sceneTimes}</summary>
      <ol className="dr-story-clock-list">{sceneClock.transitions.slice(-timeLimit).reverse().map(marker => <li key={marker.revisionId}>
        <strong>{marker.label}</strong><small>{t.recordedOrder.replace("{number}", number(marker.order))}</small>
      </li>)}</ol>
      {sceneClock.transitions.length > timeLimit && <button className="button secondary" type="button" onClick={() => setTimeLimit(n => n + 6)}>{t.earlierTimes}</button>}
    </details></div>}
    {!!journal.episodes.length && <div className="dr-story-journal-filters">
      <label className="field-label">{t.search}<input className="input" type="search" maxLength={120} value={query} onChange={e => { setQuery(e.target.value); setLimit(6); }}/></label>
      {!!journal.people.length && <label className="field-label">{t.person}<Select value={person} onChange={e => { setPersonId(e.target.value); setLimit(6); }}>
        <option value="">{t.allPeople}</option>
        {[...journal.people].sort((a, b) => a.name.localeCompare(b.name, locale)).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
      </Select></label>}
      {!!journal.plots.length && <label className="field-label">{t.plot}<Select value={plot} onChange={e => { setPlotKey(e.target.value); setLimit(6); }}>
        <option value="">{t.allPlots}</option>
        {[...journal.plots].sort((a, b) => a.title.localeCompare(b.title, locale)).map(candidate => <option key={candidate.key} value={candidate.key}>{candidate.title}</option>)}
      </Select></label>}
      {journal.hasRoutine && <label className="dr-story-journal-routine"><input type="checkbox" checked={includeRoutine} onChange={e => { setIncludeRoutine(e.target.checked); setLimit(6); }}/>{t.includeRoutine}</label>}
    </div>}
    <div className="dr-story-journal-notice" role="status">{notice}</div>
    {!matching.length && <p className="setting-copy">{query || person || plot ? t.noMatch : journal.hasRoutine && !includeRoutine ? t.onlyRoutine : t.empty}</p>}
    {matching.slice(0, limit).map(episode => { const brief = narrator.read(episode.entries.map(entry => entry.fact)); return <details key={episode.number ?? "unknown"} className="dr-story-tool">
      <summary>{episode.number === null ? t.unplaced : t.episode.replace("{number}", number(episode.number))} · {t.facts.replace("{count}", number(episode.entries.length))}</summary>
      <p className="setting-copy">{episode.number === null ? t.unknown : t.turns.replace("{count}", number(episode.sourceIds.length))}</p>
      <div className="dr-story-narrative">
        <strong>{n.title}</strong><p className="setting-copy">{n.hint}</p>
        {!!brief.parts.length && <p className="dr-story-narrative-text">{brief.parts.map((part,index) => <Fragment key={narrativeFactKey(part.reference.fact)}>
          {index>0?" ":""}{part.text}{" "}<button type="button" className="dr-story-narrative-reference" aria-label={n.source.replace("{number}",number(index+1))} onClick={() => openSource(narrativeFactKey(part.reference.fact))}>[{number(index+1)}]</button>{"."}
        </Fragment>)}</p>}
        {brief.omitted>0 && <p className="setting-copy">{brief.parts.length?n.omitted.replace("{count}",number(brief.omitted)):n.tooLong}</p>}
      </div>
      {episode.entries.map(({ fact: f, facts, id: factId, order, people, objects, tasks }) => {
        const eventId = facts.length === 1 ? actions?.events.get(factId) : undefined;
        return <article className="dr-story-review-entry" key={factId}>
        <strong>{storyUpdateText(locale, f.kind)}</strong>
        {!!people.length && <p className="setting-copy">{people.map(person => person.name).join(" · ")}</p>}
        {!!objects.length && <p className="setting-copy">{objects.map(object => object.name).join(" · ")}</p>}
        {time.sceneAt(f) && <p className="setting-copy dr-story-time-status">{time.sceneAt(f)!.label}</p>}
        {time.read(f) && <p className="setting-copy dr-story-time-status">{statusText[time.read(f)!]}</p>}
        <p className="dr-story-review-source">{f.text}</p>
        {tasks.map(goal => <p key={goal.key} className="dr-story-task-status">{tasks.length > 1 ? `${goal.title} · ` : ""}{task[goal.status]}</p>)}
        <details ref={node => { if (node) sourceDetails.current.set(factId, node); else sourceDetails.current.delete(factId); }}>
          <summary>{t.source}</summary>
          {order !== null && <p className="setting-copy">{t.recordedOrder.replace("{number}", number(order))}</p>}
          <p className="dr-story-review-source">{f.quote}</p>
          <div className="dr-story-journal-actions">
            <button type="button" className="button secondary small" onClick={event => {
              const source = event.currentTarget.closest("details"); if (source) void copyQuote(f.quote, source);
            }}>{t.copyQuote}</button>
            {eventId && onExclude && <StoryMemoryAction locale={locale} label={update("remove")} confirmLabel={update("confirmExclude")}
              hint={update("excludeFactHint")} secondary disabled={saving} onConfirm={() => void exclude(eventId, f.text)}/>}
          </div>
        </details>
      </article>; })}
    </details>; })}
    {matching.length > limit && <button className="button secondary" type="button" onClick={() => setLimit(n => n + 6)}>{t.more}</button>}
  </section>;
}
