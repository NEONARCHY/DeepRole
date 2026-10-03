/** Message identity must not depend on height, scrolling or Markdown paragraphs. */
export const NATIVE_TURN = "article, [data-message-id], [data-message-role], [data-role='user'], [data-role='assistant'], .ds-message";
export const REASONING = ".ds-think-content, .ds-think-content-wrapper, [data-testid*='thinking'], [data-testid*='reasoning']";

export function nativeMessageRow(element: HTMLElement): HTMLElement | null {
  const row = element.closest<HTMLElement>(NATIVE_TURN);
  if (!row || row.matches("body, main, form") || row.closest("deeprole-page-widget")
    || row.querySelector("textarea, input, [contenteditable='true']")
    || row.querySelector(NATIVE_TURN)) return null;
  return row;
}

export function nativeMessageRows(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(NATIVE_TURN)].filter(row => nativeMessageRow(row) === row);
}

/** A native virtual-list key survives DOM replacement and does not contain lore. */
export function nativeMessageIdentity(row: HTMLElement): string | undefined {
  const virtual = row.closest('[data-virtual-list-item-key]')?.getAttribute('data-virtual-list-item-key');
  const id = row.getAttribute('data-message-id');
  return virtual ? JSON.stringify(['virtual', virtual]) : id ? JSON.stringify(['message', id]) : undefined;
}

export function isUserMessage(element: HTMLElement): boolean {
  const row = nativeMessageRow(element) ?? element;
  return !!row.closest("[data-role='user'], [data-message-role='user'], [data-testid*='user-message'], .ds-message--user")
    || row.matches(".ds-message") && !!row.querySelector(".ds-collapsible-text") && !row.querySelector(".ds-assistant-message-main-content");
}
