import { normalizeActionStatus } from "./action-compat";

export interface CastIssue { path: string; rule: string; actual: string }
export class CastValidationError extends Error {
  constructor(public issues: CastIssue[], code = "invalid-result") { super(code); this.name = "CastValidationError"; }
}
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const id = (v: unknown, max = 160): v is string => str(v, max) && !!v.trim() && !["__proto__", "constructor", "prototype"].includes(v);
const integer = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
export const castShape = (v: unknown): string => v === undefined ? "missing" : v === null ? "null" : Array.isArray(v) ? `array(length=${v.length})` : typeof v === "string" ? `string(length=${v.length})` : obj(v) ? `object(fields=${Object.keys(v).length})` : typeof v === "number" ? Number.isInteger(v) ? "number(integer)" : "number(non-integer)" : typeof v;
/** Paths are generated locally. Never use model-owned keys, labels or values in diagnostics. */
export function castCheck(ok: unknown, path: string, rule: string, value?: unknown, code = "invalid-result"): asserts ok {
  if (!ok) throw new CastValidationError([{ path, rule, actual: castShape(value) }], code);
}
export function castProfileIssues(sheet: Record<string, unknown>, status: Record<string, unknown>, completed: string[], path: string): CastIssue[] {
  const issues: CastIssue[] = [];
  const check = (ok: unknown, field: string, rule: string, value?: unknown) => { if (!ok && issues.length < 60) issues.push({ path: `${path}.${field}`, rule, actual: castShape(value) }); };
  const text = (o: Record<string, unknown>, field: string, prefix: string, max: number, nonempty = false) => check(str(o[field], max) && (!nonempty || !!(o[field] as string).trim()), `${prefix}.${field}`, `string <=${max}${nonempty ? ", nonempty" : ""}`, o[field]);
  const number = (o: Record<string, unknown>, field: string, prefix: string, min: number, max: number) => check(integer(o[field], min, max), `${prefix}.${field}`, `integer ${min}..${max}`, o[field]);
  check(["male", "female", "neutral"].includes(String(sheet.gender)), "sheet.gender", "enum male|female|neutral", sheet.gender);
  check(typeof sheet.protagonist === "boolean", "sheet.protagonist", "boolean", sheet.protagonist);
  for (const field of ["appearance", "personality", "goals", "background"]) text(sheet, field, "sheet", 1200);
  check(Array.isArray(sheet.attributes) && sheet.attributes.length <= 6, "sheet.attributes", "array <=6", sheet.attributes);
  if (Array.isArray(sheet.attributes)) {
    const ids = new Set(), labels = new Set();
    sheet.attributes.slice(0, 6).forEach((a, i) => {
      const p = `sheet.attributes[${i}]`;
      check(obj(a), p, "object", a); if (!obj(a)) return;
      check(id(a.id) && !ids.has(a.id), `${p}.id`, "safe unique string ID <=160", a.id); ids.add(a.id);
      text(a, "label", p, 40, true); const label = typeof a.label === "string" ? a.label.trim().toLocaleLowerCase() : undefined;
      check(!labels.has(label), `${p}.label`, "unique label (case-insensitive)", a.label); labels.add(label);
      number(a, "initial", p, 0, 100); number(a, "cap", p, 1, 8);
      text(a, "low", p, 160); text(a, "high", p, 160);
      if (a.lowAt !== undefined) number(a, "lowAt", p, 0, 99);
      if (a.highAt !== undefined) number(a, "highAt", p, 1, 100);
      check(Number(a.lowAt ?? 30) < Number(a.highAt ?? 70), `${p}.lowAt`, "lowAt < highAt (defaults 30/70)", a.lowAt);
    });
  }
  const r = sheet.relationships;
  if (r !== undefined && r !== null) {
    check(obj(r), "sheet.relationships", "object or null", r);
    if (obj(r)) {
      const p = "sheet.relationships";
      for (const field of ["enabled", "romance"]) check(typeof r[field] === "boolean", `${p}.${field}`, "boolean", r[field]);
      check(["slow", "balanced", "open"].includes(String(r.pace)), `${p}.pace`, "enum slow|balanced|open", r.pace);
      text(r, "boundaries", p, 600);
      if (r.reactions !== undefined) text(r, "reactions", p, 600);
      for (const field of ["initial", "thresholds"]) {
        check(obj(r[field]), `${p}.${field}`, "object with trust/affinity", r[field]);
        if (obj(r[field])) for (const score of ["trust", "affinity"]) number(r[field], score, `${p}.${field}`, 0, 100);
      }
      if (r.stageBehavior !== undefined) {
        check(obj(r.stageBehavior), `${p}.stageBehavior`, "object", r.stageBehavior);
        if (obj(r.stageBehavior)) Object.entries(r.stageBehavior).forEach(([stage, value], index) => {
          const known = ["guarded", "acquaintance", "trusting", "close"].includes(stage);
          check(known, `${p}.stageBehavior[${index}]`, "key guarded|acquaintance|trusting|close", stage);
          check(str(value, 240), known ? `${p}.stageBehavior.${stage}` : `${p}.stageBehavior[${index}]`, "string <=240", value);
        });
      }
      check(Array.isArray(r.milestones) && r.milestones.length <= 8, `${p}.milestones`, "array <=8", r.milestones);
      const milestones = new Set();
      if (Array.isArray(r.milestones)) r.milestones.slice(0, 8).forEach((m, i) => {
        const mp = `${p}.milestones[${i}]`; check(obj(m), mp, "object", m); if (!obj(m)) return;
        check(id(m.id) && !milestones.has(m.id), `${mp}.id`, "safe unique string ID <=160", m.id); milestones.add(m.id);
        text(m, "label", mp, 100, true);
        if (m.required !== undefined) check(typeof m.required === "boolean", `${mp}.required`, "boolean", m.required);
      });
      completed.forEach((value, i) => check(milestones.has(value), `completed[${i}]`, "ID must belong to this character's milestones", value));
      if (r.initialCompleted !== undefined) {
        check(Array.isArray(r.initialCompleted) && r.initialCompleted.length <= 8, `${p}.initialCompleted`, "array <=8 unique milestone IDs", r.initialCompleted);
        if (Array.isArray(r.initialCompleted)) r.initialCompleted.slice(0, 8).forEach((v, i) => check(id(v) && milestones.has(v) && r.initialCompleted instanceof Array && r.initialCompleted.indexOf(v) === i, `${p}.initialCompleted[${i}]`, "unique ID from milestones", v));
      }
    }
  } else check(!completed.length, "completed", "empty array without relationships", completed);
  const state = normalizeActionStatus(status) as Record<string, unknown>;
  // Status action uses the existing validator's nonempty (not trimmed) key rule.
  check(str(state.action, 32) && state.action.length > 0 && !["__proto__", "constructor", "prototype"].includes(state.action), "state.action", "safe nonempty string <=32", state.action);
  for (const field of ["condition", "goal", "relationship"]) text(state, field, "state", 240);
  check(Array.isArray(state.stats) && state.stats.length <= 6, "state.stats", "array <=6", state.stats);
  if (Array.isArray(state.stats)) state.stats.slice(0, 6).forEach((s, i) => {
    const p = `state.stats[${i}]`; check(obj(s), p, "object", s); if (!obj(s)) return;
    text(s, "label", p, 40, true); text(s, "value", p, 80);
  });
  return issues;
}
