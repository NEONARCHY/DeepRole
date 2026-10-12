import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CharacterDiscovery } from "../src/entrypoints/shared/CharacterDiscovery";
import { characterDiscoveryText as text } from "../src/core/character-discovery-i18n";
import type { CharacterDiscoveryAction, CharacterDiscoveryPage } from "../src/core/story-character-discovery";
import { characterText } from "../src/core/characters";
import { profileCopy } from "../src/core/character-profile-i18n";
import type { DiscoveryProfile } from "../src/core/discovery-profile";
afterEach(cleanup);
const page = (): CharacterDiscoveryPage => ({ worldId: "world", chatId: "chat", guard: { branchId: "branch", headRevisionId: "reply", selectionVersion: 1, revisionCount: 2 }, sources: 2, completed: 2, remaining: 0, total: 1, offset: 0, next: null, candidates: [{ eventId: "event", name: "Sergey", quote: "Sergey brought a letter.", background: "Sergey brought a letter.", added: false }] });
it.each(["ru", "en"] as const)("%s only searches on request, offers editable provenance and never auto-approves a profile", async locale => {
  let p = page(); const calls: CharacterDiscoveryAction[] = [], changed = vi.fn();
  const onAction = vi.fn(async (a: CharacterDiscoveryAction) => { calls.push(a); if (a.action === "approve") p = { ...p, guard: { ...p.guard, selectionVersion: 2 }, candidates: [{ ...p.candidates[0]!, name: a.input.name, background: a.input.background, added: true }] }; return structuredClone(p); });
  render(<CharacterDiscovery locale={locale} scope={p} onAction={onAction} onChanged={changed} disabled={false} />); expect(calls).toHaveLength(0);
  fireEvent.click(screen.getByText(text(locale, "read"))); await screen.findByText("Sergey"); expect(calls.map(c => c.action)).toEqual(["read"]);
  fireEvent.change(screen.getByLabelText(text(locale, "name")), { target: { value: "Sergey the courier" } }); fireEvent.change(screen.getByLabelText(text(locale, "background")), { target: { value: "A trusted courier" } }); fireEvent.click(screen.getByText(text(locale, "approve")));
  await screen.findByText(text(locale, "added")); expect(calls.at(-1)).toMatchObject({ action: "approve", input: { name: "Sergey the courier", background: "A trusted courier", accept: true, eventId: "event" } }); expect(changed).toHaveBeenCalledOnce();
});
it("an unmounted search is cancelled; an ordinary read never opens or cancels a worker", async () => {
  const p = { ...page(), remaining: 2, completed: 0, candidates: [], total: 0 }, calls: CharacterDiscoveryAction[] = []; let finish!: (v: CharacterDiscoveryPage) => void;
  const onAction = async (a: CharacterDiscoveryAction) => { calls.push(a); return a.action === "run" ? new Promise<CharacterDiscoveryPage>(r => { finish = r; }) : p; };
  const view = render(<CharacterDiscovery locale="en" scope={p} onAction={onAction} onChanged={() => undefined} disabled={false} />); fireEvent.click(screen.getByText(text("en", "start"))); await waitFor(() => expect(calls.map(a => a.action)).toEqual(["read", "run"])); view.unmount(); expect(calls.at(-1)?.action).toBe("cancel"); finish(p);
});
it("a foreign or malformed result cannot appear as an approved character", async () => {
  const p = page(); render(<CharacterDiscovery locale="en" scope={p} onAction={async () => ({ ...p, worldId: "foreign" })} onChanged={() => undefined} disabled={false} />);
  fireEvent.click(screen.getByText(text("en", "read"))); await screen.findByText(text("en", "error")); expect(screen.queryByText("Sergey")).toBeNull(); expect(screen.queryByText(text("en", "approve"))).toBeNull();
});
const proposal = (values: DiscoveryProfile["values"]): DiscoveryProfile => ({ headRevisionId: "reply", name: "Sergey", values, proposal: {
 appearance: { status: "found", text: "Red coat", evidence: ["Sergey wears a red coat."] }, personality: { status: "found", text: "Patient", evidence: ["Sergey waits patiently."] }, goals: { status: "not-found", text: "", evidence: [] }, background: { status: "not-found", text: "", evidence: [] },
}, proofs: [{ revisionId: "reply", quote: "Sergey wears a red coat." }, { revisionId: "reply", quote: "Sergey waits patiently." }], partial: true });
it.each(["ru", "en"] as const)("%s prepares one profile, protects filled/late edited fields and saves author choices only on approval", async locale => {
 let p = page(); const calls: CharacterDiscoveryAction[] = [];
 const onAction = async (a: CharacterDiscoveryAction) => { calls.push(a); if (a.action === "profile") p = { ...p, candidates: [{ ...p.candidates[0]!, profile: proposal(a.input.values) }] }; if (a.action === "approve") p = { ...p, candidates: [{ ...p.candidates[0]!, added: true }] }; return structuredClone(p); };
 render(<CharacterDiscovery locale={locale} scope={p} onAction={onAction} onChanged={() => undefined} disabled={false} />); fireEvent.click(screen.getByText(text(locale, "read"))); await screen.findByText("Sergey");
 const appearance = screen.getByLabelText(characterText(locale, "appearance")), personality = screen.getByLabelText(characterText(locale, "personality")); fireEvent.change(appearance, { target: { value: "Manual blue coat" } });
 fireEvent.click(screen.getByText(text(locale, "prepare"))); await screen.findByText(profileCopy(locale).review); expect(calls.filter(c => c.action === "profile")).toHaveLength(1); expect(calls.filter(c => c.action === "approve")).toHaveLength(0);
 expect(screen.getByRole("checkbox", { name: profileCopy(locale).select + " · " + characterText(locale, "appearance") })).not.toBeChecked();
 fireEvent.change(personality, { target: { value: "Manual later personality" } }); fireEvent.click(screen.getByText(text(locale, "profileApply"))); expect(appearance).toHaveValue("Manual blue coat"); expect(personality).toHaveValue("Manual later personality"); await screen.findByText(profileCopy(locale).skipped);
 const choice = screen.getByRole("checkbox", { name: profileCopy(locale).select + " · " + characterText(locale, "personality") }); fireEvent.click(choice); fireEvent.change(screen.getByLabelText(profileCopy(locale).proposal + ": " + characterText(locale, "personality")), { target: { value: "Author edited suggestion" } }); await screen.findByText(profileCopy(locale).edited); fireEvent.click(screen.getByText(text(locale, "profileApply"))); expect(personality).toHaveValue("Author edited suggestion");
 fireEvent.click(screen.getByText(text(locale, "approve"))); await screen.findByText(text(locale, "added")); expect(calls.at(-1)).toMatchObject({ action: "approve", input: { values: { appearance: "Manual blue coat", personality: "Author edited suggestion", goals: "" } } });
});
it("stale source-backed proposals cannot be added and unmount cancels profile work", async () => {
 const p = page(); p.candidates[0]!.profile = { ...proposal({ appearance: "", personality: "", goals: "", background: "Seed" }), headRevisionId: "older" };
 let finish!: (v: CharacterDiscoveryPage) => void; const calls: CharacterDiscoveryAction[] = [];
 const view = render(<CharacterDiscovery locale="en" scope={p} onAction={async a => { calls.push(a); return a.action === "profile" ? new Promise(r => { finish = r; }) : p; }} onChanged={() => undefined} disabled={false} />);
 fireEvent.click(screen.getByText(text("en", "read"))); await screen.findByText(text("en", "profileStale")); expect(screen.getByText(text("en", "approve"))).toBeDisabled(); fireEvent.click(screen.getByText(text("en", "prepare"))); await screen.findByText(text("en", "stopProfile")); view.unmount(); expect(calls.at(-1)?.action).toBe("cancel"); finish(p);
});
it("preparing a later catalog page keeps that page and its local author draft", async () => {
 const rows = Array.from({ length: 21 }, (_, i) => ({ ...page().candidates[0]!, eventId: "candidate-" + i, name: "Courier " + i }));
 const snapshot = (offset = 0): CharacterDiscoveryPage => ({ ...page(), total: rows.length, offset, next: offset ? null : 20, candidates: rows.slice(offset, offset + 20) });
 const calls: CharacterDiscoveryAction[] = [], onAction = async (a: CharacterDiscoveryAction) => { calls.push(a); if (a.action === "profile") rows[20]!.profile = { ...proposal(a.input.values), name: a.input.name }; return snapshot(a.action === "read" ? a.input.offset : 0); };
 render(<CharacterDiscovery locale="en" scope={page()} onAction={onAction} onChanged={() => undefined} disabled={false} />); fireEvent.click(screen.getByText(text("en", "read"))); await screen.findByText("Courier 0"); fireEvent.click(screen.getByText(text("en", "next"))); await screen.findByText("Courier 20");
 fireEvent.change(screen.getByLabelText(text("en", "background")), { target: { value: "Author's draft on page two" } }); fireEvent.click(screen.getByText(text("en", "prepare"))); await screen.findByText(profileCopy("en").review); expect(screen.getByLabelText(text("en", "background"))).toHaveValue("Author's draft on page two"); expect(screen.queryByText("Courier 0")).toBeNull(); expect(calls.at(-1)).toMatchObject({ action: "read", input: { offset: 20 } });
});
