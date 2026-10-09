import { nativeMessageRows, REASONING, isUserMessage } from "./deepseek-message-dom";

const HIDDEN_TURN = "[data-deeprole-character-text-hidden],[data-deeprole-memory-request],[data-deeprole-choices-request]";
const OWNED = "[data-deeprole-choices-host],[data-deeprole-choices-loading],[data-deeprole-choices-recovery],[data-deeprole-choices-anchor],[data-deeprole-choices-spacer],[data-deeprole-illustrations],[data-deeprole-scene-photos],[data-deeprole-memory-card],[data-deeprole-service-preloader],[data-deeprole-result],[data-deeprole-handoff-visible],[data-deeprole-cast-recovery]";
const IGNORED = REASONING + ",button,[role=button],[role=toolbar],[role=tooltip],script,style,[data-deeprole-choices-payload]";
const PROTECTED = "html,body,main,form,header,nav,aside,textarea,input,[contenteditable=true],deeprole-page-widget,[role=log],[role=list]";
type Mode = "hidden" | "compact";
type Property = { value: string; priority: string };
type Saved = { mode: Mode; original: Map<string, Property> };
const managed = new WeakMap<ParentNode, Map<HTMLElement, Saved>>();
const styles: Record<Mode, Record<string, string>> = {
  hidden: { display: "none" },
  compact: { "min-height": "0px", height: "auto", "margin-block": "0px", "padding-block": "0px" },
};

/** Collapse only identified DeepRole transport, not arbitrary empty messages.
 * Native text and virtual-list keys remain intact for parsers and React.
 * Useful cards and pinned-space anchors retain their own layout. */
export function syncHiddenMessageLayout(root: ParentNode = document): void {
  const previous = managed.get(root) ?? new Map<HTMLElement, Saved>();
  const desired = new Map<HTMLElement, Mode>();
  const rows = new Set([...nativeMessageRows(root), ...root.querySelectorAll<HTMLElement>(HIDDEN_TURN)]);
  const nativeChildren = new Map<HTMLElement, HTMLElement[]>();
  function useful(node: Node, excluded?: Node, ignoreOwned = false): boolean {
    if (node === excluded) return false;
    if (node.nodeType === Node.TEXT_NODE) return !!node.textContent?.trim();
    if (!(node instanceof Element)) return false;
    if (node.matches(OWNED)) return !ignoreOwned;
    if (node.matches(IGNORED)) return false;
    // Ignore native hidden descendants, but inspect our collapsed containers:
    // a reused node may already hold a new, ordinary story.
    if (node instanceof HTMLElement && node.style.display === "none" && !previous.has(node) && !node.matches(HIDDEN_TURN)) return false;
    if (node.matches("img,video,audio,canvas,iframe,object,embed,svg,hr")) return true;
    return [...node.childNodes].some(child => useful(child, excluded, ignoreOwned));
  }
  function envelope(row: HTMLElement): HTMLElement {
    let shell = row;
    for (let parent = row.parentElement, depth = 0; parent && depth < 8; parent = parent.parentElement, depth++) {
      const children = nativeChildren.get(parent) ?? nativeMessageRows(parent);
      nativeChildren.set(parent, children);
      if (parent === root || !parent.matches("div,section,article,li") || parent.matches(PROTECTED)
        || parent.querySelector(PROTECTED) || parent.closest("deeprole-page-widget")
        || children.some(other => other !== row)
        || useful(parent, row, true)) break;
      const overflow = parent.ownerDocument.defaultView?.getComputedStyle(parent).overflowY;
      if (overflow === "auto" || overflow === "scroll") break;
      shell = parent;
      if (parent.hasAttribute("data-virtual-list-item-key")) break;
    }
    return shell;
  }
  function hideChrome(node: HTMLElement, row: HTMLElement): void {
    if (node === row || node.matches(OWNED)) return;
    if (!node.contains(row) && !node.querySelector(OWNED)) { desired.set(node, "hidden"); return; }
    for (const child of node.children) if (child instanceof HTMLElement) hideChrome(child, row);
  }
  for (const row of rows) {
    const nativeHidden = row.matches(HIDDEN_TURN);
    const transportOnly = !isUserMessage(row) && !!row.querySelector("[data-deeprole-choices-payload]") && !useful(row);
    if (!nativeHidden && !transportOnly) continue;
    if (!nativeHidden) desired.set(row, "hidden");
    const shell = envelope(row);
    if (shell === row) continue;
    if (shell.querySelector(OWNED)) {
      desired.set(shell, "compact"); hideChrome(shell, row);
    } else desired.set(shell, "hidden");
  }
  function restore(node: HTMLElement, saved: Saved): void {
    for (const [key, value] of saved.original) {
      // Never overwrite a newer style authored by DeepSeek while hidden.
      if (node.style.getPropertyValue(key) !== styles[saved.mode][key] || node.style.getPropertyPriority(key) !== "important") continue;
      if (value.value) node.style.setProperty(key, value.value, value.priority); else node.style.removeProperty(key);
    }
    if (node.dataset.deeproleEmptyShell === saved.mode) delete node.dataset.deeproleEmptyShell;
  }
  for (const [node, saved] of previous) {
    if (desired.get(node) === saved.mode) continue;
    restore(node, saved); previous.delete(node);
  }
  for (const [node, mode] of desired) {
    const saved = previous.get(node) ?? { mode, original: new Map<string, Property>() };
    for (const [key, value] of Object.entries(styles[mode])) {
      if (node.style.getPropertyValue(key) === value && node.style.getPropertyPriority(key) === "important") continue;
      saved.original.set(key, { value: node.style.getPropertyValue(key), priority: node.style.getPropertyPriority(key) });
      node.style.setProperty(key, value, "important");
    }
    if (node.dataset.deeproleEmptyShell !== mode) node.dataset.deeproleEmptyShell = mode;
    previous.set(node, saved);
  }
  managed.set(root, previous);
}
