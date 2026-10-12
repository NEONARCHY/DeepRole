import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { CharacterEditor } from "../src/entrypoints/shared/CharacterSheets";
import { AttributeEditor } from "../src/entrypoints/shared/Attributes";
import { RelationshipEditor } from "../src/entrypoints/shared/Relationships";
import { CharacterUpdateNotice } from "../src/entrypoints/shared/CharacterUpdateNotice";
import { characterUpdateText } from "../src/core/character-update-i18n";
import { EMPTY_CHARACTER, EMPTY_STATUS } from "../src/core/characters";
import { DEFAULT_RELATIONSHIP } from "../src/core/relationships";
import type { CharacterSheet, CharacterStatus, Locale, SceneEntity } from "../src/core/types";
afterEach(cleanup);
function sample() {
  const sheet: CharacterSheet = { ...structuredClone(EMPTY_CHARACTER), appearance: "Blue coat", relationships: { ...structuredClone(DEFAULT_RELATIONSHIP), enabled: true, milestones: [{ id: "promise", label: "Kept the promise", required: false }] }, attributes: [{ id: "energy", label: "Energy", initial: 70, low: "Tired", high: "Rested", cap: 3 }] };
  const person: SceneEntity = { id: "mira", name: "Mira", kind: "character", worldId: "w", description: "", aliases: [], memberIds: [], characterSheet: sheet, createdAt: 1, updatedAt: 1 }, hero: SceneEntity = { ...person, id: "hero", name: "Noah", characterSheet: { ...structuredClone(EMPTY_CHARACTER), protagonist: true } };
  const state: CharacterStatus = { ...structuredClone(EMPTY_STATUS), condition: "Safe", bonds: { hero: { trust: 35, affinity: 70, locked: false, completed: [], history: [] } }, attributes: { values: { energy: 65 }, locked: [], history: [] } };
  return { sheet, person, hero, state };
}
it.each(["ru", "en"] as Locale[])("shows scoped notices in the real editor without changing or generating data in %s", locale => {
  const f = sample(), onSave = vi.fn(), onGenerateText = vi.fn();
  render(<CharacterEditor locale={locale} entity={f.person} hero={f.hero} relationshipsEnabled scene={{ revision: "rev", presentIds: [f.hero.id, f.person.id], states: { mira: f.state }, updatedAt: 1 }} actions={["neutral"]} onClose={() => {}} onSave={onSave} onGenerateText={onGenerateText} />);
  expect(screen.getByRole("note", { name: characterUpdateText(locale, "profile").title })).toHaveTextContent(characterUpdateText(locale, "profile").body);
  fireEvent.click(screen.getByRole("tab", { name: locale === "ru" ? "В сцене" : "In scene" }));
  expect(screen.getByRole("note", { name: characterUpdateText(locale, "scene").title })).toHaveTextContent(characterUpdateText(locale, "scene").body);
  expect(screen.getByRole("note", { name: characterUpdateText(locale, "attributes").title })).toBeVisible();
  const condition = screen.getByRole("textbox", { name: locale === "ru" ? "Состояние" : "Condition" }); expect(condition).toHaveValue("Safe");
  fireEvent.click(screen.getByRole("note", { name: characterUpdateText(locale, "scene").title })); expect(condition).not.toHaveFocus(); expect(onSave).not.toHaveBeenCalled(); expect(onGenerateText).not.toHaveBeenCalled();
  fireEvent.change(condition, { target: { value: "Resting" } }); expect(condition).toHaveValue("Resting");
  fireEvent.click(screen.getByRole("tab", { name: locale === "ru" ? "Отношения" : "Relationships" }));
  expect(screen.getByRole("note", { name: characterUpdateText(locale, "relationships").title })).toBeVisible(); expect(screen.getByRole("note", { name: characterUpdateText(locale, "events").title })).toBeVisible();
  expect(f.state.bonds!.hero!.trust).toBe(35); expect(f.sheet.attributes![0]!.initial).toBe(70);
  fireEvent.click(screen.getByRole("tab", { name: locale === "ru" ? "Изображения" : "Images" })); expect(screen.queryByRole("note")).toBeNull();
});
it.each(["ru", "en"] as Locale[])("accurately distinguishes paused, locked and profile-only relationship controls in %s", locale => {
  const f = sample(), props = { locale, entity: f.person, hero: f.hero, sheet: f.sheet, state: f.state, onSheet: vi.fn(), onState: vi.fn() };
  const view = render(<RelationshipEditor {...props} enabled={false} />);
  expect(screen.getAllByRole("note")).toHaveLength(2); for (const note of screen.getAllByRole("note")) expect(note).toHaveTextContent(characterUpdateText(locale, "relationships", "paused").body);
  view.rerender(<RelationshipEditor {...props} state={{ ...f.state, bonds: { hero: { ...f.state.bonds!.hero!, locked: true } } }} />);
  expect(screen.getAllByRole("note", { name: characterUpdateText(locale, "relationships", "locked").title })).toHaveLength(2);
  view.rerender(<RelationshipEditor {...props} profileOnly />); expect(screen.queryByRole("note")).toBeNull();
  expect(props.onSheet).not.toHaveBeenCalled(); expect(props.onState).not.toHaveBeenCalled();
});
it.each(["ru", "en"] as Locale[])("keeps characteristic definitions separate from current updates and locks in %s", locale => {
  const f = sample(), props = { locale, sheet: f.sheet, state: f.state, onSheet: vi.fn(), onState: vi.fn() }, view = render(<AttributeEditor {...props} />);
  expect(screen.getByRole("note")).toHaveTextContent(characterUpdateText(locale, "attributes").body);
  view.rerender(<AttributeEditor {...props} enabled={false} />); expect(screen.getByRole("note")).toHaveTextContent(characterUpdateText(locale, "attributes", "paused").body);
  view.rerender(<AttributeEditor {...props} state={{ ...f.state, attributes: { ...f.state.attributes!, locked: ["energy"] } }} />); expect(screen.getByRole("note")).toHaveTextContent(characterUpdateText(locale, "attributes", "locked").body);
  view.rerender(<AttributeEditor {...props} profileOnly />); expect(screen.queryByRole("note")).toBeNull(); expect(props.onSheet).not.toHaveBeenCalled(); expect(props.onState).not.toHaveBeenCalled();
});
it("does not announce a static notice as an alert or change profile copy for numeric tracking mode", () => {
  render(<CharacterUpdateNotice locale="en" kind="profile" mode="locked" />); expect(within(screen.getByRole("note")).getByText(characterUpdateText("en", "profile").body)).toBeVisible(); expect(screen.queryByRole("alert")).toBeNull();
});
