import { isUserMessage, nativeMessageRows } from "./deepseek-message-dom";
import { injectedUserText } from "../core/injected-user-text";

/** Presentation only. The original user turn stays intact for DeepSeek/copy/history. */
export function presentHiddenHandoffs(root: ParentNode = document): void {
  const doc = root instanceof Document ? root : root.ownerDocument ?? document;
  if (!doc.querySelector("style[data-deeprole-handoff-style]")) {
    const style = doc.createElement("style"); style.dataset.deeproleHandoffStyle = "true";
    style.textContent = '[data-deeprole-handoff-body]{font-size:0!important;line-height:0!important;visibility:hidden!important}[data-deeprole-handoff-body]>:not([data-deeprole-handoff-visible]){display:none!important}[data-deeprole-handoff-visible]{display:block!important;visibility:visible!important;white-space:pre-wrap;font:400 15px/1.6 system-ui,sans-serif}';
    doc.head.append(style);
  }
  for (const row of nativeMessageRows(root).filter(isUserMessage)) {
    const body = [...row.querySelectorAll<HTMLElement>(".ds-markdown, .ds-collapsible-text")].reverse()
      .find(node => injectedUserText(node.textContent ?? "") !== null || node.hasAttribute("data-deeprole-handoff-body")) ?? row;
    const clone = body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[data-deeprole-handoff-visible]").forEach(node => node.remove());
    const text = clone.textContent ?? "";
    const message = injectedUserText(text);
    let host = body.querySelector<HTMLElement>(":scope > [data-deeprole-handoff-visible]");
    if (message === null) {
      delete body.dataset.deeproleHandoffBody; host?.remove(); continue;
    }
    body.dataset.deeproleHandoffBody = "true";
    if (!host) { host = doc.createElement("div"); host.dataset.deeproleHandoffVisible = "true"; body.append(host); }
    if (host.textContent !== message) host.textContent = message;
  }
}
