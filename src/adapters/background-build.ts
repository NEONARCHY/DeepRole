import { browser } from "wxt/browser";
import type { DeepRoleMessage } from "../core/messages";
import { startupDeadline } from "../core/startup";

export async function readBackgroundBuild(): Promise<string> {
  const reply = await startupDeadline(browser.runtime.sendMessage({ type: "DR_PING" } satisfies DeepRoleMessage), 4000).catch(() => null);
  if (!reply?.ok || typeof reply.build !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(reply.build)) throw Error("handoff-background-unavailable");
  return reply.build;
}

export async function requireMatchingBackground() {
  if (await readBackgroundBuild() !== import.meta.env.VITE_BUILD_TIME) throw Error("handoff-build-mismatch");
}
