import {expect,test} from "@playwright/test";
for(const locale of ["ru","en"])for(const width of [320,1100])test("reviews cast in "+locale+" at "+width+"px",async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto("/tests/fixtures/cast.html?locale="+locale);const text=(ru:string,en:string)=>locale==="ru"?ru:en;
 await page.getByRole("button",{name:text("Проверить персонажей","Review characters"),exact:true}).click();
 const dialog=page.getByRole("dialog",{name:text("Персонажи из лора","Characters from lore"),exact:true});await expect(dialog).toBeVisible();
 expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(dialog.getByRole("radio",{name:text("Главный герой","Protagonist")}).first()).toBeChecked();
 await dialog.getByRole("spinbutton",{name:text("Доверие: Mira","Trust: Mira"),exact:true}).fill("88");
 const members=dialog.locator(".dr-cast-member");await members.nth(1).getByText(text("Проверить персонажей","Review characters"),{exact:true}).click();
 await expect(dialog.getByRole("textbox",{name:text("Внешность: Mira","Appearance: Mira"),exact:true})).toHaveValue("Blue coat");
 await dialog.getByRole("textbox",{name:text("Внешность: Mira","Appearance: Mira"),exact:true}).fill("Green coat");
 await page.screenshot({path:test.info().outputPath("cast-review.png"),fullPage:true});
 await dialog.getByRole("button",{name:text("Сохранить выбранных · 2","Save selected · 2"),exact:true}).click();await expect(dialog).not.toBeVisible();
 const people=await page.evaluate(()=>(window as any).saved);expect(people).toHaveLength(2);const mira=people.find((e:any)=>e.name==="Mira");expect(mira.characterSheet.appearance).toBe("Green coat");expect(mira.characterSheet.relationships.initial.trust).toBe(88);
});
test("requires a selected protagonist and returns focus on closing",async({page})=>{
 await page.goto("/tests/fixtures/cast.html");const trigger=page.getByRole("button",{name:"Проверить персонажей",exact:true});await trigger.click();const dialog=page.getByRole("dialog");await dialog.getByRole("checkbox",{name:"Добавить: Leon",exact:true}).uncheck();await expect(dialog.getByRole("button",{name:"Сохранить выбранных · 1",exact:true})).toBeDisabled();await page.keyboard.press("Escape");await expect(trigger).toBeFocused();
});
