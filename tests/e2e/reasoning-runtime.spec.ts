import { chromium, expect, test } from "@playwright/test";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";

for (const locale of ["ru", "en"] as const) test("installed appearance preference updates native reasoning without requests " + locale, async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Installed MV3 runtime; shared DOM tested in Firefox separately"); test.setTimeout(60000);
  const profiles = path.join(info.project.outputDir, "profiles"); await mkdir(profiles, { recursive: true });
  const directory = await mkdtemp(path.join(profiles, "thoughts-")), extension = path.resolve(".output/chrome-mv3");
  const context = await chromium.launchPersistentContext(directory, { channel: "msedge", headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  context.setDefaultTimeout(10000);
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    await worker.evaluate(locale => (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true } }), locale);
    let requests = 0;
    await context.route("https://chat.deepseek.com/**", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><title>Thoughts demo</title><style>body{background:#151a20;color:#edf3f7;font:15px/1.7 system-ui}main{max-width:660px;margin:100px auto}.ds-think-content-wrapper{padding-left:16px;border-left:1px solid #485765;margin:16px 0}article{margin-bottom:20px}button,textarea{color:inherit;background:#28333e;border:1px solid #485765;border-radius:8px;padding:8px}textarea{box-sizing:border-box;width:100%}</style></head><body><main><header><h1>Observatory</h1></header><section id="conversation"></section><form><textarea aria-label="Message">Unsent draft.</textarea><button type="button" id="deepthink" aria-pressed="true">DeepThink</button><button type="button">Send</button></form></main><script>let modeClicks=0;document.querySelector("#deepthink").onclick=()=>modeClicks++;function makeRow(id){const row=document.createElement("article");row.dataset.role="assistant";row.dataset.messageId=id;row.id=id;row.innerHTML=\'<button type="button" class="thought-heading" aria-expanded="true">Thought for 2 seconds</button><div class="ds-think-content-wrapper"><div class="ds-think-content">Private test thoughts about the observatory.</div></div><div class="ds-assistant-message-main-content ds-markdown">Mira opens the observatory.</div>\';const head=row.querySelector("button"),body=row.querySelector(".ds-think-content-wrapper");head.onclick=()=>{const open=head.getAttribute("aria-expanded")!=="true";head.setAttribute("aria-expanded",String(open));body.style.display=open?"block":"none";};return row;}document.querySelector("#conversation").append(makeRow("thoughts-one"));window.nativeThoughts={replace:()=>document.querySelector("#thoughts-one").replaceWith(makeRow("thoughts-one")),stream:()=>document.querySelector("#thoughts-one .ds-think-content").append(" More streamed thoughts."),add:()=>document.querySelector("#conversation").append(makeRow("thoughts-two")),modeClicks:()=>modeClicks};</script></body></html>' }));
    await context.route("**/api/v0/chat/completion", route => { requests++; return route.fulfill({ json: {} }); });
    const panel = await context.newPage(); await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`); await panel.setViewportSize({ width: 360, height: 950 });
    const chat = await context.newPage(); await chat.setViewportSize({ width: 1280, height: 950 }); await chat.goto("https://chat.deepseek.com/a/chat/thoughts-runtime");
    const header = chat.locator("#thoughts-one .thought-heading"), body = chat.locator("#thoughts-one .ds-think-content-wrapper");
    await expect(header).toHaveAttribute("aria-expanded", "false"); await expect(body).toBeHidden(); await expect(chat.locator(".ds-markdown")).toBeVisible();
    expect(await body.textContent()).toContain("Private test thoughts"); await expect(chat.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("Unsent draft.");
    await header.click(); await expect(body).toBeVisible(); await chat.evaluate(() => (window as any).nativeThoughts.stream()); await expect(body).toBeVisible();
    await chat.evaluate(() => (window as any).nativeThoughts.replace()); await expect(body).toBeVisible();
    await chat.evaluate(() => (window as any).nativeThoughts.add()); await expect(chat.locator("#thoughts-two .ds-think-content-wrapper")).toBeHidden();
    await panel.getByRole("button", { name: locale === "ru" ? "Настройки" : "Settings", exact: true }).click();
    await panel.getByRole("button", { name: locale === "ru" ? "Оформление" : "Appearance", exact: true }).click();
    const toggle = panel.getByRole("checkbox", { name: locale === "ru" ? "Показывать размышления автоматически" : "Show thoughts automatically", exact: true });
    await expect(toggle).not.toBeChecked(); await panel.screenshot({ path: info.outputPath("installed-appearance.png") });
    await toggle.check(); await expect(chat.locator("#thoughts-two .ds-think-content-wrapper")).toBeVisible();
    await chat.reload(); await expect(header).toHaveAttribute("aria-expanded", "true"); await expect(body).toBeVisible();
    await panel.reload(); await panel.getByRole("button", { name: locale === "ru" ? "Настройки" : "Settings", exact: true }).click(); await panel.getByRole("button", { name: locale === "ru" ? "Оформление" : "Appearance", exact: true }).click(); await expect(toggle).toBeChecked();
    await toggle.uncheck(); await expect(body).toBeHidden(); await expect(header).toHaveAttribute("aria-expanded", "false");
    await expect(chat.locator("#deepthink")).toHaveAttribute("aria-pressed", "true"); expect(await chat.evaluate(() => (window as any).nativeThoughts.modeClicks())).toBe(0); expect(requests).toBe(0);
    await expect(chat.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("Unsent draft.");
    await chat.screenshot({ path: info.outputPath("installed-folded-thoughts.png") });
  } finally { await context.close(); }
});
