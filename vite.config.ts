import { defineConfig } from "vite";

// This server serves Playwright fixtures; WXT owns extension development/builds.
// Trace snapshots are HTML, but writing them must never reload other test pages.
export default defineConfig({
  server: { hmr: false, watch: { ignored: ["**/test-results*/**", "**/playwright-report/**", "**/.output/**", "**/downloads/**"] } },
});
