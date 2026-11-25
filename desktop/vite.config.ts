import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here("./"),
  publicDir: here("../public"),
  plugins: [react()],
  define: {
    __DEEPROLE_DESKTOP__: "true",
    "import.meta.env.VITE_BUILD_TIME": JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: [
      { find: "wxt/browser", replacement: here("./runtime/browser.ts") },
      { find: "wxt/utils/inject-script", replacement: here("./runtime/inject-script.ts") },
      { find: "wxt/utils/content-script-ui/shadow-root", replacement: here("./runtime/shadow-root.ts") },
    ],
  },
  build: {
    outDir: here("../.output/desktop-web"),
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(["index", "background", "sidepanel", "image-permission", "recovery"].map(name => [name, here(`./${name}.html`)])),
    },
  },
});
