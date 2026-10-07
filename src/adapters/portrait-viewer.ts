import { validPortrait } from "../core/portrait-variations";
import type { Locale } from "../core/types";
import designTokens from "../entrypoints/shared/design-tokens.css?raw";
import style from "./portrait-viewer.css?raw";

const viewers = new WeakMap<Document, HTMLDialogElement>();
export const photoCopy = (locale: Locale) => ({
  ru: { open: "Открыть изображение", close: "Закрыть изображение", actual: "Масштаб 100%", fit: "Вписать в окно", selfie: "Селфи", waiting: "Получаем фото…", missing: "Это фото удалено из подборки" },
  en: { open: "Open image", close: "Close image", actual: "100% zoom", fit: "Fit to window", selfie: "Selfie", waiting: "Receiving photo…", missing: "This photo was removed from the collection" },
}[locale]);
export function closePortraitViewer(doc: Document = document): void { viewers.get(doc)?.close(); }
export function openPortraitViewer(doc: Document, src: string, title: string, locale: Locale): boolean {
  if (!validPortrait(src)) return false;
  closePortraitViewer(doc);
  let origin = doc.activeElement as HTMLElement | null;
  while (origin?.shadowRoot?.activeElement) origin = origin.shadowRoot.activeElement as HTMLElement;
  const host = doc.createElement("div"); host.dataset.deeprolePhotoViewer = "true";
  const shadow = host.attachShadow({ mode: "open" }); const css = doc.createElement("style"); css.textContent = designTokens + style;
  const dialog = doc.createElement("dialog"); dialog.setAttribute("aria-label", title || photoCopy(locale).open);
  const header = doc.createElement("header"); const name = doc.createElement("strong"); name.textContent = title;
  const size = doc.createElement("button"); size.type = "button"; size.textContent = photoCopy(locale).actual; size.setAttribute("aria-pressed", "false");
  const close = doc.createElement("button"); close.type = "button"; close.textContent = "×"; close.setAttribute("aria-label", photoCopy(locale).close);
  const body = doc.createElement("div"); body.className = "photo-body";
  const image = doc.createElement("img"); image.src = src; image.alt = title; image.draggable = false;
  body.append(image); header.append(name, size, close); dialog.append(header, body); shadow.append(css, dialog); doc.body.append(host);
  viewers.set(doc, dialog);
  close.onclick = () => dialog.close();
  size.onclick = () => { const actual = dialog.dataset.actual !== "true"; dialog.dataset.actual = String(actual); size.textContent = photoCopy(locale)[actual ? "fit" : "actual"]; size.setAttribute("aria-pressed", String(actual)); body.scrollTop = body.scrollLeft = 0; };
  dialog.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dialog.close(); } });
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => { if (viewers.get(doc) === dialog) viewers.delete(doc); host.remove(); if (origin?.isConnected) origin.focus({ preventScroll: true }); }, { once: true });
  dialog.showModal(); close.focus({ preventScroll: true }); return true;
}
