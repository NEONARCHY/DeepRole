import type { Page } from '@playwright/test';
import type { WxtBrowser } from 'wxt/browser';
import type { DataRecord, Locale } from '../../../src/core/types';

export async function seedStoryLibrary(panel:Page, records:DataRecord[], locale:Locale) {
  await panel.evaluate(async ({records,locale})=>{
    await new Promise<void>((resolve,reject)=>{
      const open = indexedDB.open('deeprole');
      open.onerror = ()=>reject(open.error);
      open.onsuccess = ()=>{
        const db = open.result, tx = db.transaction('records','readwrite');
        for (const r of records) tx.objectStore('records').put({pk:r.kind+':'+r.id,...r,updatedAt:Date.now()});
        tx.oncomplete = ()=>{db.close();resolve();};
        tx.onabort = ()=>{db.close();reject(tx.error);};
      };
    });
    const browser = (globalThis as typeof globalThis & {chrome:Pick<WxtBrowser,'storage'>}).chrome;
    await browser.storage.local.set({
      deeprole_settings:{locale,onboardingComplete:true,showChatContextMeter:false,automaticMetadataRepair:false},
      deeprole_library_change:{token:'memory-runtime-seed'},
    });
  },{records,locale});
}
