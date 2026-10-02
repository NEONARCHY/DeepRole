import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = pathToFileURL(join(root, "assets", "icon-source.html")).href;
const output = join(root, "public", "icons");
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ channel: process.platform === "win32" ? "msedge" : undefined });
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.goto(source);
  await page.screenshot({ path: join(output, `icon-${size}.png`), omitBackground: true });
}
await browser.close();
