import { afterEach, expect, it } from "vitest";
import { ReasoningPresentation } from "../src/adapters/reasoning-presentation";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { parseBackupSettings } from "../src/core/record-validation";

let controller: ReasoningPresentation;
afterEach(() => { controller?.dispose(); document.body.innerHTML = ""; });
function reply(id = "one", expanded = true) {
  const row = document.createElement("article"); row.dataset.role = "assistant"; row.dataset.messageId = id;
  row.innerHTML = '<button aria-expanded="' + expanded + '">Thought for 2 seconds</button><div class="ds-think-content-wrapper"><div class="ds-think-content">Private test thoughts.</div></div><div class="ds-markdown">Mira opens the observatory.</div>';
  const button = row.querySelector("button")!, body = row.querySelector<HTMLElement>(".ds-think-content-wrapper")!;
  body.style.display = expanded ? "block" : "none";
  button.onclick = () => { const next = button.getAttribute("aria-expanded") !== "true"; button.setAttribute("aria-expanded", String(next)); body.style.display = next ? "block" : "none"; };
  document.body.append(row); return { row, button, body };
}
function start(show = false) { controller = new ReasoningPresentation(document); controller.configure(show, "en"); }
it("defaults to folded thoughts and strictly validates old/new backup preferences", () => {
  expect(DEFAULT_SETTINGS.showDeepSeekReasoning).toBe(false); expect(parseBackupSettings({}).showDeepSeekReasoning).toBe(false);
  expect(parseBackupSettings({ showDeepSeekReasoning: true }).showDeepSeekReasoning).toBe(true);
  for (const value of ["true", 1, null, []]) expect(() => parseBackupSettings({ showDeepSeekReasoning: value })).toThrow();
});
it("folds only thoughts with the native control, preserving narrative, source and mode", () => {
  const { row, button, body } = reply(); const source = row.textContent;
  document.body.insertAdjacentHTML("beforeend", '<textarea>Unsent draft.</textarea><button id="deepthink" aria-pressed="true">DeepThink</button>');
  start(); expect(button.getAttribute("aria-expanded")).toBe("false"); expect(body.style.display).toBe("none");
  expect(row.textContent).toBe(source); expect(row.querySelector<HTMLElement>(".ds-markdown")!.style.display).toBe("");
  expect(document.getElementById("deepthink")!.getAttribute("aria-pressed")).toBe("true"); expect(document.querySelector("textarea")!.value).toBe("Unsent draft.");
});
it("respects a manual expansion across streamed text and native DOM replacement", () => {
  const first = reply(); start(); first.button.click(); controller.sync(); expect(first.body.style.display).toBe("block");
  first.body.append(" More thoughts."); controller.sync(); expect(first.button.getAttribute("aria-expanded")).toBe("true");
  first.row.remove(); const next = reply(); controller.sync(); expect(next.body.style.display).toBe("block");
});
it("folds each new reply, not a previously expanded one", () => {
  const first = reply(); start(); first.button.click(); const second = reply("two"); controller.sync();
  expect(first.body.style.display).toBe("block"); expect(second.body.style.display).toBe("none");
});
it("keeps a streamed automatic reopen folded before the next paint", async () => {
  const { button, body } = reply(); start(); button.setAttribute("aria-expanded", "true"); body.style.display = "block";
  await new Promise(resolve => setTimeout(resolve, 0)); expect(button.getAttribute("aria-expanded")).toBe("false"); expect(body.style.display).toBe("none");
});
it("enabling display restores only folds performed by the extension", () => {
  const open = reply(), originallyClosed = reply("closed", false); start(); controller.configure(true, "en");
  expect(open.body.style.display).toBe("block"); expect(originallyClosed.body.style.display).toBe("none");
  const next = reply("new"); controller.sync(); expect(next.body.style.display).toBe("block");
});
it("does not change a player's manual collapse when automatic display is enabled", () => {
  const { button, body } = reply(); start(); button.click(); button.click(); controller.configure(true, "en"); expect(body.style.display).toBe("none");
});
it("uses a reversible accessible fallback when native markup has no recognized header", () => {
  document.body.innerHTML = '<article data-role="assistant"><div class="ds-think-content" style="display:grid!important">Private test thoughts.</div><p>Visible story.</p></article>';
  const body = document.querySelector<HTMLElement>(".ds-think-content")!; start(); expect(body.style.display).toBe("none");
  const button = document.querySelector<HTMLButtonElement>("[data-deeprole-reasoning-toggle]")!; expect(button.textContent).toContain("Show thoughts"); expect(button.getAttribute("aria-expanded")).toBe("false");
  button.click(); controller.sync(); expect(body.style.display).toBe("grid"); expect(body.style.getPropertyPriority("display")).toBe("important"); expect(button.getAttribute("aria-expanded")).toBe("true");
  controller.configure(true, "en"); expect(button.isConnected).toBe(false); expect(body.style.display).toBe("grid");
});
it("supports native details without toggling unrelated details or user messages", () => {
  document.body.innerHTML = '<article data-role="assistant"><details open id="thoughts"><summary>Thought for 2 seconds</summary><div class="ds-think-content">Private test thoughts.</div></details><details open id="story"><summary>Map</summary>Story map.</details></article><article data-role="user"><div class="ds-think-content">My own quoted text.</div></article>';
  start(); expect(document.getElementById("thoughts")!.hasAttribute("open")).toBe(false); expect(document.getElementById("story")!.hasAttribute("open")).toBe(true);
  expect(document.querySelector<HTMLElement>('[data-role="user"] .ds-think-content')!.style.display).toBe("");
});
it("never folds the answer when a wrapper interleaves final Markdown", () => {
  document.body.innerHTML = '<article data-role="assistant"><div class="ds-think-content-wrapper"><div class="ds-think-content">Private test thoughts.</div><div class="ds-assistant-message-main-content">Visible story.</div></div></article>';
  start(); expect(document.querySelector<HTMLElement>(".ds-think-content-wrapper")!.style.display).toBe(""); expect(document.querySelector<HTMLElement>(".ds-assistant-message-main-content")!.style.display).toBe("");
});
it("restores the native view and disconnects observation on disposal", async () => {
  const { button, body } = reply(); start(); controller.dispose(); expect(body.style.display).toBe("block");
  button.setAttribute("aria-expanded", "true"); body.style.display = "grid"; await new Promise(resolve => setTimeout(resolve, 0)); expect(body.style.display).toBe("grid");
});
it("updates fallback labels on a language change without revealing the body", () => {
  document.body.innerHTML = '<article data-role="assistant"><div class="ds-think-content">Private test thoughts.</div></article>';
  start(); controller.configure(false, "ru"); expect(document.querySelector("[data-deeprole-reasoning-toggle]")!.textContent).toBe("Показать размышления");
  expect(document.querySelector<HTMLElement>(".ds-think-content")!.style.display).toBe("none");
});
it("preserves newer site display styles and leaves an unchanged scan idempotent", () => {
  document.body.innerHTML = '<article data-role="assistant"><div class="ds-think-content" style="display:grid">Private test thoughts.</div></article>';
  start(); const body = document.querySelector<HTMLElement>(".ds-think-content")!;
  body.style.setProperty("display", "flex", "important"); controller.sync(); const snapshot = document.body.innerHTML;
  controller.sync(); expect(document.body.innerHTML).toBe(snapshot); controller.configure(true, "en"); expect(body.style.display).toBe("flex");
});
it("recognizes a decorated native header without relying on an English-only button label", () => {
  const { row, button, body } = reply(); button.removeAttribute("aria-expanded"); button.textContent = "✧ Думал 2 секунды ›";
  button.onclick = () => { body.style.display = body.style.display === "none" ? "block" : "none"; };
  start(); expect(body.style.display).toBe("none"); expect(row.querySelector("[data-deeprole-reasoning-toggle]")).toBeNull();
  button.click(); controller.sync(); expect(body.style.display).toBe("block");
});
it("adopts a native header that mounts after the fallback without leaving duplicate controls", () => {
  document.body.innerHTML = '<article data-role="assistant"><div class="ds-think-content">Private test thoughts.</div></article>'; start();
  const body = document.querySelector<HTMLElement>(".ds-think-content")!, header = document.createElement("button"); header.setAttribute("aria-expanded", "true"); header.textContent = "Thought for 2 seconds";
  header.onclick = () => { const next = header.getAttribute("aria-expanded") !== "true"; header.setAttribute("aria-expanded", String(next)); body.style.display = next ? "block" : "none"; };
  body.parentElement!.prepend(header); controller.sync(); expect(header.getAttribute("aria-expanded")).toBe("false"); expect(document.querySelector("[data-deeprole-reasoning-toggle]")).toBeNull();
  header.click(); expect(body.style.display).toBe("block");
});
it("never clicks an unrelated adjacent dropdown even if it has aria-expanded", () => {
  document.body.innerHTML = '<article data-role="assistant"><button aria-expanded="true">Message actions</button><div class="ds-think-content">Private test thoughts.</div></article>';
  let clicks = 0; document.querySelector("button")!.onclick = () => clicks++; start(); expect(clicks).toBe(0);
  expect(document.querySelector("[data-deeprole-reasoning-toggle]")).not.toBeNull();
});
it("does not close a newer already-open native body while restoring an obsolete folded body", () => {
  const { body, button } = reply(); start(); const replacement = body.cloneNode(true) as HTMLElement; replacement.style.display = "block";
  body.replaceWith(replacement); button.setAttribute("aria-expanded", "true"); controller.configure(true, "en");
  expect(button.getAttribute("aria-expanded")).toBe("true"); expect(replacement.style.display).toBe("block");
});
