import { chromium, expect, test } from "@playwright/test";
import { mkdtemp, mkdir } from "node:fs/promises";
import path from "node:path";
import { characterTab, closeSavedCharacter } from "./character-helpers";
for(const locale of ["ru","en"]) test(`installed photo addresses and small save ${locale}`,async({},info)=>{
  test.skip(info.project.name!=="chromium","Installed Chrome MV3; shared photo UI also has Firefox coverage");test.setTimeout(90000);
  const root=path.resolve("test-results/profiles");await mkdir(root,{recursive:true});const profile=await mkdtemp(path.join(root,"photo-runtime-"));
  const context=await chromium.launchPersistentContext(profile,{channel:"msedge",headless:true,args:[`--disable-extensions-except=${path.resolve(".output/chrome-mv3")}`,`--load-extension=${path.resolve(".output/chrome-mv3")}`]});
  try{
    context.setDefaultTimeout(15000);const worker=context.serviceWorkers()[0]??await context.waitForEvent("serviceworker");
    await context.route("https://chat.deepseek.com/**",route=>route.fulfill({contentType:"text/html",body:`<!doctype html><html lang="${locale}"><head><title>Photo runtime</title></head><body><main><h1>Photo world</h1><section id="story"></section><form><textarea aria-label="Message"></textarea><button type="submit">Send</button></form></main></body></html>`}));
    const panel=await context.newPage();await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);
    await expect.poll(()=>panel.evaluate(async()=> (await indexedDB.databases()).some(db=>db.name==="deeprole"))).toBe(true);
    await panel.evaluate(async locale=>{
      const images:string[]=[];for(let i=0;i<60;i++){const canvas=document.createElement("canvas");canvas.width=512;canvas.height=768;const c=canvas.getContext("2d")!;c.fillStyle=`hsl(${i*17},45%,45%)`;c.fillRect(0,0,512,768);c.fillStyle="white";c.font="48px sans-serif";c.fillText(String(i),30,100);images.push(canvas.toDataURL("image/png"))}
      const state={action:"neutral",condition:"",goal:"",relationship:"",stats:[]};
      const world={id:"w",name:"Photo world",description:"Unchanged lore",color:"#123456",contextBudget:1000,relevanceThreshold:6,createdAt:1,updatedAt:1};
      const person={id:"p",worldId:"w",kind:"character",name:"Mira",description:"Original lore",aliases:[],memberIds:[],createdAt:1,updatedAt:1,characterSheet:{gender:"female",protagonist:false,appearance:"Blue coat",personality:"",goals:"",background:"",sprites:{neutral:images[0]},portraitLibrary:images.slice(1)}};
      const binding={id:"b",chatId:"photo-runtime",chatUrl:"https://chat.deepseek.com/a/chat/s/photo-runtime",worldId:"w",focusIds:[],bookId:null,messageCountAtAnalysis:0,characterScenes:{w:{revision:"first",presentIds:["p"],states:{p:state},updatedAt:1}},createdAt:1,updatedAt:1};
      await new Promise<void>((resolve,reject)=>{const open=indexedDB.open("deeprole");open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction("records","readwrite");for(const [kind,data]of[["world",world],["entity",person],["binding",binding]]as Array<[string,any]>)tx.objectStore("records").put({pk:`${kind}:${data.id}`,kind,id:data.id,data,updatedAt:1});tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)}});
      await (window as any).chrome.storage.local.set({deeprole_settings:{locale,onboardingComplete:true,characterSheetsEnabled:true}});
    },locale);await panel.reload();
    await worker.evaluate(()=>{(globalThis as any).photoRequests=[];(globalThis as any).chrome.runtime.onConnect.addListener((port:any)=>{let size=0,operation="",address=false;port.onMessage.addListener((message:any)=>{if(message.type==="request"){size+=message.part.length;if(message.index===0)operation=message.part.match(/"operation":"([^"]+)"/)?.[1]??"";address=address||message.part.includes("deeprole-photo:")}if(message.type==="execute")(globalThis as any).photoRequests.push({operation,size,address})})})});
    const chat=await context.newPage();await chat.goto("https://chat.deepseek.com/a/chat/s/photo-runtime");await chat.locator(".dr-character-row").filter({hasText:"Mira"}).click();
    const dialog=chat.getByRole("dialog");await characterTab(dialog,"images",locale);const grid=dialog.locator(".dr-portrait-library-grid");await grid.scrollIntoViewIfNeeded();
    await expect.poll(()=>grid.locator('img[src^="blob:"]').count()).toBeGreaterThan(0);expect(await grid.locator('img[src^="blob:"]').count()).toBeLessThan(60);
    await grid.locator(".dr-library-view").last().click();const viewer=chat.locator('[data-deeprole-photo-viewer]');await expect.poll(()=>viewer.locator("img").evaluate(image=>(image as HTMLImageElement).naturalHeight)).toBe(768);
    await viewer.getByRole("button",{name:locale==="ru"?"Закрыть изображение":"Close image",exact:true}).click();await characterTab(dialog,"profile",locale);
    await dialog.getByLabel(locale==="ru"?"Имя":"Name",{exact:true}).fill("Mira renamed");await dialog.getByRole("button",{name:locale==="ru"?"Сохранить персонажа":"Save character",exact:true}).click();await closeSavedCharacter(dialog,locale);
    const saves=await worker.evaluate(()=>(globalThis as any).photoRequests.filter((request:any)=>request.operation==="saveCharacter"));expect(saves).toHaveLength(1);expect(saves[0].size).toBeLessThan(5000);expect(saves[0].address).toBe(false);
    const summary=await panel.evaluate(()=>new Promise<any>((resolve,reject)=>{const open=indexedDB.open("deeprole");open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction(["records","photos"]),record=tx.objectStore("records").get("entity:p"),count=tx.objectStore("photos").count();tx.oncomplete=()=>{resolve({name:record.result.data.name,description:record.result.data.description,photos:count.result,compact:!JSON.stringify(record.result).includes("data:image")});db.close()}}}));
    expect(summary).toEqual({name:"Mira renamed",description:"Original lore",photos:60,compact:true});await chat.reload();await expect(chat.locator(".dr-character-row")).toContainText("Mira renamed");
  }finally{await context.close()}
});
