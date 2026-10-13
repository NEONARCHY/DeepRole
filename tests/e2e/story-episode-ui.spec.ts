import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { storyEpisodeText } from "../../src/core/story-episode-i18n";

for(const locale of ["ru","en"] as const)for(const width of [320,900])test(`episode summaries ${locale} ${width}: source, search, keyboard and accessibility`,async({page},info)=>{
  await page.setViewportSize({width,height:1000});await page.goto("/tests/fixtures/story-episodes.html?locale="+locale);const t=storyEpisodeText(locale);
  await expect(page.getByRole("heading",{name:t.title})).toBeVisible();await expect(page.getByText(t.hint)).toBeVisible();await expect(page.getByText(t.history)).toBeVisible();
  await expect(page.getByText(t.time+":",{exact:true})).toBeVisible();await expect(page.getByText(t.elapsed)).toBeVisible();
  await expect(page.locator(".dr-story-episodes > details")).toHaveCount(6);
  await page.getByRole("button",{name:t.more}).click();await expect(page.locator(".dr-story-episodes > details")).toHaveCount(9);
  const search=page.getByRole("searchbox",{name:t.search});await search.fill(locale==="ru"?"Нора":"Nora");await expect(page.locator(".dr-story-episodes > details")).toHaveCount(1);
  const episode=page.locator(".dr-story-episodes > details > summary");await episode.focus();await page.keyboard.press("Enter");
  const quote=locale==="ru"?"Нора: «Я помогу, если дорогу откроют».":"Nora: “I will help if the road opens.”";
  await expect(page.getByText(quote,{exact:true})).not.toBeVisible();const source=page.getByText(t.source,{exact:true});await source.focus();await page.keyboard.press("Enter");await expect(page.getByText(quote,{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
  if(info.project.name==="chromium")await page.screenshot({path:info.outputPath(`episodes-${locale}-${width}.png`),fullPage:true});
  await search.fill(locale==="ru"?"Я помогу":"I will help");await expect(page.locator(".dr-story-episodes > details")).toHaveCount(1);
  await search.fill("NO_MATCH");await expect(page.getByText(t.noMatch)).toBeVisible();await search.fill("");
  await page.getByRole("button",{name:t.more}).click();
  for(const n of [2,3,4])await page.getByText(t.episode.replace("{number}",String(n))+" ·",{exact:false}).click();
  await expect(page.getByText(t.earlierScene,{exact:true})).toBeVisible();await expect(page.getByText(t.persistent,{exact:true})).toBeVisible();
  await expect(page.getByText(t.ended,{exact:true})).toBeVisible();
  expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(info.project.name==="chromium")await page.screenshot({path:info.outputPath(`circumstances-${locale}-${width}.png`),fullPage:true});
  await page.evaluate(()=>{const f=(window as any).episodeFixture;f.game.facts=[];f.game.factRoleSeeds=[];f.render();});await expect(page.getByText(t.empty)).toBeVisible();
});
