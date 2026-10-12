import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CharacterDiscovery } from "../src/entrypoints/shared/CharacterDiscovery";
import { characterDiscoveryText as text } from "../src/core/character-discovery-i18n";
import type { CharacterDiscoveryAction, CharacterDiscoveryPage } from "../src/core/story-character-discovery";
afterEach(cleanup);
const page = (): CharacterDiscoveryPage => ({ worldId: "world", chatId: "chat", guard: { branchId: "branch", headRevisionId: "reply", selectionVersion: 1, revisionCount: 2 }, sources: 2, completed: 2, remaining: 0, total: 1, offset: 0, next: null, candidates: [{ eventId: "event", name: "Courier", quote: "Courier brought a letter.", background: "Courier brought a letter.", added: false }] });
it.each(["ru", "en"] as const)("%s linking requires a searched and selected stable profile; it never starts a worker or copies draft text", async locale => {
 let p = page(); const calls: CharacterDiscoveryAction[] = [];
 const onAction = async (a: CharacterDiscoveryAction) => { calls.push(a); if (a.action === "read" && a.input.identity) return { ...p, identity: { ...a.input.identity, total: 2, next: null, people: [{ id: "person-a", name: "Alex", summary: "Clockmaker", updatedAt: 20 }, { id: "person-b", name: "Alex", summary: "Courier", updatedAt: 30 }] } }; if (a.action === "approve") p = { ...p, guard: { ...p.guard, selectionVersion: 2 }, candidates: [{ ...p.candidates[0]!, added: true, identityName: "Alex" }] }; return p; };
 render(<CharacterDiscovery locale={locale} scope={p} onAction={onAction} onChanged={() => undefined} disabled={false} />);
 fireEvent.click(screen.getByText(text(locale, "read"))); await screen.findByText("Courier", { selector: "h4" }); fireEvent.change(screen.getByLabelText(text(locale, "background")), { target: { value: "My draft" } });
 expect(calls).toHaveLength(1); fireEvent.click(screen.getByText(text(locale, "identityOpen"))); await screen.findByText("Clockmaker"); expect(screen.getByText(text(locale, "identityConfirm"))).toBeDisabled(); expect(screen.getByLabelText(text(locale, "background"))).toHaveValue("My draft");
 fireEvent.click(screen.getByRole("radio", { name: "Alex Courier" })); fireEvent.click(screen.getByText(text(locale, "identityConfirm") + " · Alex")); await screen.findByText(text(locale, "identityLinked").replace("{name}", "Alex"));
 expect(calls.at(-1)).toMatchObject({ action: "approve", input: { eventId: "event", identity: { entityId: "person-b", updatedAt: 30 }, accept: true } }); expect(calls.at(-1)!.input).not.toHaveProperty("values"); expect(calls.some(a => a.action === "run" || a.action === "profile" || a.action === "queue")).toBe(false); expect(screen.getByText(text(locale, "identityRemove"))).toBeInTheDocument();
});
it("searching clears selection and closing the picker preserves author fields", async () => {
 const p = page(), calls: CharacterDiscoveryAction[] = [], onAction = async (a: CharacterDiscoveryAction) => { calls.push(a); return a.action === "read" && a.input.identity ? { ...p, identity: { ...a.input.identity, total: 1, next: null, people: [{ id: "person", name: "Alex", summary: "Clockmaker", updatedAt: 20 }] } } : p; };
 render(<CharacterDiscovery locale="en" scope={p} onAction={onAction} onChanged={() => undefined} disabled={false} />); fireEvent.click(screen.getByText(text("en", "read"))); await screen.findByText("Courier", { selector: "h4" }); fireEvent.click(screen.getByText(text("en", "identityOpen"))); await screen.findByRole("radio"); fireEvent.click(screen.getByRole("radio")); expect(screen.getByText(text("en", "identityConfirm") + " · Alex")).not.toBeDisabled();
 fireEvent.change(screen.getByLabelText(text("en", "identitySearch")), { target: { value: "Maker" } }); expect(screen.getByText(text("en", "identityConfirm"))).toBeDisabled(); fireEvent.click(screen.getByText(text("en", "identityFind"))); await waitFor(() => expect(calls.at(-1)).toMatchObject({ action: "read", input: { identity: { query: "Maker", offset: 0 } } }));
 fireEvent.change(screen.getByLabelText(text("en", "background")), { target: { value: "Preserved draft" } }); fireEvent.click(screen.getByText(text("en", "identityOpen"))); expect(screen.queryByRole("radio")).toBeNull(); expect(screen.getByLabelText(text("en", "background"))).toHaveValue("Preserved draft");
});
it("a namesake is kept as a proposal and cannot be prepared under the shared unqualified name", async () => {
 const p = page(); p.candidates[0]!.distinct = true;
 render(<CharacterDiscovery locale="en" scope={p} onAction={async () => p} onChanged={() => undefined} disabled={false} />); fireEvent.click(screen.getByText(text("en", "read"))); await screen.findByText(text("en", "distinctHint")); expect(screen.getByText(text("en", "prepare"))).toBeDisabled(); expect(screen.getByText(text("en", "queuePage"))).toBeDisabled();
 fireEvent.change(screen.getByLabelText(text("en", "name")), { target: { value: "Courier from the north" } }); expect(screen.getByText(text("en", "prepare"))).not.toBeDisabled(); expect(screen.getByText(text("en", "approve"))).not.toBeDisabled(); await waitFor(() => expect(screen.getByText(text("en", "queuePage"))).not.toBeDisabled());
});
