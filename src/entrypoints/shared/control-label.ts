import type { MouseEvent } from "react";
/** Keep accessible label names, but activate controls only on the controls themselves. */
export function preventLabelActivation(event: MouseEvent<HTMLElement>): void {
  const target = event.target as Element;
  if (!target?.closest || !target.closest("label")) return;
  if (!target.closest("input,textarea,select,button,a,[role=button],[role=switch],[role=checkbox],[role=option]")) event.preventDefault();
}
