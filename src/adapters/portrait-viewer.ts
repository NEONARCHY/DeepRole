import { validGeneratedImage } from "../core/generated-images";
import { anchoredZoomScroll, clampImageZoom, fitImageZoom, MAX_IMAGE_ZOOM } from "../core/image-zoom";
import type { Locale } from "../core/types";
import designTokens from "../entrypoints/shared/design-tokens.css?raw";
import style from "./portrait-viewer.css?raw";

const viewers = new WeakMap<Document, HTMLDialogElement>();
export const photoCopy = (locale: Locale) => ({
  ru: { open: "Открыть изображение", close: "Закрыть изображение", actual: "Масштаб 100%", fit: "Вписать в окно", selfie: "Селфи", waiting: "Получаем фото…", missing: "Это фото удалено из подборки", zoomIn: "Увеличить", zoomOut: "Уменьшить", zoom: "Масштаб", hint: "Колёсико или +/−: зум до 128×. Тяните картинку для перемещения. 0: 100%, F: вписать, Esc: закрыть. Детализация зависит от исходника." },
  en: { open: "Open image", close: "Close image", actual: "100% zoom", fit: "Fit to window", selfie: "Selfie", waiting: "Receiving photo…", missing: "This photo was removed from the collection", zoomIn: "Zoom in", zoomOut: "Zoom out", zoom: "Zoom", hint: "Wheel or +/−: zoom up to 128×. Drag to pan. 0: 100%, F: fit, Esc: close. Detail depends on the source image." },
}[locale]);
export function closePortraitViewer(doc: Document = document): void { viewers.get(doc)?.close(); }
export function openPortraitViewer(doc: Document, src: string, title: string, locale: Locale): boolean {
  if (!validGeneratedImage(src)) return false;
  closePortraitViewer(doc);
  const win = doc.defaultView; if (!win) return false;
  const copy = photoCopy(locale);
  let origin = doc.activeElement as HTMLElement | null;
  while (origin?.shadowRoot?.activeElement) origin = origin.shadowRoot.activeElement as HTMLElement;
  const host = doc.createElement("div"); host.dataset.deeprolePhotoViewer = "true";
  const shadow = host.attachShadow({ mode: "open" }); const css = doc.createElement("style"); css.textContent = designTokens + style;
  const dialog = doc.createElement("dialog"); dialog.setAttribute("aria-label", title || copy.open);
  const button = (text: string, label?: string) => { const el = doc.createElement("button"); el.type = "button"; el.textContent = text; if (label) { el.setAttribute("aria-label", label); el.title = label; } return el; };
  const header = doc.createElement("header"), name = doc.createElement("strong"); name.textContent = title;
  const close = button("×", copy.close); close.className = "photo-close"; header.append(name, close);
  const body = doc.createElement("div"); body.className = "photo-body"; body.tabIndex = 0; body.setAttribute("aria-label", copy.open);
  const stage = doc.createElement("div"); stage.className = "photo-stage";
  const image = doc.createElement("img"); image.alt = title; image.draggable = false; stage.append(image); body.append(stage);
  const footer = doc.createElement("footer"), controls = doc.createElement("div"); controls.className = "photo-controls";
  const minus = button("−", copy.zoomOut), plus = button("+", copy.zoomIn), actual = button(copy.actual), fit = button(copy.fit);
  const output = doc.createElement("output"); output.setAttribute("aria-label", copy.zoom);
  const hint = doc.createElement("p"); hint.id = "photo-hint"; hint.textContent = copy.hint; body.setAttribute("aria-describedby", hint.id);
  controls.append(minus, output, plus, actual, fit); footer.append(controls, hint); dialog.append(header, body, footer); shadow.append(css, dialog); doc.body.append(host);
  viewers.set(doc, dialog);
  let zoom = 1, minimum = 1, fitting = true, closed = false, frame = 0, wheelDelta = 0, wheelX = 0, wheelY = 0;
  const render = () => {
    const width = image.naturalWidth * zoom, height = image.naturalHeight * zoom;
    stage.style.width = `${Math.max(body.clientWidth, width)}px`; stage.style.height = `${Math.max(body.clientHeight, height)}px`;
    image.style.width = `${width}px`; image.style.height = `${height}px`;
    image.style.left = `${Math.max(0, (body.clientWidth - width) / 2)}px`; image.style.top = `${Math.max(0, (body.clientHeight - height) / 2)}px`;
    output.textContent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(zoom);
    dialog.dataset.zoom = String(zoom); dialog.dataset.actual = String(Math.abs(zoom - 1) < .00001); body.dataset.zoomed = String(zoom > minimum + .00001);
    minus.disabled = zoom <= minimum + .00001; plus.disabled = zoom >= MAX_IMAGE_ZOOM;
    actual.setAttribute("aria-pressed", String(Math.abs(zoom - 1) < .00001)); fit.setAttribute("aria-pressed", String(fitting));
  };
  const change = (next: number, x = body.clientWidth / 2, y = body.clientHeight / 2, fitMode = false) => {
    if (closed || !image.naturalWidth) return;
    const value = clampImageZoom(next, minimum);
    const left = anchoredZoomScroll(body.scrollLeft, x, image.naturalWidth, body.clientWidth, zoom, value);
    const top = anchoredZoomScroll(body.scrollTop, y, image.naturalHeight, body.clientHeight, zoom, value);
    zoom = value; fitting = fitMode || zoom <= minimum + .00001; render();
    body.scrollLeft = fitting ? 0 : left; body.scrollTop = fitting ? 0 : top;
  };
  const resize = () => { if (closed || !image.naturalWidth) return; minimum = fitImageZoom(image.naturalWidth, image.naturalHeight, body.clientWidth, body.clientHeight); change(fitting ? minimum : zoom, undefined, undefined, fitting); };
  const observer = new win.ResizeObserver(resize); observer.observe(body); win.addEventListener("resize", resize);
  image.addEventListener("load", resize, { once: true }); image.src = src;
  close.onclick = () => dialog.close(); minus.onclick = () => change(zoom / 1.25); plus.onclick = () => change(zoom * 1.25); actual.onclick = () => change(1); fit.onclick = () => change(minimum, undefined, undefined, true);
  body.addEventListener("wheel", event => {
    event.preventDefault(); event.stopPropagation(); const rect = body.getBoundingClientRect();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? body.clientHeight : 1;
    wheelDelta += Math.max(-240, Math.min(240, event.deltaY * unit)); wheelX = event.clientX - rect.left; wheelY = event.clientY - rect.top;
    if (!frame) frame = win.requestAnimationFrame(() => { frame = 0; const delta = Math.max(-600, Math.min(600, wheelDelta)); wheelDelta = 0; change(zoom * Math.exp(-delta * .002), wheelX, wheelY); });
  }, { passive: false });
  let drag: { id: number; x: number; y: number; left: number; top: number } | undefined;
  body.addEventListener("pointerdown", event => { if (event.button !== 0 || event.pointerType === "touch" || zoom <= minimum) return; event.preventDefault(); body.focus({ preventScroll: true }); body.setPointerCapture(event.pointerId); drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: body.scrollLeft, top: body.scrollTop }; body.dataset.dragging = "true"; });
  body.addEventListener("pointermove", event => { if (drag?.id !== event.pointerId) return; body.scrollLeft = drag.left - event.clientX + drag.x; body.scrollTop = drag.top - event.clientY + drag.y; });
  const stopDrag = () => { drag = undefined; delete body.dataset.dragging; };
  body.addEventListener("pointerup", stopDrag); body.addEventListener("pointercancel", stopDrag); body.addEventListener("lostpointercapture", stopDrag);
  dialog.addEventListener("keydown", event => {
    if (!["Escape", "+", "=", "-", "_", "0", "f", "F"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    if (event.key === "Escape") dialog.close(); else if (event.key === "0") change(1); else if (event.key.toLowerCase() === "f") change(minimum, undefined, undefined, true); else change(zoom * (["+", "="].includes(event.key) ? 1.25 : .8));
  });
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => { closed = true; observer.disconnect(); win.removeEventListener("resize", resize); if (frame) win.cancelAnimationFrame(frame); if (viewers.get(doc) === dialog) viewers.delete(doc); host.remove(); if (origin?.isConnected) origin.focus({ preventScroll: true }); }, { once: true });
  dialog.showModal(); resize(); close.focus({ preventScroll: true }); return true;
}
