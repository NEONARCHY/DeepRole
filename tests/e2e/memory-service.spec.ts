import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const locale of ['ru','en']) for (const width of [360,1280]) test(`single memory plaque across streaming and rerenders ${locale} ${width}`, async ({ page }, info) => {
  await page.setViewportSize({width,height:850});
  await page.goto(`/tests/fixtures/memory-service.html?locale=${locale}`);
  const card=page.locator('[data-deeprole-memory-card]');
  await expect(card).toHaveCount(1); await expect(card).toBeVisible();
  for (const selector of ['.ds-collapsible-text','.ds-think-content','.ds-assistant-message-main-content']) await expect(page.locator(selector)).toBeHidden();
  await expect(page.getByText('Mira hands Noah the brass key.',{exact:false})).toBeVisible();
  await page.getByRole('textbox',{name:'Message',exact:true}).fill('MY UNSENT MESSAGE');
  await page.evaluate(()=>{
    const final=document.querySelector('.ds-assistant-message-main-content')!;
    for(let i=0;i<2;i++){const old=document.createElement('div');old.dataset.deeproleServicePreloader='preview';old.textContent='Old duplicate';final.append(old);}
    const json=document.createElement('p'); json.textContent=JSON.stringify({type:'memory-suggestions',items:[{title:'Key',content:'Noah has the brass key.'}]});
    const end=document.createElement('p'); end.textContent='</deeprole_data>'; final.append(json,end);
    (window as any).serviceTest.sync();
  });
  await expect(page.locator('[data-deeprole-service-preloader]')).toHaveCount(1);
  expect(await page.evaluate(()=>(window as any).serviceTest.parse())).toMatchObject([{type:'memory-suggestions',items:[{title:'Key'}]}]);
  await expect(page.locator('#conversation')).not.toContainText('deeprole_data',{useInnerText:true});
  expect((await new AxeBuilder({page}).include('[data-deeprole-memory-card]').withTags(['wcag2a','wcag2aa']).analyze()).violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({path:info.outputPath(`memory-waiting-${locale}-${width}.png`)});
  await page.evaluate(()=>(window as any).serviceTest.finish());
  await expect(card).toHaveAttribute('aria-busy','false'); await expect(page.locator('[data-deeprole-service-preloader]')).toHaveCount(0);
  const result=await card.innerText();
  await page.evaluate(()=>{for(let i=0;i<4;i++){(window as any).serviceTest.sync();(window as any).serviceTest.archive();}});
  await expect(card).toHaveText(result);
  await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('MY UNSENT MESSAGE');
  await page.evaluate(()=>(window as any).serviceTest.finish(true));
  await expect(card).toHaveAttribute('aria-busy','false'); await expect(card).toContainText(locale==='ru'?'Память не менялась':'Memory is unchanged');
  await page.screenshot({path:info.outputPath(`memory-error-${locale}-${width}.png`)});
});
