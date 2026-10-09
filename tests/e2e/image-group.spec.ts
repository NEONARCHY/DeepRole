import {expect, test} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {realPng} from "../image-fixtures";

for (const locale of ["ru", "en"] as const) for (const width of [320, 800]) for (const limit of [2, 6]) test(`group identity references ${locale} ${width}px limit ${limit}`, async ({page}, info) => {
  await page.setViewportSize({width, height: 900}); const requests: any[] = [];
  await page.route("https://images.example.test/**", async route => {
    const headers={"access-control-allow-origin":"*","access-control-allow-headers":"authorization,content-type","access-control-allow-methods":"GET,POST,OPTIONS","content-type":"image/png"};
    if(route.request().method()==="OPTIONS"){await route.fulfill({status:204,headers});return;}
    requests.push({url:route.request().url(),body:route.request().postDataJSON()});
    await route.fulfill({body:Buffer.from(realPng,"base64"),headers});
  });
  await page.goto(`/tests/fixtures/image-group.html?locale=${locale}&limit=${limit}`);
  const host=page.locator('[data-message-id="group-story"] [data-deeprole-illustrations]');
  await host.getByRole("button",{name:locale==="ru"?"Создать иллюстрацию":"Create illustration",exact:true}).click();
  await expect(host.locator("img")).toHaveCount(1); expect(requests).toHaveLength(1);
  const body=requests[0].body; expect(requests[0].url).toMatch(/\/image\/multi-edit$/); expect(body.images).toHaveLength(limit);
  expect(new Set(body.images).size).toBe(limit); expect(body.futureOption).toEqual({keep:[false,null,3]});
  expect(body.prompt).toContain("Reference 1 preserves the identity of Noah"); expect(body.prompt).toContain("Action: Talking to Mira");
  for(const name of ["Mira","Noah","Ari","Dani","Iris","Leo"])expect(body.prompt).toContain(name);
  await host.locator(".dr-image-info summary").click();
  const list=host.getByRole("list",{name:locale==="ru"?"Участники кадра":"Frame participants"}); await expect(list.getByRole("listitem")).toHaveCount(6);
  await expect(list.getByRole("listitem").first()).toContainText("Noah");
  await expect(list.getByRole("listitem").first()).toContainText(locale==="ru"?"Референс 1":"Reference 1");
  await expect(host.getByText(locale==="ru"?`Референсы: ${limit} из 6 участников`:`References: ${limit} of 6 participants`,{exact:true})).toBeVisible();
  await expect(list.getByText(locale==="ru"?"По описанию, без референса":"Description only, no reference",{exact:true})).toHaveCount(6-limit);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({path:info.outputPath("group-references.png")});
  expect((await page.evaluate(()=>(window as any).sentPlans))[0]).not.toContain("data:image");
  await page.reload(); await expect(host.locator("img")).toHaveCount(1); expect(requests).toHaveLength(1);
  await host.getByRole("button",{name:locale==="ru"?"Попробовать ещё раз":"Try again",exact:true}).click();
  await expect(host.locator("img")).toHaveCount(1); await expect(host.getByText(locale === "ru" ? "Генерация 2 из 2" : "Generation 2 of 2", {exact:true})).toBeVisible(); expect(requests).toHaveLength(2); expect(requests[1].body).toEqual(body);
});
