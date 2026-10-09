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
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  dismissSceneChoiceCards(document, false); pick.mockClear(); request.mockClear();
});
afterEach(() => { dismissSceneChoiceCards(document, false); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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
  it("conceals streamed character JSON before choices and shows one loader below the story", () => {
    const row = answer("Мира отвечает.\n<deeprole_characters>{\"request\":\"", "live");
    sync("ru", true, true);
    expect(row.firstChild?.textContent).toContain("Мира отвечает.");
    expect(row.querySelector<HTMLElement>("[data-deeprole-choices-payload='characters']")?.style.display).toBe("none");
    expect(document.querySelectorAll("[data-deeprole-choices-loading]")).toHaveLength(1);
    expect(row.nextElementSibling?.matches("[data-deeprole-choices-loading]")).toBe(true);
    row.append(document.createTextNode("abc\"}</deeprole_characters>\n" + payload.slice(0, 70)));
    sync("ru", true, true);
    expect(row.querySelectorAll("[data-deeprole-choices-payload]")).toHaveLength(2);
    expect(row.querySelector<HTMLElement>("[data-deeprole-choices-payload='characters']")?.textContent).toContain("</deeprole_characters>");
    expect(row.querySelector<HTMLElement>("[data-deeprole-choices-payload='choices']")?.textContent).toBe(payload.slice(0, 70));
    expect(document.querySelectorAll("[data-deeprole-choices-loading]")).toHaveLength(1);
  });
  it("waits for transport JSON, not story or thinking", () => {
    const row = answer("", "live");
    const thought = document.createElement("div"); thought.className = "ds-think-content"; thought.textContent = payload;
    const body = document.createElement("div"); body.className = "ds-markdown"; body.textContent = "Mira opens the gate.";
    row.append(thought, body);
    sync("ru", true, true);
    expect(document.querySelectorAll("[data-deeprole-choices-loading]")).toHaveLength(0); expect(recovery()).toBeNull();
    body.append(" More story. <deeprole_characters>{}</deeprole_characters>"); sync("ru", true, true);
    expect(document.querySelectorAll("[data-deeprole-choices-loading]")).toHaveLength(1);
    body.append(payload.slice(0, 55)); sync("ru", true, true); sync("ru", true, true);
    expect(document.querySelectorAll("[data-deeprole-choices-loading]")).toHaveLength(1);
    expect(body.querySelector("[data-deeprole-choices-payload='choices']")?.textContent).toBe(payload.slice(0, 55));
  });
  it("removes an earlier loader when a different story starts", () => {
    answer("Scene. " + payload.slice(0, 55)); sync("en", true, true);
    expect(document.querySelectorAll("[data-deeprole-choices-loading]")).toHaveLength(1);
    answer("A new scene begins.", "new"); sync("en", true, true);
    expect(document.querySelectorAll("[data-deeprole-choices-loading]")).toHaveLength(0); expect(recovery()).toBeNull();
  });
  it("keeps story-only settling silent before offering the final fallback", () => {
    vi.useFakeTimers();
    try {
      answer("Mira opens the gate."); sync("en", true, true); sync("en");
      expect(document.querySelectorAll("[data-deeprole-choices-loading]")).toHaveLength(0); expect(recovery()).toBeNull();
      vi.advanceTimersByTime(1250);
      expect(document.querySelectorAll("[data-deeprole-choices-loading]")).toHaveLength(0); expect(recovery()).not.toBeNull();
    } finally { vi.useRealTimers(); }
  });
  it("does not show a loader merely because a manual request is busy", () => {
    answer("Mira opens the gate.");
    syncSceneChoiceCards(true, true, "ru", pick, document, { busy: true, onRequest: request });
    expect(document.querySelectorAll("[data-deeprole-choices-loading]")).toHaveLength(0); expect(recovery()).toBeNull();
  });
  it("never mistakes old malformed JSON for the newly requested response", () => {
    answer("Scene. <deeprole_choices>{broken}</deeprole_choices>"); sync();
    const requestSignature = latestSceneChoiceTarget()!.signature;
    syncSceneChoiceCards(true, true, "ru", pick, document, { busy: true, requestSignature, onRequest: request });
    expect(document.querySelectorAll("[data-deeprole-choices-loading]")).toHaveLength(0);
    answer(payload.slice(0, 55), "new-reply");
    syncSceneChoiceCards(true, true, "ru", pick, document, { busy: true, requestSignature, onRequest: request });
    expect(document.querySelectorAll("[data-deeprole-choices-loading]")).toHaveLength(1);
  });
  it.each([false, "throw"])("restores a refused manual request without an early loader: %s", async result => {
    answer("Mira opens the gate.");
    const reject = vi.fn(async () => { if (result === "throw") throw new Error("offline"); return false; });
    syncSceneChoiceCards(true, false, "en", pick, document, { busy: false, onRequest: reject });
    const card = recovery()!; const button = card.shadowRoot!.querySelector<HTMLButtonElement>("button")!;
    button.click();
    expect(card.style.display).toBe("none"); expect(button.disabled).toBe(true);
    expect(document.querySelectorAll("[data-deeprole-choices-loading]")).toHaveLength(0);
    await vi.waitFor(() => { expect(button.disabled).toBe(false); expect(card.style.display).toBe(""); });
    expect(reject).toHaveBeenCalledOnce();
  });
  it("hides streamed chunks, retains parseable data and preserves text after the block", () => {
    const row = answer("Scene. " + payload.slice(0, 60));
    sync("ru", true, true);
    expect(row.querySelector("[data-deeprole-choices-payload]")?.textContent).toBe(payload.slice(0, 60));
    expect(document.querySelectorAll("[data-deeprole-choices-loading]")).toHaveLength(1);
    expect(recovery()).toBeNull();
    row.append(document.createTextNode(payload.slice(60) + " Story continues."));
    sync("ru", true, true); sync("ru", true, true);
    expect(parseSceneChoices(row.textContent!)?.choices.options).toHaveLength(4);
    expect(row.textContent).toContain("Story continues.");
    expect(row.querySelectorAll("[data-deeprole-choices-payload] [data-deeprole-choices-payload]")).toHaveLength(0);
    sync(); expect(host()).not.toBeNull();
    expect(document.querySelectorAll("[data-deeprole-choices-loading]")).toHaveLength(0);
  });
  it("handles a framework updating its original text node during streaming", () => {
    const row = answer("Scene. " + payload.slice(0, 55));
    const node = row.firstChild!;
    sync("en", true, true);
    node.textContent = "Scene. " + payload;
    sync("en", true, true); sync("en");
    expect(row.textContent).toBe("Scene. " + payload);
    expect(host()!.shadowRoot!.querySelectorAll(".grid button")).toHaveLength(4);
  });
  it("leaves reasoning and user text untouched while concealing only final choices", () => {
    const row = answer("", "reasoning-scene");
    const thought = document.createElement("div"); thought.className = "ds-think-content"; thought.textContent = "Thinking " + payload;
    const final = document.createElement("div"); final.className = "ds-markdown"; final.textContent = "Scene " + payload;
    row.append(thought, final);
    const user = answer("User " + payload, "user"); user.dataset.role = "user";
    sync("ru", true, true);
    expect(thought.textContent).toBe("Thinking " + payload);
    expect(thought.querySelector("[data-deeprole-choices-payload]")).toBeNull();
    expect(user.textContent).toBe("User " + payload);
    expect(user.querySelector("[data-deeprole-choices-payload]")).toBeNull();
    expect(final.querySelector("[data-deeprole-choices-payload]")).not.toBeNull();
  });
  it("hides the manual request while preserving service reply correlation", () => {
    answer("Scene.");
    const command = answer("[DeepRole Service]\n[Request ID: choices]\n[DeepRole Scene Choices]", "command"); command.dataset.role = "user";
    const reply = answer(payload, "reply");
    sync();
    expect(command.style.display).toBe("none");
    expect(findServiceReplyRows("choices", document, "<deeprole_choices>")).toEqual([reply]);
    expect(host()).not.toBeNull();
  });
  it("assigns a persistent semantic color to each type before selection", () => {
    answer("Scene\n" + payload); sync();
    const buttons = [...host()!.shadowRoot!.querySelectorAll<HTMLButtonElement>(".grid button")];
    expect(buttons.map(button => button.dataset.choiceKind)).toEqual(options.map(option => option.kind));
    expect(buttons.every(button => button.getAttribute("aria-pressed") === "false")).toBe(true);
    sync("en");
    expect([...host()!.shadowRoot!.querySelectorAll<HTMLButtonElement>(".grid button")].map(button => button.dataset.choiceKind)).toEqual(options.map(option => option.kind));
    expect(pick).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled();
  });
  it("restores choices from saved history without requesting anything", () => {
    answer("The gate opens.\n" + payload); sync();
    expect(host()?.shadowRoot?.querySelectorAll(".grid button")).toHaveLength(4);
    expect(recovery()).toBeNull(); expect(request).not.toHaveBeenCalled();
    expect(document.querySelector("[data-deeprole-choices-payload]")?.textContent).toBe(payload);
    expect(document.querySelector("article")?.textContent).toContain("The gate opens.");
    host()!.remove(); sync();
    expect(host()?.shadowRoot?.querySelectorAll(".grid button")).toHaveLength(4);
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
    expect(host()?.shadowRoot?.querySelectorAll(".grid button")).toHaveLength(4);
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
    const button = host()!.shadowRoot!.querySelector<HTMLButtonElement>(".grid button")!; button.click(); await Promise.resolve();
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
  it("restores the last story choices after a saved-state service turn and chat return", () => {
    const scene = answer("Scene\n" + payload, "story");
    sync(); expect(host()?.previousElementSibling).toBe(scene);
    const command = answer("[DeepRole Service]\n[Request ID: handoff]\nSave state", "request"); command.dataset.role = "user";
    answer('<deeprole_data>{"type":"handoff","title":"Gate","summary":"Mira has the map."}</deeprole_data>', "snapshot");
    dismissSceneChoiceCards(document, false); sync();
    expect(host()?.previousElementSibling).toBe(scene);
    expect(recovery()).toBeNull();
    const newer = answer("The next scene has changed.", "new-story"); sync();
    expect(host()).toBeNull(); expect(recovery()?.previousElementSibling).toBe(newer);
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
  it("restores identical options when a regenerated answer reuses its message id", () => {
    const row = answer("Mira holds the letter.\n" + payload); sync();
    dismissSceneChoiceCards(); sync(); expect(host()).toBeNull();
    row.textContent = "Mira puts the letter on the table.\n" + payload; sync();
    expect(host()?.shadowRoot?.querySelectorAll(".grid button")).toHaveLength(4); expect(request).not.toHaveBeenCalled();
  });
  it("rejects a stale choice when the story changes but the four options are identical", async () => {
    const row = answer("Mira holds the letter.\n" + payload); sync();
    const button = host()!.shadowRoot!.querySelector<HTMLButtonElement>(".grid button")!;
    row.textContent = "Mira puts the letter on the table.\n" + payload;
    button.click(); await Promise.resolve();
    expect(pick).not.toHaveBeenCalled(); expect(host()!.shadowRoot!.querySelector(".choice-status")?.textContent).toContain("Сцена уже изменилась");
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
    expect(host()?.shadowRoot?.querySelector("h2")?.textContent).toBe("Your move");
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
  it("rejects an old option immediately when a new turn appears before the next scan", async () => {
    answer("Old scene\n" + payload); sync();
    const button = host()!.shadowRoot!.querySelector<HTMLButtonElement>(".grid button")!;
    answer("A different scene.", "new"); button.click(); await Promise.resolve();
    expect(pick).not.toHaveBeenCalled();
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });
  it("uses the current handler without rebuilding an unchanged card", async () => {
    answer("Scene\n" + payload); sync(); const firstHost = host();
    const nextPick = vi.fn(async () => true);
    syncSceneChoiceCards(true, false, "ru", nextPick);
    expect(host()).toBe(firstHost);
    host()!.shadowRoot!.querySelector<HTMLButtonElement>(".grid button")!.click(); await Promise.resolve();
    expect(nextPick).toHaveBeenCalledOnce(); expect(pick).not.toHaveBeenCalled();
  });
  it("keeps pending options focusable while preventing a duplicate selection", async () => {
    let finish!: (ok: boolean) => void;
    const pendingPick = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    answer("Scene\n" + payload); syncSceneChoiceCards(true, false, "ru", pendingPick);
    const card = host()!; const button = card.shadowRoot!.querySelector<HTMLButtonElement>(".grid button")!;
    button.focus(); button.click(); button.click();
    expect(pendingPick).toHaveBeenCalledOnce(); expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(card.shadowRoot!.activeElement).toBe(button);
    finish(false); await Promise.resolve(); await Promise.resolve();
    expect(button.getAttribute("aria-disabled")).toBe("false");
    expect(card.shadowRoot!.activeElement).toBe(button);
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });
  it.each(["ru", "en"] as const)("expands full option text locally and preserves it across idle scans (%s)", locale => {
    answer("Scene\n" + payload); sync(locale);
    const card = host()!; const toggle = card.shadowRoot!.querySelector<HTMLButtonElement>(".choice-expand")!;
    expect(toggle.textContent).toBe(""); expect(toggle.querySelector("svg")).not.toBeNull();
    expect(toggle.getAttribute("aria-label")).toBe(locale === "ru" ? "Текст целиком" : "Full text");
    toggle.focus(); toggle.click(); sync(locale);
    expect(toggle.getAttribute("aria-label")).toBe(locale === "ru" ? "Свернуть текст" : "Collapse text");
    expect(host()).toBe(card); expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(card.shadowRoot!.querySelector(".grid")?.getAttribute("data-expanded")).toBe("true");
    expect(card.shadowRoot!.activeElement).toBe(toggle); expect(pick).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled();
    toggle.click(); expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
  it.each(["ru", "en"] as const)("minimizes locally and restores the same options, selection and text mode (%s)", async locale => {
    const input = document.createElement("textarea"); input.value = "My untouched draft"; document.body.append(input);
    answer("Scene\n" + payload); sync(locale);
    const card = host()!, root = card.shadowRoot!;
    const grid = root.querySelector<HTMLElement>(".grid")!;
    const minimize = root.querySelector<HTMLButtonElement>(".choice-minimize")!;
    const restore = root.querySelector<HTMLButtonElement>(".choice-restore")!;
    expect(minimize.getAttribute("aria-label")).toBe(locale === "ru" ? "Свернуть варианты" : "Minimize options");
    expect(restore.getAttribute("aria-label")).toBe(locale === "ru" ? "Развернуть варианты" : "Restore options");
    root.querySelector<HTMLButtonElement>(".choice-expand")!.click();
    const choice = grid.querySelector<HTMLButtonElement>("button")!; choice.click(); await Promise.resolve(); await Promise.resolve();
    pick.mockClear(); minimize.click(); sync(locale);
    expect(host()).toBe(card); expect(grid.hidden).toBe(true); expect(minimize.hidden).toBe(true); expect(restore.hidden).toBe(false);
    expect(restore.getAttribute("aria-expanded")).toBe("false"); expect(root.activeElement).toBe(restore);
    restore.click();
    expect(grid.hidden).toBe(false); expect(root.activeElement).toBe(minimize); expect(restore.hidden).toBe(true);
    expect(grid.dataset.expanded).toBe("true"); expect(choice.getAttribute("aria-pressed")).toBe("true");
    expect(input.value).toBe("My untouched draft"); expect(pick).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled();
  });
  it("opens fresh choices after a minimized scene without altering the enabled mode", () => {
    answer("Scene\n" + payload); sync("en");
    const old = host()!; old.shadowRoot!.querySelector<HTMLButtonElement>(".choice-minimize")!.click();
    answer("A new scene\n" + payload, "new"); sync("en");
    expect(host()).not.toBe(old); expect(old.isConnected).toBe(false);
    expect(host()!.shadowRoot!.querySelector<HTMLElement>(".grid")!.hidden).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
  it.each(["ru", "en"] as const)("keeps successful selections quiet and retains accessible navigation (%s)", async locale => {
    answer("Scene\n" + payload); sync(locale);
    const card = host()!; const root = card.shadowRoot!;
    const status = root.querySelector<HTMLParagraphElement>(".choice-status")!;
    expect(status.hidden).toBe(true); expect(status.textContent).toBe("");
    expect(root.querySelector(".grid")?.getAttribute("aria-describedby")).toBe(root.querySelector(".choice-navigation")?.id);
    expect(root.querySelector(".choice-navigation")?.textContent).toContain("1–4");
    expect(root.textContent).not.toContain(locale === "ru" ? "Выбор попадёт в поле сообщения" : "A choice fills the message box");
    root.querySelector<HTMLButtonElement>(".grid button")!.click(); await Promise.resolve(); await Promise.resolve();
    expect(pick).toHaveBeenCalledOnce(); expect(status.hidden).toBe(true); expect(status.textContent).toBe("");
    expect(root.querySelector(".grid button")?.getAttribute("aria-pressed")).toBe("true");
  });
  it("settles a synchronously throwing handler without leaving options busy", () => {
    answer("Scene\n" + payload); syncSceneChoiceCards(true, false, "ru", () => { throw new Error("broken composer"); });
    const card = host()!; const button = card.shadowRoot!.querySelector<HTMLButtonElement>(".grid button")!; button.click();
    expect(card.shadowRoot!.querySelector(".grid")?.getAttribute("aria-busy")).toBe("false");
    expect(button.getAttribute("aria-disabled")).toBe("false");
    expect(card.shadowRoot!.querySelector(".choice-status")?.textContent).toBe("Поле ввода сейчас недоступно.");
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
