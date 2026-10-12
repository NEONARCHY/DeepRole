import { createRoot } from "react-dom/client";
import { CharacterDiscovery } from "../../src/entrypoints/shared/CharacterDiscovery";
import type { CharacterDiscoveryAction, CharacterDiscoveryPage } from "../../src/core/story-character-discovery";
import "../../src/entrypoints/sidepanel/styles.css";
import "../../src/entrypoints/shared/story-review.css";
const locale = new URL(location.href).searchParams.get("locale") === "en" ? "en" : "ru";
document.documentElement.lang = locale;
const profileName = locale === "ru" ? "Алекс" : "Alex";
const profiles = Array.from({ length: 83 }, (_, i) => ({ id: "person-" + i, name: i < 2 ? profileName : (locale === "ru" ? "Житель " : "Resident ") + i, summary: i === 0 ? (locale === "ru" ? "Часовщик" : "Clockmaker") : i === 1 ? (locale === "ru" ? "Курьер" : "Courier") : (locale === "ru" ? "Описание жителя " : "Description of resident ") + i, updatedAt: 20 + i }));
let state: CharacterDiscoveryPage = { worldId: "world", chatId: "chat", guard: { branchId: "branch", headRevisionId: "reply", selectionVersion: 1, revisionCount: 2 }, sources: 2, completed: 2, remaining: 0, total: 1, offset: 0, next: null, candidates: [{ eventId: "event", name: locale === "ru" ? "Медный курьер" : "Copper Courier", quote: locale === "ru" ? "Медный курьер принёс письмо." : "Copper Courier brought a letter.", background: "", added: false }] };
const fixture = { calls: [] as CharacterDiscoveryAction[], foreign: false }; (window as any).identityFixture = fixture;
async function onAction(a: CharacterDiscoveryAction) {
 fixture.calls.push(a);
 if (a.action === "read" && a.input.identity) { const q = a.input.identity, list = profiles.filter(p => p.name.toLocaleLowerCase().includes(q.query.toLocaleLowerCase())), people = list.slice(q.offset, q.offset + 40); return { ...state, ...(fixture.foreign ? { worldId: "foreign" } : {}), identity: { ...q, total: list.length, next: q.offset + people.length < list.length ? q.offset + people.length : null, people } }; }
 if (a.action === "approve") { state = { ...state, guard: { ...state.guard, selectionVersion: state.guard.selectionVersion + 1 }, candidates: [{ ...state.candidates[0]!, added: a.input.accept, ...(a.input.identity ? { identityName: profiles.find(p => p.id === a.input.identity!.entityId)!.name, identityActive: true } : {}) }] }; if (!a.input.accept) { delete state.candidates[0]!.identityName; delete state.candidates[0]!.identityActive; } }
 return structuredClone(state);
}
createRoot(document.getElementById("root")!).render(<section className="settings-card dr-story-review"><h2>DeepRole</h2><CharacterDiscovery locale={locale} scope={state} onAction={onAction} onChanged={() => undefined} disabled={false} /></section>);
