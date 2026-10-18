import { defineConfig } from "@playwright/test";

const port = Number(process.env.DEEPROLE_E2E_PORT ?? 4173);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  projects: [
    { name: "chromium", use: { browserName: "chromium", channel: "msedge" } },
    { name: "firefox", use: { browserName: "firefox" } },
  ],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/tests/fixtures/deepseek.html`,
    reuseExistingServer: true,
  },
});
