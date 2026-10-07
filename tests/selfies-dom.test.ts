import { afterEach, expect, it, vi } from "vitest";
import { ScenePhotosPresenter } from "../src/adapters/scene-photos-dom";
import { visibleStoryHistory } from "../src/adapters/story-history-dom";
import { selfieImageKey } from "../src/core/selfies";
import { EMPTY_CHARACTER, characterTurnKey } from "../src/core/characters";
import type { ChatBinding, SceneEntity } from "../src/core/types";

const image = "data:image/png;base64,AAAA";
const person: SceneEntity = { id: "mira", worldId: "w", name: "Mira", kind: "character", description: "", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1, characterSheet: { ...EMPTY_CHARACTER, selfieCategories: [{ id: "regular", name: "Ordinary", description: "", default: true, minTrust: 40, minAffinity: 30, images: [image] }] } };
const turn = { world: "w", chat: "a", base: "1", present: [], updates: [] };
const key = characterTurnKey(turn);
const binding = (createdAt = Date.now() - 2000): ChatBinding => ({ id: "binding:a", chatId: "a", worldId: "w", bookId: null, chatUrl: "https://chat.deepseek.com/chat/s/a", messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1, scenePhotos: [{ worldId: "w", entityId: "mira", categoryId: "regular", messageKey: '["message","reply"]', turnKey: key, imageKey: selfieImageKey(image), createdAt }] });
const presenter = new ScenePhotosPresenter(document);
function reply(text = "Mira sends a photo.\n<deeprole_characters>" + JSON.stringify(turn) + "</deeprole_characters>") {
  const row = document.createElement("article"); row.dataset.role = "assistant"; row.dataset.messageId = "reply"; row.textContent = text; document.body.append(row); return row;
}
const host = () => document.querySelector<HTMLElement>("[data-deeprole-scene-photos]");
afterEach(() => { presenter.clear(); document.body.replaceChildren(); vi.useRealTimers(); });
it("delays the photo, restores the saved source and leaves native history unchanged", () => {
  vi.useFakeTimers(); const row = reply(); const history = visibleStoryHistory(); const saved = binding(Date.now());
  presenter.sync(saved, "w", [person], "ru", true);
  expect(host()?.shadowRoot?.querySelector("img")).toBeNull();
  vi.advanceTimersByTime(1520); expect(host()?.shadowRoot?.querySelector("img")?.getAttribute("src")).toBe(image);
  expect(visibleStoryHistory()).toEqual(history);
  const original = row.textContent; row.remove(); reply(original!);
  presenter.sync(saved, "w", [person], "en", true);
  expect(host()?.shadowRoot?.querySelector("img")?.getAttribute("src")).toBe(image);
  expect(document.querySelectorAll("[data-deeprole-scene-photos]")).toHaveLength(1);
});
it("does not churn unchanged hosts and never substitutes another photo after deletion", () => {
  reply(); const saved = binding(); presenter.sync(saved, "w", [person], "en", true); const original = host();
  const observer = new MutationObserver(() => {}); observer.observe(document.body, { subtree: true, childList: true, attributes: true });
  presenter.sync(saved, "w", [person], "en", true); expect(observer.takeRecords()).toEqual([]); observer.disconnect(); expect(host()).toBe(original);
  presenter.sync(saved, "w", [{ ...person, characterSheet: { ...EMPTY_CHARACTER, sprites: { neutral: image } } }], "en", true);
  expect(host()?.shadowRoot?.textContent).toContain("This photo was removed"); expect(host()?.shadowRoot?.querySelector("img")).toBeNull();
});
it("removes photos on lock, another world, service replies, refusal and native row reuse", () => {
  const row = reply(); const saved = binding();
  presenter.sync(saved, "w", [person], "en", true); expect(host()).not.toBeNull();
  presenter.sync(saved, "other", [person], "en", true); expect(host()).toBeNull();
  presenter.sync(saved, "w", [person], "en", false); expect(host()).toBeNull();
  row.dataset.deeproleServiceReply = "true"; presenter.sync(saved, "w", [person], "en", true); expect(host()).toBeNull(); delete row.dataset.deeproleServiceReply;
  row.textContent = "Sorry, that's beyond my current scope. Let's talk about something else."; presenter.sync(saved, "w", [person], "en", true); expect(host()).toBeNull();
  row.textContent = "<deeprole_characters>" + JSON.stringify({ ...turn, base: "another" }) + "</deeprole_characters>";
  presenter.sync(saved, "w", [person], "en", true); expect(host()).toBeNull();
});
