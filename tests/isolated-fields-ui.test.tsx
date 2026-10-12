import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CharacterTextField } from "../src/entrypoints/shared/CharacterTextField";
import { characterModeCopy, isolatedFieldCopy } from "../src/core/character-text";
const field = { key: "appearance", label: "Appearance", maxLength: 1200, scope: "profile" as const };
afterEach(cleanup);
it.each(["ru", "en"] as const)("shows unsaved result and cleanup warning/link in %s", async locale => {
 const change = vi.fn(), generate = vi.fn(async () => ({ text: "Blue coat", cleanup: "failed" as const, partialContext: true, cleanupUrl: "https://chat.deepseek.com/chat/s/owned" }));
 render(<CharacterTextField field={field} value="" locale={locale} onChange={change} onGenerate={generate} />);
 fireEvent.click(screen.getByRole("button")); await act(async () => { fireEvent.click(screen.getByRole("button", { name: characterModeCopy(locale).suggest })); }); expect(change).toHaveBeenCalledWith("Blue coat"); expect(screen.getByText(isolatedFieldCopy(locale).cleanup)).toBeVisible(); expect(screen.getByText(isolatedFieldCopy(locale).partial)).toBeVisible();
 expect(screen.getByRole("link", { name: isolatedFieldCopy(locale).open })).toHaveAttribute("href", "https://chat.deepseek.com/chat/s/owned");
});
it("never overwrites manual typing while the temporary request is running", async () => {
 let resolve!: (value: any) => void; const generate = vi.fn(() => new Promise<any>(r => { resolve = r; })), change = vi.fn();
 const { rerender } = render(<CharacterTextField field={field} value="" locale="en" onChange={change} onGenerate={generate} />);
 fireEvent.click(screen.getByRole("button")); fireEvent.click(screen.getByRole("button", { name: characterModeCopy("en").suggest })); expect(screen.getByText(isolatedFieldCopy("en").waiting)).toBeVisible();
 rerender(<CharacterTextField field={field} value="My manual coat" locale="en" onChange={change} onGenerate={generate} />);
 await act(async () => { resolve({ text: "Blue coat", cleanup: "done", partialContext: false }); }); expect(change).not.toHaveBeenCalled(); expect(screen.getByRole("textbox", { name: "Suggested text: Appearance" })).toHaveValue("Blue coat");
});
it("does not expose arbitrary links or apply a result after editor unmount", async () => {
 let resolve!: (value: any) => void; const change = vi.fn(); const { unmount } = render(<CharacterTextField field={field} value="" locale="en" onChange={change} onGenerate={() => new Promise<any>(r => { resolve = r; })} />);
 fireEvent.click(screen.getByRole("button")); fireEvent.click(screen.getByRole("button", { name: characterModeCopy("en").suggest })); unmount(); await act(async () => { resolve({ text: "Blue coat", cleanup: "failed", cleanupUrl: "javascript:alert(1)", partialContext: false }); }); expect(change).not.toHaveBeenCalled();
});
it.each(["ru", "en"] as const)("opening/cancelling the chooser sends no request in %s; Escape restores focus", locale => {
 const generate = vi.fn(); render(<CharacterTextField field={field} value="Manual coat" locale={locale} onChange={vi.fn()} onGenerate={generate} />);
 const wand = screen.getByRole("button"); fireEvent.click(wand); expect(generate).not.toHaveBeenCalled();
 expect(screen.getByRole("button", { name: characterModeCopy(locale).history })).toHaveAccessibleDescription(characterModeCopy(locale).historyHint);
 fireEvent.keyDown(screen.getByRole("group"), { key: "Escape" }); expect(wand).toHaveFocus(); expect(wand).toHaveAttribute("aria-expanded", "false"); expect(generate).not.toHaveBeenCalled();
});
it.each(["facts-not-found", "conflicting-facts"])("does not change a field when history mode returns %s", async code => {
 const change = vi.fn(), generate = vi.fn(async () => { throw Error(code); });
 render(<CharacterTextField field={field} value="Manual coat" locale="en" onChange={change} onGenerate={generate} />);
 fireEvent.click(screen.getByRole("button")); await act(async () => { fireEvent.click(screen.getByRole("button", { name: characterModeCopy("en").history })); });
 expect(generate.mock.calls[0]).toEqual([{ ...field, mode: "history" }, "Manual coat", expect.objectContaining({ signal: expect.any(AbortSignal), isCurrent: expect.any(Function), onProgress: expect.any(Function) })]); expect(change).not.toHaveBeenCalled(); expect(screen.getByRole(code === "facts-not-found" ? "status" : "alert")).toHaveTextContent(code === "facts-not-found" ? characterModeCopy("en").missing : characterModeCopy("en").conflict);
});
it.each(["ru", "en"] as const)("shows supporting quotes as inert text, without a source ID in %s", async locale => {
 const generate = async () => ({ text: "Blue coat.", cleanup: "done" as const, partialContext: true, mode: "history" as const, historyOrigin: "native" as const, evidence: ['Mira wears a blue coat. <img onerror="bad()">'] });
 render(<CharacterTextField field={field} value="" locale={locale} onChange={vi.fn()} onGenerate={generate} />);
 fireEvent.click(screen.getByRole("button")); await act(async () => { fireEvent.click(screen.getByRole("button", { name: characterModeCopy(locale).history })); });
 expect(screen.getByText(characterModeCopy(locale).quotes)).toBeVisible(); expect(document.querySelector("blockquote")?.textContent).toContain('<img onerror="bad()">'); expect(document.querySelector("img")).toBeNull();
});
