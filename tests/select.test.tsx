import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { Select } from "../src/entrypoints/shared/Select";

beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function Picker({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState("a");
  return <div className="app-shell"><label>Mood<Select value={value} disabled={disabled} onChange={e => setValue(e.target.value)}><option value="a">Calm</option><option value="b" disabled>Angry</option><option value="c">Focused</option><option value="d">Joy</option></Select></label></div>;
}

it("explores without editing, skips disabled options, commits once and preserves native labels", () => {
  render(<Picker />); const picker = screen.getByRole("combobox", { name: "Mood" });
  picker.focus(); fireEvent.keyDown(picker, { key: "ArrowDown" });
  expect(picker).toHaveAttribute("aria-expanded", "true"); expect(screen.getByRole("listbox")).toBeVisible();
  fireEvent.keyDown(picker, { key: "ArrowDown" }); expect(screen.getByRole("option", { name: "Focused", selected: true })).toBeVisible();
  expect(picker).toHaveValue("a"); fireEvent.keyDown(picker, { key: "Enter" });
  expect(picker).toHaveValue("c"); expect(screen.queryByRole("listbox")).toBeNull(); expect(picker).toHaveFocus();
});

it("Escape cancels, Tab commits and outside pointer cancels", () => {
  render(<Picker />); const picker = screen.getByRole("combobox");
  fireEvent.click(picker); fireEvent.keyDown(picker, { key: "End" }); fireEvent.keyDown(picker, { key: "Escape" }); expect(picker).toHaveValue("a");
  fireEvent.click(picker); fireEvent.keyDown(picker, { key: "End" }); fireEvent.keyDown(picker, { key: "Tab" }); expect(picker).toHaveValue("d");
  fireEvent.click(picker); fireEvent.keyDown(picker, { key: "Home" }); fireEvent.pointerDown(document.body); expect(picker).toHaveValue("d"); expect(screen.queryByRole("listbox")).toBeNull();
});

it("typeahead selects by label, mouse changes follow the normal React form path", () => {
  const changed = vi.fn(); render(<form onChange={changed}><Picker /></form>); const picker = screen.getByRole("combobox");
  fireEvent.keyDown(picker, { key: "f" }); fireEvent.keyDown(picker, { key: "Enter" }); expect(picker).toHaveValue("c"); expect(changed).toHaveBeenCalledTimes(1);
  fireEvent.click(picker); fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Joy" })); expect(picker).toHaveValue("d"); expect(changed).toHaveBeenCalledTimes(2);
  fireEvent.change(picker, { target: { value: "a" } }); expect(picker).toHaveValue("a");
});

it("disabling while open closes the menu without changing the value", () => {
  const view = render(<Picker />); const picker = screen.getByRole("combobox"); fireEvent.click(picker);
  view.rerender(<Picker disabled />); expect(picker).toBeDisabled(); expect(screen.queryByRole("listbox")).toBeNull(); expect(picker).toHaveValue("a");
});

it("retains form submission, required validation and disabled groups", async () => {
  render(<form><div className="app-shell"><label>World<Select required name="world" defaultValue=""><option value="">Choose</option><optgroup label="Unavailable" disabled><option value="a">A</option></optgroup><optgroup label="Worlds"><option value="b">B</option></optgroup></Select></label></div></form>);
  const picker = screen.getByRole("combobox") as HTMLSelectElement;
  expect(picker.checkValidity()).toBe(false); fireEvent.click(picker); expect(screen.getByRole("option", { name: "Unavailable A" })).toHaveAttribute("aria-disabled", "true");
  await act(async () => { fireEvent.click(screen.getByRole("option", { name: "Worlds B" })); });
  expect(picker.checkValidity()).toBe(true); expect(new FormData(picker.form!).get("world")).toBe("b");
});
