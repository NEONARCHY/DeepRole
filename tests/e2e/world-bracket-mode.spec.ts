import {expect,test} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {storyMessageModeText} from '../../src/core/story-message-mode-i18n';

for(const locale of ['ru','en'] as const)for(const width of [320,900])test(`world bracket setting ${locale}/${width}: keyboard, cancel/save, isolation`,async({page},info)=>{
  await page.setViewportSize({width,height:1000});
  await page.goto(`/tests/fixtures/sidepanel.html?world&locale=${locale}`);
  const l=(ru:string,en:string)=>locale==='ru'?ru:en;
  await page.getByRole('button',{name:l('Миры','Worlds'),exact:true}).click();
  await page.getByRole('button',{name:l('Мир и профили','World & profiles'),exact:true}).click();
  const editor=page.locator('form.rp-editor'),control=editor.getByRole('switch',{name:storyMessageModeText(locale,'label'),exact:true});
  const open=async(name:string)=>{
    await page.locator('section.rp-card').filter({has:page.getByRole('heading',{name,exact:true})}).getByRole('button',{name:l('Изменить','Edit'),exact:true}).click();
    await expect(editor).toBeVisible();
  };
  await open('Observatory');
  await expect(control).not.toBeChecked();
  await control.focus();await page.keyboard.press('Space');await expect(control).toBeChecked();
  await editor.getByRole('button',{name:l('Отмена','Cancel'),exact:true}).click();
  await expect(editor).toHaveCount(0);
  await open('Observatory');await expect(control).not.toBeChecked();
  await control.focus();await page.keyboard.press('Space');
  await expect(editor.getByText(storyMessageModeText(locale,'scope'),{exact:true})).toBeVisible();
  expect(await editor.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  const audit=await new AxeBuilder({page}).include('form.rp-editor').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  expect(audit.violations).toEqual([]);
  await editor.screenshot({path:info.outputPath(`brackets-${locale}-${width}.png`)});
  await editor.getByRole('button',{name:l('Сохранить','Save'),exact:true}).click();await expect(editor).toHaveCount(0);
  const choose=async(name:string)=>{
    await page.getByRole('button',{name:new RegExp('^'+l('Библиотека мира:','World library:'))}).click();
    await page.getByRole('menuitemradio',{name,exact:true}).click();
  };
  await choose('Forest');await open('Forest');await expect(control).not.toBeChecked();
  await editor.getByRole('button',{name:l('Отмена','Cancel'),exact:true}).click();
  await expect(editor).toHaveCount(0);
  await choose('Observatory');await open('Observatory');await expect(control).toBeChecked();
});
