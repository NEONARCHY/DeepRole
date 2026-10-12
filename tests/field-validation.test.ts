import { expect, it } from "vitest";
import { FieldValidationError, fieldShape, validFieldValidationIssue } from "../src/core/field-validation";
import { fieldFactsResult } from "../src/core/field-facts";
import { characterFieldResult } from "../src/core/character-text";
import { isolatedFieldResult } from "../src/core/isolated-character-text";
import { imageScenePlanIssues, parseImageScenePlan, validImageScenePlan } from "../src/core/image-plan";
import { fieldServiceValidation, readServiceValidation } from "../src/core/service-validation";
import { progressServiceOperation, serviceOperationFromStart, validServiceOperation } from "../src/core/service-operations";
import { readServiceDiagnosticSnapshot, serviceDiagnosticReport, serviceDiagnosticSnapshot } from "../src/core/service-diagnostics";
const id = "field_00000000-0000-4000-8000-000000000001";
const field = { key: "PRIVATE_FIELD", label: "PRIVATE_LABEL", scope: "profile" as const, maxLength: 100, mode: "history" as const };
const sources = [{ id: "PRIVATE_SOURCE", text: "PRIVATE_CHARACTER wears a blue coat." }];
const reply = () => ({ requestId: id, field: field.key, status: "found", text: "Blue coat.", evidence: [{ source: sources[0]!.id, quote: sources[0]!.text }] });
function failure(run: () => unknown): FieldValidationError { try { run(); throw Error("expected failure"); } catch (error) { expect(error).toBeInstanceOf(FieldValidationError); return error as FieldValidationError; } }
for (const [patch, code, path, rule] of [
 [{ requestId: "PRIVATE_WRONG" }, "invalid-result", "requestId", "must match current request ID"],
 [{ field: "PRIVATE_OTHER" }, "invalid-result", "field", "must match requested field"],
 [{ status: "PRIVATE_STATUS" }, "invalid-result", "status", "enum found|not-found|conflict"],
 [{ text: null }, "invalid-result", "text", "string"],
 [{ PRIVATE_EXTRA: true }, "invalid-result", "$", "only requestId/field/status/text/evidence fields"],
 [{ evidence: null }, "invalid-result", "evidence", "array <=8"],
 [{ evidence: [null] }, "invalid-evidence", "evidence[0]", "object"],
 [{ evidence: [{ source: "PRIVATE_WRONG", quote: "PRIVATE_QUOTE" }] }, "invalid-evidence", "evidence[0].source", "ID must exist in supplied sources"],
 [{ evidence: [{ source: sources[0]!.id, quote: "PRIVATE_MODIFIED_QUOTE" }] }, "invalid-evidence", "evidence[0].quote", "exact substring of source text"],
 [{ evidence: [{ source: 12, quote: sources[0]!.text }] }, "invalid-evidence", "evidence[0].source", "source ID must be a string"],
 [{ evidence: [{ source: sources[0]!.id, quote: " " }] }, "invalid-evidence", "evidence[0].quote", "nonempty quote <=4000"],
 [{ evidence: [{ source: sources[0]!.id, quote: sources[0]!.text, PRIVATE_EXTRA: true }] }, "invalid-evidence", "evidence[0]", "only source/quote fields"],
 [{ evidence: [] }, "invalid-evidence", "evidence", "at least one supporting quote"],
 [{ text: "entity_PRIVATE123456" }, "invalid-evidence", "text", "no protocol identifiers in field text"],
 [{ status: "not-found", text: "", evidence: [] }, "facts-not-found", "status", "facts required in supplied sources"],
 [{ status: "not-found", text: "PRIVATE_INVENTION", evidence: [] }, "invalid-result", "text", "empty text for not-found or conflict"],
 [{ status: "not-found", text: "" }, "invalid-result", "evidence", "empty evidence for not-found"],
 [{ status: "conflict", text: "", evidence: [...reply().evidence, ...reply().evidence] }, "conflicting-facts", "status", "unresolved source conflict"],
 [{ status: "conflict", text: "" }, "invalid-result", "evidence", "at least two quotes for conflict"],
] as const) it(`reports real history check ${path} / ${rule}`, () => {
 const raw = JSON.stringify({ ...reply(), ...patch }), error = failure(() => fieldFactsResult(raw, { field }, id, sources));
 expect(error.message).toBe(code); expect(error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path, rule })]));
 const validation = fieldServiceValidation(error, raw.length, 3)!; expect(readServiceValidation(validation)).toEqual(validation); expect(JSON.stringify(validation)).not.toContain("PRIVATE");
});
it("collects independent top-level and evidence reasons without revealing unknown field names", () => {
 const error = failure(() => fieldFactsResult(JSON.stringify({ PRIVATE_SECRET: "PRIVATE_VALUE", evidence: [] }), { field }, id, sources));
 expect(error.issues.map(issue => issue.path)).toEqual(["$", "requestId", "field", "status", "text"]);
 expect(JSON.stringify(error.issues)).not.toContain("PRIVATE");
});
for (const [raw, code, path, rule] of [
 ["", "invalid-result", "$", "nonempty final text"], ["X".repeat(20_001), "invalid-result", "$", "reply length <=20000"],
 ["{broken", "invalid-result", "$", "complete valid JSON object"], ["[]", "invalid-result", "$", "object"],
] as const) it(`reports outer/JSON check ${rule}`, () => {
 const error = failure(() => isolatedFieldResult(raw, { field }, { requestId: id, sources })); expect(error.message).toBe(code); expect(error.issues[0]).toMatchObject({ path, rule });
});
it("reports the configured length, not the private text or custom field key", () => {
 const error = failure(() => characterFieldResult("PRIVATE_TEXT".repeat(20), 100));
 expect(error.message).toBe("text-too-long"); expect(error.issues).toEqual([{ path: "text", rule: "text length <=100", actual: "string(length=240)" }]);
 expect(characterFieldResult("```text\nBlue coat.\n```", 100)).toBe("Blue coat."); expect(() => characterFieldResult("{ PRIVATE: true }", 100)).toThrow("invalid-result");
});
for (const path of ["PRIVATE_SOURCE", "evidence[0].PRIVATE", "text.PRIVATE", "plan.characters[0].PRIVATE", "__proto__", "evidence[-1]", "evidence[1000000].quote"]) it(`rejects unsafe field path ${path}`, () => expect(validFieldValidationIssue({ path, rule: "string", actual: "missing" })).toBe(false));
for (const rule of ["text length <=0", "text length <=20001", "text length <=01", "text length <=Infinity", "text length <=100 PRIVATE", "PRIVATE_RULE"]) it(`rejects unsafe field rule ${rule}`, () => expect(validFieldValidationIssue({ path: "text", rule, actual: "missing" })).toBe(false));
it("shapes values without copying their contents and rejects poisoned detailed payloads", () => {
 expect([fieldShape("PRIVATE"), fieldShape({ PRIVATE: "VALUE" }), fieldShape(["PRIVATE"])]).toEqual(["string(length=7)", "object(fields=1)", "array(length=1)"]);
 const error = new FieldValidationError([{ path: "text", rule: "string", actual: "PRIVATE_VALUE" }, { path: "text", rule: "string", actual: "missing" }]);
 expect(fieldServiceValidation(error, 7, 3)).toMatchObject({ excluded: 1, events: [{ issues: [{ actual: "missing" }] }] });
 expect(fieldServiceValidation(new FieldValidationError([]), 7, 3)).toBeNull();
});
const plan = () => ({ scene: "A quiet village in daylight.", characters: [{ id: "PRIVATE_PERSON", reference: "neutral", appearance: "Blue coat." }] });
for (const value of [null, {}, { ...plan(), scene: "short" }, { ...plan(), characters: [null] }, { ...plan(), characters: [{ id: "", reference: "wrong", appearance: 12, look: "wrong", referenceReason: 12, action: 12, position: 12, focus: "wrong" }] }, { ...plan(), characters: [...plan().characters, ...plan().characters] }, { ...plan(), characters: Array.from({ length: 41 }, () => plan().characters[0]) }, { ...plan(), scene: "X".repeat(12_001) }]) it(`explains invalid image plan ${JSON.stringify(value).slice(0, 55)}`, () => {
 expect(validImageScenePlan(value)).toBe(false); expect(imageScenePlanIssues(value).length).toBeGreaterThan(0);
 const error = failure(() => parseImageScenePlan(JSON.stringify(value))); expect(error.message).toBe("invalidPlan"); expect(error.issues.every(validFieldValidationIssue)).toBe(true); expect(JSON.stringify(fieldServiceValidation(error, 200, 3))).not.toContain("PRIVATE");
});
it("leaves valid image plans, optional fields and existing permitted extra fields unchanged", () => {
 for (const value of [plan(), { ...plan(), characters: [] }, { ...plan(), extra: "Kept as before" }, { ...plan(), characters: [{ ...plan().characters[0], action: "Waits", focus: "supporting", look: "ordinary", position: "Left", referenceReason: "Coat" }] }]) {
  expect(validImageScenePlan(value)).toBe(true); expect(imageScenePlanIssues(value)).toEqual([]); expect(parseImageScenePlan(JSON.stringify(value))).toEqual(value);
 }
});
it("strictly separates V1, cast V2, field V3 and report versions", () => {
 const validation = fieldServiceValidation(failure(() => characterFieldResult("X".repeat(101), 100)), 101, 3)!;
 const operation = { ...serviceOperationFromStart({ id, worldId: "PRIVATE_WORLD", sourceChatId: "PRIVATE_GAME", mode: "suggest", fieldScope: "profile", createdAt: 1 }), contractVersion: 3, validation };
 expect(validServiceOperation(operation)).toBe(true); for (const version of [1, 2]) expect(validServiceOperation({ ...operation, contractVersion: version })).toBe(false);
 const progressed = progressServiceOperation(operation as any, { phase: "failed", workerChatId: "PRIVATE_WORKER", cleanup: "done", error: "text-too-long", at: 4 }); expect(progressed.validation).toEqual(validation);
 const snapshot = serviceDiagnosticSnapshot({ status: "read", values: [progressed] }, { status: "read", values: {} }); expect(readServiceDiagnosticSnapshot(snapshot)).toEqual(snapshot);
 for (const version of [1, 2]) expect(readServiceDiagnosticSnapshot({ ...snapshot, diagnosticVersion: version })).toBeNull();
 const text = serviceDiagnosticReport(snapshot, 5)!; expect(JSON.parse(text)).toMatchObject({ diagnosticVersion: 4 }); expect(text).not.toContain("PRIVATE");
 for (const poison of [(v: any) => v.events[0].issues[0].actual = "PRIVATE_VALUE", (v: any) => v.events[0].issues[0].path = "PRIVATE_KEY", (v: any) => v.events[0].repair = true, (v: any) => v.events[0].stage = "worker", (v: any) => v.events.push(v.events[0]), (v: any) => v.events[0].PRIVATE = "VALUE"]) {
  const bad = structuredClone(snapshot); poison(bad.journal.entries[0]!.validation); expect(readServiceDiagnosticSnapshot(bad)).toBeNull(); expect(serviceDiagnosticReport(bad, 5)).toBeNull();
 }
});
it("preserves the previous fact acceptance and error codes across malformed and valid variants", () => {
 // Frozen pre-diagnostic validator: compare behavior, not just the new messages.
 const legacy = (raw: string): string => {
  let value: any; try { value = JSON.parse(raw.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/u, "$1")); } catch { throw Error("invalid-result"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("invalid-result");
  if (Object.keys(value).some(key => !["requestId", "field", "status", "text", "evidence"].includes(key)) || value.requestId !== id || value.field !== field.key || !["found", "not-found", "conflict"].includes(String(value.status)) || typeof value.text !== "string" || !Array.isArray(value.evidence) || value.evidence.length > 8) throw Error("invalid-result");
  const byId = new Map(sources.map(source => [source.id, source.text]));
  for (const item of value.evidence) if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).some(key => key !== "source" && key !== "quote") || typeof item.source !== "string" || typeof item.quote !== "string" || !item.quote.trim() || item.quote.length > 4000 || !byId.get(item.source)?.includes(item.quote)) throw Error("invalid-evidence");
  if (value.status === "not-found") { if (value.text !== "" || value.evidence.length) throw Error("invalid-result"); throw Error("facts-not-found"); }
  if (value.status === "conflict") { if (value.text !== "" || value.evidence.length < 2) throw Error("invalid-result"); throw Error("conflicting-facts"); }
  if (!value.evidence.length || /\b(?:entity|entry)_[\w-]{8,}|protagonist\s*:\s*true/iu.test(value.text)) throw Error("invalid-evidence");
  return characterFieldResult(value.text, field.maxLength);
 };
 const result = (run: () => string) => { try { return { text: run() }; } catch (error) { return { code: (error as Error).message }; } };
 const variants: unknown[] = [null, [], {}, true, 12, "string", reply()];
 for (const status of ["found", "not-found", "conflict", "wrong", null]) for (const text of ["", "Blue coat.", "entity_PRIVATE12345", "X".repeat(101), null]) for (const evidence of [[], reply().evidence, [...reply().evidence, ...reply().evidence], [null], [{ source: "missing", quote: "quote" }], [{ source: sources[0]!.id, quote: "changed" }], null]) variants.push({ ...reply(), status, text, evidence });
 for (const key of ["requestId", "field", "status", "text", "evidence"]) { const value: any = reply(); delete value[key]; variants.push(value); }
 for (const value of variants) { const raw = JSON.stringify(value); expect(result(() => fieldFactsResult(raw, { field }, id, sources))).toEqual(result(() => legacy(raw))); }
});
