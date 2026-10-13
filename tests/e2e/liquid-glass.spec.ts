import { openSettingsSection } from "./helpers/settings";
import { expect, test } from '@playwright/test';
import { setEnglish } from './helpers/settings';
for(const locale of ['ru','en']) for(const width of [320,1100]) {
  test(`Markdown thinking collapses while streaming ${locale} ${width}`,async({page})=>{
    await page.setViewportSize({width,height:900});await page.goto(`/tests/fixtures/reasoning.html?locale=${locale}&markdown=1`);
    const body=page.locator('#first .ds-think-content-wrapper'),header=page.locator('#first .thought-heading');
    await expect(body).toBeHidden();await expect(page.locator('#first>.ds-assistant-message-main-content')).toBeVisible();
    await page.evaluate(()=>{const body=document.querySelector<HTMLElement>('#first .ds-think-content-wrapper')!;body.style.display='block';document.querySelector('#first .thought-heading')!.setAttribute('aria-expanded','true');body.querySelector('.ds-markdown')!.append(' Streamed test text');});
    await expect(body).toBeHidden();await header.click();await expect(body).toBeVisible();
    await page.evaluate(()=>(window as any).thoughtsTest.stream());await expect(body).toBeVisible();
    await page.evaluate(()=>(window as any).thoughtsTest.setShow(true));await expect(body).toBeVisible();
  });
  test(`classic design restored without liquid glass ${locale} ${width}`,async({page},info)=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setViewportSize({width,height:900});await page.goto('/tests/fixtures/sidepanel.html?persist');
    await page.getByRole('button',{name:'Настройки',exact:true}).click();if(locale==='en')await setEnglish(page);
    await openSettingsSection(page,"appearance",locale);
    await expect(page.locator('.dr-glass-nav')).toHaveCount(0);await expect(page.locator('.bottom-nav')).toBeVisible();
    const card=page.locator('.dr-settings-page:not([hidden]) .settings-card').first();await expect(card).toBeVisible();
    expect(await card.evaluate(e=>getComputedStyle(e).backdropFilter)).toBe('none');
    expect(await page.locator('.app-shell').evaluate(e=>getComputedStyle(e).backgroundImage)).toBe('none');
    expect(await page.locator('.app-shell').evaluate(e=>getComputedStyle(e,'::before').content)).toBe('none');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath(`classic-${locale}-${width}.png`),fullPage:true});
    await page.emulateMedia({reducedMotion:'reduce'});
    expect(await page.locator('.app-shell').evaluate(e=>getComputedStyle(e,'::before').animationName)).toBe('none');
    await page.locator('.app-shell').evaluate(e=>e.setAttribute('data-motion','off'));
    expect(await page.locator('.app-shell').evaluate(e=>getComputedStyle(e,'::before').animationName)).toBe('none');
    await page.getByRole('button',{name:locale==='ru'?'Игра':'Play',exact:true}).click();
    expect(errors).toEqual([]);
  });
}
