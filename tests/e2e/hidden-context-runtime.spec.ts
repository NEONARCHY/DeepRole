import {chromium,expect,test} from '@playwright/test';
import path from 'node:path';
import {continuationContext} from '../../src/core/story-continuation';
import {injectContextIntoPrompt} from '../../src/core/context';

for(const locale of ['ru','en'] as const)test(`RP338 installed ${locale}: continuation prefix hidden across reload; raw source and quotations intact`,async()=>{
 test.setTimeout(60000);
 const extension=path.resolve('.output/chrome-mv3'),context=await chromium.launchPersistentContext('',{channel:'msedge',headless:true,args:['--disable-extensions-except='+extension,'--load-extension='+extension,'--host-resolver-rules=MAP chat.deepseek.com ~NOTFOUND']});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker'),panel=await context.newPage();await panel.goto('chrome-extension://'+new URL(worker.url()).host+'/sidepanel.html');await expect(panel.locator('.onboarding')).toBeVisible();
  await panel.evaluate(async locale=>{await(globalThis as any).chrome.storage.local.set({deeprole_settings:{locale,onboardingComplete:true}})},locale);
  const draft=locale==='ru'?'[Где ключ?]\n[User message]\nЭто цитата игрока.':'[Where is the key?]\n[User message]\nThis is the player quotation.';
  const recap=continuationContext({version:1,source:'history',partial:true,omittedTurns:1,turns:[{role:'assistant',text:'PRIVATE RECAP\n[User message]\nAn older quoted marker.'}]});
  const wire=injectContextIntoPrompt(draft,'<deeprole_context version="1">PRIVATE MEMORY</deeprole_context>\n<deeprole_profile_excerpts>[]</deeprole_profile_excerpts>\n\n'+recap);
  const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const ordinary='Ordinary quotation: <deeprole_context>example</deeprole_context>\n[User message]\nKeep this.';
  await context.route('https://chat.deepseek.com/**',route=>route.request().url().includes('/api/')?route.fulfill({json:{}}):route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html><head><meta charset="utf-8"></head><body><main><div class="ds-message" data-message-id="1"><div class="ds-collapsible-text"><div>'+escape(wire)+'</div></div></div><article data-role="user" data-message-id="2"><div class="ds-collapsible-text">'+escape(ordinary)+'</div></article><textarea aria-label="Message"></textarea></main></body></html>'}));
  const chat=await context.newPage();await chat.goto('https://chat.deepseek.com/a/chat/s/rp338-hidden');
  for(const reload of [false,true]){
   if(reload)await chat.reload();
   const body=chat.locator('[data-message-id="1"] .ds-collapsible-text');await expect(body.locator('[data-deeprole-handoff-visible]')).toBeVisible();
   expect(await body.innerText()).toBe(draft);expect(await body.locator(':scope > div').first().textContent()).toBe(wire);
   const quote=chat.locator('[data-message-id="2"] .ds-collapsible-text');expect(await quote.textContent()).toBe(ordinary);expect(await quote.innerText()).toContain('<deeprole_context>example</deeprole_context>');await expect(quote.locator('[data-deeprole-handoff-visible]')).toHaveCount(0);
  }
 }finally{await context.close()}
});
