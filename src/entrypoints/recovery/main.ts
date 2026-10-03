import { browser } from "wxt/browser";
import { startupDeadline } from "../../core/startup";
import { recoveryCopy } from "../../core/recovery-i18n";
import type { DeepRoleMessage } from "../../core/messages";
import "../sidepanel/styles.css";

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
  async function ping() {
    check.disabled = true;
    status.textContent = copy.checking;
    try {
      const response = await startupDeadline(browser.runtime.sendMessage({ type: "DR_PING" } satisfies DeepRoleMessage), 4000);
      status.textContent = response?.ok && typeof response.build === "string" ? copy.ready : copy.failed;
      status.dataset.result = response?.ok && typeof response.build === "string" ? "ready" : "failed";
    } catch { status.textContent = copy.failed; status.dataset.result = "failed"; }
    finally { check.disabled = false; }
  }
  check.onclick = () => void ping();
  await ping();
}
void start();
