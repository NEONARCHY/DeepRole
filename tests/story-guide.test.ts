import { expect, it } from "vitest";
import { storyGuide } from "../src/core/story-guide";
import { translate } from "../src/core/i18n";
import { assistantText } from "../src/core/assistant-i18n";

it.each(["ru", "en"] as const)("story manual covers first-world creation, memory actions and transfer: %s", locale => {
  const guide = storyGuide(locale);
  expect(guide.sections).toHaveLength(8);
  const text = guide.sections.flatMap(section => section.lines).join(" ");
  for (const key of ["saveSnapshot", "continueChat", "apply"] as const) {
    expect(text).toContain(translate(locale, key));
  }
  for (const key of ["review", "saveChanges"] as const) {
    expect(text).toContain(assistantText(locale, key));
  }
  expect(text).toContain("JSON");
  for (const term of locale === "ru" ? ["Создать свой мир", "Без мира", "Запомнить", "не создаёт мир автоматически", "Экспорт → Этот мир", "Полная резервная копия"] : ["Create your world", "No world", "Remember", "does not create a world automatically", "Export → This world", "Full backup"]) expect(text).toContain(term);
  expect(guide.sections.every(section => section.lines.length >= 2)).toBe(true);
});
