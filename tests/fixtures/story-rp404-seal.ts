import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const hashFile = (file: string) => digest(readFileSync(file, "utf8").replaceAll("\r\n", "\n"));
function runtimeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const file = join(dir, e.name).replaceAll("\\", "/");
    return e.isDirectory() ? runtimeFiles(file) : /\.tsx?$/.test(e.name) ? [file] : [];
  });
}
export function seals() {
  const evaluationFiles = [
    "tests/fixtures/story-rp404-corpus.ts", "tests/fixtures/story-rp404-expectations.ts",
    "tests/fixtures/story-rp404-history.ts", "tests/fixtures/story-rp404-seal.ts",
    "tests/fixtures/story-worlds.ts", "tests/fixtures/story-persisted-evidence.ts",
    "tests/story-rp404.audit.ts", "tests/setup.ts", "vitest.config.ts", "vitest.rp404.config.ts", "package-lock.json",
  ];
  return {
    files: Object.fromEntries(evaluationFiles.map(file => [file, hashFile(file)])),
    runtimeSha256: digest(JSON.stringify(runtimeFiles("src").sort().map(file => [file, hashFile(file)]))),
  };
}
