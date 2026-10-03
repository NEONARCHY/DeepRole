import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CharacterPanel } from "../src/entrypoints/shared/CharacterSheets";
import { EMPTY_CHARACTER, EMPTY_STATUS } from "../src/core/characters";
import type { SceneEntity } from "../src/core/types";

afterEach(() => { cleanup(); document.body.replaceChildren(); vi.restoreAllMocks(); });

it("returns focus to a portrait in another shadow root after closing its editor", () => {
  const widget = document.createElement("div"); const root = widget.attachShadow({ mode: "open" });
  const container = document.createElement("div"); container.className = "dr-root"; root.append(container);
  const choices = document.createElement("div"); const cast = choices.attachShadow({ mode: "open" });
  const portrait = document.createElement("button"); portrait.textContent = "Mira"; cast.append(portrait);
  document.body.append(widget, choices);
  const entity: SceneEntity = { id: "mira", name: "Mira", worldId: "w", kind: "character", description: "", aliases: [], memberIds: [], characterSheet: EMPTY_CHARACTER, createdAt: 1, updatedAt: 1 };
  const props = { locale: "en" as const, entities: [entity], scene: { revision: "1", presentIds: ["mira"], states: { mira: EMPTY_STATUS }, updatedAt: 1 }, emotions: ["neutral"], base: "v", worldId: "w", chatId: "a", status: "updated" as const, onSave: vi.fn(async () => {}), onRetry: vi.fn() };
  const panel = render(<CharacterPanel {...props} />, { container });
  portrait.focus(); expect(cast.activeElement).toBe(portrait);
  panel.rerender(<CharacterPanel {...props} openId="mira" />);
  const dialog = root.querySelector<HTMLElement>("[role=dialog]")!; expect(dialog).not.toBeNull();
  expect(root.activeElement).toBe(dialog.querySelector("input"));
  fireEvent.keyDown(dialog, { key: "Escape" }); expect(root.querySelector("[role=dialog]")).toBeNull();
  expect(cast.activeElement).toBe(portrait);
});

it("does not claim an unsaved edit when an invalid upload changed no portrait", async () => {
  const container = document.createElement("div"); document.body.append(container);
  const entity: SceneEntity = { id: "mira", name: "Mira", worldId: "w", kind: "character", description: "", aliases: [], memberIds: [], characterSheet: EMPTY_CHARACTER, createdAt: 1, updatedAt: 1 };
  render(<CharacterPanel locale="en" entities={[entity]} emotions={["neutral"]} base="v" worldId="w" chatId="a" status="updated" onSave={vi.fn(async () => {})} onRetry={vi.fn()} openId="mira" />, { container });
  const dialog = container.querySelector<HTMLElement>("[role=dialog]")!;
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  fireEvent.change(dialog.querySelector("input[type=file]")!, { target: { files: [new File(["<svg/>"], "bad.svg", { type: "image/svg+xml" })] } });
  await waitFor(() => expect(dialog.querySelector("[role=alert]")).not.toBeNull());
  fireEvent.keyDown(dialog, { key: "Escape" }); expect(confirm).not.toHaveBeenCalled();
  expect(container.querySelector("[role=dialog]")).toBeNull();
});

it("keeps filled field names separate from their saved values and the compact list has no images", () => {
  const entity: SceneEntity = { id: "mira", name: "Mira", worldId: "w", kind: "character", description: "", aliases: [], memberIds: [], characterSheet: { ...EMPTY_CHARACTER, appearance: "Blue coat" }, createdAt: 1, updatedAt: 1 };
  const view = render(<CharacterPanel locale="en" entities={[entity]} scene={{ revision: "v", presentIds: ["mira"], states: { mira: { ...EMPTY_STATUS, condition: "Safe", goal: "Find a key", relationship: "Trusted" } }, updatedAt: 1 }} emotions={["neutral"]} base="v" worldId="w" chatId="a" status="updated" onSave={vi.fn(async () => {})} onRetry={vi.fn()} />);
  expect(view.container.querySelectorAll(".dr-character-row img")).toHaveLength(0);
  fireEvent.click(view.getByRole("button", { name: /Mira/ }));
  expect(view.getByRole("textbox", { name: "Appearance and clothing" })).toHaveValue("Blue coat");
  expect(view.getByRole("textbox", { name: "Condition" })).toHaveValue("Safe");
  expect(view.getByRole("textbox", { name: "Current goal" })).toHaveValue("Find a key");
  expect(view.getByRole("textbox", { name: "Relationships" })).toHaveValue("Trusted");
});
