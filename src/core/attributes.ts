import type { AttributePatch, AttributeState, CharacterAttribute, CharacterScene, Locale, SceneEntity } from "./types";
import { relationshipNarrative } from "./relationships";

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const key = (v: unknown): v is string => text(v, 160) && !!v.trim() && !["__proto__", "constructor", "prototype"].includes(v);
const integer = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const values = (v: unknown): v is Record<string, number> => object(v) && Object.keys(v).length <= 6 && Object.entries(v).every(([id, n]) => key(id) && integer(n, 0, 100));
export function validAttributes(v: unknown): v is CharacterAttribute[] {
  return Array.isArray(v) && v.length <= 6 && v.every(a => object(a) && key(a.id) && text(a.label, 40) && !!a.label.trim() && integer(a.initial, 0, 100) && integer(a.cap, 1, 8) && text(a.low, 160) && text(a.high, 160)
    && (a.lowAt === undefined || integer(a.lowAt, 0, 99)) && (a.highAt === undefined || integer(a.highAt, 1, 100)) && Number(a.lowAt ?? 30) < Number(a.highAt ?? 70)) && new Set(v.map(a => a.id)).size === v.length && new Set(v.map(a => a.label.trim().toLocaleLowerCase())).size === v.length;
}
/** Resolve the meaning locally. An intermediate value is neither extreme. */
export function attributeBand(definition: CharacterAttribute, value: number): "low" | "middle" | "high" {
  return value <= (definition.lowAt ?? 30) ? "low" : value >= (definition.highAt ?? 70) ? "high" : "middle";
}
export function attributeMeaning(definition: CharacterAttribute, value: number): string {
  const band = attributeBand(definition, value);
  return band === "middle" ? "" : definition[band];
}
export function validAttributeState(v: unknown): v is AttributeState {
  return object(v) && values(v.values) && Array.isArray(v.locked) && v.locked.length <= 6 && v.locked.every(key) && new Set(v.locked).size === v.locked.length && Array.isArray(v.history) && v.history.length <= 20 && v.history.every(h => object(h) && typeof h.at === "number" && Number.isFinite(h.at) && h.at >= 0 && (h.turn === undefined || key(h.turn)) && ["scene", "manual"].includes(String(h.source)) && values(h.before) && values(h.after) && text(h.reason, 240) && text(h.quote, 240));
}
export function validAttributePatches(v: unknown): v is AttributePatch[] {
  return Array.isArray(v) && v.length <= 12 && v.every(p => object(p) && key(p.id) && Array.isArray(p.changes) && p.changes.length >= 1 && p.changes.length <= 6 && p.changes.every(c => object(c) && key(c.key) && integer(c.delta, -8, 8)) && new Set(p.changes.map(c => c.key)).size === p.changes.length && text(p.reason, 240) && !!p.reason.trim() && text(p.quote, 240) && p.quote.trim().length >= 12) && new Set(v.map(p => p.id)).size === v.length;
}
/** Saved chat values override starting values; unconfigured fields never leak back in. */
export function attributeState(definitions: CharacterAttribute[], saved?: AttributeState): AttributeState {
  const ids = new Set(definitions.map(a => a.id));
  return { values: Object.fromEntries(definitions.map(a => [a.id, saved?.values[a.id] ?? a.initial])), locked: saved?.locked.filter(id => ids.has(id)) ?? [], history: saved?.history ?? [] };
}
export function advanceAttributes(definitions: CharacterAttribute[], before: AttributeState, patch: AttributePatch, narrative: string, at: number, turn?: string): AttributeState | null {
  if (patch.changes.every(change => before.locked.includes(change.key))) return before;
  const quote = relationshipNarrative(patch.quote);
  if (quote.length < 12 || !narrative.includes(quote) || before.history.some(h => h.source === "scene" && relationshipNarrative(h.quote) === quote)) return null;
  if (patch.changes.some(change => { const definition = definitions.find(a => a.id === change.key); return !definition || Math.abs(change.delta) > definition.cap; })) return null;
  const after = { ...before.values };
  for (const { key: id, delta } of patch.changes) if (!before.locked.includes(id)) after[id] = Math.max(0, Math.min(100, after[id]! + delta));
  if (Object.entries(after).every(([id, value]) => value === before.values[id])) return before;
  return { ...before, values: after, history: [{ at, ...(turn ? { turn } : {}), source: "scene" as const, before: { ...before.values }, after, reason: patch.reason.trim(), quote: patch.quote.trim() }, ...before.history].slice(0, 20) };
}
export function recordManualAttributes(definitions: CharacterAttribute[], previous: AttributeState | undefined, draft: AttributeState | undefined, at: number): AttributeState | undefined {
  if (!draft) return previous;
  const before = attributeState(definitions, previous); const next = attributeState(definitions, draft);
  if (JSON.stringify(before.values) === JSON.stringify(next.values) && JSON.stringify([...before.locked].sort()) === JSON.stringify([...next.locked].sort())) return previous;
  return { ...next, history: [{ at, source: "manual" as const, before: before.values, after: next.values, reason: "", quote: "" }, ...(previous?.history ?? [])].slice(0, 20) };
}
export function starterAttributes(locale: Locale): CharacterAttribute[] {
  return locale === "ru" ? [
    { id: "energy", label: "Запас сил", initial: 70, low: "Усталость; нужен отдых, тяжёлые действия даются труднее", high: "Бодрость; хватает сил для длительных действий", cap: 5 },
    { id: "resolve", label: "Уверенность", initial: 50, low: "Сомнения; сложные решения требуют усилий", high: "Уверенность; легче отстаивать своё решение", cap: 3 },
  ] : [
    { id: "energy", label: "Stamina", initial: 70, low: "Tired; needs rest, strenuous actions are harder", high: "Rested; can sustain effort", cap: 5 },
    { id: "resolve", label: "Confidence", initial: 50, low: "Uncertain; difficult decisions take effort", high: "Confident; easier to stand by a decision", cap: 3 },
  ];
}
export function attributeInstruction(roster: SceneEntity[], active: SceneEntity[], scene?: CharacterScene, referenceOnly = false, canonicalIds = false, compact = false): string {
  const ids = new Set([...active.map(e => e.id), ...(scene?.presentIds ?? [])]);
  const people = roster.filter(e => ids.has(e.id) && e.characterSheet?.attributes?.length).map(e => {
    const definitions = e.characterSheet!.attributes!; const state = attributeState(definitions, scene?.states[e.id]?.attributes);
    return { id: canonicalIds ? e.id : e.name, attributes: definitions.map(a => ({ key: a.id, label: a.label, value: state.values[a.id], band: attributeBand(a, state.values[a.id]!), meaning: attributeMeaning(a, state.values[a.id]!), lowAt: a.lowAt ?? 30, highAt: a.highAt ?? 70, low: a.low, high: a.high, cap: a.cap, locked: state.locked.includes(a.id) })), recent: state.history.filter(h => h.source === "scene").slice(0, 2).map(h => ({ before: h.before, after: h.after, reason: h.reason, quote: h.quote })) };
  });
  if (!people.length) return "";
  if (compact) return `Configured ordinary characteristics: ${JSON.stringify(people)}\nUse current band/meaning in story AND choices; middle is neither extreme. They guide capability, not forced player actions, consent or guaranteed success; lore/personality/agency take precedence. Only actually played final-reply events may propose attributes:[{id:"${canonicalIds?"exact roster ID":"exact character name"}",changes:[{key:"exact configured key",delta:0}],reason:"played consequence",quote:"verbatim prose,12–240 characters"}]. Signed integer deltas within cap, not absolute values; omit locked/unchanged. No recovery without played rest, no draft/unchosen/hypothetical/repeated rewards. Never invent attributes, change definitions/initial values/locks, convert text stats to numbers or create sexual measurements.\n`;
  if (referenceOnly) return `Configured ordinary characteristics: ${JSON.stringify(people)}\nRead-only reference for this service request. Keep choices consistent with the current band and meaning; middle is neither extreme. Respect agency, personality and world rules. Do not continue the scene, change values or return attributes.`;
  return `Configured ordinary characteristics: ${JSON.stringify(people)}\nUse current characteristics and their low/high meanings to make the story and ALL reply choices consistent with capabilities and state; do not dictate the player's actions or guarantee outcomes. They do not override world rules or personality. Never invent attributes or convert old text stats to numbers. Only after an event actually happened in this final narrative, optionally add attributes:[{id:"${canonicalIds ? "exact roster ID" : "exact character name"}",changes:[{key:"exact configured key",delta:0}],reason:"consequence of the played event",quote:"verbatim narrative excerpt, 12–240 characters"}] to the SAME character update JSON. Deltas are signed integers within each individual cap, NOT absolute values. Omit locked or unchanged values. No points for unchosen options, drafts, repeated evidence or just sending a message; no automatic recovery without an actual rest/recovery event. Do not change definitions, starting values or locks. No sexual measurements. Existing ordinary text stats remain descriptive, not a second numeric authority.`;
}
