import type { CastJob } from "./cast-initialization";
import { FieldValidationError, validFieldValidationIssue, type FieldDiagnosticRule, type FieldValidationCode } from "./field-validation";

/** Fixed protocol rules only. Never export a repair prompt or a model-owned key. */
export const castDiagnosticRules = [
 "complete valid JSON object", "reply length <=180000", "at most one deeprole_cast block", "object", "version must equal 1", "must match current request ID", "exact next existing reset profiles",
 "batch array <=1", "batch array <=2", "boolean unless partial reply", "empty batch requires more=false and no partial flag", "empty array for empty final batch",
 "at least one prepared profile across batches", "must not repeat an earlier batch", "complete final batch envelope", "roster <=40 profiles", "array of 1..40 profiles", "nonempty profile array",
 "array <=12 unique safe string IDs <=80", "array <=12", "string <=600", "safe nonempty string ID <=160", "nonempty string <=80",
 "array <=12 unique safe strings <=80", "object or null", "array <=8 unique STRING milestone IDs <=80", "nonempty string <=600", "array of 1..6 source quotes",
 "valid character sheet schema", "valid character status schema", "array", "IDs from this character's milestones", "empty array without relationships",
 "safe source record ID <=160", "string 3..240 trimmed characters", "ID must exist in supplied sources", "exact substring of source text",
 "unique keys across roster", "unique keys across batches", "unique names (case-insensitive)", "at most one protagonist",
 "key from this batch or previously validated roster (not a character name or source ID)", "key must also be present", "must not be protagonist",
 "enum male|female|neutral", "boolean", "string <=1200", "array <=6", "safe unique string ID <=160", "string <=40, nonempty", "unique label (case-insensitive)",
 "integer 0..100", "integer 1..8", "string <=160", "integer 0..99", "integer 1..100", "lowAt < highAt (defaults 30/70)", "enum slow|balanced|open",
 "object with trust/affinity", "key guarded|acquaintance|trusting|close", "string <=240", "array <=8", "string <=100, nonempty", "ID must belong to this character's milestones",
 "array <=8 unique milestone IDs", "unique ID from milestones", "safe nonempty string <=32", "string <=80",
] as const;
export type CastDiagnosticRule = typeof castDiagnosticRules[number];
export interface ServiceValidationIssue { path: string; rule: CastDiagnosticRule | FieldDiagnosticRule; actual: string | null }
export interface ServiceValidationEvent {
 step: number; repair: boolean; code: "invalid-result" | "invalid-evidence" | "duplicate-character" | "partial-reply" | "character-limit" | FieldValidationCode;
 stage: "parse" | "merge"; at: number; replyLength: number | null; issues: ServiceValidationIssue[];
}
export interface ServiceValidation { family: "cast" | "field"; events: ServiceValidationEvent[]; excluded: number }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && Object.keys(v).every(k => keys.includes(k));
const integer = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max;
const index = "(?:0|[1-9]\\d{0,5})", item = `\\[${index}\\]`, member = `characters\\[(?:${index}|\\*)\\]`;
const paths = new RegExp(`^(?:\\$|version|request|more|characters|present|partners|warnings|(?:present|partners|warnings)${item}|${member}(?:\\.(?:key|name|aliases|name/aliases|reason|completed(?:${item})?|evidence(?:${item}(?:\\.(?:source|quote))?)?|sheet(?:\\.(?:gender|protagonist|appearance|personality|goals|background|attributes(?:${item}(?:\\.(?:id|label|initial|cap|low|high|lowAt|highAt))?)?|relationships(?:\\.(?:enabled|romance|pace|boundaries|reactions|initial(?:\\.(?:trust|affinity))?|thresholds(?:\\.(?:trust|affinity))?|stageBehavior(?:${item}|\\.(?:guarded|acquaintance|trusting|close))?|milestones(?:${item}(?:\\.(?:id|label|required))?)?|initialCompleted(?:${item})?))?))?|state(?:\\.(?:action|condition|goal|relationship|stats(?:${item}(?:\\.(?:label|value))?)?))?))?)$`, "u");
const actuals = /^(?:missing|null|boolean|undefined|function|symbol|bigint|number\((?:integer|non-integer)\)|(?:string\(length=|array\(length=|object\(fields=)(?:0|[1-9]\d{0,8})\)|invalid JSON|only completed profiles recovered from interrupted reply|40 profiles with more=true)$/u;
const codes = ["invalid-result", "invalid-evidence", "duplicate-character", "partial-reply", "character-limit"];
export function validServiceValidationIssue(v: unknown): v is ServiceValidationIssue {
 return object(v) && exact(v, ["path", "rule", "actual"]) && typeof v.path === "string" && v.path.length <= 240 && paths.test(v.path)
  && castDiagnosticRules.some(rule => rule === v.rule) && (v.actual === null || typeof v.actual === "string" && actuals.test(v.actual));
}
function validEvent(v: unknown, family: ServiceValidation["family"] = "cast"): v is ServiceValidationEvent {
 return object(v) && exact(v, ["step", "repair", "code", "stage", "at", "replyLength", "issues"]) && integer(v.step, 1_000_000) && typeof v.repair === "boolean"
  && typeof v.code === "string" && (family === "cast" ? codes.includes(v.code) && (v.stage === "parse" || v.stage === "merge") : ["invalid-result", "invalid-evidence", "text-too-long", "facts-not-found", "conflicting-facts"].includes(v.code) && v.step === 1 && v.repair === false && v.stage === "parse") && integer(v.at, 8_640_000_000_000_000)
  && (v.replyLength === null || integer(v.replyLength, 1_000_000_000)) && Array.isArray(v.issues) && v.issues.length > 0 && v.issues.length <= 60 && v.issues.every(family === "cast" ? validServiceValidationIssue : validFieldValidationIssue);
}
export function readServiceValidation(v: unknown): ServiceValidation | null {
 if (!object(v) || !exact(v, ["family", "events", "excluded"]) || v.family !== "cast" && v.family !== "field" || !integer(v.excluded) || !Array.isArray(v.events) || v.events.length > (v.family === "cast" ? 24 : 1) || v.family === "field" && !v.events.length && !v.excluded || !v.events.every(event => validEvent(event, v.family as ServiceValidation["family"]))) return null;
 const keys = v.events.map(e => `${e.step}:${e.repair}:${e.stage}:${e.code}:${e.at}`);
 if (new Set(keys).size !== keys.length) return null;
 return { family: v.family, excluded: v.excluded, events: v.events.map(e => ({ step: e.step, repair: e.repair, code: e.code, stage: e.stage, at: e.at, replyLength: e.replyLength,
  issues: e.issues.map(i => ({ path: i.path, rule: i.rule, actual: i.actual })) })) };
}
/** Called only on the local validator exception, never on worker-supplied issues. */
export function fieldServiceValidation(error: FieldValidationError, replyLength: number | null, at: number): ServiceValidation | null {
 const issues = error.issues.slice(0, 60).filter(validFieldValidationIssue).map(issue => ({ path: issue.path, rule: issue.rule, actual: issue.actual }));
 const code = error.message === "invalidPlan" ? "invalid-result" : error.message;
 const result = { family: "field", events: issues.length ? [{ step: 1, repair: false, stage: "parse", code, at, replyLength, issues }] : [], excluded: error.issues.length - issues.length };
 return readServiceValidation(result);
}
/** Ignore inherited diagnostics of an earlier request. Strings in `issues`,
 * sources/quotes, reasoning and prepared character names are never inspected. */
export function castServiceValidation(job: Pick<CastJob, "id" | "diagnostics">): ServiceValidation {
 const events: ServiceValidationEvent[] = []; let excluded = 0;
 for (const source of (Array.isArray(job.diagnostics) ? job.diagnostics : []).slice(-24)) {
  if (!object(source) || source.requestId !== job.id || !Array.isArray(source.details) || !source.details.length) continue;
  const issues: ServiceValidationIssue[] = [];
  for (const value of source.details.slice(0, 60)) {
   if (!object(value) || !exact(value, ["path", "rule", "actual"])) { excluded++; continue; }
   const issue = { path: value.path, rule: value.rule, actual: typeof value.actual === "string" && actuals.test(value.actual) ? value.actual : null };
   if (validServiceValidationIssue(issue)) issues.push(issue); else excluded++;
  }
  excluded += Math.max(0, source.details.length - 60);
  if (!issues.length) continue;
  const event = { step: source.step, repair: source.repair, code: source.code, stage: source.stage, at: source.at, replyLength: source.replyLength ?? null, issues };
  if (validEvent(event)) {
   if (!events.some(e => e.step === event.step && e.repair === event.repair && e.stage === event.stage && e.code === event.code && e.at === event.at)) events.push(event);
  } else excluded++;
 }
 return { family: "cast", events, excluded };
}
