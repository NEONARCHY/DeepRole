import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StoryEpisodePanel } from "../src/entrypoints/shared/StoryEpisodePanel";
import { storyEpisodeText } from "../src/core/story-episode-i18n";
import type { WorldGame } from "../src/core/world-game";
import { GAME_TIME_KEY } from "../src/core/story-time";
import { roleSeed } from "../src/core/story-role-binding";
import type { StoryFact } from "../src/core/story-update";
afterEach(cleanup);

const game: WorldGame = { version: 1, id: "game", revision: "rev", activationId: "active", activeBindingId: "binding:a", activeChatId: "a", managed: true, memoryOverrides: { includedIds: [], excludedIds: [] }, profileSeeds: {}, identitySeeds: {}, mergeSeeds: {}, updatedAt: 0, facts: [{ kind: "promise", text: "Help if road opens", quote: "Nora: I will help if the road opens." }] };
it.each(["ru", "en"] as const)("shows unknown chronology and exact source, and rebuilds after removal: %s", locale => {
  const g = structuredClone(game), t = storyEpisodeText(locale), before = structuredClone(g), view = render(<StoryEpisodePanel locale={locale} game={g}/>);
  fireEvent.change(screen.getByRole("searchbox", { name: t.search }), { target: { value: "Nora" } });
  expect(screen.getByText(t.unplaced, { exact: false })).toBeInTheDocument(); expect(screen.getByText(t.unknown)).toBeInTheDocument();
  fireEvent.click(screen.getByText(t.unplaced, { exact: false })); fireEvent.click(screen.getByText(t.source));
  expect(screen.getByText(g.facts[0]!.quote)).toBeVisible(); expect(g).toEqual(before);
  fireEvent.change(screen.getByRole("searchbox", { name: t.search }), { target: { value: "" } });
  view.rerender(<StoryEpisodePanel locale={locale} game={{ ...g, facts: [] }}/>); expect(screen.getByText(t.empty)).toBeVisible();
});
it.each(["ru", "en"] as const)("shows proven time, temporary/persistent status and unknown fallback: %s", locale => {
  const t=storyEpisodeText(locale),label=locale==="ru"?"Прошло три дня.":"Three days later.";
  const clock:StoryFact={kind:"event",text:label,quote:label,claim:{key:GAME_TIME_KEY,value:label,scope:"state",transition:"progress"}};
  const temp:StoryFact={kind:"event",text:"Nora at bridge",quote:"Nora at bridge",claim:{key:"place",value:"bridge",scope:"state",lifetime:"scene"}},lasting:StoryFact={kind:"event",text:"Nora knows code",quote:"Nora knows code",claim:{key:"code",value:"code",scope:"state",lifetime:"persistent"}};
  const facts=[temp,lasting,clock],g={...game,facts,episodeSources:["s0","s1"],factRoleSeeds:facts.map((f,i)=>roleSeed(f,{version:1,sourceRevisionId:i===2?"s1":"s0",quote:f.quote,roles:{}}))},before=structuredClone(g),view=render(<StoryEpisodePanel locale={locale} game={g}/>);
  expect(screen.getByText(t.time+":")).toBeVisible();expect(screen.getByText(t.elapsed)).toBeVisible();fireEvent.click(screen.getByText(t.episode.replace("{number}","1"),{exact:false}));
  expect(screen.getByText(t.earlierScene)).toBeVisible();expect(screen.getByText(t.persistent)).toBeVisible();expect(g).toEqual(before);
  view.rerender(<StoryEpisodePanel locale={locale} game={{...g,factRoleSeeds:[]}}/>);expect(screen.getByText(t.timeUnknown)).toBeVisible();expect(screen.getAllByText(t.timeUnplaced)).toHaveLength(2);
});
it.each(["ru", "en"] as const)("resets search when a different game is opened: %s", async locale => {
  const t = storyEpisodeText(locale), view = render(<StoryEpisodePanel locale={locale} game={game}/>);
  fireEvent.change(screen.getByRole("searchbox", { name: t.search }), { target: { value: "no match" } }); expect(screen.getByText(t.noMatch)).toBeVisible();
  view.rerender(<StoryEpisodePanel locale={locale} game={{ ...game, id: "new-game" }}/>);
  await waitFor(() => expect(screen.getByRole("searchbox", { name: t.search })).toHaveValue(""));
});
it.each(["ru","en"] as const)("shows an ending with its source, then restores active state after undo: %s", locale => {
 const t=storyEpisodeText(locale),temp:StoryFact={kind:"event",text:"Nora waits.",quote:"Nora waits.",claim:{key:"waiting",value:"Nora waits.",scope:"state",lifetime:"scene"}},ended:StoryFact={kind:"event",text:"Nora left.",quote:"Nora left.",claim:{...temp.claim!,value:"Nora left.",transition:"progress",status:"ended"}},facts=[temp,ended],g={...game,facts,episodeSources:["s0","s1"],factRoleSeeds:facts.map((f,i)=>roleSeed(f,{version:1,sourceRevisionId:"s"+i,quote:f.quote,roles:{}}))};
 const view=render(<StoryEpisodePanel locale={locale} game={g}/>);fireEvent.click(screen.getByText(t.episode.replace("{number}","1"),{exact:false}));expect(screen.getByText(t.ended)).toBeVisible();expect(screen.queryByText(temp.text)).not.toBeInTheDocument();fireEvent.click(screen.getByText(t.source));expect(screen.getAllByText(ended.quote)).toHaveLength(2);
 view.rerender(<StoryEpisodePanel locale={locale} game={{...g,facts:[temp]}}/>);expect(screen.queryByText(t.ended)).not.toBeInTheDocument();expect(screen.getByText(t.lastKnown)).toBeVisible();expect(screen.getAllByText(temp.text)).toHaveLength(2);
});
