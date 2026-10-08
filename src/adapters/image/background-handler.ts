import { browser } from "wxt/browser";
import type { ImageMessage } from "../../core/image-messages";
import { ImageJobs, validImageTarget, validImageJob } from "../../storage/image-jobs";
import { isSameDeepSeekChat } from "../../core/chat-scope";
import { ImageApiError } from "./transport";
import { imageWorkerOperation } from "./worker-operation";
const jobs = new ImageJobs();
type ImageSender = { id?: string; url?: string; tab?: { id?: number } };
export function imageSenderAllowed(sender: ImageSender, runtimeId: string, extensionUrl: string, models: boolean): boolean {
  if (sender.id !== runtimeId || !sender.url) return false;
  const ui = sender.url.startsWith(extensionUrl) && ["/sidepanel.html", "/image-permission.html"].includes(new URL(sender.url).pathname);
  return models ? ui : ui || !!sender.tab?.id && sender.url.startsWith("https://chat.deepseek.com/");
}
export async function handleImageMessage(message: ImageMessage, sender: ImageSender) {
  if (!imageSenderAllowed(sender, browser.runtime.id, browser.runtime.getURL("/"), message.type === "DR_IMAGE_MODELS")) return { ok: false, error: "forbidden" };
  try {
    if (message.type === "DR_IMAGE_OPEN_DOWNLOAD") { await jobs.ticket(message.ticketId); await browser.tabs.create({ url: browser.runtime.getURL("/image-permission.html") + "?ticket=" + encodeURIComponent(message.ticketId) }); return { ok: true }; }
    if (message.type === "DR_IMAGE_TICKET" || message.type === "DR_IMAGE_DOWNLOAD") {
      if (!imageSenderAllowed(sender, browser.runtime.id, browser.runtime.getURL("/"), true)) throw new ImageApiError("forbidden");
      if (message.type === "DR_IMAGE_DOWNLOAD") return { ok: true, illustration: await imageWorkerOperation(() => jobs.download(message.ticketId)) };
      return { ok: true, origin: new URL((await jobs.ticket(message.ticketId)).url).origin };
    }
    if (message.type === "DR_IMAGE_MODELS") return { ok: true, models: await imageWorkerOperation(() => jobs.models(message.profile)) };
    const target = message.type === "DR_IMAGE_GENERATE" ? message.input : message.target;
    if (!validImageTarget(target) || !sender.tab?.id) throw new ImageApiError("changed");
    const tab = await browser.tabs.get(sender.tab.id);
    if (!tab.url || !isSameDeepSeekChat(target.chatUrl, tab.url, target.chatId)) throw new ImageApiError("changed");
    if (message.type === "DR_IMAGE_GENERATE") { if (!validImageJob(message.input)) throw new ImageApiError("invalid"); return { ok: true, illustration: await imageWorkerOperation(() => jobs.run(message.input)) }; }
    if (message.type === "DR_IMAGE_START") return { ok: true, attempt: await jobs.start(target) };
    if (message.type === "DR_IMAGE_RENDER") return { ok: true, illustration: await imageWorkerOperation(() => jobs.render(target, message.id, message.plan)) };
    if (message.type === "DR_IMAGE_REPEAT") return { ok: true, illustration: await imageWorkerOperation(() => jobs.repeat(target, message.id, message.attempt === true)) };
    if (message.type === "DR_IMAGE_FAIL") { await jobs.fail(target, message.id, { code: message.error }); return { ok: true }; }
    if (message.type === "DR_IMAGE_SELFIE") return { ok: true, illustration: await imageWorkerOperation(() => jobs.selfie(target, message.entityId, message.turnKey, message.retry === true)) };
    if (message.type === "DR_IMAGE_REMOVE") await jobs.remove(target, message.id);
    else if (message.type === "DR_IMAGE_PROFILE") await jobs.saveProfile(target, message.entityId, message.profile, message.expected);
    else throw new ImageApiError("unsupported");
    return { ok: true };
  } catch (error) {
    // Never echo raw exceptions, API bodies, headers other than the declared diagnostics, or keys.
    return error instanceof ImageApiError ? { ok: false, error: error.code, headers: error.headers, ...(error.ticketId ? { ticketId: error.ticketId, downloadOrigin: error.downloadUrl } : {}) } : { ok: false, error: "failed" };
  }
}
