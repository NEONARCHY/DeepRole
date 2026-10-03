import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { latestCharacterResponse, foldCharacterPayload, syncChoicePortraits } from "../src/adapters/deepseek-characters-dom";
import { dismissSceneChoiceCards, syncSceneChoiceCards } from "../src/adapters/deepseek-choices-dom";
import { EMPTY_CHARACTER, EMPTY_STATUS } from "../src/core/characters";
import type { CharacterScene, SceneEntity } from "../src/core/types";
const payload = `<deeprole_characters>${JSON.stringify({ world: "w", chat: "a", base: "v", present: ["mira"], updates: [{ id: "mira", state: EMPTY_STATUS }] })}</deeprole_characters>`;
function row(text: string, role = "assistant") { const el = document.createElement("article"); el.dataset.role = role; el.dataset.messageId = crypto.randomUUID(); el.textContent = text; document.body.append(el); return el; }
beforeEach(() => { vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList); dismissSceneChoiceCards(document, false); });
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

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
it("reuses choices and decorates only current participants, without duplicate buttons", () => {
  const choices = ["positive", "neutral", "negative", "surprise"].map(kind => ({ kind, label: kind, text: kind })); row(`<deeprole_choices>${JSON.stringify({ version: 1, options: choices })}</deeprole_choices>`);
  const people: SceneEntity[] = ["hero", "mira", "noah"].map(id => ({ id, name: id, kind: "character", worldId: "w", description: "", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1, characterSheet: { ...EMPTY_CHARACTER, protagonist: id === "hero" } }));
  const scene: CharacterScene = { revision: "v", presentIds: ["hero", "mira", "noah"], partnerId: "noah", states: {}, updatedAt: 1 };
  const pick = vi.fn(async () => true); const open = vi.fn(); syncSceneChoiceCards(true, false, "en", pick); syncChoicePortraits(true, people, scene, "en", open);
  const host = document.querySelector<HTMLElement>("[data-deeprole-choices-host]")!;
  expect([...host.shadowRoot!.querySelectorAll(".dr-cast-portrait")].map(b => b.getAttribute("aria-label"))).toEqual(["Open character: hero", "Open character: noah"]);
  syncSceneChoiceCards(true, false, "en", pick); syncChoicePortraits(true, people, scene, "en", open);
  expect(document.querySelector("[data-deeprole-choices-host]")).toBe(host); expect(host.shadowRoot!.querySelectorAll("button")).toHaveLength(6);
  host.shadowRoot!.querySelector<HTMLButtonElement>(".dr-cast-portrait.right")!.click(); expect(open).toHaveBeenCalledWith("noah");
  syncChoicePortraits(true, people, { ...scene, revision: "v2", partnerId: null }, "en", open); expect(host.shadowRoot!.querySelectorAll(".dr-cast-portrait")).toHaveLength(1);
  syncChoicePortraits(false, people, scene, "en", open); expect(host.shadowRoot!.querySelectorAll("button")).toHaveLength(4);
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
