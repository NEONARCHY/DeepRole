import { afterEach,expect,it } from "vitest";
import { cleanup,fireEvent,render,screen } from "@testing-library/react";
import { StoryEpisodePanel } from "../src/entrypoints/shared/StoryEpisodePanel";
import { storyEpisodeText } from "../src/core/story-episode-i18n";
import { storyNarrativeText } from "../src/core/story-narrative-i18n";
import { narrativeQualityCorpus } from "./fixtures/story-narrative-quality";
import type { WorldGame } from "../src/core/world-game";
import { roleSeed } from "../src/core/story-role-binding";
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

it("shows one linked event for either character and keeps old routine entries available", () => {
  const t = storyEpisodeText("ru");
  const text = "Мира сказала Тимуру: «Запасной ключ лежит в синей коробке».";
  const shared = { kind: "event" as const, text, quote: text };
  const old = { kind: "event" as const, text: "Мира встала утром.", quote: "Мира встала утром." };
  const game = { ...base, facts: [old, shared], episodeSources: ["source"], factRoleSeeds: [roleSeed(shared, {
    version: 1, sourceRevisionId: "source", quote: text, roles: { speaker: { id: "mira", name: "Мира" }, recipient: { id: "timur", name: "Тимур" } },
  })] };
  render(<StoryEpisodePanel locale="ru" game={game}/>);
  expect(screen.queryByText(t.unplaced, { exact: false })).not.toBeInTheDocument();
  const character = screen.getByRole("combobox", { name: t.person });
  for (const id of ["mira", "timur"]) {
    fireEvent.change(character, { target: { value: id } });
    expect(document.querySelectorAll(".dr-story-review-entry")).toHaveLength(1);
    expect(document.querySelector(".dr-story-review-entry")?.textContent).toContain(text);
  }
  fireEvent.change(character, { target: { value: "" } });
  fireEvent.click(screen.getByRole("checkbox", { name: t.includeRoutine }));
  expect(screen.getByText(t.unplaced, { exact: false })).toBeVisible();
  expect(game.facts).toEqual([old, shared]);
});
