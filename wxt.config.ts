import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  // WXT defaults Firefox to MV2, which drops optional_host_permissions.
  // Both targets use MV3; Firefox's minimum remains 128 for optional host access.
  manifestVersion: 3,
  modules: ["@wxt-dev/module-react"],
  vite: () => ({ define: { "import.meta.env.VITE_BUILD_TIME": JSON.stringify(new Date().toISOString()) } }),
  zip: {
    excludeSources: ["coverage/**", "test-results/**", "test-results-*/**", "test-results-*.png", "playwright-report/**", "tests/**", ".lazyweb/**", "private-assets/**", "downloads/*.zip"],
  },
  manifest: ({ browser }) => ({
    name: "__MSG_extName__",
    short_name: "DeepRole",
    description: "__MSG_extDescription__",
    default_locale: "en",
    version: "0.1.0",
    icons: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
      128: "icons/icon-128.png",
    },
    permissions: [
      "storage",
      "contextMenus",
      ...(browser === "chrome" ? ["sidePanel"] : []),
    ],
    host_permissions: ["https://chat.deepseek.com/*"],
    // Firefox 128+ supports MV3 optional_host_permissions. No static API hosts.
    optional_host_permissions: ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"],
    action: {
      default_title: "Open DeepRole",
      default_icon: {
        16: "icons/icon-16.png",
        32: "icons/icon-32.png",
      },
    },
    ...(browser === "chrome"
      ? { side_panel: { default_path: "sidepanel.html" } }
      : {
          sidebar_action: {
            default_title: "DeepRole",
            default_panel: "sidepanel.html",
          },
          browser_specific_settings: {
            gecko: {
              id: "deeprole@local",
              strict_min_version: "128.0",
              data_collection_permissions: {
                required: ["none"],
              },
            },
          },
        }),
    web_accessible_resources: [
      {
        resources: ["injected.js", "sidepanel.html"],
        matches: ["https://chat.deepseek.com/*"],
      },
    ],
  }),
});
