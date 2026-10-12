import { cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { ActionAvailability } from "../src/entrypoints/shared/ActionAvailability";
import { DEFAULT_ACTIONS, EMPTY_CHARACTER } from "../src/core/characters";
import type { CharacterSheet } from "../src/core/types";

afterEach(cleanup);
function Form({ initial = EMPTY_CHARACTER, actions = DEFAULT_ACTIONS }: { initial?: CharacterSheet; actions?: string[] }) {
  const [sheet, setSheet] = useState(initial);
  return <><ActionAvailability locale="en" sheet={sheet} actions={actions} onChange={setSheet} /><output>{JSON.stringify(sheet)}</output></>;
}
it("defaults to all allowed, uses positive switches and never blocks neutral", () => {
  const view = render(<Form />); expect(view.getByText(`${DEFAULT_ACTIONS.length} of ${DEFAULT_ACTIONS.length} available`)).toBeVisible(); fireEvent.click(view.getByText("Customize list"));
  expect(view.getByRole("switch", { name: "Allow action: Calm" })).toBeDisabled();
  const happy = view.getByRole("switch", { name: "Allow action: Happy" }); expect(happy).toBeChecked(); fireEvent.click(happy);
  expect(happy).not.toBeChecked(); expect(view.getByRole("status").textContent).toContain('"blockedActions":["happy"]');
  fireEvent.click(view.getByRole("button", { name: "Allow all" })); expect(happy).toBeChecked(); expect(view.getByRole("status").textContent).not.toContain("blockedActions");
});
it("searches translated labels or exact keys without changing the rule", () => {
  const view = render(<Form />); fireEvent.click(view.getByText("Customize list")); fireEvent.change(view.getByRole("searchbox"), { target: { value: "angry" } });
  expect(view.getAllByRole("switch")).toHaveLength(1); expect(view.getByRole("status").textContent).not.toContain("blockedActions");
  fireEvent.change(view.getByRole("searchbox"), { target: { value: "no match" } }); expect(view.getByText("No matches. Try another name.")).toBeVisible();
});
it("retains retired exclusions and allows removing them explicitly", () => {
  const view = render(<Form initial={{ ...EMPTY_CHARACTER, blockedActions: ["retired"] }} />); fireEvent.click(view.getByText("Customize list")); fireEvent.click(view.getByText("Outside the world list · 1"));
  const retired = view.getByRole("switch", { name: "Allow action: retired" }); expect(retired).not.toBeChecked(); fireEvent.click(retired);
  expect(view.getByRole("status").textContent).not.toContain("blockedActions");
});
it("bulk neutral-only detaches portraits without deleting images and permits newly added keys", () => {
  const initial = { ...EMPTY_CHARACTER, sprites: { angry: "data:image/png;base64,AAAA" } };
  const view = render(<Form initial={initial} />); fireEvent.click(view.getByText("Customize list")); fireEvent.click(view.getByRole("button", { name: "Calm only" }));
  expect(view.getByText(`1 of ${DEFAULT_ACTIONS.length} available`)).toBeVisible(); expect(view.getByRole("status").textContent).toContain(initial.sprites.angry);
  expect(JSON.parse(view.getByRole("status").textContent!)).toMatchObject({ sprites: {}, portraitLibrary: [initial.sprites.angry] });
  view.rerender(<Form initial={initial} actions={[...DEFAULT_ACTIONS, "focused"]} />); expect(view.getByRole("switch", { name: "Allow action: focused" })).toBeChecked();
});
it("reports retained-list capacity without changing the draft and lets the user recover", () => {
  const view = render(<Form initial={{ ...EMPTY_CHARACTER, blockedActions: Array.from({ length: 128 }, (_, i) => `old${i}`) }} />);
  fireEvent.click(view.getByText("Customize list")); fireEvent.click(view.getByRole("button", { name: "Calm only" }));
  expect(view.getByRole("alert")).toHaveTextContent("Too many retained restrictions");
  expect(view.getByRole("switch", { name: "Allow action: Happy" })).toBeChecked();
  fireEvent.click(view.getByRole("button", { name: "Allow all" })); expect(view.queryByRole("alert")).toBeNull();
  fireEvent.click(view.getByRole("button", { name: "Calm only" })); expect(view.getByText(`1 of ${DEFAULT_ACTIONS.length} available`)).toBeVisible();
});
it("detaches images beyond the former library capacity without losing images", () => {
  const images = Array.from({ length: 513 }, (_, i) => "data:image/png;base64," + btoa("portrait-" + i));
  const initial = { ...EMPTY_CHARACTER, sprites: { happy: images[512]! }, portraitLibrary: images.slice(0, 512) };
  const view = render(<Form initial={initial} />); fireEvent.click(view.getByText("Customize list"));
  fireEvent.click(view.getByRole("switch", { name: "Allow action: Happy" }));
  expect(view.queryByRole("alert")).toBeNull();
  expect(view.getByRole("switch", { name: "Allow action: Happy" })).not.toBeChecked();
  expect(JSON.parse(view.getByRole("status").textContent!).portraitLibrary).toHaveLength(513);
});
