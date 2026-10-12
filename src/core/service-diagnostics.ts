import { validServiceOperation, type ServiceOperation } from "./service-operations";
import { SERVICE_OUTBOX_PREFIX, serviceOperationId, validServicePending, type ServicePending } from "./service-outbox";
import { readServiceValidation, type ServiceValidation } from "./service-validation";
import { validFieldWorkerRuntime, type FieldWorkerRuntime } from "./field-runtime";

/** Report size only, not a storage, character or history limit. */
export const SERVICE_DIAGNOSTIC_LIMIT = 50;
const MAX_DATE = 8_640_000_000_000_000;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && Object.keys(v).every(k => keys.includes(k));
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const time = (v: unknown): v is number => count(v) && v <= MAX_DATE;
export type ServiceJournalState = "read" | "locked" | "unavailable";
export interface ServiceDiagnosticOperation {
 id: string | null; operation: ServiceOperation["operation"]; origin: ServiceOperation["origin"];
 mode: ServiceOperation["mode"]; fieldScope: ServiceOperation["fieldScope"];
 phase: ServiceOperation["phase"]; cleanup: ServiceOperation["cleanup"]; error: string | null;
 createdAt: number; updatedAt: number;
 validation?: ServiceValidation | null;
 runtime?: FieldWorkerRuntime | null;
}
export interface ServiceDiagnosticPending {
 id: string; operation: ServiceOperation["operation"]; phase: ServicePending["phase"];
 cleanup: ServicePending["cleanup"]; error: string | null; at: number;
}
interface ServiceDiagnosticSection<T, S extends string> {
 status: S; total: number | null; invalid: number | null; omitted: number | null; entries: T[];
}
export interface ServiceDiagnosticSnapshot {
 diagnosticVersion: 1 | 2 | 3 | 4;
 journal: ServiceDiagnosticSection<ServiceDiagnosticOperation, ServiceJournalState>;
 pending: ServiceDiagnosticSection<ServiceDiagnosticPending, "read" | "unavailable">;
}
const operation = (id: string) => id.startsWith("cast_") ? "cast-preparation" as const : id.startsWith("repair_") ? "story-repair" as const : id.startsWith("discover_") ? "character-discovery" as const : "character-field" as const;
function journalEntry(v: ServiceOperation): ServiceDiagnosticOperation {
 return { id: serviceOperationId(v.id) ? v.id : null, operation: v.operation, origin: v.origin, mode: v.mode, fieldScope: v.fieldScope,
  phase: v.phase, cleanup: v.cleanup, error: v.error, createdAt: v.createdAt, updatedAt: v.updatedAt, validation: v.validation ? readServiceValidation(v.validation) : null,
  runtime: v.runtime ? { stage: v.runtime.stage, visibility: v.runtime.visibility, at: v.runtime.at } : null };
}
function pendingEntry(v: ServicePending): ServiceDiagnosticPending {
 return { id: v.id, operation: operation(v.id), phase: v.phase, cleanup: v.cleanup, error: v.error, at: v.at };
}
function section<T, S extends string>(status: S, entries: T[], invalid: number): ServiceDiagnosticSection<T, S> {
 return { status, total: status === "read" ? entries.length : null, invalid: status === "read" ? invalid : null,
  omitted: status === "read" ? Math.max(0, entries.length - SERVICE_DIAGNOSTIC_LIMIT) : null, entries: entries.slice(0, SERVICE_DIAGNOSTIC_LIMIT) };
}
/** No spreads of source objects. Legacy IDs are omitted, never copied as text.
 * Journal and pending snapshots are separate: reading must not deliver the queue,
 * and a queued update is NOT a committed outcome or proof of native completion.
 */
export function serviceDiagnosticSnapshot(journal: { status: ServiceJournalState; values?: unknown }, pending: { status: "read" | "unavailable"; values?: unknown }): ServiceDiagnosticSnapshot {
 const rows: ServiceDiagnosticOperation[] = [], updates: ServiceDiagnosticPending[] = []; let badJournal = 0, badPending = 0;
 const seen = new Set<string>();
 if (journal.status === "read" && Array.isArray(journal.values)) for (const value of journal.values) {
  if (!validServiceOperation(value) || !time(value.createdAt) || !time(value.updatedAt) || seen.has(value.id)
   || serviceOperationId(value.id) && operation(value.id) !== value.operation) { badJournal++; continue; }
  seen.add(value.id); rows.push(journalEntry(value));
 }
 if (pending.status === "read" && object(pending.values)) for (const [key, value] of Object.entries(pending.values)) {
  if (!key.startsWith(SERVICE_OUTBOX_PREFIX)) continue;
  if (!validServicePending(value) || key !== SERVICE_OUTBOX_PREFIX + value.id || !time(value.at)) { badPending++; continue; }
  updates.push(pendingEntry(value));
 }
 rows.sort((a, b) => b.updatedAt - a.updatedAt || (a.id ?? "").localeCompare(b.id ?? ""));
 updates.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
 return { diagnosticVersion: 4,
  journal: section(journal.status === "read" && !Array.isArray(journal.values) ? "unavailable" : journal.status, rows, badJournal),
  pending: section(pending.status === "read" && !object(pending.values) ? "unavailable" : pending.status, updates, badPending) };
}
function validJournalEntry(v: unknown, version: number): v is ServiceDiagnosticOperation {
 if (!object(v) || !exact(v, ["id", "operation", "origin", "mode", "fieldScope", "phase", "cleanup", "error", "createdAt", "updatedAt", ...(version >= 2 ? ["validation"] : []), ...(version >= 4 ? ["runtime"] : [])]) || v.id !== null && !serviceOperationId(v.id)) return false;
 if (version >= 4 && v.runtime !== null && (v.operation !== "character-field" || !validFieldWorkerRuntime(v.runtime))) return false;
 if (version >= 2 && v.validation !== null) {
  const validation = readServiceValidation(v.validation);
  if (!validation || validation.family !== (v.operation === "cast-preparation" ? "cast" : "field") || version === 2 && validation.family !== "cast") return false;
 }
 // Validate with the same contract; synthetic bindings never appear in output.
 return time(v.createdAt) && time(v.updatedAt) && validServiceOperation({ format: "deeprole-service-operation", contractVersion: 1, purpose: "service",
  id: v.id ?? (v.operation === "cast-preparation" ? "cast_legacy" : v.operation === "story-repair" ? "repair_legacy" : v.operation === "character-discovery" ? "discover_legacy" : "field_legacy"), worldId: null, sourceChatId: v.operation === "story-repair" || v.operation === "character-discovery" ? "diagnostic-source" : null,
  workerChatId: v.phase === "result" ? "diagnostic-worker" : null, origin: v.origin, operation: v.operation, mode: v.mode,
  fieldScope: v.fieldScope, phase: v.phase, cleanup: v.cleanup, error: v.error, createdAt: v.createdAt, updatedAt: v.updatedAt })
  && (v.id === null || operation(v.id) === v.operation);
}
function validPendingEntry(v: unknown): v is ServiceDiagnosticPending {
 return object(v) && exact(v, ["id", "operation", "phase", "cleanup", "error", "at"]) && serviceOperationId(v.id) && operation(v.id) === v.operation && time(v.at)
  && validServicePending({ format: "deeprole-service-pending", version: 1, id: v.id, token: "00000000-0000-4000-8000-000000000000", phase: v.phase, cleanup: v.cleanup, error: v.error, at: v.at });
}
function validSection<T>(v: unknown, states: string[], valid: (v: unknown) => v is T): v is ServiceDiagnosticSection<T, string> {
 if (!object(v) || !exact(v, ["status", "total", "invalid", "omitted", "entries"]) || typeof v.status !== "string" || !states.includes(v.status) || !Array.isArray(v.entries) || v.entries.length > SERVICE_DIAGNOSTIC_LIMIT || !v.entries.every(valid)) return false;
 return v.status === "read" ? count(v.total) && count(v.invalid) && count(v.omitted) && v.entries.length === Math.min(v.total, SERVICE_DIAGNOSTIC_LIMIT) && v.omitted === v.total - v.entries.length
  : v.total === null && v.invalid === null && v.omitted === null && v.entries.length === 0;
}
/** Revalidate/rebuild before displaying or copying, even for extension-local reads. */
export function readServiceDiagnosticSnapshot(v: unknown): ServiceDiagnosticSnapshot | null {
 if (!object(v) || !exact(v, ["diagnosticVersion", "journal", "pending"]) || v.diagnosticVersion !== 1 && v.diagnosticVersion !== 2 && v.diagnosticVersion !== 3 && v.diagnosticVersion !== 4
  || !validSection(v.journal, ["read", "locked", "unavailable"], (row): row is ServiceDiagnosticOperation => validJournalEntry(row, v.diagnosticVersion as number)) || !validSection(v.pending, ["read", "unavailable"], validPendingEntry)) return null;
 const j = v.journal, p = v.pending;
 const ids = j.entries.flatMap(e => e.id === null ? [] : [e.id]);
 if (new Set(ids).size !== ids.length || new Set(p.entries.map(e => e.id)).size !== p.entries.length) return null;
 return { diagnosticVersion: v.diagnosticVersion, journal: { status: j.status as ServiceJournalState, total: j.total, invalid: j.invalid, omitted: j.omitted,
  entries: j.entries.map(e => ({ id: e.id, operation: e.operation, origin: e.origin, mode: e.mode, fieldScope: e.fieldScope, phase: e.phase, cleanup: e.cleanup, error: e.error, createdAt: e.createdAt, updatedAt: e.updatedAt,
   ...((v.diagnosticVersion as number) >= 2 ? { validation: e.validation ? readServiceValidation(e.validation) : null } : {}),
   ...(v.diagnosticVersion === 4 ? { runtime: e.runtime ? { stage: e.runtime.stage, visibility: e.runtime.visibility, at: e.runtime.at } : null } : {}) })) },
  pending: { status: p.status as "read" | "unavailable", total: p.total, invalid: p.invalid, omitted: p.omitted,
   entries: p.entries.map(e => ({ id: e.id, operation: e.operation, phase: e.phase, cleanup: e.cleanup, error: e.error, at: e.at })) } };
}
export function serviceDiagnosticReport(value: unknown, checkedAt: number): string | null {
 const safe = readServiceDiagnosticSnapshot(value);
 return safe && time(checkedAt) ? JSON.stringify({ diagnosticVersion: safe.diagnosticVersion, extensionVersion: "0.1.0", checkedAt, readOnly: true, nativeCompletion: "not-verified", result: safe }, null, 2) : null;
}
