import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dismissSceneChoiceCards, latestSceneChoiceTarget, syncSceneChoiceCards } from "../src/adapters/deepseek-choices-dom";
import { parseSceneChoices, sceneChoiceRecoveryPrompt } from "../src/core/scene-choices";
import { findServiceReplyRows } from "../src/adapters/deepseek-service-dom";

const options = ["positive", "neutral", "negative", "surprise"].map((kind) => ({ kind, label: kind, text: `I choose ${kind}.` }));
const payload = `<deeprole_choices>${JSON.stringify({ version: 1, options })}</deeprole_choices>`;
const pick = vi.fn(async () => true);
const request = vi.fn(async () => true);
function answer(text: string, id = "scene") {
  const row = document.createElement("article"); row.dataset.messageId = id; row.dataset.role = "assistant";
  row.textContent = text; document.body.append(row); return row;
}
function sync(locale: "ru" | "en" = "ru", enabled = true, generating = false) {
  syncSceneChoiceCards(enabled, generating, locale, pick, document, { busy: false, onRequest: request });
}
const host = () => document.querySelector<HTMLElement>("[data-deeprole-choices-host]");
const recovery = () => document.querySelector<HTMLElement>("[data-deeprole-choices-recovery]");

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  dismissSceneChoiceCards(document, false); pick.mockClear(); request.mockClear();
});
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

describe("scene choice protocol", () => {
  it("normalizes four options and accepts only a complete block", () => {
    expect(parseSceneChoices(payload)?.choices.options.map((item) => item.kind)).toEqual(["positive", "neutral", "negative", "surprise"]);
    expect(parseSceneChoices(payload.replace("</deeprole_choices>", ""))).toBeNull();
    expect(parseSceneChoices(payload.replace('"surprise"', '"positive"'))).toBeNull();
    expect(parseSceneChoices(payload.replace('"version":1', '"version":2'))).toBeNull();
  });
  it.each([
    "not json", "null", "[]", "5", JSON.stringify({ version: 1, options: {} }),
    ...[null, [], { ...options[0], kind: "unknown" }, { ...options[0], label: 7 }, { ...options[0], label: " " },
      { ...options[0], label: "x".repeat(101) }, { ...options[0], text: 7 }, { ...options[0], text: " " }, { ...options[0], text: "x".repeat(601) }]
      .map((item) => JSON.stringify({ version: 1, options: [item, ...options.slice(1)] })),
  ])("rejects malformed option data: %s", (body) => {
    expect(parseSceneChoices(`<deeprole_choices>${body}</deeprole_choices>`)).toBeNull();
  });
  it("bounds payload size and supports legacy random options", () => {
    expect(parseSceneChoices(`<deeprole_choices>${" ".repeat(8001)}${JSON.stringify({ version: 1, options })}</deeprole_choices>`)).toBeNull();
    expect(parseSceneChoices(payload.replace('"surprise"', '"random"'))?.choices.options[3].kind).toBe("surprise");
  });
  for (const locale of ["ru", "en"] as const) it(`makes a visible, non-continuing recovery request in ${locale}`, () => {
    const prompt = sceneChoiceRecoveryPrompt(locale);
    expect(prompt).toMatch(/^\[DeepRole Service\]\n\[DeepRole Scene Choices\]/);
    expect(prompt).toContain(locale === "ru" ? "Не продолжай и не переписывай сцену" : "Do not continue or rewrite the scene");
    expect(prompt).toContain("Return only one complete");
  });
});

describe("history restoration and explicit recovery", () => {
  it("restores choices from saved history without requesting anything", () => {
    answer("The gate opens.\n" + payload); sync();
    expect(host()?.shadowRoot?.querySelectorAll("button")).toHaveLength(4);
    expect(recovery()).toBeNull(); expect(request).not.toHaveBeenCalled();
    expect(document.querySelector("[data-deeprole-choices-payload]")?.textContent).toBe(payload);
    expect(document.querySelector("article")?.textContent).toContain("The gate opens.");
    host()!.remove(); sync();
    expect(host()?.shadowRoot?.querySelectorAll("button")).toHaveLength(4);
  });
  it("has a stable signature and one card across Markdown rerenders", () => {
    const row = answer("Scene\n" + payload); sync();
    const signature = host()!.dataset.deeproleChoicesSignature;
    row.replaceChildren(); const body = document.createElement("div"); body.className = "ds-markdown";
    body.append(document.createElement("p"), document.createElement("pre"));
    body.firstElementChild!.textContent = "Scene"; body.lastElementChild!.textContent = payload; row.append(body);
    sync(); sync();
    expect(host()!.dataset.deeproleChoicesSignature).toBe(signature);
    expect(document.querySelectorAll("[data-deeprole-choices-host]")).toHaveLength(1);
  });
  it("rebuilds a cloned empty host rather than mistaking it for restored buttons", () => {
    answer("Scene\n" + payload); sync();
    document.body.innerHTML = document.body.innerHTML; sync();
    expect(host()?.shadowRoot?.querySelectorAll("button")).toHaveLength(4);
  });
  it("offers recovery for a missing or malformed block, but does not send on its own", async () => {
    answer("The gate opens. <deeprole_choices>{broken}</deeprole_choices>"); sync();
    const button = recovery()?.shadowRoot?.querySelector("button");
    expect(button?.textContent).toBe("Предложить варианты");
    expect(recovery()?.shadowRoot?.textContent).toContain("Отправит запрос в чат");
    expect(request).not.toHaveBeenCalled(); button!.click();
    await Promise.resolve(); expect(request).toHaveBeenCalledOnce();
    expect(pick).not.toHaveBeenCalled();
  });
  it("picks text only through the supplied draft handler", async () => {
    answer("Scene\n" + payload); sync();
    const button = host()!.shadowRoot!.querySelector("button")!; button.click(); await Promise.resolve();
    expect(pick).toHaveBeenCalledWith(options[0], host()!.dataset.deeproleChoicesSignature);
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });
  it("never displays old choices after a newer assistant reply", () => {
    answer("Old\n" + payload, "old"); sync(); answer("A new scene.", "new"); sync();
    expect(host()).toBeNull(); expect(recovery()?.previousElementSibling?.getAttribute("data-message-id")).toBe("new");
  });
  it("never displays choices or recovery beneath the latest user turn", () => {
    answer("Old\n" + payload); const user = answer("My reply\n" + payload, "user"); user.dataset.role = "user"; sync();
    expect(host()).toBeNull(); expect(recovery()).toBeNull(); expect(latestSceneChoiceTarget()).toBeNull();
  });
  it("ignores the valid example in a recovery prompt", () => {
    const row = answer(sceneChoiceRecoveryPrompt("ru")); row.dataset.role = "user"; sync();
    expect(host()).toBeNull(); expect(recovery()).toBeNull();
  });
  it("does not accept options from the reasoning section", () => {
    const row = answer(""); const reasoning = document.createElement("div"); reasoning.className = "ds-think-content"; reasoning.textContent = payload;
    const body = document.createElement("div"); body.className = "ds-markdown"; body.textContent = "The gate opens."; row.append(reasoning, body); sync();
    expect(host()).toBeNull(); expect(recovery()).not.toBeNull();
  });
  it("keeps memory analysis and handoff replies out of scene recovery", () => {
    const command = answer("[DeepRole Service]\n[Request ID: memory]\nAnalyze"); command.dataset.role = "user";
    answer("No new facts.", "result"); sync(); expect(recovery()).toBeNull();
  });
  it("allows explicit retry after a failed options request", () => {
    answer("[DeepRole Service]\n[Request ID: choices]\n[DeepRole Scene Choices]");
    const row = answer("Sorry, I could not return the requested format.", "result"); row.dataset.deeproleServiceReply = "true";
    sync(); expect(recovery()).not.toBeNull();
  });
  it("clears dismissal on navigation so returning to a saved scene restores its buttons", () => {
    answer("Scene\n" + payload); sync(); dismissSceneChoiceCards(); sync(); expect(host()).toBeNull();
    dismissSceneChoiceCards(document, false); sync(); expect(host()).not.toBeNull();
  });
  it("puts a transport retry next to the original scene, not under a user message", () => {
    const scene = answer("The gate opens.");
    const command = answer(sceneChoiceRecoveryPrompt("ru"), "request"); command.dataset.role = "user";
    answer("", "empty-result"); sync();
    expect(recovery()?.previousElementSibling).toBe(scene);
    expect(request).not.toHaveBeenCalled();
  });
  it("removes both kinds of cards when disabled or generating", () => {
    answer("Scene"); sync(); expect(recovery()).not.toBeNull(); sync("ru", false); expect(recovery()).toBeNull();
    sync("ru", true, true); expect(recovery()).toBeNull();
    document.querySelector("article")!.textContent = "Scene\n" + payload; sync(); expect(host()).not.toBeNull();
    sync("ru", true, true); expect(host()).toBeNull();
  });
  it("localizes recovery and restores the final card when a complete answer arrives", () => {
    const row = answer("Scene"); sync("en"); expect(recovery()?.shadowRoot?.querySelector("button")?.textContent).toBe("Suggest options");
    row.textContent = "Scene\n" + payload; sync("en"); expect(recovery()).toBeNull();
    expect(host()?.shadowRoot?.querySelector("h3")?.textContent).toBe("Choose a reply or action");
  });
  it("keeps existing hosts during repeated idle scans instead of churning the DOM", () => {
    const row = answer("Scene"); sync(); const buttonHost = recovery();
    for (let index = 0; index < 50; index++) sync();
    expect(recovery()).toBe(buttonHost);
    row.textContent = "Scene\n" + payload; sync(); const optionsHost = host();
    for (let index = 0; index < 50; index++) sync();
    expect(host()).toBe(optionsHost);
  });
  it("renders model strings as plain text, not HTML", () => {
    answer(payload.replace("positive", "positive").replace('"label":"positive"', '"label":"<img src=x onerror=alert(1)>"')); sync();
    expect(host()?.shadowRoot?.querySelector("img")).toBeNull();
    expect(host()?.shadowRoot?.querySelector("strong")?.textContent).toContain("<img");
  });
  it("correlates only the reply of the matching options request through layout wrappers", () => {
    const first = answer("[DeepRole Service]\n[Request ID: old]\n[DeepRole Scene Choices]"); first.dataset.role = "user";
    answer(payload, "old-reply");
    const current = answer("[DeepRole Service]\n[Request ID: current]\n[DeepRole Scene Choices]"); current.dataset.role = "user";
    const wrapper = document.createElement("section"); const row = document.createElement("article"); row.textContent = payload; wrapper.append(row); document.body.append(wrapper);
    expect(findServiceReplyRows("current", document, "<deeprole_choices>")).toEqual([row]);
    expect(findServiceReplyRows("absent", document, "<deeprole_choices>")).toEqual([]);
  });
});
