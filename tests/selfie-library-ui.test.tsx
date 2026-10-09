import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { SelfieCategories } from "../src/entrypoints/shared/SelfieCategories";
import type { SelfieCategory } from "../src/core/types";

afterEach(cleanup);
const image = "data:image/png;base64,AAAA", other = "data:image/png;base64,BBBB";
const initial: SelfieCategory[] = [{ id: "regular", name: "Regular", description: "At home", default: true, minTrust: 40, minAffinity: 30, images: [image] }];
const onGenerate = vi.fn(), onBusy = vi.fn(), changed = vi.fn();
function Form({ library = [image, other], value = initial, disabled = false }: { library?: string[]; value?: SelfieCategory[]; disabled?: boolean }) {
  const [categories, setCategories] = useState(value);
  return <SelfieCategories value={categories} library={library} locale="en" disabled={disabled} onBusy={onBusy} onGenerate={onGenerate} onChange={next => { changed(next); setCategories(next); }} />;
}
it("selects several photos locally, marks existing images, commits once and restores focus", () => {
  vi.clearAllMocks(); const view = render(<Form />);
  const open = view.getByRole("button", { name: "Choose from library" }); fireEvent.click(open);
  const picker = within(view.getByRole("group", { name: "Character’s library" }));
  expect(picker.getByRole("button", { name: "Photo 1" })).toBeDisabled();
  fireEvent.click(picker.getByRole("button", { name: "Photo 2" }));
  expect(picker.getByRole("button", { name: "Photo 2" })).toHaveAttribute("aria-pressed", "true");
  expect(changed).not.toHaveBeenCalled(); fireEvent.click(picker.getByRole("button", { name: "Add selected · 1" }));
  expect(changed).toHaveBeenCalledTimes(1); expect(changed.mock.calls[0]?.[0][0].images).toEqual([image, other]);
  expect(view.queryByRole("group", { name: "Character’s library" })).toBeNull(); expect(open).toHaveFocus();
  expect(onGenerate).not.toHaveBeenCalled(); expect(onBusy).not.toHaveBeenCalled();
  expect(view.getByText(/You request a photo yourself/)).toBeVisible();
});
it("cancels with Escape without closing a surrounding editor or retaining the selection", () => {
  vi.clearAllMocks(); const outerEscape = vi.fn();
  const view = render(<div onKeyDown={outerEscape}><Form /></div>);
  const open = view.getByRole("button", { name: "Choose from library" }); fireEvent.click(open);
  const photo = view.getByRole("button", { name: "Photo 2" }); fireEvent.click(photo); fireEvent.keyDown(photo, { key: "Escape" });
  expect(changed).not.toHaveBeenCalled(); expect(outerEscape).not.toHaveBeenCalled(); expect(open).toHaveFocus();
  fireEvent.click(open); expect(view.getByRole("button", { name: "Add selected · 0" })).toBeDisabled();
});
it("explains an empty library and lets the user close it", () => {
  const view = render(<Form library={[]} />); fireEvent.click(view.getByRole("button", { name: "Choose from library" }));
  expect(view.getByText(/This character’s library has no photos yet/)).toBeVisible();
  expect(view.queryByRole("button", { name: /Add selected/ })).toBeNull();
  fireEvent.click(view.getByRole("button", { name: "Cancel selection" }));
  expect(view.queryByRole("group", { name: "Character’s library" })).toBeNull();
});
it("limits new selection to the remaining slots while allowing deselection", () => {
  const images = Array.from({ length: 47 }, (_, i) => "data:image/png;base64," + btoa("photo-" + i));
  const view = render(<Form value={[{ ...initial[0]!, images }]} library={[image, other]} />);
  fireEvent.click(view.getByRole("button", { name: "Choose from library" }));
  const first = view.getByRole("button", { name: "Photo 1" }), second = view.getByRole("button", { name: "Photo 2" });
  fireEvent.click(first); expect(second).toBeDisabled(); expect(first).toBeEnabled();
  fireEvent.click(first); expect(second).toBeEnabled(); fireEvent.click(second);
  fireEvent.click(view.getByRole("button", { name: "Add selected · 1" }));
  expect(view.getByRole("button", { name: "Choose from library" })).toBeDisabled();
});
it("ignores removed sources, deduplicates the library and hides invalid images", () => {
  vi.clearAllMocks(); const view = render(<Form library={[other, other, "https://example.com/private.png"]} />);
  fireEvent.click(view.getByRole("button", { name: "Choose from library" }));
  expect(view.getAllByRole("button", { name: /^Photo / })).toHaveLength(1);
  fireEvent.click(view.getByRole("button", { name: "Photo 1" }));
  view.rerender(<Form library={[image]} />);
  expect(view.getByRole("button", { name: "Add selected · 0" })).toBeDisabled(); expect(changed).not.toHaveBeenCalled();
});
it("pages through a large library without truncating the selectable list", () => {
  const sources = Array.from({ length: 49 }, (_, i) => "data:image/png;base64," + btoa("source-" + i));
  const view = render(<Form library={sources} />); fireEvent.click(view.getByRole("button", { name: "Choose from library" }));
  expect(view.getAllByRole("button", { name: /^Photo / })).toHaveLength(24);
  fireEvent.click(view.getByRole("button", { name: "Show more · 24/49" }));
  fireEvent.click(view.getByRole("button", { name: "Show more · 48/49" }));
  fireEvent.click(view.getByRole("button", { name: "Photo 49" }));
  expect(view.getByRole("button", { name: "Add selected · 1" })).toBeEnabled();
});
it("does not commit a selection while the editor is busy", () => {
  vi.clearAllMocks(); const view = render(<Form />); fireEvent.click(view.getByRole("button", { name: "Choose from library" }));
  fireEvent.click(view.getByRole("button", { name: "Photo 2" })); view.rerender(<Form disabled />);
  const add = view.getByRole("button", { name: "Add selected · 1" }); expect(add).toBeDisabled(); fireEvent.click(add);
  expect(changed).not.toHaveBeenCalled();
});
