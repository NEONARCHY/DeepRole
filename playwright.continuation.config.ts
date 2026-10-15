import { defineConfig } from "@playwright/test";
import base from "./playwright.ux.config";

/** Full transfer and its established safeguards, with an isolated fresh server. */
export default defineConfig({
 ...base,
 testMatch: ["continuation-chain-runtime.spec.ts", "continuation-ui.spec.ts", "continuation-recap-runtime.spec.ts", "runtime-sync.spec.ts"].map(name=>`**/${name}`),
 grep: /full continuation chain|reviewed continuation|accepted transfer local-save notice|installed compact continuation|continuation stages/,
 outputDir: "test-results-continuation",
});
