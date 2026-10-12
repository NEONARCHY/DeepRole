import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StoryDiagnostics } from "../src/entrypoints/shared/StoryDiagnostics";
import { readNativeStoryHistory } from "../src/core/story-native-history";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
for(const locale of ["ru","en"] as const)it(`renders anchored v3 observations without leaking values or asserting selection in ${locale}`,async()=>{
  const diagnostics=readNativeStoryHistory({messages:[{id:1,parent_id:null,role:"user"},{id:2,parent_id:1,role:"assistant",status:"PRIVATE_STATUS",is_finished:true,finish_reason:"PRIVATE_REASON"}],selected_message_id:2},"PRIVATE_CHAT",{collectReplyProbe:true,anchorId:"2"}).diagnostics;
  render(<StoryDiagnostics locale={locale} onCheck={async()=>({status:"read",diagnostics})}/>);
  fireEvent.click(screen.getByRole("button",{name:locale==="ru"?"Проверить текущий чат":"Check current chat"}));
  await screen.findByText(locale==="ru"?"Связи сообщений прочитаны":"Message links read");
  const region=screen.getByRole("region",{name:locale==="ru"?"Проверка последней видимой реплики":"Last visible message check",hidden:true});
  expect(region.textContent).toContain(locale==="ru"?"Точное совпадение":"Exact match");
  expect(region.textContent).toContain(locale==="ru"?"Совпадает с ID видимой реплики":"Matches the visible ID");
  expect(region.textContent).toContain(locale==="ru"?"Незнакомое текстовое значение":"Unrecognized text value");
  expect(document.body.textContent).not.toMatch(/PRIVATE|selected: true/);
});
for (const locale of ["ru", "en"] as const) it(`renders and copies safe v2 status counts without asserting completion in ${locale}`, async () => {
  const diagnostics = readNativeStoryHistory({ messages: [
    { id: 1, parent_id: null, role: "USER", status: "PRIVATE_STATUS" },
    { id: 2, parent_id: 1, role: "ASSISTANT", status: "FINISHED", message_status: 987654 },
  ] }, "PRIVATE_CHAT", { collectStatuses: true }).diagnostics;
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(<StoryDiagnostics locale={locale} onCheck={async () => ({ status: "read", diagnostics })}/>);
  fireEvent.click(screen.getByRole("button", { name: locale === "ru" ? "Проверить текущий чат" : "Check current chat" }));
  await screen.findByText(locale === "ru" ? "Связи сообщений прочитаны" : "Message links read");
  const details = screen.getByText(locale === "ru" ? "Технические подробности" : "Technical details").closest("details")!;
  expect(details).not.toHaveAttribute("open"); fireEvent.click(details.querySelector("summary")!);
  expect(screen.getByText("FINISHED")).toBeInTheDocument();
  expect(screen.getByText(locale === "ru" ? "Не подтверждена" : "Not verified")).toBeInTheDocument();
  expect(details.textContent).toContain(locale === "ru" ? "Сообщения пользователя: Незнакомое текстовое значение" : "User messages: Unrecognized text value");
  expect(details.textContent).toContain(locale === "ru" ? "Ответы DeepSeek: Нетекстовое значение" : "DeepSeek replies: Non-text value");
  expect(document.body.textContent).not.toMatch(/PRIVATE|987654/);
  fireEvent.click(screen.getByRole("button", { name: locale === "ru" ? "Скопировать отчёт" : "Copy report" }));
  await screen.findByText(locale === "ru" ? "Отчёт скопирован" : "Report copied");
  const report = JSON.parse(writeText.mock.calls[0]![0]);
  expect(report).toMatchObject({ diagnosticVersion: 2, automaticStoryIngestion: "not-checked", result: { diagnostics: { completion: "unknown", statusCounts: diagnostics.diagnosticVersion === 2 ? diagnostics.statusCounts : [] } } });
  expect(JSON.stringify(report)).not.toMatch(/PRIVATE|987654|chatId/);
});
const result = { status: "read", diagnostics: readNativeStoryHistory({ messages: [{ id: 1, role: "user", content: "PRIVATE_LORE" }] }, "PRIVATE_CHAT").diagnostics };
for (const locale of ["ru", "en"] as const) it(`checks only on request and copies a safe report in ${locale}`, async () => {
  const onCheck = vi.fn().mockResolvedValue(result), writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } }); render(<StoryDiagnostics locale={locale} onCheck={onCheck}/>);
  expect(onCheck).not.toHaveBeenCalled(); expect(screen.queryByRole("button", { name: locale === "ru" ? "Скопировать отчёт" : "Copy report" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: locale === "ru" ? "Проверить текущий чат" : "Check current chat" }));
  await screen.findByText(locale === "ru" ? "Не удалось проверить связи сообщений" : "Message links could not be verified"); expect(onCheck).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: locale === "ru" ? "Скопировать отчёт" : "Copy report" })); await screen.findByText(locale === "ru" ? "Отчёт скопирован" : "Report copied");
  expect(writeText).toHaveBeenCalledTimes(1); expect(writeText.mock.calls[0]![0]).not.toMatch(/PRIVATE|chatId|FINISHED/); expect(JSON.parse(writeText.mock.calls[0]![0])).toMatchObject({ automaticStoryIngestion: "not-checked", result: { diagnostics: { completion: "unknown", issues: [{ code: "missing-parent" }] } } });
});
it("shows a selectable fallback instead of claiming a failed clipboard write succeeded", async () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("PRIVATE")) } });
  render(<StoryDiagnostics locale="en" onCheck={async () => result}/>); fireEvent.click(screen.getByRole("button", { name: "Check current chat" })); await screen.findByRole("button", { name: "Copy report" }); fireEvent.click(screen.getByRole("button", { name: "Copy report" }));
  const text = await screen.findByRole("textbox", { name: "Diagnostic report" }); expect(text).toHaveAttribute("readonly"); expect(screen.queryByText("Report copied")).toBeNull(); fireEvent.focus(text); expect((text as HTMLTextAreaElement).selectionEnd).toBe((text as HTMLTextAreaElement).value.length);
});
it("single-flights rapid clicks and ignores a result after unmount", async () => {
  let resolve!: (v: unknown) => void; const onCheck = vi.fn().mockReturnValue(new Promise(r => { resolve = r; })), view = render(<StoryDiagnostics locale="en" onCheck={onCheck}/>);
  const button = screen.getByRole("button", { name: "Check current chat" }); fireEvent.click(button); fireEvent.click(button); expect(onCheck).toHaveBeenCalledTimes(1); expect(button).toBeDisabled(); view.unmount(); await act(async () => resolve(result)); expect(screen.queryByText("Message links could not be verified")).toBeNull();
});
it("hides raw check errors and malformed data behind localized recovery messages", async () => {
  const onCheck = vi.fn().mockRejectedValueOnce(new Error("PRIVATE_TOKEN")).mockResolvedValueOnce({ ...result, content: "PRIVATE_LORE" }); render(<StoryDiagnostics locale="en" onCheck={onCheck}/>);
  fireEvent.click(screen.getByRole("button", { name: "Check current chat" })); await screen.findByText(/tab is not responding/); fireEvent.click(screen.getByRole("button", { name: "Check again" })); await screen.findByText(/failed its safety check/); expect(document.body.textContent).not.toContain("PRIVATE");
});
it("does not display stale clipboard success after another check", async () => {
  let resolve!: () => void; Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockReturnValue(new Promise<void>(r => { resolve = r; })) } });
  render(<StoryDiagnostics locale="en" onCheck={async () => result}/>); fireEvent.click(screen.getByRole("button", { name: "Check current chat" })); await screen.findByRole("button", { name: "Copy report" }); fireEvent.click(screen.getByRole("button", { name: "Copy report" })); fireEvent.click(screen.getByRole("button", { name: "Check again" })); await screen.findByRole("button", { name: "Copy report" }); await act(async () => resolve()); expect(screen.queryByText("Report copied")).toBeNull();
});
