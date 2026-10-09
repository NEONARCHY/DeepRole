import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const topics = ["choices", "portraits", "images", "emotions", "relationships", "new-world", "characteristics", "progress", "map", "memory", "review", "settings", "continuation", "warning", "recovery", "quality", "library-large", "zoom"];
const pages = [{ locale: "en", file: "README.md" }, { locale: "ru", file: "docs/README.ru.md" }] as const;

describe("published bilingual feature pages", () => {
  for (const { locale, file } of pages) {
    const filename = resolve(file), markdown = readFileSync(filename, "utf8");

    it(`${locale} has a complete, locale-matched current gallery`, () => {
      const images = [...markdown.matchAll(/<img\s+[^>]*src="([^"]+)"[^>]*>/gu)]
        .filter(match => match[1]!.includes("images/readme/"));
      expect(images).toHaveLength(topics.length);
      expect(images.map(match => match[1]!.split("/").at(-1)).sort()).toEqual(topics.map(topic => `${topic}-${locale}.png`).sort());
      for (const match of images) {
        const tag = match[0], source = match[1]!;
        expect(tag).toMatch(/alt="[^"]+"/u);
        const displayWidth = Number(tag.match(/width="(\d+)"/u)?.[1]);
        expect(displayWidth).toBeGreaterThanOrEqual(260);
        expect(displayWidth).toBeLessThanOrEqual(900);
        const bytes = readFileSync(resolve(dirname(filename), source));
        expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
        expect(bytes.length).toBeLessThan(200_000);
        expect(bytes.readUInt32BE(16)).toBeLessThanOrEqual(1400);
        expect(bytes.readUInt32BE(20)).toBeLessThanOrEqual(source.includes("library-large-") ? 1100 : 1000);
      }
    });

    it(`${locale} local links and image references exist`, () => {
      const references = [
        ...[...markdown.matchAll(/\]\(([^)]+)\)/gu)].map(match => match[1]!),
        ...[...markdown.matchAll(/(?:href|src)="([^"]+)"/gu)].map(match => match[1]!),
      ];
      for (const reference of references) {
        if (/^(?:https?:|#)/u.test(reference)) continue;
        const path = reference.split(/[?#]/u)[0]!;
        expect(existsSync(resolve(dirname(filename), path)), reference).toBe(true);
      }
    });
  }

  it("keeps credits explicit and memory approval distinct from played progress", () => {
    for (const { file } of pages) {
      const markdown = readFileSync(resolve(file), "utf8");
      expect([...markdown.matchAll(/Better Deepseek \(BDS\)/gu)]).toHaveLength(2);
      expect([...markdown.matchAll(/\[Better Deepseek \(BDS\)\]\(https:\/\/github\.com\/EdgeTypE\/better-deepseek\)/gu)]).toHaveLength(2);
      expect(markdown).toContain("0–100");
      expect(markdown).toContain("90%");
      expect(markdown).toContain("97%");
      expect(markdown).toContain("200");
      expect(markdown).toContain("360");
    }
    expect(readFileSync("README.md", "utf8")).toContain("saved only after you review and approve");
    expect(readFileSync("docs/README.ru.md", "utf8")).toContain("после вашей проверки и подтверждения");
  });
  it("describes automatic recovery delivery, its transfer limit and the distinction from rewriting old turns", () => {
    const en = readFileSync("README.md", "utf8"), ru = readFileSync("docs/README.ru.md", "utf8");
    expect(en).toContain("Restored · context sent"); expect(en).toContain("64,000 characters"); expect(en).toContain("original server reply is not rewritten");
    expect(ru).toContain("Восстановлено · контекст передан"); expect(ru).toContain("64 000 символов"); expect(ru).toContain("Исходный ответ на сервере не переписывается");
  });
  it("explains embedded world images, both image sources and non-secret API setup in both languages", () => {
    const en = readFileSync("README.md", "utf8"), ru = readFileSync("docs/README.ru.md", "utf8");
    expect(en).toContain("The pictures really travel inside the JSON"); expect(ru).toContain("Картинки действительно лежат внутри JSON");
    expect(en).toContain("API keys/connections are not included"); expect(ru).toContain("Ключи и подключения API не входят");
    for (const page of [en, ru]) {
      expect(page).toContain("https://api.venice.ai/api/v1"); expect(page).toContain("https://venice.ai/settings/api");
      expect(page).toContain("https://developers.openai.com/api/docs/guides/image-generation");
      expect(page).toContain("1920"); expect(page).toContain("4096"); expect(page).toContain("128×");
      expect(page).not.toContain("18+");
    }
  });
});
