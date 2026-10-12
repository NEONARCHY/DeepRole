import { createRoot } from "react-dom/client";
import { StoryMerge } from "../../src/entrypoints/shared/StoryMerge";
import { StoryIdentities } from "../../src/entrypoints/shared/StoryIdentities";
import { EMPTY_STATUS } from "../../src/core/characters";
import type { MergeAction, MergePage, MergePerson } from "../../src/core/story-character-merge";
import type { IdentityAction, IdentityPage } from "../../src/core/story-identity-management";
import "../../src/entrypoints/sidepanel/styles.css";
import "../../src/entrypoints/shared/story-review.css";
const locale = new URL(location.href).searchParams.get("locale") === "en" ? "en" : "ru";
document.documentElement.lang = locale;
const scope = { worldId: "world", chatId: "chat" }, guard = { branchId: "branch", headRevisionId: "reply", selectionVersion: 1, revisionCount: 2 };
const fixture = { calls: [] as (MergeAction | IdentityAction)[], foreign: false }; (window as any).mergeFixture = fixture;
const make = (id: string, name: string): MergePerson => ({ id, name, updatedAt: 20, profile: { appearance: locale === "ru" ? "Серое пальто." : "Gray coat.", personality: locale === "ru" ? "Терпеливый." : "Patient.", goals: "", background: locale === "ru" ? "Часовщик; переписка в мастерской." : "Clockmaker; letters in the workshop." }, state: { ...EMPTY_STATUS, condition: locale === "ru" ? "В мастерской" : "In the workshop", stats: [{ label: locale === "ru" ? "Энергия" : "Energy", value: "65" }] }, protagonist: id === "a", aliases: [], images: true });
let a = make("a", locale === "ru" ? "Алекс" : "Alex"), b = make("b", locale === "ru" ? "Медный курьер" : "Copper Courier");
let merges: MergePage["merges"] = [];
async function onAction(action: MergeAction): Promise<MergePage> {
 fixture.calls.push(action);
 if (action.action === "approve") { merges = [{ id: "merge-event", name: action.input.choices.name, sources: [a.name, b.name], inherited: false, dropsLaterScenes: true }]; a = make("merged", action.input.choices.name); }
 if (action.action === "undo") { merges = []; a = make("a", locale === "ru" ? "Алекс" : "Alex"); }
 const input = action.input, pair = "pair" in input ? input.pair : null;
 return { ...scope, ...(fixture.foreign ? { chatId: "foreign" } : {}), query: input.query, offset: 0, pair, guard, paused: false, total: 2, next: null, people: [a, b].map(p => ({ id: p.id, name: p.name, summary: p.profile.background })), preview: pair ? { a, b, incomingConflicts: 0 } : null, merges };
}
let identities: IdentityPage = { ...scope, offset: 0, guard, paused: false, total: 1, next: null, rows: [{ reference: { sourceId: "baseline", entityId: "a", alias: locale === "ru" ? "Курьер" : "Courier" }, name: a.name, inherited: true, updatedAt: 20, status: "active" }] };
async function onIdentity(action: IdentityAction) { fixture.calls.push(action); if (action.action === "approve") identities = { ...identities, rows: [{ ...identities.rows[0]!, status: action.input.enabled ? "active" : "disabled" }] }; return structuredClone(identities); }
createRoot(document.getElementById("root")!).render(<section className="app-shell"><section className="settings-card dr-story-review"><h2>DeepRole</h2><StoryMerge locale={locale} scope={scope} onAction={onAction} onChanged={() => undefined} disabled={false}/><StoryIdentities locale={locale} scope={scope} onAction={onIdentity} onChanged={() => undefined} disabled={false}/></section></section>);
