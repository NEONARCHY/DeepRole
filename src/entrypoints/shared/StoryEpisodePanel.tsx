import { Fragment, useEffect, useId, useRef, useState } from "react";
import type { Locale } from "../../core/types";
import type { WorldGame } from "../../core/world-game";
import { storyEpisodes, createEpisodeReader } from "../../core/story-episodes";
import { createStoryTimeReader } from "../../core/story-time";
import { storyEpisodeText } from "../../core/story-episode-i18n";
import { storyUpdateText } from "../../core/story-update-i18n";
import { storyTaskText } from "../../core/story-task-i18n";
import { normalizeText } from "../../core/text";
import { createStoryNarrativeReader, narrativeFactKey } from "../../core/story-narrative";
import { storyNarrativeText } from "../../core/story-narrative-i18n";

export function StoryEpisodePanel({ locale, game }: { locale: Locale; game: WorldGame }) {
  const t = storyEpisodeText(locale), task = storyTaskText(locale), id = useId();
  const [query, setQuery] = useState(""), [limit, setLimit] = useState(6);
  useEffect(() => { setQuery(""); setLimit(6); }, [game.id]);
  const episodes = storyEpisodes(game.facts, game.factRoleSeeds, game.episodeSources);
  const episodeReader = createEpisodeReader(game.factRoleSeeds, game.episodeSources);
  const time = createStoryTimeReader(game.facts, episodeReader);
  const narrator = createStoryNarrativeReader(game.facts,game.factRoleSeeds,game.episodeSources,locale,{episodes:episodeReader,time});
  const n = storyNarrativeText(locale), sourceDetails = useRef(new Map<string,HTMLDetailsElement>());
  const openSource = (key: string) => {
    const detail = sourceDetails.current.get(key); if (!detail) return;
    detail.open = true; detail.querySelector("summary")?.focus(); detail.scrollIntoView?.({block:"nearest"});
  };
  const statusText = { "earlier-scene": t.earlierScene, "last-known": t.lastKnown, persistent: t.persistent, unknown: t.timeUnplaced, ended: t.ended };
  const words = normalizeText(query);
  const matching = episodes.map(episode => ({ ...episode, facts: episode.facts.filter(f => !words || normalizeText(f.text + " " + (f.task?.title ?? "") + " " + f.quote).includes(words)) })).filter(e => e.facts.length);
  const number = (n: number) => new Intl.NumberFormat(locale).format(n);
  return <section className="settings-card dr-story-episodes" aria-labelledby={id + "-title"}>
    <h2 id={id + "-title"}>{t.title}</h2><p className="setting-copy">{t.hint}</p><p className="setting-copy">{t.history}</p>
    <p className="setting-copy dr-story-time">{time.anchor ? <><strong>{t.time}: </strong>{time.anchor.label}</> : t.timeUnknown}</p>
    {time.anchor?.kind === "elapsed" && <p className="setting-copy">{t.elapsed}</p>}
    {!!episodes.length && <><label className="field-label" htmlFor={id + "-search"}>{t.search}</label><input className="input" type="search" id={id + "-search"} maxLength={120} value={query} onChange={e => { setQuery(e.target.value); setLimit(6); }}/></>}
    {!matching.length && <p className="setting-copy">{query ? t.noMatch : t.empty}</p>}
    {matching.slice(0, limit).map(episode => { const brief = narrator.read(episode.facts); return <details key={episode.number ?? "unknown"} className="dr-story-tool">
      <summary>{episode.number === null ? t.unplaced : t.episode.replace("{number}", number(episode.number))} · {t.facts.replace("{count}", number(episode.facts.length))}</summary>
      <p className="setting-copy">{episode.number === null ? t.unknown : t.turns.replace("{count}", number(episode.sourceIds.length))}</p>
      <div className="dr-story-narrative">
        <strong>{n.title}</strong><p className="setting-copy">{n.hint}</p>
        {!!brief.parts.length && <p className="dr-story-narrative-text">{brief.parts.map((part,index) => <Fragment key={narrativeFactKey(part.reference.fact)}>
          {index>0?" ":""}{part.text}{" "}<button type="button" className="dr-story-narrative-reference" aria-label={n.source.replace("{number}",number(index+1))} onClick={() => openSource(narrativeFactKey(part.reference.fact))}>[{number(index+1)}]</button>{"."}
        </Fragment>)}</p>}
        {brief.omitted>0 && <p className="setting-copy">{brief.parts.length?n.omitted.replace("{count}",number(brief.omitted)):n.tooLong}</p>}
      </div>
      {episode.facts.map((f, index) => <article className="dr-story-review-entry" key={index}>
        <strong>{storyUpdateText(locale, f.kind)}</strong>{f.task && <p className="dr-story-task-status">{task[f.task.status]}</p>}
        {time.read(f) && <p className="setting-copy dr-story-time-status">{statusText[time.read(f)!]}</p>}
        <p className="dr-story-review-source">{f.text}</p>
        <details ref={node => { const key=narrativeFactKey(f); if(node)sourceDetails.current.set(key,node);else sourceDetails.current.delete(key); }}><summary>{t.source}</summary><p className="dr-story-review-source">{f.quote}</p></details>
      </article>)}
    </details>; })}
    {matching.length > limit && <button className="button secondary" type="button" onClick={() => setLimit(n => n + 6)}>{t.more}</button>}
  </section>;
}
