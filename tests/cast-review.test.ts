import { expect, it } from "vitest";
import { castReviewReason } from "../src/core/cast-review";
import { castDraft } from "./fixtures/cast-data";

for (const locale of ["ru", "en"] as const) it("keeps readable explanations and presents technical ones safely: " + locale, () => {
 const person = castDraft("x").characters[0]!;
 expect(castReviewReason(person, locale)).toBe(person.reason);
 for (const reason of ["Протагонист по флагу protagonist:true в entity_abc-123 и entry_def-456. Связи описаны в state.", "romance false; relationships null", "Read sheet.initialStatus in entity_123"]) {
  person.reason = reason;
  const shown = castReviewReason(person, locale);
  expect(shown).not.toMatch(/entity_|entry_|protagonist|relationships|state|sheet|\bnull\b/u);
  expect(shown).toContain(locale === "ru" ? "Проверьте" : "Check");
  expect(person.reason).toBe(reason);
 }
});
