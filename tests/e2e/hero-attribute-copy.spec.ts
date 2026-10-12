import {expect,test} from "@playwright/test";
import {relationshipText} from "../../src/core/relationship-i18n";
import {progressText} from "../../src/core/progress-i18n";
for(const locale of ['ru','en'] as const)for(const width of [320,1100])test(`hero characteristic copy ${locale} ${width}`,async({page})=>{
 const t=(key:Parameters<typeof relationshipText>[1])=>relationshipText(locale,key);
 await page.setViewportSize({width,height:900});await page.goto(`/tests/fixtures/relationships.html?locale=${locale}`);
 await page.getByRole('button',{name:locale==='ru'?'Новый мир':'New world',exact:true}).click();const create=page.locator('.lm-create-dialog');
 await create.getByLabel(locale==='ru'?'Название':'Name',{exact:true}).fill('Harbor');await create.locator('summary').filter({hasText:t('setupTitle')}).click();
 const section=create.locator('.dr-hero-attributes-setup'),toggle=section.getByRole('switch',{name:progressText(locale,'setup'),exact:true});
 await expect(toggle).toBeDisabled();await create.getByLabel(t('heroName'),{exact:true}).fill('Leon');await toggle.check();
 await expect(section).toContainText(progressText(locale,'setupEnergy'));await expect(section).toContainText(progressText(locale,'setupResolve'));await expect(section).toContainText(progressText(locale,'setupChanges'));
 await expect(section).not.toContainText(t('consent'));await expect(section).not.toContainText(locale==='ru'?'решимость':'resolve');
 await section.scrollIntoViewIfNeeded();await page.screenshot({path:test.info().outputPath(`hero-copy-${locale}-${width}.png`)});
 expect(await create.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await create.getByRole('button',{name:t('createWorld'),exact:true}).click();await expect(create).toHaveCount(0);
 const sheet=await page.evaluate(async()=>{const records=await (window as any).records();return records.find((r:any)=>r.kind==='entity'&&r.data.worldId===(window as any).createdWorld.id&&r.data.characterSheet.protagonist).data.characterSheet;});
 expect(sheet.attributes.map((a:any)=>({id:a.id,label:a.label,initial:a.initial}))).toEqual([{id:'energy',label:locale==='ru'?'Запас сил':'Stamina',initial:70},{id:'resolve',label:locale==='ru'?'Уверенность':'Confidence',initial:50}]);
});
