import { browser } from "wxt/browser";
import { validImageBaseUrl } from "../core/image-generation";
export function imageOriginPattern(url: string): string { const u = new URL(url); if (!validImageBaseUrl(u.origin)) throw new Error("image-origin-invalid"); return `${u.protocol}//${u.hostname}/*`; }
export const hasImagePermission = (url: string) => browser.permissions.contains({ origins: [imageOriginPattern(url)] });
/** Call synchronously from an extension-page click so Firefox keeps the user gesture. */
export const requestImagePermission = (url: string) => browser.permissions.request({ origins: [imageOriginPattern(url)] });
