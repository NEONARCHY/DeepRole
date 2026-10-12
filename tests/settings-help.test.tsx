import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SettingsHelp } from "../src/entrypoints/shared/SettingsHelp";
it("keeps descriptions hidden until requested; keyboard and repeated clicks close them without changing a setting", () => {
 const change = vi.fn();
 render(<div><SettingsHelp locale="ru" title="Название" text="Подробное объяснение"/><input aria-label="Настройка" type="checkbox" onChange={change}/></div>);
 expect(screen.queryByRole("note")).toBeNull();
 const help = screen.getByRole("button", { name: "Подсказка: Название" });
 fireEvent.click(help); expect(screen.getByRole("note")).toHaveTextContent("Подробное объяснение"); expect(help).toHaveAttribute("aria-expanded", "true"); expect(change).not.toHaveBeenCalled();
 fireEvent.keyDown(help, { key: "Escape" }); expect(screen.queryByRole("note")).toBeNull();
 fireEvent.click(help); fireEvent.click(help); expect(screen.queryByRole("note")).toBeNull();
 fireEvent.click(screen.getByRole("checkbox")); expect(change).toHaveBeenCalledTimes(1);
});
it("preserves a real heading and a localized accessible help name", () => {
 render(<SettingsHelp locale="en" title="Section" text="Explanation" heading/>);
 expect(screen.getByRole("heading", { name: "Section", level: 2 })).toBeVisible();
 expect(screen.getByRole("button", { name: "Help: Section" })).toHaveAttribute("aria-expanded", "false");
});
