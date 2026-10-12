const LABEL = /^(?:DeepThink(?:\s*\([^)]*\))?|Глубокое мышление(?:\s*\([^)]*\))?|深度思考(?:\s*\([^)]*\))?)$/iu;
const state = (button: HTMLElement): boolean | undefined => {
  const pressed = button.getAttribute("aria-pressed") ?? button.getAttribute("aria-checked");
  return pressed === "true" ? true : pressed === "false" ? false : undefined;
};
export function restoreCastThinking(composer: HTMLElement | null) {
  let scope = composer?.parentElement;
  for (let depth = 0; scope && scope.tagName !== "BODY" && depth < 6; depth++, scope = scope.parentElement) {
    const matches = [...scope.querySelectorAll<HTMLElement>("button,[role=button],[role=checkbox]")].filter(b => !b.hidden && !b.closest('[hidden],deeprole-page-widget') && LABEL.test((b.getAttribute("aria-label") ?? b.textContent ?? "").trim()));
    if (matches.length) { if (matches.length === 1 && state(matches[0]!) === true && !matches[0]!.matches(':disabled,[aria-disabled=true]')) matches[0]!.click(); return; }
  }
}
/** Called only by the owned cast worker, never by the ordinary story adapter.
 * Unknown native state is not guessed from colors or clicked speculatively. */
export async function enableCastThinking(composer: HTMLElement | null): Promise<{ status: "enabled" | "unavailable" | "unverified"; changed: boolean; restore: () => void }> {
  const noop = () => {};
  let scope = composer?.parentElement;
  for (let depth = 0; scope && scope.tagName !== "BODY" && depth < 6; depth++, scope = scope.parentElement) {
    const buttons = [...scope.querySelectorAll<HTMLElement>("button,[role=button],[role=checkbox]")].filter(b => !b.hidden && !b.closest('[hidden],deeprole-page-widget') && LABEL.test((b.getAttribute("aria-label") ?? b.textContent ?? "").trim()));
    if (!buttons.length) continue;
    if (buttons.length !== 1) return { status: "unverified", changed:false, restore: noop };
    const button = buttons[0]!, before = state(button);
    if (before === true) return { status: "enabled", changed:false, restore: noop };
    if (before !== false || button.matches(':disabled,[aria-disabled=true]')) return { status: "unverified", changed:false, restore: noop };
    button.click();
    await new Promise(resolve => setTimeout(resolve, 150));
    return { status: state(button) === true ? "enabled" : "unverified", changed:true, restore: () => { if (button.isConnected && state(button) === true && !button.matches(':disabled,[aria-disabled=true]')) button.click(); } };
  }
  return { status: "unavailable", changed:false, restore: noop };
}
