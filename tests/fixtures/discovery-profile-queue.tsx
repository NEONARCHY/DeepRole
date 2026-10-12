import React from "react";
import { createRoot } from "react-dom/client";
import { CharacterDiscovery } from "../../src/entrypoints/shared/CharacterDiscovery";
import type { CharacterDiscoveryAction, CharacterDiscoveryPage } from "../../src/core/story-character-discovery";
import { PROFILE_FIELDS } from "../../src/core/character-profile";
import { runDiscoveryProfileQueue } from "../../src/adapters/discovery-profile-queue";
import type { DiscoveryQueueInput } from "../../src/core/discovery-profile-queue";
import "../../src/entrypoints/sidepanel/styles.css";
import "../../src/entrypoints/shared/story-review.css";
const locale = new URL(location.href).searchParams.get("locale") === "ru" ? "ru" : "en"; document.documentElement.lang = locale;
const state = JSON.parse(localStorage.getItem("queue-fixture") ?? "null") ?? { guard: { branchId: "branch", headRevisionId: "reply", selectionVersion: 1, revisionCount: 2 }, sent: [], rows: Array.from({ length: 26 }, (_, i) => ({ eventId: "candidate-" + i, name: (locale === "ru" ? "Курьер " : "Courier ") + i, quote: (locale === "ru" ? "Курьер доставил письмо. " : "Courier delivered a letter. ") + i, background: "", added: false })) };
const save = () => localStorage.setItem("queue-fixture", JSON.stringify(state));
const control = { state, calls: [] as CharacterDiscoveryAction[], stallAfter: -1, abort: () => {}, advance: () => { state.guard = { ...state.guard, headRevisionId: "later", selectionVersion: state.guard.selectionVersion + 1 }; save(); } };
(window as any).queueFixture = control;
function snapshot(offset = 0): CharacterDiscoveryPage {
 const tasks = state.rows.filter((r: any) => !r.added && r.task), unfinished = tasks.filter((r: any) => r.task.status !== "ready"), stale = unfinished.filter((r: any) => JSON.stringify(r.task.guard) !== JSON.stringify(state.guard)), next = unfinished[0];
 return structuredClone({ worldId: "world", chatId: "chat", guard: state.guard, sources: 2, completed: 2, remaining: 0, total: state.rows.length, offset, next: offset + 20 < state.rows.length ? offset + 20 : null, candidates: state.rows.slice(offset, offset + 20), queue: { total: tasks.length, ready: tasks.length - unfinished.length, pending: unfinished.length, stale: stale.length, next: next && !stale.length ? { worldId: "world", chatId: "chat", guard: next.task.guard, eventId: next.eventId, queueId: next.task.id, name: next.task.name, values: next.task.values } : null } });
}
async function edit(input: DiscoveryQueueInput) {
 if (input.operation === "enqueue") for (const i of input.items) { const row = state.rows.find((r: any) => r.eventId === i.eventId); if (!row.task) row.task = { id: "profilequeue_" + crypto.randomUUID(), guard: input.guard, name: i.name, values: i.values, status: "pending", requestId: null }; }
 if (input.operation === "clear") for (const row of state.rows) delete row.task;
 if (input.operation === "resume") for (const row of state.rows) if (row.task?.status !== "ready" && row.task) { row.task.status = "pending"; row.task.requestId = null; }
 save();
}
async function onAction(a: CharacterDiscoveryAction) {
 control.calls.push(a);
 if (a.action === "cancel") { control.abort(); return null; }
 if (a.action === "queue") {
  let current = true; control.abort = () => { current = false; };
  await runDiscoveryProfileQueue(a.input, { current: () => current, edit, read: async () => snapshot(), prepare: async input => {
   const row = state.rows.find((r: any) => r.eventId === input.eventId); row.task.status = "preparing"; row.task.requestId = "field_" + crypto.randomUUID(); save();
   if (control.stallAfter === state.sent.length) { await new Promise<void>((resolve, reject) => { control.abort = () => { current = false; row.task.status = "failed"; save(); reject(Error("cancelled")); }; void resolve; }); }
   state.sent.push(input.name); row.profile = { headRevisionId: state.guard.headRevisionId, name: input.name, values: input.values, proposal: Object.fromEntries(PROFILE_FIELDS.map(k => [k, { status: "not-found", text: "", evidence: [] }])), proofs: [], partial: true }; row.task.status = "ready"; save();
  } });
 }
 return snapshot(a.action === "read" ? a.input.offset : 0);
}
createRoot(document.getElementById("root")!).render(React.createElement("section", { className: "settings-card dr-story-review" }, React.createElement("h2", {}, "DeepRole"), React.createElement(CharacterDiscovery, { locale, scope: snapshot(), onAction, onChanged: () => {}, disabled: false })));
