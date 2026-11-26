import { useLayoutEffect, useRef, type RefObject } from "react";
import { afterWindowMotion } from "../../src/entrypoints/shared/window-motion";

let activeLayout: { transition: ViewTransition; commit: () => void } | undefined;

export function animateDock(commitLayout: () => void) {
  if (activeLayout) {
    activeLayout.transition.skipTransition();
    activeLayout.commit();
  }
  if (!document.startViewTransition || document.documentElement.dataset.motion === "off" || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    commitLayout();
    return;
  }
  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    commitLayout();
  };
  const transition = document.startViewTransition({ update: commit, types: ["desktop-dock"] });
  const layout = { transition, commit };
  activeLayout = layout;
  void transition.ready.catch(() => undefined);
  void transition.finished.catch(() => undefined).then(() => {
    if (activeLayout === layout) activeLayout = undefined;
  });
}

export function useNativeDialog(initialFocus?: RefObject<HTMLElement | null>) {
  const modal = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const node = modal.current;
    if (!node) return;
    node.showModal();
    initialFocus?.current?.focus({ preventScroll: true });
    return () => { if (node.open) node.close(); };
  }, [initialFocus]);

  function dismiss(onClosed: () => void) {
    const node = modal.current;
    if (!node?.open) return;
    node.close();
    node.inert = true;
    afterWindowMotion(node, onClosed);
  }
  return { modal, dismiss };
}
