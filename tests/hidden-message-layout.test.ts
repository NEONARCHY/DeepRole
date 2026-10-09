import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { hideCharacterTextServices, plainCharacterReplyText, presentMemoryAnalysis, removeServicePreloader } from "../src/adapters/deepseek-service-dom";
import { concealChoicePayloads, syncSceneChoiceCards } from "../src/adapters/deepseek-choices-dom";

beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { syncSceneChoiceCards(false, false, "en", async () => false); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
const command = "[DeepRole Service]\n[Request ID: frame]\n[DeepRole Image Plan]\nAn observatory at dusk.";
const plan = '{"scene":"An observatory at dusk.","characters":[]}';
const options = { version: 1, options: ["positive", "neutral", "negative", "surprise"].map(kind => ({ kind, label: kind, text: "Ask about the sky." })) };
function imageTurns() {
  document.body.innerHTML = '<main><section id="chat"><div id="request-shell" data-virtual-list-item-key="1" style="margin-block:32px;min-height:140px"><div class="ds-message ds-message--user" id="request"><div class="ds-collapsible-text"></div></div><div class="toolbar"><button>Copy</button><button>Edit</button></div></div><div id="reply-shell" data-virtual-list-item-key="2" style="padding-block:24px;min-height:160px"><div class="ds-message" id="reply"><button>Thought for 2 seconds</button><div class="ds-think-content">Private reasoning.</div><div class="ds-assistant-message-main-content"></div></div><div class="toolbar"><button>Copy</button><button>Share</button></div></div><article data-role="assistant" id="story">Mira opens the observatory.</article></section><form><textarea></textarea></form></main>';
  document.querySelector(".ds-collapsible-text")!.textContent = command;
  document.querySelector(".ds-assistant-message-main-content")!.textContent = plan;
}
it("collapses service envelopes and native controls without removing any source text", () => {
  imageTurns(); hideCharacterTextServices();
  expect(document.getElementById("request-shell")!.style.display).toBe("none");
  expect(document.getElementById("reply-shell")!.style.display).toBe("none");
  expect(document.getElementById("request")!.textContent).toBe(command);
  expect(plainCharacterReplyText(document.getElementById("reply")!)).toBe(plan);
  expect(document.getElementById("story")!.style.display).toBe("");
  expect(document.getElementById("chat")!.style.display).toBe("");
  expect(document.querySelector("form")!.style.display).toBe("");
});
it("restores original display styles and priorities when DeepSeek reuses a shell for an ordinary turn", () => {
  imageTurns(); const shell = document.getElementById("request-shell")!;
  shell.style.setProperty("display", "grid", "important"); hideCharacterTextServices();
  document.querySelector(".ds-collapsible-text")!.textContent = "Continue the story.";
  document.querySelector(".ds-assistant-message-main-content")!.textContent = "Mira holds the key.";
  hideCharacterTextServices();
  expect(shell.style.display).toBe("grid"); expect(shell.style.getPropertyPriority("display")).toBe("important");
  expect(shell.style.marginBlock).toBe("32px"); expect(document.getElementById("reply-shell")!.style.display).toBe("");
  expect(document.getElementById("reply")!.style.display).toBe("");
});
it("never collapses an ancestor that owns another native message or the composer", () => {
  imageTurns(); const shell = document.getElementById("request-shell")!;
  shell.append(document.getElementById("story")!); hideCharacterTextServices();
  expect(shell.style.display).toBe(""); expect(document.querySelector("main")!.style.display).toBe("");
  expect(document.getElementById("request")!.style.display).toBe("none");
});
it("hides a choices-only answer and its thinking/toolbar but keeps its actual options card", () => {
  document.body.innerHTML = '<main><div id="shell" data-virtual-list-item-key="3" style="min-height:180px;margin-block:40px;padding-block:18px"><div class="ds-message" id="reply"><button>Thought for 2 seconds</button><div class="ds-think-content">Private reasoning.</div><div class="ds-markdown"></div></div><div id="toolbar"><button>Copy</button></div></div><form><textarea></textarea></form></main>';
  document.querySelector(".ds-markdown")!.textContent = "<deeprole_choices>" + JSON.stringify(options) + "</deeprole_choices>";
  syncSceneChoiceCards(true, false, "en", async () => true);
  const shell = document.getElementById("shell")!, row = document.getElementById("reply")!;
  expect(row.style.display).toBe("none"); expect(shell.style.display).not.toBe("none");
  expect(shell.style.minHeight).toBe("0px"); expect(shell.style.marginBlock).toBe("0px"); expect(shell.style.paddingBlock).toBe("0px");
  expect(document.getElementById("toolbar")!.style.display).toBe("none");
  expect(document.querySelector("[data-deeprole-choices-host]")?.shadowRoot?.querySelectorAll(".grid button")).toHaveLength(4);
  expect(row.textContent).toContain("<deeprole_choices>");
});
it("keeps story prose, attachments and illustration cards around concealed payloads", () => {
  document.body.innerHTML = '<main><article data-role="assistant" id="story"><div class="ds-markdown"></div><div data-deeprole-illustrations="true">Create illustration</div></article><article data-role="assistant" id="attachment"><div class="ds-markdown"></div><img src="data:image/png;base64,AAAA"></article></main>';
  document.querySelector("#story .ds-markdown")!.textContent = "Mira opens the observatory. <deeprole_choices>" + JSON.stringify(options) + "</deeprole_choices>";
  document.querySelector("#attachment .ds-markdown")!.textContent = "<deeprole_choices>" + JSON.stringify(options) + "</deeprole_choices>";
  concealChoicePayloads(document); hideCharacterTextServices();
  expect(document.getElementById("story")!.style.display).toBe(""); expect(document.getElementById("attachment")!.style.display).toBe("");
});
it("leaves ordinary empty placeholders alone until an owned hidden payload is identified", () => {
  document.body.innerHTML = '<main><div data-virtual-list-item-key="ordinary"><article data-role="assistant" id="empty"><div class="ds-think-content">Thinking…</div></article><button>Copy</button></div></main>';
  hideCharacterTextServices(); expect(document.getElementById("empty")!.style.display).toBe("");
  expect(document.querySelector<HTMLElement>("[data-virtual-list-item-key]")!.style.display).toBe("");
});
it("keeps memory results visible while collapsing the hidden request envelope", () => {
  imageTurns(); document.querySelector(".ds-collapsible-text")!.textContent = "[DeepRole Service]\n[Request ID: frame]\nAnalyze the lore.";
  presentMemoryAnalysis("frame", "Preparing", "Ready to review");
  expect(document.getElementById("request-shell")!.style.display).toBe("none");
  expect(document.getElementById("reply-shell")!.style.display).not.toBe("none");
  expect(document.querySelector("[data-deeprole-memory-card]")?.textContent).toBe("Ready to review");
  removeServicePreloader("frame", [document.getElementById("request")!, document.getElementById("reply")!]);
  expect(document.getElementById("request-shell")!.style.display).toBe("");
});
it("retains spacer/anchor dimensions for composer clearance instead of treating them as unwanted blanks", () => {
  imageTurns(); const shell = document.getElementById("reply-shell")!;
  const spacer = document.createElement("div"); spacer.dataset.deeproleChoicesSpacer = "true"; spacer.style.height = "280px"; shell.append(spacer);
  hideCharacterTextServices();
  expect(shell.style.display).not.toBe("none"); expect(shell.style.minHeight).toBe("0px");
  expect(spacer.style.display).toBe(""); expect(spacer.style.height).toBe("280px");
  expect(shell.querySelector<HTMLElement>(".toolbar")!.style.display).toBe("none");
});
it("does not overwrite a newer native display style during restoration", () => {
  imageTurns(); hideCharacterTextServices(); const shell = document.getElementById("request-shell")!;
  shell.style.setProperty("display", "flex", "important");
  document.querySelector(".ds-collapsible-text")!.textContent = "An ordinary message."; hideCharacterTextServices();
  expect(shell.style.display).toBe("flex"); expect(shell.style.getPropertyPriority("display")).toBe("important");
});
it("an unchanged scan produces no layout or DOM changes", () => {
  imageTurns(); hideCharacterTextServices(); const before = document.body.innerHTML;
  hideCharacterTextServices(); expect(document.body.innerHTML).toBe(before);
});
it("preserves a real SVG illustration next to a concealed payload", () => {
  document.body.innerHTML = '<main><article data-role="assistant" id="art"><div class="ds-markdown"></div><svg aria-label="Star map"><circle cx="12" cy="12" r="6"/></svg></article></main>';
  document.querySelector(".ds-markdown")!.textContent = "<deeprole_choices>" + JSON.stringify(options) + "</deeprole_choices>";
  concealChoicePayloads(document); hideCharacterTextServices();
  expect(document.getElementById("art")!.style.display).toBe("");
});
it("never collapses an enclosing shell containing a real SVG outside the hidden message", () => {
  imageTurns(); const shell = document.getElementById("reply-shell")!;
  shell.insertAdjacentHTML("beforeend", '<svg aria-label="Star map"><circle cx="12" cy="12" r="6"/></svg>');
  hideCharacterTextServices(); expect(shell.style.display).toBe(""); expect(document.getElementById("reply")!.style.display).toBe("none");
});
it("restores a reused choices request and its outer envelope without losing original styles", () => {
  imageTurns(); const row = document.getElementById("request")!, shell = document.getElementById("request-shell")!;
  row.style.setProperty("display", "grid", "important");
  document.querySelector(".ds-collapsible-text")!.textContent = "[DeepRole Service]\n[DeepRole Scene Choices]\nSuggest four replies.";
  concealChoicePayloads(document); hideCharacterTextServices(); expect(shell.style.display).toBe("none");
  document.querySelector(".ds-collapsible-text")!.textContent = "Mira, where is the key?";
  concealChoicePayloads(document); hideCharacterTextServices();
  expect(row.style.display).toBe("grid"); expect(row.style.getPropertyPriority("display")).toBe("important");
  expect(row.hasAttribute("data-deeprole-choices-request")).toBe(false); expect(shell.style.display).toBe("");
});
it("does not overwrite a newer native style when restoring a reused choices request", () => {
  imageTurns(); const row = document.getElementById("request")!;
  document.querySelector(".ds-collapsible-text")!.textContent = "[DeepRole Service]\n[DeepRole Scene Choices]\nSuggest four replies.";
  concealChoicePayloads(document); hideCharacterTextServices();
  row.style.setProperty("display", "flex", "important"); document.querySelector(".ds-collapsible-text")!.textContent = "Continue.";
  concealChoicePayloads(document); hideCharacterTextServices(); expect(row.style.display).toBe("flex");
});
