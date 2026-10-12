import { expect, test } from "@playwright/test";
import { stat } from "node:fs/promises";

test("a 280 MiB library exports once and the downloaded file restores all 24 characters and assignments", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Run the large memory fixture once; bilingual flows also run in Firefox");
  test.setTimeout(180_000);
  await page.goto("/tests/fixtures/sidepanel.html?world");
  await expect(page.getByRole("button", { name: "Настройки", exact: true })).toBeVisible();
  const original = await page.evaluate(async () => {
    const { repository } = await import("/src/storage/repository.ts" as string);
    const { EMPTY_CHARACTER } = await import("/src/core/characters.ts" as string);
    const world = (await repository.list("world"))[0]!;
    const photos: string[] = [];
    // Opaque but valid storage fixtures: no user files, no image quality claims.
    for (let i=0;i<40;i++) photos.push(await repository.storePhoto("data:image/png;base64," + btoa(String(i).padStart(6,"0")) + "A".repeat(7*1024*1024)));
    for (let i=0;i<24;i++) await repository.put("entity", {
      id:"export-person-"+i, worldId:world.id, name:i===1?"Хлоя":"Персонаж "+i, kind:"character", description:"  Исходный лор\n", aliases:[], memberIds:[], createdAt:1, updatedAt:1,
      characterSheet:{...EMPTY_CHARACTER, sprites:i===1?{neutral:photos.slice(0,20),happy:photos.slice(20)}:{}, portraitLibrary:i===1?photos:[]},
    });
    const data = await repository.readPhoto(photos[0]!);
    let legacyFails=false;
    try { JSON.stringify({library:Array(80).fill(data)}); } catch(e) { legacyFails=e instanceof RangeError; }
    return { photos, legacyFails, records:await repository.rawRecords() };
  });
  expect(original.legacyFails).toBe(true);
  await page.getByRole("button", { name:"Настройки",exact:true }).click();
  await page.getByRole("button", { name:"Файлы и защита",exact:true }).click();
  await page.getByRole("button", { name:"Экспорт",exact:true }).click();
  const dialog=page.getByRole("dialog",{name:"Экспорт",exact:true});
  await dialog.getByRole("radio",{name:/^Полная резервная копия/}).check();
  const downloadEvent=page.waitForEvent("download",{timeout:90_000});
  await dialog.getByRole("button",{name:"Скачать файл",exact:true}).click();
  const downloaded=await downloadEvent,file=(await downloaded.path())!;
  expect(await downloaded.failure()).toBeNull();
  const size=(await stat(file)).size;
  expect(size).toBeGreaterThan(280*1024*1024);
  expect(size).toBeLessThan(281*1024*1024);
  await expect(dialog).toHaveCount(0);
  // Empty only this isolated fixture database; make restoration prove portability.
  await page.evaluate(async()=>{
    const { repository }=await import("/src/storage/repository.ts" as string);
    await repository.clear();
  });
  await page.getByRole("button",{name:"Лор",exact:true}).click();
  await page.getByRole("button",{name:"Загрузить готовый лор",exact:true}).click();
  await page.locator(".rp-import-input").setInputFiles(file);
  const preview=page.getByRole("dialog",{name:"Восстановление копии",exact:true});
  await expect(preview).toBeVisible({timeout:90_000});
  await preview.getByRole("button",{name:"Добавить недостающее",exact:true}).click();
  await expect(preview).toHaveCount(0,{timeout:90_000});
  const restored=await page.evaluate(async()=>{
    const { repository }=await import("/src/storage/repository.ts" as string);
    const { database }=await import("/src/storage/database.ts" as string);
    const { portablePhotoId }=await import("/src/core/portable-photos.ts" as string);
    const records=await repository.rawRecords(),p=records.find((r:any)=>r.id==="export-person-1")!.data;
    const verified:string[]=[];
    for(const id of p.characterSheet.portraitLibrary) verified.push(await portablePhotoId(await repository.readPhoto(id)));
    return {records,verified,photoCount:await database.photos.count()};
  });
  expect(restored.records).toEqual(original.records);
  expect(restored.verified).toEqual(original.photos);
  expect(restored.photoCount).toBe(40);
  await page.screenshot({path:info.outputPath("large-backup-restored.png")});
});
