import { chromium, expect, test } from "@playwright/test";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import { EMPTY_CHARACTER } from "../../src/core/characters";
import { characterTab, closeSavedCharacter } from "./character-helpers";
import { portraitUploadText } from "../../src/core/portrait-upload-i18n";

for(const locale of ["ru","en"] as const)test(`installed custom portrait quality and embedded world JSON ${locale}`,async({},info)=>{
  test.skip(info.project.name!=="chromium","Fresh MV3 runtime; shared controls also tested in Firefox");test.setTimeout(60000);
  const profiles=path.join(info.project.outputDir,"profiles");await mkdir(profiles,{recursive:true});
  const profile=await mkdtemp(path.join(profiles,"portrait-quality-")),extension=path.resolve(".output/chrome-mv3");
  const context=await chromium.launchPersistentContext(profile,{channel:"msedge",headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});context.setDefaultTimeout(10000);
  try{
    const worker=context.serviceWorkers()[0]??await context.waitForEvent("serviceworker");let requests=0;
    await context.route("https://chat.deepseek.com/**",route=>{
      if(route.request().url().includes("/api/")){if(route.request().method()==="POST")requests++;return route.fulfill({json:{}});}
      return route.fulfill({contentType:"text/html",body:'<!doctype html><html><head><title>Observatory</title><style>body{margin:0;background:#151a20;color:#edf3f7;font:15px system-ui}main{max-width:720px;margin:120px auto}</style></head><body><main><h1>Observatory</h1><article data-role="assistant"><div class="ds-markdown">Mira waits.</div></article><form><textarea aria-label="Message">Unsent draft.</textarea><button type="button">Send</button></form></main></body></html>'});
    });
    const panel=await context.newPage();await panel.setViewportSize({width:440,height:1000});await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);await expect(panel.locator(".onboarding")).toBeVisible();
    const rows=[["world",{id:"w",name:"Observatory",description:"UNCHANGED LORE",color:"#58a6ff",contextBudget:3000,relevanceThreshold:6,createdAt:1,updatedAt:1}],["entity",{id:"mira",worldId:"w",name:"Mira",kind:"character",description:"ORIGINAL PROFILE",aliases:[],memberIds:[],characterSheet:EMPTY_CHARACTER,createdAt:1,updatedAt:1}],["binding",{id:"binding:quality",chatId:"quality",chatUrl:"https://chat.deepseek.com/a/chat/s/quality",worldId:"w",bookId:null,messageCountAtAnalysis:0,createdAt:1,updatedAt:1}]];
    await panel.evaluate(async({rows,locale})=>{
      await new Promise<void>((resolve,reject)=>{const open=indexedDB.open("deeprole");open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction("records","readwrite");for(const[kind,data]of rows)tx.objectStore("records").put({kind,id:data.id,pk:kind+":"+data.id,data,updatedAt:1});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
      await(window as any).chrome.storage.local.set({deeprole_settings:{locale,onboardingComplete:true,characterSheetsEnabled:true}});
    },{rows:rows as Array<[string,any]>,locale});
    await panel.reload();await panel.getByRole("button",{name:locale==="ru"?"Настройки":"Settings",exact:true}).click();await panel.getByRole("button",{name:locale==="ru"?"Оформление":"Appearance",exact:true}).click();
    const quality=panel.locator(".settings-card").filter({hasText:portraitUploadText(locale,"title")});await expect(quality.getByRole("spinbutton")).toHaveValue("1920");await quality.getByRole("spinbutton").fill("1280");await quality.getByRole("button",{name:portraitUploadText(locale,"save"),exact:true}).click();await expect(quality.getByRole("status")).toContainText(portraitUploadText(locale,"saved"));await quality.screenshot({path:info.outputPath(`quality-installed-${locale}.png`)});
    await panel.reload();expect(await panel.evaluate(async()=>((await(window as any).chrome.storage.local.get("deeprole_settings")).deeprole_settings.portraitMaxEdge))).toBe(1280);
    const source=await panel.evaluate(()=>{const canvas=document.createElement("canvas");canvas.width=1200;canvas.height=1800;const ctx=canvas.getContext("2d")!;ctx.fillStyle="#759aaa";ctx.fillRect(0,0,1200,1800);ctx.fillStyle="#182630";ctx.fillRect(300,400,600,900);return canvas.toDataURL("image/png").split(",")[1]!;});
    const chat=await context.newPage();await chat.goto("https://chat.deepseek.com/a/chat/s/quality");const editor=chat.locator(".dr-character-dialog");
    await chat.locator(".dr-character-row").filter({hasText:"Mira"}).click();await characterTab(editor,"images",locale);const library=editor.locator(".dr-portrait-library");
    await library.locator("input[type=file]").setInputFiles({name:"portrait.png",mimeType:"image/png",buffer:Buffer.from(source,"base64")});await expect(library.locator(".dr-library-image")).toHaveCount(1);
    await editor.getByRole("button",{name:locale==="ru"?"Сохранить персонажа":"Save character",exact:true}).click();await closeSavedCharacter(editor,locale);await expect(chat.getByRole("textbox",{name:"Message"})).toHaveValue("Unsent draft.");
    await panel.getByRole("button",{name:locale==="ru"?"Настройки":"Settings",exact:true}).click();await panel.getByRole("button",{name:locale==="ru"?"Файлы и защита":"Files & security",exact:true}).click();await panel.getByRole("button",{name:locale==="ru"?"Экспорт":"Export",exact:true}).click();
    const exportDialog=panel.getByRole("dialog",{name:locale==="ru"?"Экспорт":"Export",exact:true});await exportDialog.getByRole("radio",{name:locale==="ru"?/^Этот мир/:/^This world/}).check();
    const event=panel.waitForEvent("download");await exportDialog.getByRole("button",{name:locale==="ru"?"Скачать файл":"Download file",exact:true}).click();const file=await(await event).path();if(!file)throw Error("missing download");
    const json=JSON.parse(await readFile(file,"utf8"));expect(json.format).toBe("deeprole-world");const person=json.records.find((row:any)=>row.kind==="entity").data;expect(person.description).toBe("ORIGINAL PROFILE");const saved=person.characterSheet.portraitLibrary[0];
    expect(await panel.evaluate(async src=>{const img=new Image();img.src=src;await img.decode();return[img.naturalWidth,img.naturalHeight];},saved)).toEqual([853,1280]);expect(json.records.find((row:any)=>row.kind==="world").data.description).toBe("UNCHANGED LORE");expect(requests).toBe(0);
  }finally{await context.close();}
});
