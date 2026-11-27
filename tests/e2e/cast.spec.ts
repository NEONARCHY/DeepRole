import {expect,test,type Locator} from "@playwright/test";
// Resolve a DeepRole Ink token in the control's own scope, so assertions follow the theme.
const token=(control:Locator,name:string,property='backgroundColor')=>control.evaluate((e,[name,property])=>{const probe=document.createElement('i');probe.style.cssText=`position:absolute;background-color:var(${name});outline:2px solid var(${name})`;e.parentElement!.append(probe);const value=(getComputedStyle(probe) as any)[property];probe.remove();return value;},[name,property] as const);
for(const locale of ['ru','en'])for(const width of [320,1100])test(`retry and neutral controls ${locale} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto(`/tests/fixtures/cast.html?locale=${locale}&phase=error`);
 const retry=page.locator('.dr-retry-action'),ordinary=page.locator('.dr-cast-trigger');
 await expect(retry).toHaveCSS('background-color',await token(retry,'--dr-retry'));
 for(const control of [ordinary,retry]){
  const box=await control.boundingBox();const before=await control.evaluate(e=>getComputedStyle(e).backgroundColor);await control.hover();
  await expect.poll(()=>control.evaluate(e=>getComputedStyle(e).backgroundColor)).not.toBe(before);
  expect(await control.boundingBox()).toEqual(box);
 }
 await page.screenshot({path:test.info().outputPath(`retry-${locale}-${width}.png`)});
 await retry.press('Tab');await retry.focus();await expect(retry).toBeFocused();await expect(retry).toHaveCSS('outline-style','solid');await expect(retry).toHaveCSS('outline-color',await token(retry,'--ui-focus','outlineColor'));
 await page.emulateMedia({reducedMotion:'reduce'});expect((await retry.evaluate(e=>getComputedStyle(e).transitionDuration)).split(',').every(v=>parseFloat(v)===0)).toBe(true);
 await retry.evaluate((e:HTMLButtonElement)=>e.disabled=true);await expect(retry).toHaveCSS('opacity','0.42');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
for(const locale of ['ru','en'])for(const width of [320,1100])test(`success review styling ${locale} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto(`/tests/fixtures/cast.html?locale=${locale}`);
 const button=page.locator('.dr-cast-review-ready');await expect(button).toBeVisible();
 const accent=await token(button,'--ui-accent');
 await expect(button).toHaveCSS('background-color',accent);
 await button.hover();await expect.poll(()=>button.evaluate(e=>getComputedStyle(e).backgroundColor)).not.toBe(accent);
 await page.screenshot({path:test.info().outputPath(`ready-${locale}-${width}.png`)});
 await page.mouse.move(0,0);await button.focus();await expect(button).toBeFocused();await expect(button).toHaveCSS('outline-color',await token(button,'--ui-focus','outlineColor'));
 await page.emulateMedia({reducedMotion:'reduce'});expect((await button.evaluate(e=>getComputedStyle(e).transitionDuration)).split(',').every(v=>parseFloat(v)===0)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await button.click();await expect(page.getByRole('dialog')).toBeVisible();
 await page.goto(`/tests/fixtures/cast.html?locale=${locale}&phase=error`);await expect(page.locator('.dr-cast-review-ready')).toHaveCount(0);
});
for(const locale of ["ru","en"])for(const width of [320,1100])test("retains safe diagnostics after chat deletion and reload in "+locale+" at "+width+"px",async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto(`/tests/fixtures/cast.html?locale=${locale}&phase=error&cleanup=done&diagnostics=1&persist=1`);
 const detail=page.locator('.dr-cast-diagnostics');await detail.locator('summary').click();
 await expect(detail).toContainText('cast-fixture');await expect(detail).toContainText('characters[1].state');
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('blocked')}}}));
 await detail.getByRole('button',{name:locale==='ru'?'Скопировать диагностику':'Copy diagnostics',exact:true}).click();
 const report=JSON.parse(await detail.locator('textarea').inputValue());
 expect(report.diagnosticVersion).toBe(2);expect(report.automaticCorrectionsPerBatch).toBe(1);
 expect(report.events[0].details[0].path).toBe('characters[1].state');
 expect(report).not.toHaveProperty('sources');expect(report).not.toHaveProperty('draft');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(await page.evaluate(()=>(window as any).castMessages.some((m:any)=>['start','cleanup','open'].includes(m.action)))).toBe(false);
 await page.screenshot({path:test.info().outputPath(`cast-diagnostics-${locale}-${width}.png`),fullPage:true});
 await page.getByRole('button',{name:locale==='ru'?'Проверить персонажей · 2':'Review characters · 2',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:locale==='ru'?'Сохранить выбранных · 2':'Save selected · 2',exact:true}).click();
 await page.reload();await page.locator('.dr-cast-diagnostics summary').click();await expect(page.locator('.dr-cast-diagnostics')).toContainText('characters[1].state');
});
for(const locale of ["ru","en"])for(const width of [320,1100])test("explains invalid profile format in "+locale+" at "+width+"px",async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto(`/tests/fixtures/cast.html?locale=${locale}&phase=error&error=invalid-result&cleanup=failed`);
 const status=page.locator('.dr-cast-status');await expect(status).toBeVisible();
 await expect(status).toContainText(locale==="ru"?"формат анкет не прошёл проверку":"profiles did not pass format validation");
 await expect(status.getByRole('button',{name:locale==="ru"?'Проверить персонажей · 2':'Review characters · 2',exact:true})).toBeEnabled();
 expect(await status.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:test.info().outputPath(`cast-format-${locale}-${width}.png`),fullPage:true});
});
for(const locale of ["ru","en"])for(const width of [320,1100])test("reviews cast in "+locale+" at "+width+"px",async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto("/tests/fixtures/cast.html?locale="+locale);const text=(ru:string,en:string)=>locale==="ru"?ru:en;
 await page.getByRole("button",{name:text("Проверить персонажей","Review characters"),exact:true}).click();
 const dialog=page.getByRole("dialog",{name:text("Персонажи из лора","Characters from lore"),exact:true});await expect(dialog).toBeVisible();
 expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(dialog.getByRole("radio",{name:text("Главный герой","Protagonist")}).first()).toBeChecked();
 await dialog.getByRole("spinbutton",{name:text("Доверие: Mira","Trust: Mira"),exact:true}).fill("88");
 const members=dialog.locator(".dr-cast-member");await members.nth(1).getByText(text("Проверить персонажей","Review characters"),{exact:true}).click();
 await expect(dialog.getByRole("textbox",{name:text("Внешность: Mira","Appearance: Mira"),exact:true})).toHaveValue("Blue coat");
 await dialog.getByRole("textbox",{name:text("Внешность: Mira","Appearance: Mira"),exact:true}).fill("Green coat");
 await page.screenshot({path:test.info().outputPath("cast-review.png"),fullPage:true});
 await dialog.getByRole("button",{name:text("Сохранить выбранных · 2","Save selected · 2"),exact:true}).click();await expect(dialog).not.toBeVisible();
 const people=await page.evaluate(()=>(window as any).saved);expect(people).toHaveLength(2);const mira=people.find((e:any)=>e.name==="Mira");expect(mira.characterSheet.appearance).toBe("Green coat");expect(mira.characterSheet.relationships.initial.trust).toBe(88);
});
test("requires a selected protagonist and returns focus on closing",async({page})=>{
 await page.goto("/tests/fixtures/cast.html");const trigger=page.getByRole("button",{name:"Проверить персонажей",exact:true});await trigger.click();const dialog=page.getByRole("dialog");await dialog.getByRole("checkbox",{name:"Добавить: Leon",exact:true}).uncheck();await expect(dialog.getByRole("button",{name:"Сохранить выбранных · 1",exact:true})).toBeDisabled();await page.keyboard.press("Escape");await expect(trigger).toBeFocused();
});
