import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  workers: 1,
  outputDir: "../.output/desktop-test-results",
});
