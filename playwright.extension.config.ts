import {defineConfig} from '@playwright/test';

// These tests load the built MV3 extension and route synthetic DeepSeek pages.
// They do not need Vite. Keeping the dev server out avoids watching temporary
// browser profiles and rebuilding modules during a production-binary check.
export default defineConfig({
  testDir:'./tests/e2e',
  testMatch:['**/story-ooc-runtime.spec.ts','**/story-bracket-runtime.spec.ts','**/world-bracket-runtime.spec.ts','**/learning-runtime.spec.ts'],
  timeout:30000,
  fullyParallel:true,
  projects:[{name:'chromium',use:{browserName:'chromium',channel:'msedge'}}],
  use:{trace:'retain-on-failure'},
});
