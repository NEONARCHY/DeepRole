import { expect, test } from "@playwright/test";
import { syntheticHDPng } from "./helpers/hd-image";
import { characterTab } from "./character-helpers";

for (const locale of ["ru","en"] as const) for (const width of [320,1280]) {
  test(`custom upload quality and anchored wheel zoom ${locale} ${width}`,async({page},info)=>{
    await page.setViewportSize({width,height:900});await page.goto(`/tests/fixtures/portrait-quality.html?locale=${locale}`);
    const field=page.getByRole("spinbutton");await expect(field).toHaveValue("1920");
    await field.fill("4097");await expect(page.getByRole("alert")).toBeVisible();
    const save=page.getByRole("button",{name:locale==="ru"?"Сохранить качество":"Save image quality",exact:true});
    await expect(save).toBeDisabled();await field.fill("1280");await save.click();await expect(page.getByRole("status")).toContainText(locale==="ru"?"Сохранено":"Saved");
    await page.reload();await expect(field).toHaveValue("1280");
    const source=await page.evaluate(syntheticHDPng);
    const upload=async()=>page.evaluate(async src=>{const blob=await(await fetch(src)).blob();return(window as any).readPortrait(new File([blob],"hd.png",{type:"image/png"}));},source);
    const resized=await upload();expect(resized).not.toBe(source);
    expect(await page.evaluate(async src=>{const image=new Image();image.src=src;await image.decode();return[image.naturalWidth,image.naturalHeight];},resized)).toEqual([1280,720]);
    await field.fill("1920");await save.click();await expect(page.getByRole("status")).toContainText(locale==="ru"?"Сохранено":"Saved");
    const full=await upload();
    expect(await page.evaluate(async src=>{const image=new Image();image.src=src;await image.decode();return[image.naturalWidth,image.naturalHeight];},full)).toEqual([1920,1080]);
    // A lighter fitting original is kept byte-for-byte, including PNG alpha.
    expect(await page.evaluate(async()=>{const canvas=document.createElement("canvas");canvas.width=1920;canvas.height=1080;canvas.getContext("2d")!.fillRect(0,0,400,400);const src=canvas.toDataURL("image/png");return(await(window as any).readPortrait(new File([await(await fetch(src)).blob()],"light.png",{type:"image/png"})))===src;})).toBe(true);
    if(width===1280)await page.locator("#app section").screenshot({path:info.outputPath(`quality-${locale}.png`)});
    const viewSource=await page.evaluate(async()=>{
      const{silhouetteSource}=await import("/src/core/characters.ts" as string);
      const canvas=document.createElement("canvas");canvas.width=1920;canvas.height=1080;
      const ctx=canvas.getContext("2d")!,gradient=ctx.createLinearGradient(0,0,1920,1080);gradient.addColorStop(0,"#203c4c");gradient.addColorStop(1,"#141c24");ctx.fillStyle=gradient;ctx.fillRect(0,0,1920,1080);
      for(const[gender,x]of [["female",360],["male",1160]] as const){const image=new Image();image.src=silhouetteSource(gender);await image.decode();ctx.drawImage(image,x,200,400,640);}
      ctx.fillStyle="#a8c9d6";ctx.font="32px system-ui";ctx.fillText("DeepRole · demo portraits",72,92);return canvas.toDataURL("image/png");
    });
    await page.evaluate(src=>(window as any).openImage(src),viewSource);
    const viewer=page.locator("[data-deeprole-photo-viewer] dialog"),body=viewer.locator(".photo-body");
    await expect(viewer.locator("img")).toHaveJSProperty("naturalWidth",1920);
    const minimum=Number(await viewer.getAttribute("data-zoom"));expect(minimum).toBeLessThan(1);
    await body.hover();const before=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,-240);
    await expect.poll(async()=>Number(await viewer.getAttribute("data-zoom"))).toBeGreaterThan(minimum);
    expect(await page.evaluate(()=>scrollY)).toBe(before);
    await page.keyboard.press("0");await expect(viewer).toHaveAttribute("data-zoom","1");
    await page.keyboard.press("+");await expect(viewer).toHaveAttribute("data-zoom","1.25");
    const rect=await body.boundingBox();if(!rect)throw Error("missing viewport");
    const scrollBefore=await body.evaluate(el=>[el.scrollLeft,el.scrollTop]);
    await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2-60,rect.y+rect.height/2-40);await page.mouse.up();
    expect(await body.evaluate(el=>[el.scrollLeft,el.scrollTop])).not.toEqual(scrollBefore);
    for(let i=0;i<24;i++)await page.keyboard.press("+");
    await expect(viewer).toHaveAttribute("data-zoom","128");await expect(viewer.getByRole("button",{name:locale==="ru"?"Увеличить":"Zoom in",exact:true})).toBeDisabled();
    await page.keyboard.press("f");await expect(viewer).toHaveAttribute("data-zoom",String(minimum));
    await body.hover();await page.mouse.wheel(0,10000);await expect(viewer).toHaveAttribute("data-zoom",String(minimum));
    await expect(viewer.getByRole("button",{name:locale==="ru"?"Уменьшить":"Zoom out",exact:true})).toBeDisabled();
    expect(await viewer.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    if(width===1280){await page.setViewportSize({width:1024,height:800});await viewer.screenshot({path:info.outputPath(`zoom-${locale}.png`)});}
    await page.keyboard.press("Escape");await expect(viewer).toHaveCount(0);
  });
  test(`library preview size persists and view preserves selection ${locale} ${width}`,async({page},info)=>{
    await page.setViewportSize({width,height:1000});await page.goto(`/tests/fixtures/characters.html?locale=${locale}`);
    await page.waitForFunction(()=>!!(window as any).getCast);
    await page.evaluate(async()=>{
      const{silhouetteSource}=await import("/src/core/characters.ts" as string);const samples:string[]=[];
      for(const gender of ["female","male","neutral"]){const image=new Image();image.src=silhouetteSource(gender);await image.decode();const canvas=document.createElement("canvas");canvas.width=360;canvas.height=480;canvas.getContext("2d")!.drawImage(image,0,0,360,480);samples.push(canvas.toDataURL("image/png"));}
      const cast=(window as any).getCast();(window as any).setCast({entities:cast.entities.map((entity:any)=>entity.id==="mira"?{...entity,characterSheet:{...entity.characterSheet,portraitLibrary:samples}}:entity)});
    });
    const open=async()=>{await page.locator(".dr-character-row").filter({hasText:"Mira"}).click();await characterTab(page.locator(".dr-character-dialog"),"images",locale);};
    await open();const library=page.locator(".dr-portrait-library"),slider=library.getByRole("slider");
    await slider.focus();await slider.press("End");await expect(slider).toHaveValue("280");
    await expect.poll(()=>page.evaluate(async()=>((await(window as any).chrome.storage.local.get("deeprole_settings")).deeprole_settings?.portraitPreviewSize))).toBe(280);
    const selection=library.locator(".dr-library-image").first();await selection.click();await expect(selection).toHaveAttribute("aria-pressed","true");
    const trigger=library.locator(".dr-library-view").first();await trigger.click();const viewer=page.locator("[data-deeprole-photo-viewer] dialog");await expect(viewer).toBeVisible();await page.keyboard.press("Escape");await expect(trigger).toBeFocused();await expect(selection).toHaveAttribute("aria-pressed","true");
    if(width===1280){await page.setViewportSize({width,height:1500});await library.locator("header").scrollIntoViewIfNeeded();await library.screenshot({path:info.outputPath(`library-large-${locale}.png`)});}
    await page.keyboard.press("Escape");await open();await expect(slider).toHaveValue("280");
    expect(await library.evaluate(el=>{const box=el.getBoundingClientRect();return[...el.querySelectorAll("*")].filter(node=>node.getBoundingClientRect().right>box.right+1).map(node=>({tag:node.tagName,classes:node.className,width:node.getBoundingClientRect().width,container:box.width})).slice(0,12);})).toEqual([]);
  });
}
