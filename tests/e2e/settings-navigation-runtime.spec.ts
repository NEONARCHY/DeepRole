import { chromium, expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { navigationText } from "../../src/core/navigation-i18n";

for (const locale of ["ru", "en"] as const) for (const width of [320,900]) test(`installed settings ${locale} ${width}: routes, keyboard, scope and accessibility`, async ({},info) => {
  test.skip(info.project.name !== "chromium", "Installed Chrome MV3 build only; Firefox coverage not claimed");
  await mkdir(path.join(info.project.outputDir,"profiles"),{recursive:true});
  const profile = await mkdtemp(path.join(info.project.outputDir,"profiles","settings-"));
  const extension = path.resolve(".output/chrome-mv3");
  const context = await chromium.launchPersistentContext(profile,{channel:"msedge",headless:true,viewport:{width,height:1000},args:[`--load-extension=${extension}`,`--disable-extensions-except=${extension}`]});
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    await worker.evaluate(locale => (globalThis as any).chrome.storage.local.set({deeprole_settings:{locale,onboardingComplete:true}}),locale);
    const before = await worker.evaluate(() => (globalThis as any).chrome.storage.local.get("deeprole_settings"));
    const page = await context.newPage(); const errors:string[]=[]; page.on("pageerror",error=>errors.push(error.message));
    await page.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);
    const nav=page.locator(".bottom-nav");
    for(const key of ["play","worlds","story","settings"] as const) await expect(nav.getByRole("button",{name:navigationText(locale,key),exact:true})).toBeVisible({timeout:12000});
    await nav.getByRole("button",{name:navigationText(locale,"settings"),exact:true}).click();
    const directory=page.locator(".dr-settings-directory");
    await expect(directory.getByText(navigationText(locale,"intro"))).toBeVisible();
    await expect(directory.getByRole("button",{name:navigationText(locale,"memory"),exact:true})).not.toBeVisible();
    await page.screenshot({path:info.outputPath(`settings-home-${locale}-${width}.png`),fullPage:true,animations:"disabled"});
    expect((await new AxeBuilder({page}).include(".dr-settings-directory").withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
    for(const section of ["app","appearance","characters","images","safety","data","memory","diagnostics"] as const) {
      if(section==="memory" || section==="diagnostics") {
        await directory.getByText(navigationText(locale,"advanced"),{exact:true}).focus(); await page.keyboard.press("Enter");
        if(section==="diagnostics") { await directory.getByText(navigationText(locale,"support"),{exact:true}).focus(); await page.keyboard.press("Enter"); }
      }
      const route=directory.getByRole("button",{name:navigationText(locale,section),exact:true});
      await route.focus();await page.keyboard.press("Enter");
      const heading=directory.getByRole("heading",{name:navigationText(locale,section),exact:true});
      await expect(heading).toBeFocused();
      await expect(page.locator(".dr-settings-page:visible")).not.toHaveCount(0);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      if(section==="memory") {
        await expect(directory.getByText(navigationText(locale,"memoryNotice"))).toBeVisible();
        await page.locator(".settings-form input[type=number]").fill("3333");
        await page.screenshot({path:info.outputPath(`settings-memory-${locale}-${width}.png`),fullPage:true,animations:"disabled"});
      }
      if(section==="data") await expect(page.locator(".dr-service-diagnostics")).not.toBeVisible();
      await directory.getByRole("button",{name:navigationText(locale,"back"),exact:true}).click();
      await expect(directory.getByRole("heading",{name:navigationText(locale,"back"),exact:true})).toBeFocused();
    }
    await directory.getByText(navigationText(locale,"advanced"),{exact:true}).click();
    await directory.getByRole("button",{name:navigationText(locale,"memory"),exact:true}).click();
    await expect(page.locator(".settings-form input[type=number]")).toHaveValue("3333");
    await page.locator(".bottom-nav").getByRole("button",{name:navigationText(locale,"play"),exact:true}).click();
    await page.locator(".bottom-nav").getByRole("button",{name:navigationText(locale,"settings"),exact:true}).click();
    await expect(page.locator(".settings-form input[type=number]")).toHaveValue("3333");
    expect(await worker.evaluate(() => (globalThis as any).chrome.storage.local.get("deeprole_settings"))).toEqual(before);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
