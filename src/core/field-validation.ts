/** Local validator metadata only. Model-owned keys and values are never included. */
export const fieldDiagnosticRules = [
 "complete valid JSON object", "object", "only requestId/field/status/text/evidence fields", "must match current request ID", "must match requested field",
 "only requestId/field/fields fields", "exact requested profile fields", "only status/text/evidence fields", "enum suggested", "empty evidence for suggested",
 "enum found|not-found|conflict", "string", "array <=8", "only source/quote fields", "source ID must be a string", "ID must exist in supplied sources",
 "nonempty quote <=4000", "exact substring of source text", "empty text for not-found or conflict", "empty evidence for not-found", "at least two quotes for conflict",
 "facts required in supplied sources", "unresolved source conflict", "at least one supporting quote", "no protocol identifiers in field text",
 "nonempty final text", "reply length <=20000", "fact sources required", "not a replaced reply", "plain field text without protocol or placeholder",
 "JSON-serializable plan <=12000", "scene text 12..1200", "character array <=40", "safe nonempty character ID <=160", "unique character IDs",
 "enum neutral|suggestive|none", "appearance text <=600", "enum ordinary|alternate|unknown", "reference reason text <=240", "action text <=320", "position text <=240", "enum primary|supporting|background",
] as const;
export type FieldDiagnosticRule = typeof fieldDiagnosticRules[number] | `text length <=${number}`;
export interface FieldValidationIssue { path: string; rule: FieldDiagnosticRule; actual: string | null }
export type FieldValidationCode = "invalid-result" | "invalid-evidence" | "text-too-long" | "facts-not-found" | "conflicting-facts";
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const paths = /^(?:\$|requestId|field|status|text|evidence(?:\[(?:0|[1-9]\d{0,5})\](?:\.(?:source|quote))?)?|plan(?:\.(?:scene|characters(?:\[(?:0|[1-9]\d{0,5})\](?:\.(?:id|reference|appearance|look|referenceReason|action|position|focus))?)?))?)$/u;
const actuals = /^(?:missing|null|boolean|undefined|function|symbol|bigint|number\((?:integer|non-integer)\)|(?:string\(length=|array\(length=|object\(fields=)(?:0|[1-9]\d{0,8})\)|invalid JSON)$/u;
export function validFieldDiagnosticRule(v: unknown): v is FieldDiagnosticRule {
 if (fieldDiagnosticRules.some(rule => rule === v)) return true;
 if (typeof v !== "string" || !/^text length <=[1-9]\d{0,4}$/u.test(v)) return false;
 return Number(v.slice("text length <=".length)) <= 20_000;
}
export function validFieldValidationIssue(v: unknown): v is FieldValidationIssue {
 return object(v) && Object.keys(v).length === 3 && Object.keys(v).every(key => ["path", "rule", "actual"].includes(key))
  && typeof v.path === "string" && paths.test(v.path) && validFieldDiagnosticRule(v.rule) && (v.actual === null || typeof v.actual === "string" && actuals.test(v.actual));
}
export function fieldShape(v: unknown): string {
 return v === undefined ? "missing" : v === null ? "null" : Array.isArray(v) ? `array(length=${v.length})` : typeof v === "string" ? `string(length=${v.length})` : object(v) ? `object(fields=${Object.keys(v).length})` : typeof v === "number" ? Number.isInteger(v) ? "number(integer)" : "number(non-integer)" : typeof v;
}
export class FieldValidationError extends Error {
 constructor(public issues: FieldValidationIssue[], code: FieldValidationCode | "invalidPlan" = "invalid-result") { super(code); this.name = "FieldValidationError"; }
}
export function fieldCheck(ok: unknown, path: string, rule: FieldDiagnosticRule, value?: unknown, code: FieldValidationCode = "invalid-result"): asserts ok {
 if (!ok) throw new FieldValidationError([{ path, rule, actual: fieldShape(value) }], code);
}
