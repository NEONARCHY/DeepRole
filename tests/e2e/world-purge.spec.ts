import {expect,test} from '@playwright/test';
import {setEnglish} from './helpers/settings';
for(const locale of ['ru','en'])for(const width of [320,1100])test(`full world deletion is explicit and cancellable ${locale} ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.goto('/tests/fixtures/sidepanel.html?world&persist');
 if(locale==='en'){await page.getByRole('button',{name:'Настройки',exact:true}).click();await setEnglish(page);}
 await page.evaluate(async()=>{
  const path='/src/storage/repository.ts', {repository}=await import(path);
  await repository.put('book',{id:'purge-book',worldId:'world-a',name:'Imported lore',description:'',color:'#123456',active:true,createdAt:1,updatedAt:1});
  await repository.put('entry',{id:'purge-entry',bookId:'purge-book',title:'Imported fact',content:'Original neutral lore',keywords:[],activation:'smart',priority:'normal',enabled:true,source:{type:'manual'},createdAt:1,updatedAt:1});
 });
 await page.getByRole('button',{name:locale==='ru'?'Лор':'Lore',exact:true}).click();
 await page.getByRole('button',{name:locale==='ru'?'Мир и профили':'World & profiles',exact:true}).click();
 const remove=page.getByRole('button',{name:locale==='ru'?'Удалить мир и весь лор':'Delete world and all lore',exact:true});await expect(remove).toBeVisible();
 await page.screenshot({path:info.outputPath(`world-delete-${locale}-${width}.png`),fullPage:true});
 const records=()=>page.evaluate(async()=>{const path='/src/storage/repository.ts';return(await import(path)).repository.rawRecords();});
 const before=await records();page.once('dialog',async d=>{expect(d.message()).toContain('Observatory');await d.dismiss();});await remove.click();expect(await records()).toEqual(before);
 page.once('dialog',async d=>{expect(d.message()).toContain(locale==='ru'?'нельзя отменить':'cannot be undone');await d.accept();});await remove.click();
 await expect.poll(async()=>(await records()).some((r:any)=>r.kind==='world'&&r.id==='world-a')).toBe(false);
 const after=await records();expect(after.some((r:any)=>['purge-entry','purge-book'].includes(r.id))).toBe(false);
 expect(after.some((r:any)=>r.kind==='world'&&r.id==='world-b')).toBe(true);expect(after.some((r:any)=>r.id==='memory-1')).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
