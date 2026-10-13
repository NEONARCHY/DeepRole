import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ProfileSupplements } from "../src/entrypoints/shared/ProfileSupplements";
import { profileSupplementText as text } from "../src/core/profile-supplement-i18n";
import { characterText } from "../src/core/characters";
import { profileCopy } from "../src/core/character-profile-i18n";
import type { SupplementPage, SupplementAction } from "../src/core/profile-supplements";
afterEach(cleanup);
const page = (): SupplementPage => ({ worldId: "world", chatId: "chat", guard: { branchId: "branch", headRevisionId: "reply", selectionVersion: 1, revisionCount: 2 }, query: "", offset: 0, total: 1, next: null, people: [{ id: "person", name: "Mira" }], target: null });
function selected(p: SupplementPage): SupplementPage {
 const values = { appearance: "Author: green coat", personality: "Patient", goals: "", background: "" };
 return { ...p, target: { id: "person", name: "Mira", values, suggestions: [{ eventId: "proposal", accepted: false, supplement: { entityId: "person", canonical: values, versions: {}, profile: { headRevisionId: "reply", name: "Mira", values, proposal: { appearance: { status: "found", text: "Scar above her left eyebrow", evidence: ["Mira has a scar above her left eyebrow."] }, personality: { status: "not-found", text: "", evidence: [] }, goals: { status: "not-found", text: "", evidence: [] }, background: { status: "found", text: "Grew up by the harbor", evidence: ["Mira grew up by the harbor."] } }, proofs: [{ revisionId: "reply", quote: "Mira has a scar above her left eyebrow." }, { revisionId: "reply", quote: "Mira grew up by the harbor." }], partial: true } } }] } };
}
it.each(["ru", "en"] as const)("%s starts only on request, protects filled text, lets additions be edited and approved separately", async locale => {
 let p = page(); const calls: SupplementAction[] = [], action = async (a: SupplementAction) => { calls.push(a); if (a.action === "read" && a.input.entityId) { p = selected(p); p.target!.suggestions = []; } if (a.action === "prepare") p = selected(p); if (a.action === "approve") { p.target!.suggestions[0]!.accepted = true; p = { ...p, result: { applied: 2, skipped: [] } }; } return structuredClone(p); };
 render(<ProfileSupplements locale={locale} scope={p} disabled={false} onAction={action} onChanged={() => undefined} />); expect(calls).toHaveLength(0); fireEvent.click(screen.getByText(text(locale, "read"))); await screen.findByLabelText(text(locale, "character")); await waitFor(() => expect(screen.getByLabelText(text(locale, "character"))).toBeEnabled()); fireEvent.change(screen.getByLabelText(text(locale, "character")), { target: { value: "person" } }); await screen.findByText(text(locale, "prepare")); expect(calls.every(a => a.action === "read")).toBe(true);
 await waitFor(() => expect(screen.getByText(text(locale, "prepare"))).toBeEnabled()); fireEvent.click(screen.getByText(text(locale, "prepare"))); await screen.findByText(text(locale, "review")); expect(calls.filter(a => a.action === "approve")).toHaveLength(0); const label = profileCopy(locale).select + " · " + characterText(locale, "appearance"); expect(screen.getByRole("checkbox", { name: label })).not.toBeChecked();
 await waitFor(() => expect(screen.getByRole("checkbox", { name: label })).toBeEnabled()); fireEvent.click(screen.getByRole("checkbox", { name: label })); expect(screen.getByRole("checkbox", { name: label })).toBeChecked(); fireEvent.change(screen.getByLabelText(profileCopy(locale).proposal + ": " + characterText(locale, "appearance")), { target: { value: "Author edited: small scar" } }); fireEvent.click(screen.getByText(text(locale, "stage"))); await screen.findByText(text(locale, "preview")); expect(await screen.findByText("Author: green coat Author edited: small scar")).toBeInTheDocument(); expect(calls.filter(a => a.action === "approve")).toHaveLength(0);
 fireEvent.click(screen.getByText(text(locale, "save"))); await screen.findByText(text(locale, "saved")); expect(calls.at(-1)).toMatchObject({ action: "approve", input: { additions: { appearance: "Author edited: small scar", background: "Grew up by the harbor" }, accept: true } });
});
it("unmount cancels owned preparation, while read-only mounting never sends a model request", async () => {
 let p = page(); const calls: SupplementAction[] = []; let finish!: (v: SupplementPage) => void;
 const view = render(<ProfileSupplements locale="en" scope={p} disabled={false} onChanged={() => undefined} onAction={async a => { calls.push(a); if (a.action === "read" && a.input.entityId) p = selected(p); return a.action === "prepare" ? new Promise(r => { finish = r; }) : p; }} />); fireEvent.click(screen.getByText(text("en", "read"))); await screen.findByLabelText(text("en", "character")); fireEvent.change(screen.getByLabelText(text("en", "character")), { target: { value: "person" } }); await screen.findByText(text("en", "prepare")); fireEvent.click(screen.getByText(text("en", "prepare"))); await waitFor(() => expect(calls.at(-1)?.action).toBe("prepare")); view.unmount(); expect(calls.at(-1)?.action).toBe("cancel"); finish(p);
});
it("rejects foreign pages and blocks stale proposal confirmation", async () => {
 const p = selected(page()); p.target!.suggestions[0]!.supplement.profile.headRevisionId = "old";
 const v = render(<ProfileSupplements locale="en" scope={p} disabled={false} onChanged={() => undefined} onAction={async () => p} />); fireEvent.click(screen.getByText(text("en", "read"))); await screen.findAllByText(text("en", "stale")); expect(screen.getByText(text("en", "stage"))).toBeDisabled(); v.unmount();
 render(<ProfileSupplements locale="en" scope={page()} disabled={false} onChanged={() => undefined} onAction={async () => ({ ...page(), chatId: "other" })} />); fireEvent.click(screen.getByText(text("en", "read"))); await screen.findByText(text("en", "error")); expect(screen.queryByLabelText(text("en", "character"))).toBeNull();
});
it("reports skipped-only fields without claiming any additions were saved", async () => {
 const p = { ...selected(page()), result: { applied: 0, skipped: ["appearance" as const] } };
 render(<ProfileSupplements locale="en" scope={p} disabled={false} onChanged={() => undefined} onAction={async () => p} />); fireEvent.click(screen.getByText(text("en", "read"))); await screen.findByText(text("en", "skipOnly")); expect(screen.queryByText(text("en", "saved"))).toBeNull();
});
