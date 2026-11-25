import { isPhotoAddress, isPhotoData } from "../core/photo-assets";
import { dataImageBlob } from "./image/image-codec";

interface PhotoLoad {
  address: string;
  displayedSource?: string;
  removeImageListeners?: () => void;
  visible: boolean;
  intersecting: boolean;
  loading: boolean;
  token: number;
}

/** Lazy, bounded decoding. No original image collection is retained by the UI. */
export function observePhotoImages(doc: Document, read: (id: string) => Promise<string>, readPreview?: (id: string, size: number) => Promise<string>): () => void {
  const win = doc.defaultView!;
  const states = new Map<HTMLImageElement, PhotoLoad>();
  const roots = new Set<Document | ShadowRoot>();
  const observers = new Map<Document | ShadowRoot, MutationObserver>();
  const queue: HTMLImageElement[] = [];
  let active = 0, stopped = false;
  const release = (image: HTMLImageElement) => {
    const state = states.get(image); if (!state) return;
    state.token++;
    state.removeImageListeners?.();
    const source = state.displayedSource;
    state.displayedSource = undefined;
    if (source?.startsWith("blob:")) URL.revokeObjectURL(source);
    if (source && image.getAttribute("src") === source) image.removeAttribute("src");
  };
  const pump = () => {
    while (!stopped && active < 2 && queue.length) {
      const image = queue.shift()!, state = states.get(image);
      if (!state?.visible || state.displayedSource || state.loading || !image.isConnected) continue;
      const token = ++state.token; state.loading = true; active++;
      void (async () => {
        const root = image.getRootNode();
        const full = root instanceof ShadowRoot && root.host.hasAttribute("data-deeprole-photo-viewer");
        const rect = image.getBoundingClientRect();
        // Stage portraits change scale as the chat and cast reflow. Keep one
        // detailed derivative so a narrow initial layout does not lock in a tiny preview.
        const stage = root instanceof ShadowRoot && root.host.hasAttribute("data-deeprole-portrait-layer");
        const limit = stage ? 1024 : Math.max(256, Math.min(1024, Math.ceil(Math.max(rect.width, rect.height) * win.devicePixelRatio)));
        let prepared = false;
        const original = () => isPhotoData(state.address) ? Promise.resolve(state.address) : read(state.address);
        const data = !full && readPreview && isPhotoAddress(state.address) ? await readPreview(state.address, limit).then(data => { prepared = true; return data; }).catch(original) : await original();
        if (stopped || states.get(image) !== state || token !== state.token || !state.visible || !image.isConnected) return;
        let blob = dataImageBlob(data);
        if (!full && !prepared && typeof createImageBitmap === "function") {
          const bitmap = await createImageBitmap(blob);
          try {
            const scale = Math.min(1, limit / Math.max(bitmap.width, bitmap.height));
            if (scale < 1) {
              const canvas = doc.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
              const context = canvas.getContext("2d")!;
              if (stage) context.imageSmoothingQuality = "high";
              context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
              blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("photo-preview")), "image/webp", stage ? 0.95 : 0.9));
              canvas.width = canvas.height = 0;
            }
          } finally { bitmap.close(); }
        }
        if (stopped || states.get(image) !== state || token !== state.token || !state.visible || !image.isConnected) return;
        const url = URL.createObjectURL(blob);
        const removeListeners = () => {
          image.removeEventListener("load", removeListeners);
          image.removeEventListener("error", tryInline, true);
          state.removeImageListeners = undefined;
        };
        const tryInline = (event: Event) => {
          if (states.get(image) !== state || state.token !== token || image.getAttribute("src") !== url) return;
          // A page can block blob URLs while still allowing embedded images.
          // Retry this same photo before the portrait advances to another pose.
          event.stopImmediatePropagation();
          removeListeners();
          URL.revokeObjectURL(url);
          state.displayedSource = data;
          image.src = data;
        };
        state.removeImageListeners = removeListeners;
        image.addEventListener("load", removeListeners, { once: true });
        image.addEventListener("error", tryInline, true);
        state.displayedSource = url;
        image.src = url;
      })().catch(() => { if (states.get(image) === state && token === state.token) image.dispatchEvent(new Event("error")); })
        .finally(() => { active--; state.loading = false; if (states.get(image) === state && token !== state.token && state.visible && !state.displayedSource) queue.push(image); pump(); });
    }
  };
  // Prepare a whole visible library page as soon as any image in it
  // approaches the viewport. Other photo surfaces retain their lazy behaviour.
  const syncVisibility = () => {
    const batches = new Map<Element, Set<string>>();
    for (const [image, state] of states) {
      const batch = image.dataset.drPhotoBatch, grid = image.closest(".dr-portrait-library-grid");
      if (state.intersecting && image.isConnected && grid && batch !== undefined) {
        const active = batches.get(grid) ?? new Set<string>(); active.add(batch); batches.set(grid, active);
      }
    }
    for (const [image, state] of states) {
      const batch = image.dataset.drPhotoBatch, grid = image.closest(".dr-portrait-library-grid");
      const visible = image.isConnected && (state.intersecting || !!(grid && batch !== undefined && batches.get(grid)?.has(batch)));
      if (visible === state.visible) continue;
      state.visible = visible;
      if (visible) queue.push(image); else release(image);
    }
    pump();
  };
  const intersection = new win.IntersectionObserver(entries => {
    for (const entry of entries) {
      const image = entry.target as HTMLImageElement, state = states.get(image); if (!state) continue;
      state.intersecting = entry.isIntersecting;
    }
    syncVisibility();
  }, { rootMargin: "100px" });
  const scan = (root: Document | ShadowRoot | Element) => {
    const elements = root instanceof Element ? [root, ...root.querySelectorAll("*")] : [...root.querySelectorAll("*")];
    for (const element of elements) {
      if (element.shadowRoot) observe(element.shadowRoot);
      if (!(element instanceof HTMLImageElement)) continue;
      const src = element.getAttribute("src"), previous = states.get(element);
      if (src && src === previous?.displayedSource) continue;
      const inlineLibraryPhoto = isPhotoData(src) && !!element.closest(".dr-portrait-library-grid");
      if (!isPhotoAddress(src) && !inlineLibraryPhoto) {
        if (previous && src) { release(element); states.delete(element); intersection.unobserve(element); delete element.dataset.drPhotoSource; }
        continue;
      }
      if (previous?.address === src && !previous.displayedSource) continue;
      release(element); states.set(element, { address: src, visible: false, intersecting: previous?.intersecting ?? false, loading: false, token: 0 });
      if (isPhotoAddress(src)) element.dataset.drPhotoSource = src;
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
      syncVisibility();
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "data-dr-photo-batch"] }); observers.set(root, observer); scan(root);
  };
  observe(doc);
  return () => { stopped = true; intersection.disconnect(); observers.forEach(observer => observer.disconnect()); observers.clear(); for (const [image] of states) release(image); states.clear(); roots.clear(); queue.length = 0; };
}
