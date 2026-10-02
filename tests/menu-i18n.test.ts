import { expect, it } from "vitest";
import { formatRecordCount } from "../src/core/menu-i18n";

it("uses natural Russian and English record counts", () => {
  for (const [count, text] of [[0, "0 записей"], [1, "1 запись"], [2, "2 записи"], [5, "5 записей"], [11, "11 записей"], [21, "21 запись"], [22, "22 записи"], [25, "25 записей"]] as const) expect(formatRecordCount("ru", count)).toBe(text);
  for (const [count, text] of [[0, "0 records"], [1, "1 record"], [2, "2 records"]] as const) expect(formatRecordCount("en", count)).toBe(text);
});
