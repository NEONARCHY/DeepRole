import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ServiceDiagnostics } from "../src/entrypoints/shared/ServiceDiagnostics";
import { serviceDiagnosticSnapshot } from "../src/core/service-diagnostics";
import { castServiceOperationFromStart, serviceOperationFromStart } from "../src/core/service-operations";
import { castServiceValidation, fieldServiceValidation } from "../src/core/service-validation";
import { FieldValidationError } from "../src/core/field-validation";
import { SERVICE_OUTBOX_PREFIX, servicePending } from "../src/core/service-outbox";
const id = "field_00000000-0000-4000-8000-000000000001";
const operation = { ...serviceOperationFromStart({ id, worldId: "PRIVATE_WORLD", sourceChatId: "PRIVATE_CHAT", mode: "suggest", fieldScope: "profile", createdAt: 1 }), phase: "result", workerChatId: "PRIVATE_WORKER", cleanup: "done" };
const read = () => serviceDiagnosticSnapshot({ status: "read", values: [operation] }, { status: "read", values: {} });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
for (const locale of ["ru", "en"] as const) it(`checks manually, explains limits and copies only safe metadata in ${locale}`, async () => {
 const onCheck = vi.fn().mockResolvedValue(read()), writeText = vi.fn().mockResolvedValue(undefined);
 Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } }); render(<ServiceDiagnostics locale={locale} onCheck={onCheck}/>);
 expect(onCheck).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button", { name: locale === "ru" ? "Прочитать отчёт операций" : "Read operation report" }));
 await screen.findByText(locale === "ru" ? "Сохранённые отметки прочитаны" : "Saved operation records read");
 expect(screen.getByText(locale === "ru" ? "Подробности операций" : "Operation details").closest("details")).not.toHaveAttribute("open");
 expect(document.body.textContent).toContain(locale === "ru" ? "не доказательство" : "not proof");
 expect(document.body.textContent).not.toMatch(/PRIVATE/);
 fireEvent.click(screen.getByRole("button", { name: locale === "ru" ? "Скопировать отчёт" : "Copy report" }));
 await screen.findByText(locale === "ru" ? "Отчёт скопирован" : "Report copied");
 expect(JSON.parse(writeText.mock.calls[0]![0])).toMatchObject({ readOnly: true, nativeCompletion: "not-verified", result: { journal: { total: 1 } } }); expect(writeText.mock.calls[0]![0]).not.toContain("PRIVATE");
});
for (const locale of ["ru", "en"] as const) it(`shows locked journal separately from pending work in ${locale}`, async () => {
 const entry = servicePending(id, { phase: "failed", workerChatId: "PRIVATE_WORKER", cleanup: "done", error: "vault-locked", at: 3 });
 const value = serviceDiagnosticSnapshot({ status: "locked" }, { status: "read", values: { [SERVICE_OUTBOX_PREFIX + id]: entry } });
 render(<ServiceDiagnostics locale={locale} onCheck={async () => value}/>); fireEvent.click(screen.getByRole("button"));
 await screen.findByText(locale === "ru" ? /Сейф закрыт/ : /vault is locked/);
 expect(document.body.textContent).toContain(locale === "ru" ? "не доставляет" : "does not deliver"); expect(document.body.textContent).not.toContain("PRIVATE");
});
it("labels restored records historical, never active work", async () => {
 const value = serviceDiagnosticSnapshot({ status: "read", values: [{ ...operation, origin: "restored" }] }, { status: "read", values: {} });
 render(<ServiceDiagnostics locale="en" onCheck={async () => value}/>); fireEvent.click(screen.getByRole("button")); await screen.findByText(/Restored from backup/);
});
it("provides a selectable report if clipboard fails", async () => {
 Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("PRIVATE")) } });
 render(<ServiceDiagnostics locale="en" onCheck={async () => read()}/>); fireEvent.click(screen.getByRole("button")); await screen.findByRole("button", { name: "Copy report" }); fireEvent.click(screen.getByRole("button", { name: "Copy report" }));
 const text = await screen.findByRole("textbox", { name: "Operation diagnostic report" }); expect(text).toHaveAttribute("readonly"); fireEvent.focus(text);
 expect((text as HTMLTextAreaElement).selectionEnd).toBe((text as HTMLTextAreaElement).value.length); expect((text as HTMLTextAreaElement).value).not.toContain("PRIVATE"); expect(screen.queryByText("Report copied")).toBeNull();
});
it("single-flights checks and ignores a result after unmount", async () => {
 let resolve!: (v: unknown) => void; const onCheck = vi.fn().mockReturnValue(new Promise(r => { resolve = r; }));
 const view = render(<ServiceDiagnostics locale="en" onCheck={onCheck}/>), button = screen.getByRole("button"); fireEvent.click(button); fireEvent.click(button); expect(onCheck).toHaveBeenCalledTimes(1); expect(button).toBeDisabled(); view.unmount(); await act(async () => resolve(read()));
});
it("hides raw errors and rejects injected unknown fields", async () => {
 const value = read(); const onCheck = vi.fn().mockRejectedValueOnce(new Error("PRIVATE_TOKEN")).mockResolvedValueOnce({ ...value, privateText: "PRIVATE_LORE" });
 render(<ServiceDiagnostics locale="en" onCheck={onCheck}/>); fireEvent.click(screen.getByRole("button")); await screen.findByText(/Saved records could not be read/);
 fireEvent.click(screen.getByRole("button", { name: "Refresh report" })); await screen.findByText(/Queued updates could not be read/); expect(document.body.textContent).not.toContain("PRIVATE"); expect(screen.queryByText(/No registered operations/)).toBeNull();
});
it("does not display stale clipboard success after another check", async () => {
 let resolve!: () => void; Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockReturnValue(new Promise<void>(r => { resolve = r; })) } });
 render(<ServiceDiagnostics locale="en" onCheck={async () => read()}/>); fireEvent.click(screen.getByRole("button")); await screen.findByRole("button", { name: "Copy report" }); fireEvent.click(screen.getByRole("button", { name: "Copy report" })); fireEvent.click(screen.getByRole("button", { name: "Refresh report" })); await screen.findByRole("button", { name: "Copy report" }); await act(async () => resolve()); expect(screen.queryByText("Report copied")).toBeNull();
});
it("does not call a queued but already committed result unrecorded", async () => {
 const entry = servicePending(id, { phase: "result", workerChatId: "PRIVATE_WORKER", cleanup: "done", error: null, at: 1 });
 const value = serviceDiagnosticSnapshot({ status: "read", values: [operation] }, { status: "read", values: { [SERVICE_OUTBOX_PREFIX + id]: entry } });
 render(<ServiceDiagnostics locale="en" onCheck={async () => value}/>); fireEvent.click(screen.getByRole("button"));
 await screen.findByText(/some may already be in the journal/);
 expect(document.body.textContent).not.toMatch(/not yet recorded|are not yet recorded/);
});
for (const locale of ["ru", "en"] as const) it(`explains a rejected attempt after success and copies its safe field path in ${locale}`, async () => {
 const castId = "cast_00000000-0000-4000-8000-000000000002";
 const validation = castServiceValidation({ id: castId, diagnostics: [{ requestId: castId, step: 2, repair: false, code: "invalid-evidence", stage: "parse", at: 3, replyLength: 145, issues: ["PRIVATE_QUOTE"], details: [{ path: "characters[1].evidence[1].quote", rule: "exact substring of source text", actual: "string(length=145)" }] }] });
 const value = serviceDiagnosticSnapshot({ status: "read", values: [{ ...castServiceOperationFromStart({ id: castId, worldId: "PRIVATE_WORLD", createdAt: 1 }), contractVersion: 2, phase: "result", cleanup: "done", workerChatId: "PRIVATE_WORKER", validation }] }, { status: "read", values: {} });
 const writeText = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
 render(<ServiceDiagnostics locale={locale} onCheck={async () => value}/>); fireEvent.click(screen.getByRole("button"));
 await screen.findByText(locale === "ru" ? "Цитата должна дословно совпадать с текстом источника." : "The quote must match the source text exactly.");
 expect(document.body.textContent).toContain(locale === "ru" ? "Более поздний успех их не стирает" : "A later successful result does not erase them");
 expect(screen.getByText("characters[1].evidence[1].quote")).toBeInTheDocument(); expect(document.body.textContent).not.toContain("PRIVATE");
 fireEvent.click(screen.getByRole("button", { name: locale === "ru" ? "Скопировать отчёт" : "Copy report" }));
 await screen.findByText(locale === "ru" ? "Отчёт скопирован" : "Report copied"); expect(JSON.parse(writeText.mock.calls[0]![0])).toMatchObject({ diagnosticVersion: 4, result: { journal: { entries: [{ phase: "result", validation }] } } });
});
it("does not guess the cause of an older cast error without saved checks", async () => {
 const value = serviceDiagnosticSnapshot({ status: "read", values: [{ ...castServiceOperationFromStart({ id: "cast_00000000-0000-4000-8000-000000000002", worldId: "w", createdAt: 1 }), phase: "failed", cleanup: "done", error: "invalid-evidence" }] }, { status: "read", values: {} });
 render(<ServiceDiagnostics locale="en" onCheck={async () => value}/>); fireEvent.click(screen.getByRole("button")); await screen.findByText(/A detailed reason was not saved/);
 expect(screen.queryByText("The quote must match the source text exactly.")).toBeNull();
});
for (const locale of ["ru", "en"] as const) it(`shows precise field failures without promising a correction request in ${locale}`, async () => {
 const validation = fieldServiceValidation(new FieldValidationError([{ path: "text", rule: "text length <=100", actual: "string(length=101)" }], "text-too-long"), 101, 3)!;
 const value = serviceDiagnosticSnapshot({ status: "read", values: [{ ...operation, contractVersion: 3, phase: "failed", error: "text-too-long", validation }] }, { status: "read", values: {} });
 render(<ServiceDiagnostics locale={locale} onCheck={async () => value}/>); fireEvent.click(screen.getByRole("button")); await screen.findByText(locale === "ru" ? "Проверка ответа палочки" : "Field reply check");
 expect(screen.getByText(locale === "ru" ? "Текст должен содержать не более 100 знаков." : "The text must contain no more than 100 characters.")).toBeInTheDocument();
 expect(document.body.textContent).not.toContain(locale === "ru" ? "Исправление формата" : "Format correction"); expect(document.body.textContent).not.toContain("PRIVATE");
});
for (const locale of ["ru", "en"] as const) it(`shows fixed worker stage and visibility in ${locale}`, async () => {
 const value = serviceDiagnosticSnapshot({ status: "read", values: [{ ...operation, contractVersion: 4, validation: null, runtime: { stage: "waiting-reply", visibility: "hidden", at: 3 } }] }, { status: "read", values: {} });
 render(<ServiceDiagnostics locale={locale} onCheck={async () => value}/>); fireEvent.click(screen.getByRole("button"));
 await screen.findByText(locale === "ru" ? "Ожидание ответа на странице" : "Waiting for reply in the page"); expect(screen.getByText(locale === "ru" ? "Страница скрыта" : "Hidden page")).toBeInTheDocument();
 expect(document.body.textContent).not.toContain("PRIVATE");
});
