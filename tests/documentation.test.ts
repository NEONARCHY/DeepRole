import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const topics = ["choices", "portraits", "images", "emotions", "relationships", "new-world", "characteristics", "progress", "map", "memory", "review", "settings", "continuation", "warning"];
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
        expect(bytes.readUInt32BE(20)).toBeLessThanOrEqual(1000);
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
});
