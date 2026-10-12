import { isPhotoAddress } from "../core/photo-assets";
import { dataImageBlob } from "./image/image-codec";

/** Lazy, bounded decoding. No original image collection is retained by the UI. */
export function observePhotoImages(doc: Document, read: (id: string) => Promise<string>): () => void {
  const win = doc.defaultView!;
  const states = new Map<HTMLImageElement, { address: string; url?: string; visible: boolean; loading: boolean; token: number }>();
  const roots = new Set<Document | ShadowRoot>();
  const observers = new Map<Document | ShadowRoot, MutationObserver>();
  const queue: HTMLImageElement[] = [];
  let active = 0, stopped = false;
  const release = (image: HTMLImageElement) => {
    const state = states.get(image); if (!state) return;
    state.token++; if (state.url) { URL.revokeObjectURL(state.url); state.url = undefined; image.removeAttribute("src"); }
  };
  const pump = () => {
    while (!stopped && active < 2 && queue.length) {
      const image = queue.shift()!, state = states.get(image);
      if (!state?.visible || state.url || state.loading || !image.isConnected) continue;
      const token = ++state.token; state.loading = true; active++;
      void (async () => {
        const data = await read(state.address);
        if (stopped || states.get(image) !== state || token !== state.token || !state.visible || !image.isConnected) return;
        let blob = dataImageBlob(data);
        const root = image.getRootNode();
        const full = root instanceof ShadowRoot && root.host.hasAttribute("data-deeprole-photo-viewer");
        if (!full && typeof createImageBitmap === "function") {
          const bitmap = await createImageBitmap(blob);
          try {
            const rect = image.getBoundingClientRect();
            const limit = Math.max(256, Math.min(1024, Math.ceil(Math.max(rect.width, rect.height) * win.devicePixelRatio)));
            const scale = Math.min(1, limit / Math.max(bitmap.width, bitmap.height));
            if (scale < 1) {
              const canvas = doc.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
              canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
              blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("photo-preview")), "image/webp", 0.9));
              canvas.width = canvas.height = 0;
            }
          } finally { bitmap.close(); }
        }
        if (stopped || states.get(image) !== state || token !== state.token || !state.visible || !image.isConnected) return;
        state.url = URL.createObjectURL(blob); image.src = state.url;
      })().catch(() => { if (states.get(image) === state && token === state.token) image.dispatchEvent(new Event("error")); })
        .finally(() => { active--; state.loading = false; if (states.get(image) === state && token !== state.token && state.visible && !state.url) queue.push(image); pump(); });
    }
  };
  const intersection = new win.IntersectionObserver(entries => {
    for (const entry of entries) {
      const image = entry.target as HTMLImageElement, state = states.get(image); if (!state) continue;
      state.visible = entry.isIntersecting;
      if (state.visible) { queue.push(image); } else release(image);
    }
    pump();
  }, { rootMargin: "100px" });
  const scan = (root: Document | ShadowRoot | Element) => {
    const elements = root instanceof Element ? [root, ...root.querySelectorAll("*")] : [...root.querySelectorAll("*")];
    for (const element of elements) {
      if (element.shadowRoot) observe(element.shadowRoot);
      if (!(element instanceof HTMLImageElement)) continue;
      const src = element.getAttribute("src"), previous = states.get(element);
      if (!isPhotoAddress(src)) {
        if (previous && src && src !== previous.url) { release(element); states.delete(element); intersection.unobserve(element); delete element.dataset.drPhotoSource; element.setAttribute("src", src); }
        continue;
      }
      if (previous?.address === src && !previous.url) continue;
      release(element); states.set(element, { address: src, visible: false, loading: false, token: 0 });
      element.dataset.drPhotoSource = src;
      element.removeAttribute("src"); intersection.observe(element);
    }
  };
  const observe = (root: Document | ShadowRoot) => {
    if (roots.has(root)) return; roots.add(root);
    const observer = new win.MutationObserver(changes => {
      for (const change of changes) {
        if (change.type === "attributes") scan(change.target as Element);
        else for (const node of change.addedNodes) if (node instanceof Element) scan(node);
      }
      for (const [image] of states) if (!image.isConnected) { release(image); intersection.unobserve(image); states.delete(image); }
      for (const [root, observer] of observers) if (root instanceof ShadowRoot && !root.host.isConnected) { observer.disconnect(); observers.delete(root); roots.delete(root); }
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] }); observers.set(root, observer); scan(root);
  };
  observe(doc);
  return () => { stopped = true; intersection.disconnect(); observers.forEach(observer => observer.disconnect()); observers.clear(); for (const [image] of states) release(image); states.clear(); roots.clear(); queue.length = 0; };
}
