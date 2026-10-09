import { afterEach, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ServiceProgress } from "../src/entrypoints/shared/MemoryStatus";

afterEach(cleanup);
for (const locale of ["ru", "en"] as const) {
  test.each(["preparing", "waiting", "error", "empty"] as const)(`inline frame %s has no duplicate floating status ${locale}`, phase => {
    const view = render(<ServiceProgress locale={locale} activity={{ phase, type: "character-text", presentation: "inline" }} />);
    expect(view.container).toBeEmptyDOMElement();
  });
  test(`ordinary character text still has floating feedback ${locale}`, () => {
    const view = render(<ServiceProgress locale={locale} activity={{ phase: "waiting", type: "character-text" }} />);
    expect(view.getByRole("status")).toHaveTextContent(locale === "ru" ? "Текст появится в выбранном поле персонажа." : "The text will appear in the selected character field.");
  });
}
