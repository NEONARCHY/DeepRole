import {expect,test} from "@playwright/test";
for(const locale of ["ru","en"])for(const width of [320,1100])test(`cast notices ${locale} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto(`/tests/fixtures/cast.html?locale=${locale}&notices=1`);
 await page.locator('.dr-cast-review-ready').click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 await expect(dialog).not.toContainText(locale==='ru'?'ещё не подготовлена':'not yet prepared');
 const review=dialog.locator('.dr-cast-review-notices');await expect(review).toContainText(locale==='ru'?'Возраст персонажа неоднозначен':'Character age is ambiguous');
 const notes=dialog.locator('.dr-cast-notes');await expect(notes.locator('summary')).toHaveText((locale==='ru'?'Пояснения по лору':'Lore notes')+' · 2');
 await expect(notes.locator('li').first()).not.toBeVisible();await notes.locator('summary').click();await expect(notes.locator('li')).toHaveCount(2);
 await expect(notes.locator('.dr-cast-warning')).toHaveCount(0);await expect(review.locator('.dr-cast-warning')).toHaveCount(1);
 await page.screenshot({path:test.info().outputPath(`notices-${locale}-${width}.png`)});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
