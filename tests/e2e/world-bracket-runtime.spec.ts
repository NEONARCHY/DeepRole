import {chromium,expect,test} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import {storyMessageModeText} from '../../src/core/story-message-mode-i18n';

// Production-bundled UI and the extension's real IndexedDB, independent of Vite
// module/HMR latency. No DeepSeek account, requests or user data are involved.
for(const locale of ['ru','en'] as const)for(const width of [320,900])test(`installed world brackets ${locale}/${width}: save, isolation, reload`,async({},info)=>{
  test.skip(info.project.name!=='chromium','Installed Chrome MV3');test.setTimeout(60000);
  const extension=path.resolve('.output/chrome-mv3');
  const context=await chromium.launchPersistentContext('',{channel:'msedge',headless:true,viewport:{width,height:1000},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  try{
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker'),page=await context.newPage();
    const url=`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`;
    await page.goto(url);await expect(page.locator('.onboarding')).toBeVisible();
    await page.evaluate(async locale=>{
      await new Promise<void>((resolve,reject)=>{
        const open=indexedDB.open('deeprole');open.onerror=()=>reject(open.error);
        open.onsuccess=()=>{const db=open.result,tx=db.transaction('records','readwrite');
          for(const id of ['world-a','world-b'])tx.objectStore('records').put({pk:`world:${id}`,kind:'world',id,data:{id,name:id==='world-a'?'Observatory':'Forest',description:'',color:'#58a6ff',contextBudget:3000,relevanceThreshold:6,createdAt:1,updatedAt:1},updatedAt:1});
          tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
      });
      await (globalThis as any).chrome.storage.local.set({deeprole_settings:{locale,onboardingComplete:true},deeprole_library_change:{token:'bracket-ui-seed'}});
    },locale);
    await page.reload();
    const l=(ru:string,en:string)=>locale==='ru'?ru:en;
    const choose=async(name:string)=>{await page.getByRole('button',{name:new RegExp('^'+l('Библиотека мира:','World library:'))}).click();await page.getByRole('menuitemradio',{name,exact:true}).click();};
    const manage=async()=>{await page.getByRole('button',{name:l('Миры','Worlds'),exact:true}).click();await choose('Observatory');await page.getByRole('button',{name:l('Мир и профили','World & profiles'),exact:true}).click();};
    const editor=page.locator('form.rp-editor'),control=editor.getByRole('switch',{name:storyMessageModeText(locale,'label'),exact:true});
    const open=async(name:string)=>{await page.locator('section.rp-card').filter({has:page.getByRole('heading',{name,exact:true})}).getByRole('button',{name:l('Изменить','Edit'),exact:true}).click();await expect(editor).toBeVisible();};
    await manage();await open('Observatory');await expect(control).not.toBeChecked();
    await control.focus();await page.keyboard.press('Space');await expect(control).toBeChecked();
    await editor.getByRole('button',{name:l('Отмена','Cancel'),exact:true}).click();await expect(editor).toHaveCount(0);
    await open('Observatory');await expect(control).not.toBeChecked();await control.focus();await page.keyboard.press('Space');
    expect(await editor.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    expect((await new AxeBuilder({page}).include('form.rp-editor').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
    await editor.screenshot({path:info.outputPath(`brackets-${locale}-${width}.png`)});
    await editor.getByRole('button',{name:l('Сохранить','Save'),exact:true}).click();await expect(editor).toHaveCount(0);
    await choose('Forest');await open('Forest');await expect(control).not.toBeChecked();
    await editor.getByRole('button',{name:l('Отмена','Cancel'),exact:true}).click();await expect(editor).toHaveCount(0);
    await page.reload();await manage();await open('Observatory');await expect(control).toBeChecked();
  }finally{await context.close();}
});
