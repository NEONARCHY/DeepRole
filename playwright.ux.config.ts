import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Isolated server: never reuse a developer's stale preview for release UX QA.
export default defineConfig({
  ...base,
  testDir: "./tests/e2e",
  testMatch: [
    "accessibility.spec.ts", "backup-roundtrip.spec.ts", "character-ux.spec.ts",
    "character-update-notice.spec.ts", "export-dialog.spec.ts", "import-recovery.spec.ts",
    "worlds.spec.ts", "startup-runtime.spec.ts", "recovery-runtime.spec.ts", "reply-recovery-runtime.spec.ts",
    "story-memory-batch-ui.spec.ts", "story-automation.spec.ts", "story-memory-ui.spec.ts",
    "story-game-ui.spec.ts", "story-review.spec.ts", "world-reset-runtime.spec.ts",
    "settings-help.spec.ts", "settings-navigation-runtime.spec.ts", "sidepanel.spec.ts",
    "story-ux.spec.ts", "world-reset-ui.spec.ts", "large-export.spec.ts",
  ].map(name => `**/${name}`),
  workers: 2,
  // Firefox's parallel context teardown can race in this installed runtime.
  // Keep every assertion; run that browser's contexts one at a time.
  projects: base.projects?.map(project => project.name === "firefox" ? { ...project, workers: 1 } : project),
  outputDir: "test-results-ux",
  use: { ...base.use, baseURL: "http://127.0.0.1:4175" },
  webServer: {
    command: `"${process.execPath}" node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4175 --strictPort`,
    url: "http://127.0.0.1:4175/tests/fixtures/deepseek.html",
    reuseExistingServer: false,
  },
});
