import { browser } from "wxt/browser";
import { startupDeadline } from "../../core/startup";
import { recoveryCopy } from "../../core/recovery-i18n";
import { readBackgroundBuild } from "../../adapters/background-build";
import "../sidepanel/styles.css";
import "../shared/workspace-appearance.css";
import "../shared/workspace-material.css";

async function start() {
  const saved = await startupDeadline(browser.storage.local.get("deeprole_settings"), 2000).catch(() => ({}));
  const configured = (saved as Record<string, { locale?: string }>).deeprole_settings?.locale;
  const locale = configured === "ru" || configured !== "en" && navigator.language.startsWith("ru") ? "ru" : "en";
  document.documentElement.lang = locale;
  const copy = recoveryCopy[locale];
  for (const key of ["title", "hint", "check", "library"] as const) document.getElementById(key)!.textContent = copy[key];
  document.getElementById("build")!.textContent = `${copy.build}: ${import.meta.env.VITE_BUILD_TIME}`;
  (document.getElementById("library") as HTMLAnchorElement).href = browser.runtime.getURL("/sidepanel.html");
  const status = document.getElementById("status")!;
  const check = document.getElementById("check") as HTMLButtonElement;
  const reload = document.getElementById("reload") as HTMLButtonElement;
  reload.textContent = copy.reload;
  reload.onclick = () => { if (status.dataset.result === "mismatch") browser.runtime.reload(); };
  async function ping() {
    check.disabled = true; reload.hidden = true;
    status.textContent = copy.checking;
    try {
      const version = await readBackgroundBuild();
      const result = version === import.meta.env.VITE_BUILD_TIME ? "ready" : "mismatch";
      status.textContent = copy[result];
      status.dataset.result = result;
      reload.hidden = result !== "mismatch";
      document.getElementById("background-build")!.textContent = `${copy.backgroundBuild}: ${version}`;
    } catch {
      status.textContent = copy.failed; status.dataset.result = "failed";
      document.getElementById("background-build")!.textContent = "";
    }
    finally { check.disabled = false; }
  }
  check.onclick = () => void ping();
  await ping();
}
void start();
