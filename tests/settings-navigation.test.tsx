import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsNavigation } from "../src/entrypoints/shared/SettingsNavigation";
import { navigationText } from "../src/core/navigation-i18n";
afterEach(cleanup);
describe("settings directory", () => {
  for (const locale of ["ru", "en"] as const) {
    it(`${locale}: all routes are explained and only navigation is requested`, () => {
      const select = vi.fn(); render(<SettingsNavigation locale={locale} section="home" onSelect={select}/>);
      for (const id of ["app", "appearance", "characters", "images", "safety", "data", "memory", "diagnostics"] as const) {
        const button = screen.getByRole("button", { name: navigationText(locale,id), hidden: true });
        fireEvent.click(button); expect(select).toHaveBeenLastCalledWith(id);
      }
      expect(document.querySelector("details")?.open).toBe(false);
      expect(select).toHaveBeenCalledTimes(8);
    });
    it(`${locale}: section heading receives focus, return and mixed scope stay explicit`, () => {
      const select = vi.fn(); const view = render(<SettingsNavigation locale={locale} section="home" onSelect={select}/>);
      view.rerender(<SettingsNavigation locale={locale} section="memory" onSelect={select} worldName="<Mira>"/>);
      expect(screen.getByRole("heading",{name:navigationText(locale,"memory")})).toBe(document.activeElement);
      expect(screen.getByText(navigationText(locale,"worldScope").replace("{name}","<Mira>"))).toBeTruthy();
      expect(screen.getByText(navigationText(locale,"memoryNotice"))).toBeTruthy();
      fireEvent.click(screen.getByRole("button",{name:navigationText(locale,"back")})); expect(select).toHaveBeenCalledWith("home");
      expect(document.querySelector("Mira")).toBeNull();
    });
  }
});
