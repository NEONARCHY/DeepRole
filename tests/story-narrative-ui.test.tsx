import { afterEach,expect,it } from "vitest";
import { cleanup,fireEvent,render,screen } from "@testing-library/react";
import { StoryEpisodePanel } from "../src/entrypoints/shared/StoryEpisodePanel";
import { storyEpisodeText } from "../src/core/story-episode-i18n";
import { storyNarrativeText } from "../src/core/story-narrative-i18n";
import { narrativeQualityCorpus } from "./fixtures/story-narrative-quality";
import type { WorldGame } from "../src/core/world-game";
afterEach(cleanup);
const base:WorldGame={version:1,id:"game",revision:"r",activationId:"a",activeBindingId:"binding:a",activeChatId:"a",managed:true,memoryOverrides:{includedIds:[],excludedIds:[]},profileSeeds:{},identitySeeds:{},mergeSeeds:{},facts:[],updatedAt:0};
it.each(["ru","en"] as const)("narrative source control opens the exact quote and focuses it without changing accepted memory: %s",locale=>{
  const c=narrativeQualityCorpus(locale).find(c=>c.name==="conditional-open-promise")!,n=storyNarrativeText(locale),t=storyEpisodeText(locale),game={...base,facts:c.facts,factRoleSeeds:c.seeds,episodeSources:c.sources},before=structuredClone(game);
  const view=render(<StoryEpisodePanel locale={locale} game={game}/>);
  fireEvent.click(screen.getByText(t.episode.replace("{number}","1"),{exact:false}));
  expect(document.querySelector(".dr-story-narrative-text")?.textContent).toContain(c.critical![0]);
  fireEvent.click(screen.getByRole("button",{name:n.source.replace("{number}","1")}));
  expect(screen.getByText(t.source)).toHaveFocus();expect(screen.getByText(c.facts[0]!.quote)).toBeVisible();expect(game).toEqual(before);
  view.rerender(<StoryEpisodePanel locale={locale} game={{...game,facts:[],factRoleSeeds:[]}}/>);
  expect(screen.queryByRole("button",{name:n.source.replace("{number}","1")})).not.toBeInTheDocument();expect(screen.getByText(t.empty)).toBeVisible();
});
it.each(["ru","en"] as const)("large quotes stay complete in full records and markup remains text: %s",locale=>{
  const n=storyNarrativeText(locale),t=storyEpisodeText(locale),quote="<script>PRIVATE</script> "+"A whole conditional source. ".repeat(65),fact={kind:"event" as const,text:"Small text",quote};
  const view=render(<StoryEpisodePanel locale={locale} game={{...base,facts:[fact]}}/>);
  fireEvent.click(screen.getByText(t.unplaced,{exact:false}));expect(screen.getByText(n.tooLong)).toBeVisible();
  const source=screen.getByText(t.source);fireEvent.click(source);
  const exact=source.parentElement!.querySelector("p")!;expect(exact).toBeVisible();expect(exact.textContent).toBe(quote);expect(document.querySelector("script")).toBeNull();
  view.rerender(<StoryEpisodePanel locale={locale} game={{...base,facts:[{...fact,quote:"<script>PRIVATE</script> a short source"}]}}/>);
  expect(document.querySelector(".dr-story-narrative-text")?.textContent).toContain("<script>PRIVATE</script>");expect(document.querySelector("script")).toBeNull();
});
