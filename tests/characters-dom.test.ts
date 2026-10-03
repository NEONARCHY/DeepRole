import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { latestCharacterResponse, foldCharacterPayload, syncChoicePortraits } from "../src/adapters/deepseek-characters-dom";
import { dismissSceneChoiceCards, syncSceneChoiceCards } from "../src/adapters/deepseek-choices-dom";
import { EMPTY_CHARACTER, EMPTY_STATUS, syncPortraitImage, silhouetteSource, portraitSource } from "../src/core/characters";
import type { CharacterScene, SceneEntity } from "../src/core/types";
const payload = `<deeprole_characters>${JSON.stringify({ world: "w", chat: "a", base: "v", present: ["mira"], updates: [{ id: "mira", state: EMPTY_STATUS }] })}</deeprole_characters>`;
function row(text: string, role = "assistant") { const el = document.createElement("article"); el.dataset.role = role; el.dataset.messageId = crypto.randomUUID(); el.textContent = text; document.body.append(el); return el; }
beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }); vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList); dismissSceneChoiceCards(document, false); });
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("only reads the latest assistant turn", () => { row(payload); expect(latestCharacterResponse()?.turn).not.toBeNull(); row("New question", "user"); expect(latestCharacterResponse()).toBeNull(); row("New answer without a block"); expect(latestCharacterResponse()?.turn).toBeNull(); });
it("ignores payloads in reasoning and service replies", () => {
  const r = row("A normal scene."); const thinking = document.createElement("div"); thinking.className = "ds-think-content"; thinking.textContent = payload; r.prepend(thinking);
  expect(latestCharacterResponse()?.turn).toBeNull(); r.textContent = payload; r.dataset.deeproleServiceReply = "true"; expect(latestCharacterResponse()).toBeNull();
});
it("does not execute model markup", () => { row(payload.replace('"condition":""', '"condition":"<img src=x onerror=alert(1)>"')); expect(latestCharacterResponse()?.turn?.updates[0]?.state.condition).toContain("onerror"); expect(document.querySelector("img")).toBeNull(); });
it("folds just the JSON while keeping the story and parsed state stable", () => {
  const r = row("Mira opens the gate.\n" + payload + "\nThe rain stops."); const first = latestCharacterResponse()!.turn;
  foldCharacterPayload(r, "ru", "updated"); expect(r.textContent).toContain("Mira opens the gate."); expect(r.textContent).toContain("The rain stops.");
  expect(r.querySelector("summary")!.textContent).toBe("Обновлено после ответа"); expect(latestCharacterResponse()?.turn).toEqual(first);
  foldCharacterPayload(r, "en", "stale"); expect(r.querySelectorAll("details")).toHaveLength(1); expect(r.querySelector("summary")!.textContent).toContain("Update skipped");
});
it("folds only the final character payload, never an example in reasoning", () => {
  const r = row("The final scene.\n" + payload + "\nThe door stays closed.");
  const thinking = document.createElement("div"); thinking.className = "ds-think-content";
  thinking.textContent = "I am considering this example: " + payload; r.prepend(thinking);
  const before = thinking.innerHTML;
  foldCharacterPayload(r, "en", "updated");
  expect(thinking.innerHTML).toBe(before);
  expect(thinking.querySelector("details")).toBeNull();
  expect(r.querySelector("[data-deeprole-characters-result]")?.closest(".ds-think-content")).toBeNull();
  expect(r.querySelector("[data-deeprole-characters-result] pre")?.textContent).toBe(payload);
  expect(r.querySelector("summary")?.textContent).toBe("Updated after reply");
  expect(latestCharacterResponse()?.turn?.present).toEqual(["mira"]);
  expect(r.textContent).toContain("The final scene."); expect(r.textContent).toContain("The door stays closed.");
});
it("does not fold a reasoning-only character block", () => {
  const r = row("No state was sent in the final reply.");
  const thinking = document.createElement("div"); thinking.dataset.testid = "reasoning-content"; thinking.textContent = payload; r.prepend(thinking);
  const before = r.innerHTML; foldCharacterPayload(r, "en", "missing");
  expect(r.innerHTML).toBe(before); expect(latestCharacterResponse()?.turn).toBeNull();
});
it("folds a final payload split across Markdown spans and keeps its surrounding story", () => {
  const r = row(""); const prefix = document.createElement("p"); prefix.textContent = "Mira raises the lamp.";
  const body = document.createElement("div"); body.className = "ds-markdown";
  for (const part of [payload.slice(0, 40), payload.slice(40, 90), payload.slice(90)]) { const span = document.createElement("span"); span.textContent = part; body.append(span); }
  const suffix = document.createElement("p"); suffix.textContent = "The seal remains intact."; r.append(prefix, body, suffix);
  const first = latestCharacterResponse()?.turn;
  foldCharacterPayload(r, "ru", "updated"); foldCharacterPayload(r, "en", "stale");
  expect(r.querySelectorAll("details")).toHaveLength(1); expect(r.querySelector("pre")?.textContent).toBe(payload);
  expect(latestCharacterResponse()?.turn).toEqual(first); expect(prefix.textContent).toBe("Mira raises the lamp."); expect(suffix.textContent).toBe("The seal remains intact.");
  expect(r.querySelector("summary")?.textContent).toBe("Update skipped: sheets have already changed.");
});
it("leaves interleaved reasoning intact rather than extracting it into transport details", () => {
  const r = row(""); const start = document.createTextNode(payload.slice(0, 40)); const end = document.createTextNode(payload.slice(40));
  const thinking = document.createElement("div"); thinking.className = "ds-think-content-wrapper"; thinking.textContent = "Independent thought."; r.append(start, thinking, end);
  const before = r.innerHTML; foldCharacterPayload(r, "en", "updated"); expect(r.innerHTML).toBe(before);
});
it("reuses choices and decorates only current participants, without duplicate buttons", () => {
  const choices = ["positive", "neutral", "negative", "surprise"].map(kind => ({ kind, label: kind, text: kind })); row(`<deeprole_choices>${JSON.stringify({ version: 1, options: choices })}</deeprole_choices>`);
  const people: SceneEntity[] = ["hero", "mira", "noah"].map(id => ({ id, name: id, kind: "character", worldId: "w", description: "", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1, characterSheet: { ...EMPTY_CHARACTER, protagonist: id === "hero" } }));
  const scene: CharacterScene = { revision: "v", presentIds: ["hero", "mira", "noah"], partnerId: "noah", states: {}, updatedAt: 1 };
  const pick = vi.fn(async () => true); const open = vi.fn(); syncSceneChoiceCards(true, false, "en", pick); syncChoicePortraits(true, people, scene, "en", open);
  const host = document.querySelector<HTMLElement>("[data-deeprole-choices-host]")!;
  const floating = document.querySelector<HTMLElement>("[data-deeprole-portrait-layer]")!.shadowRoot!;
  expect([...floating.querySelectorAll(".dr-cast-portrait")].map(b => b.getAttribute("aria-label"))).toEqual(["Open character: hero", "Open character: noah", "Open character: mira"]);
  syncSceneChoiceCards(true, false, "en", pick); syncChoicePortraits(true, people, scene, "en", open);
  expect(document.querySelector("[data-deeprole-choices-host]")).toBe(host); expect(host.shadowRoot!.querySelectorAll(".grid button")).toHaveLength(4); expect(floating.querySelectorAll(".dr-cast-portrait")).toHaveLength(3); expect(host.shadowRoot!.querySelectorAll(".dr-cast-portrait")).toHaveLength(0);
  floating.querySelector<HTMLButtonElement>(".dr-cast-portrait.right")!.click(); expect(open).toHaveBeenCalledWith("noah");
  syncChoicePortraits(true, people, { ...scene, revision: "v2", partnerId: null }, "en", open); expect(floating.querySelectorAll(".dr-cast-portrait")).toHaveLength(3);
  syncChoicePortraits(false, people, scene, "en", open); expect(host.shadowRoot!.querySelectorAll(".grid button")).toHaveLength(4);
});

it("keeps reply choices when the same reply also folds a character update", () => {
  const choices = ["positive", "neutral", "negative", "surprise"].map(kind => ({ kind, label: kind, text: kind }));
  const wrapper = document.createElement("div"); document.body.append(wrapper);
  const reply = row("Mira opens the gate.\n" + payload + "\n<deeprole_choices>" + JSON.stringify({ version: 1, options: choices }) + "</deeprole_choices>");
  wrapper.append(reply);
  const pick = vi.fn(async () => true);
  syncSceneChoiceCards(true, false, "en", pick);
  const host = document.querySelector("[data-deeprole-choices-host]"); expect(host).not.toBeNull();
  foldCharacterPayload(reply, "en", "updated");
  syncSceneChoiceCards(true, false, "en", pick);
  expect(document.querySelector("[data-deeprole-choices-host]")).toBe(host);
  expect(host!.shadowRoot!.querySelectorAll(".grid button")).toHaveLength(4);
});

it("keeps the same choice card when thinking or the localized character summary changes", () => {
  const choices = ["positive", "neutral", "negative", "surprise"].map(kind => ({ kind, label: kind, text: kind }));
  const reply = row("Mira raises the lamp.\n" + payload + "\n<deeprole_choices>" + JSON.stringify({ version: 1, options: choices }) + "</deeprole_choices>");
  const thinking = document.createElement("div"); thinking.className = "ds-think-content"; thinking.textContent = "Thinking."; reply.prepend(thinking);
  const pick = vi.fn(async () => true); syncSceneChoiceCards(true, false, "en", pick);
  const host = document.querySelector<HTMLElement>("[data-deeprole-choices-host]")!; const button = host.shadowRoot!.querySelector<HTMLButtonElement>(".grid button")!;
  button.focus(); thinking.textContent = "Thinking in more detail."; foldCharacterPayload(reply, "ru", "updated"); syncSceneChoiceCards(true, false, "en", pick);
  expect(document.querySelector("[data-deeprole-choices-host]")).toBe(host); expect(host.shadowRoot!.activeElement).toBe(button);
  foldCharacterPayload(reply, "en", "stale"); syncSceneChoiceCards(true, false, "en", pick);
  expect(document.querySelector("[data-deeprole-choices-host]")).toBe(host); expect(host.shadowRoot!.activeElement).toBe(button);
});

it("keeps portrait focus and nodes across emotion updates, and uses the current click callback", () => {
  const choices = ["positive", "neutral", "negative", "surprise"].map(kind => ({ kind, label: kind, text: kind }));
  row(`<deeprole_choices>${JSON.stringify({ version: 1, options: choices })}</deeprole_choices>`);
  const people: SceneEntity[] = ["hero", "mira"].map(id => ({ id, name: id, kind: "character", worldId: "w", description: "", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1, characterSheet: { ...EMPTY_CHARACTER, protagonist: id === "hero" } }));
  const scene: CharacterScene = { revision: "v", presentIds: ["hero", "mira"], states: { mira: { ...EMPTY_STATUS, emotion: "happy" } }, updatedAt: 1 };
  const oldOpen = vi.fn(); const newOpen = vi.fn();
  syncSceneChoiceCards(true, false, "en", vi.fn(async () => true));
  syncChoicePortraits(true, people, scene, "en", oldOpen);
  const shadow = document.querySelector<HTMLElement>("[data-deeprole-portrait-layer]")!.shadowRoot!;
  const button = shadow.querySelector<HTMLButtonElement>(".dr-cast-portrait.right")!;
  const image = button.querySelector("img"); button.focus();
  syncChoicePortraits(true, people, { ...scene, revision: "v2", states: { mira: { ...EMPTY_STATUS, emotion: "worried" } } }, "en", newOpen);
  expect(shadow.querySelector(".dr-cast-portrait.right")).toBe(button);
  expect(button.querySelector("img")).toBe(image); expect(shadow.activeElement).toBe(button);
  expect(button.querySelector("small")!.textContent).toBe("Worried");
  button.click(); expect(newOpen).toHaveBeenCalledWith("mira"); expect(oldOpen).not.toHaveBeenCalled();
  syncChoicePortraits(true, people, { ...scene, revision: "v2", states: { mira: { ...EMPTY_STATUS, emotion: "worried" } } }, "ru", newOpen);
  expect(shadow.activeElement).toBe(button); expect(button.querySelector("small")!.textContent).toBe("Тревога");
  const observer = new MutationObserver(() => {}); observer.observe(shadow, { childList: true, attributes: true, characterData: true, subtree: true });
  syncChoicePortraits(true, people, { ...scene, revision: "v2", states: { mira: { ...EMPTY_STATUS, emotion: "worried" } } }, "ru", newOpen);
  expect(observer.takeRecords()).toEqual([]); observer.disconnect();
});

it("updates stat highlights as plain text without recreating the portrait or churning unchanged DOM", () => {
  const choices = ["positive", "neutral", "negative", "surprise"].map(kind => ({ kind, label: kind, text: kind }));
  row(`<deeprole_choices>${JSON.stringify({ version: 1, options: choices })}</deeprole_choices>`);
  const people: SceneEntity[] = ["hero", "mira"].map(id => ({ id, name: id, kind: "character", worldId: "w", description: "", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1, characterSheet: { ...EMPTY_CHARACTER, protagonist: id === "hero" } }));
  const scene: CharacterScene = { revision: "v", presentIds: ["hero", "mira"], states: { mira: { ...EMPTY_STATUS, stats: [{ label: "Keys", value: "0" }, { label: "Signal", value: "<img src=x onerror=alert(1)>" }, { label: "Energy", value: "Rested" }] } }, updatedAt: 1 };
  const open = vi.fn(); syncSceneChoiceCards(true, false, "en", vi.fn(async () => true)); syncChoicePortraits(true, people, scene, "en", open);
  const shadow = document.querySelector<HTMLElement>("[data-deeprole-portrait-layer]")!.shadowRoot!;
  const portrait = shadow.querySelector<HTMLButtonElement>(".dr-cast-portrait.right")!; const highlights = portrait.querySelector<HTMLElement>(".dr-cast-highlights")!;
  expect([...highlights.children].map(node => node.textContent)).toEqual(["Keys: 0", "Signal: <img src=x onerror=alert(1)>"]);
  expect(highlights.querySelector("img")).toBeNull(); expect(highlights.hidden).toBe(false);
  expect(portrait.getAttribute("aria-describedby")).toBe(highlights.id);
  const image = portrait.querySelector("img"); portrait.focus();
  const observer = new MutationObserver(() => {}); observer.observe(shadow, { childList: true, attributes: true, characterData: true, subtree: true });
  syncChoicePortraits(true, people, structuredClone(scene), "en", open); expect(observer.takeRecords()).toEqual([]); observer.disconnect();
  syncChoicePortraits(true, people, { ...scene, revision: "v2", states: {} }, "ru", open);
  expect(shadow.querySelector(".dr-cast-portrait.right")).toBe(portrait); expect(portrait.querySelector("img")).toBe(image); expect(shadow.activeElement).toBe(portrait);
  expect(highlights.hidden).toBe(true); expect(highlights.childElementCount).toBe(0); expect(portrait.hasAttribute("aria-describedby")).toBe(false);
  portrait.click(); expect(open).toHaveBeenCalledWith("mira"); expect(scene.states.mira!.stats).toHaveLength(3);
});

it("falls back once through local portraits without retrying corrupt bytes on every update", () => {
  const img = document.createElement("img"); const sprites = { happy: "data:image/png;base64,AAAA", neutral: "data:image/png;base64,BBBB" };
  const sheet = { ...EMPTY_CHARACTER, sprites }; syncPortraitImage(img, sheet, "happy");
  expect(img.getAttribute("src")).toBe(sprites.happy);
  img.dispatchEvent(new Event("error")); expect(img.getAttribute("src")).toBe(sprites.neutral);
  syncPortraitImage(img, structuredClone(sheet), "happy"); expect(img.getAttribute("src")).toBe(sprites.neutral);
  img.dispatchEvent(new Event("error")); expect(img.getAttribute("src")).toBe(silhouetteSource());
  img.dispatchEvent(new Event("error")); expect(img.getAttribute("src")).toBe(silhouetteSource());
  expect(sheet.sprites).toEqual(sprites);
  syncPortraitImage(img, { ...sheet, sprites: { ...sprites, happy: "data:image/png;base64,CCCC" } }, "happy");
  expect(img.getAttribute("src")).toBe("data:image/png;base64,CCCC");
});

it("falls back to a valid neutral portrait when an emotion source is invalid", () => {
  const entity: SceneEntity = { id: "m", name: "Mira", kind: "character", worldId: "w", description: "", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1, characterSheet: { ...EMPTY_CHARACTER, sprites: { happy: "https://invalid.test/image.png", neutral: "data:image/png;base64,AAAA" } } };
  expect(portraitSource(entity, { ...EMPTY_STATUS, emotion: "happy" })).toBe(entity.characterSheet!.sprites.neutral);
});
