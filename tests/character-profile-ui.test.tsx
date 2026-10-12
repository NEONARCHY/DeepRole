import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CharacterProfileGenerator } from "../src/entrypoints/shared/CharacterProfileGenerator";
import { CharacterEditor } from "../src/entrypoints/shared/CharacterSheets";
import { PROFILE_FIELDS, profileValues, type ProfileProposal } from "../src/core/character-profile";
import { profileCopy } from "../src/core/character-profile-i18n";
import { EMPTY_CHARACTER } from "../src/core/characters";
import { characterText } from "../src/core/characters";
import type { CharacterTextGenerator, CharacterTextRequestGenerator } from "../src/core/character-text";
const missing = { status: "not-found" as const, text: "", evidence: [] };
const creative = (fields: readonly string[] = PROFILE_FIELDS): string => JSON.stringify(Object.fromEntries(fields.map(key => [key, { status: "suggested", text: "Suggested " + key, evidence: [] }])));
const facts = (extras: ProfileProposal = {}): string => JSON.stringify({ appearance: { status: "found", text: "Blue coat", evidence: ["She wears a blue coat."] }, personality: missing, goals: missing, background: missing, ...extras });
const outcome = (text: string, cleanup = "done") => ({ text, cleanup, partialContext: true, historyOrigin: "native" });
afterEach(cleanup);
it("suggestions stay editable after clearing; edited source text is not presented as an exact quoted fact", async () => {
 const apply = vi.fn();
 render(<CharacterProfileGenerator locale="en" name="Nora" values={EMPTY_CHARACTER} disabled={false} onGenerate={async field => field.mode === "history" ? facts() : creative(field.profileFields)} onApply={apply} />);
 fireEvent.click(screen.getByRole("button", { name: "Generate profile" })); fireEvent.click(screen.getByRole("button", { name: "Find in history first" }));
 await waitFor(() => expect(screen.getByText(profileCopy("en").ready)).toBeVisible());
 const appearance = screen.getByRole("textbox", { name: "Suggestion: " + characterText("en", "appearance") });
 fireEvent.change(appearance, { target: { value: "" } }); expect(appearance).toBeVisible();
 fireEvent.change(appearance, { target: { value: "My green coat" } }); expect(screen.getByText(profileCopy("en").edited)).toBeVisible();
 expect(screen.getByText(profileCopy("en").originalQuotes)).toBeInTheDocument(); expect(screen.getByText(profileCopy("en").found)).toBeVisible();
 const personality = screen.getByRole("textbox", { name: "Suggestion: " + characterText("en", "personality") });
 fireEvent.change(personality, { target: { value: "   " } }); fireEvent.click(screen.getByRole("button", { name: profileCopy("en").apply }));
 expect(apply.mock.calls[0]![0]).toContainEqual({ key: "appearance", text: "My green coat", expected: "" });
 expect(apply.mock.calls[0]![0].some((v: any) => v.key === "personality")).toBe(false);
});
it.each(["ru", "en"] as const)("offers targeted choices without sending; fills missing facts with labelled fiction in %s", async locale => {
 const copy = profileCopy(locale), apply = vi.fn();
 const generate = vi.fn<CharacterTextGenerator>(async field => outcome(field.mode === "history" ? facts() : creative(field.profileFields)) as any);
 render(<CharacterProfileGenerator locale={locale} name="Nora" values={EMPTY_CHARACTER} disabled={false} onGenerate={generate} onApply={apply} />);
 fireEvent.click(screen.getByRole("button", { name: copy.generate })); expect(generate).not.toHaveBeenCalled();
 expect(screen.getByRole("button", { name: copy.history })).toHaveAccessibleDescription(copy.historyHint);
 fireEvent.keyDown(screen.getByRole("group"), { key: "Escape" }); expect(screen.getByRole("button", { name: copy.generate })).toHaveFocus();
 fireEvent.click(screen.getByRole("button", { name: copy.generate })); fireEvent.click(screen.getByRole("button", { name: copy.history }));
 await waitFor(() => expect(generate).toHaveBeenCalledTimes(2)); await waitFor(() => expect(screen.getByText(copy.ready)).toBeVisible());
 expect(generate.mock.calls[1]![0]).toMatchObject({ mode: "suggest", profileFields: ["personality", "goals", "background"] }); expect(JSON.parse(generate.mock.calls[1]![1]).appearance).toBe("Blue coat");
 expect(screen.getAllByText(copy.suggested)).toHaveLength(3); expect(screen.getByText(copy.found)).toBeVisible(); expect(apply).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button", { name: copy.apply })); expect(apply).toHaveBeenCalledTimes(1); expect(apply.mock.calls[0]![0]).toHaveLength(4);
});
it("does not invent when every field has facts, and keeps source conflicts unresolved", async () => {
 const filled: ProfileProposal = Object.fromEntries(PROFILE_FIELDS.map(key => [key, { status: "found", text: "Known " + key, evidence: ["An exact source quote"] }]));
 filled.goals = { status: "conflict", text: "", evidence: ["First goal", "Conflicting goal"] };
 const generate = vi.fn<CharacterTextGenerator>(async () => JSON.stringify(filled));
 render(<CharacterProfileGenerator locale="en" name="Nora" values={EMPTY_CHARACTER} disabled={false} onGenerate={generate} onApply={vi.fn()} />);
 fireEvent.click(screen.getByRole("button", { name: "Generate profile" })); await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Find in history first" })); });
 expect(generate).toHaveBeenCalledTimes(1); expect(screen.getByText(profileCopy("en").conflict)).toBeVisible(); expect(screen.getAllByRole("checkbox")).toHaveLength(3);
});
it("a completely unknown character gets a full creative proposal; no automatic application", async () => {
 const apply = vi.fn(), generate = vi.fn<CharacterTextGenerator>(async field => field.mode === "history" ? JSON.stringify(Object.fromEntries(PROFILE_FIELDS.map(key => [key, missing]))) : creative());
 render(<CharacterProfileGenerator locale="en" name="New person" values={EMPTY_CHARACTER} disabled={false} onGenerate={generate} onApply={apply} />);
 fireEvent.click(screen.getByRole("button", { name: "Generate profile" })); fireEvent.click(screen.getByRole("button", { name: "Find in history first" }));
 await waitFor(() => expect(generate).toHaveBeenCalledTimes(2)); await waitFor(() => expect(screen.getAllByText("Invented")).toHaveLength(4)); expect(apply).not.toHaveBeenCalled();
});
it("does not invent after an unconfirmed cleanup; keeps found facts available for review", async () => {
 const generate = vi.fn<CharacterTextGenerator>(async () => ({ ...outcome(facts(), "failed"), cleanupUrl: "https://chat.deepseek.com/chat/s/owned" }) as any);
 render(<CharacterProfileGenerator locale="en" name="Nora" values={EMPTY_CHARACTER} disabled={false} onGenerate={generate} onApply={vi.fn()} />);
 fireEvent.click(screen.getByRole("button", { name: "Generate profile" })); await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Find in history first" })); });
 expect(generate).toHaveBeenCalledTimes(1); expect(screen.getByText(profileCopy("en").cleanup)).toBeVisible(); expect(screen.getByRole("link")).toHaveAttribute("href", "https://chat.deepseek.com/chat/s/owned");
});
it("keeps retrieved facts if the creative fallback fails, without applying anything", async () => {
 const apply = vi.fn(), generate = vi.fn<CharacterTextGenerator>(async field => { if (field.mode === "suggest") throw Error("request-failed"); return facts(); });
 render(<CharacterProfileGenerator locale="en" name="Nora" values={EMPTY_CHARACTER} disabled={false} onGenerate={generate} onApply={apply} />);
 fireEvent.click(screen.getByRole("button", { name: "Generate profile" })); fireEvent.click(screen.getByRole("button", { name: "Find in history first" }));
 await waitFor(() => expect(screen.getByRole("alert")).toBeVisible()); expect(screen.getByRole("textbox", { name: "Suggestion: " + characterText("en", "appearance") })).toHaveValue("Blue coat"); expect(apply).not.toHaveBeenCalled();
});
it("manual edits during generation skip fallback and unselect the affected field", async () => {
 let release!: (v: string) => void; const generate = vi.fn<CharacterTextGenerator>(() => new Promise(resolve => { release = resolve; })), apply = vi.fn();
 const props = { locale: "en" as const, name: "Nora", values: profileValues(EMPTY_CHARACTER), disabled: false, onGenerate: generate, onApply: apply };
 const view = render(<CharacterProfileGenerator {...props} />); fireEvent.click(screen.getByRole("button", { name: "Generate profile" })); fireEvent.click(screen.getByRole("button", { name: "Find in history first" }));
 view.rerender(<CharacterProfileGenerator {...props} values={{ ...props.values, appearance: "Manual coat" }} />);
 await act(async () => { release(facts()); }); expect(generate).toHaveBeenCalledTimes(1); expect(screen.getByRole("checkbox", { name: "Insert · " + characterText("en", "appearance") })).not.toBeChecked(); expect(apply).not.toHaveBeenCalled();
 expect(screen.getByText(profileCopy("en").changed)).toBeVisible();
});
it("apply rechecks edits made after review and requires selecting the field again", async () => {
 const apply = vi.fn(), props = { locale: "en" as const, name: "Nora", values: profileValues(EMPTY_CHARACTER), disabled: false, onGenerate: async () => creative(), onApply: apply };
 const view = render(<CharacterProfileGenerator {...props} />); fireEvent.click(screen.getByRole("button", { name: "Generate profile" })); await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Invent a profile" })); });
 view.rerender(<CharacterProfileGenerator {...props} values={{ ...props.values, appearance: "Manual coat" }} />); fireEvent.click(screen.getByRole("button", { name: "Insert selected into fields" }));
 expect(apply.mock.calls[0]![0].some((v: any) => v.key === "appearance")).toBe(false); expect(screen.getByText(profileCopy("en").skipped)).toBeVisible();
 fireEvent.click(screen.getByRole("checkbox", { name: "Insert · " + characterText("en", "appearance") })); fireEvent.click(screen.getByRole("button", { name: "Insert selected into fields" })); expect(apply.mock.calls[1]![0]).toEqual([{ key: "appearance", text: "Suggested appearance", expected: "Manual coat" }]);
});
it("cancellation, scope changes and closing never apply late results", async () => {
 let release!: (v: string) => void, signal: AbortSignal | undefined; const apply = vi.fn();
 const props = { locale: "en" as const, name: "Nora", values: EMPTY_CHARACTER, scope: "world-1", disabled: false, onGenerate: async (_f: any, _t: any, options: any) => { signal = options.signal; return new Promise<string>(resolve => { release = resolve; }); }, onApply: apply };
 const view = render(<CharacterProfileGenerator {...props} />); fireEvent.click(screen.getByRole("button", { name: "Generate profile" })); fireEvent.click(screen.getByRole("button", { name: "Invent a profile" }));
 view.rerender(<CharacterProfileGenerator {...props} scope="world-2" />); expect(signal?.aborted).toBe(true); await act(async () => { release(creative()); }); expect(screen.queryByText("Suggested profile")).toBeNull(); expect(apply).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button", { name: "Generate profile" })); fireEvent.click(screen.getByRole("button", { name: "Invent a profile" })); fireEvent.click(screen.getByRole("button", { name: "Cancel request" })); expect(signal?.aborted).toBe(true);
 view.unmount(); await act(async () => { release(creative()); }); expect(apply).not.toHaveBeenCalled();
});
it("the real editor sends only the named character, keeps a user seed and all non-profile data, and saves only explicitly", async () => {
 const generate = vi.fn<CharacterTextRequestGenerator>(async () => creative()), save = vi.fn(async (_edit: any) => { throw Error("test-save"); });
 render(<CharacterEditor locale="en" entity={null} actions={["neutral"]} onClose={() => {}} onGenerateText={generate} onSave={save} />);
 expect(screen.getByRole("button", { name: "Generate profile" })).toBeDisabled(); fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Nora" } });
 const background = within(document.querySelector('[data-character-text-field="background"]') as HTMLElement).getByRole("textbox"); fireEvent.change(background, { target: { value: "Mira’s friend" } });
 fireEvent.click(screen.getByRole("button", { name: "Generate profile" })); await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Invent a profile" })); });
 expect(generate.mock.calls[0]![0].reference).toMatchObject({ name: "Nora", background: "Mira’s friend", protagonist: false }); expect(save).not.toHaveBeenCalled();
 expect(screen.getByRole("checkbox", { name: "Insert · " + characterText("en", "background") })).not.toBeChecked(); fireEvent.click(screen.getByRole("button", { name: "Insert selected into fields" })); expect(background).toHaveValue("Mira’s friend");
 for (const key of PROFILE_FIELDS.filter(k => k !== "background")) expect(within(document.querySelector(`[data-character-text-field="${key}"]`) as HTMLElement).getByRole("textbox")).toHaveValue("Suggested " + key);
 expect(save).not.toHaveBeenCalled(); await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save character" })); }); expect(save).toHaveBeenCalledTimes(1);
 const edit = save.mock.calls[0]![0] as any; expect(edit.name).toBe("Nora"); expect(edit.sheet.sprites).toEqual(EMPTY_CHARACTER.sprites); expect(edit.sheet.relationships).toEqual(EMPTY_CHARACTER.relationships); expect(edit.present).toBe(false);
});
