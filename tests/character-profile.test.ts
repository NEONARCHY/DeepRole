import { expect, it } from "vitest";
import { PROFILE_KEY, PROFILE_FIELDS, characterProfileResult, profileField, profileValues, readProfileProposal } from "../src/core/character-profile";
import { characterTextRequest, validCharacterTextRequest } from "../src/core/character-text";
import { isolatedFieldPrompt, isolatedFieldResult } from "../src/core/isolated-character-text";
import { profileRelatedNames, selectFieldHistory, validFieldHistoryQuery } from "../src/core/field-history";
import { validFieldValidationIssue } from "../src/core/field-validation";
import { EMPTY_CHARACTER, EMPTY_STATUS } from "../src/core/characters";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { castRecords } from "./fixtures/cast-data";
import { profileMemoryId } from "../src/core/memory-workspace";
import type { DataRecord } from "../src/core/types";
const id = "field_test", sources = [{ id: "h0", text: "Mira wears a blue coat." }];
const request = (mode: "history" | "suggest" = "history", fields = [...PROFILE_FIELDS]) => characterTextRequest(profileField("en", mode, fields), JSON.stringify(profileValues(EMPTY_CHARACTER)), "Mira", null, EMPTY_CHARACTER, EMPTY_STATUS);
const missing = () => ({ status: "not-found", text: "", evidence: [] });
const found = () => ({ status: "found", text: "Blue coat.", evidence: [{ source: "h0", quote: sources[0]!.text }] });
const body = () => ({ requestId: id, field: PROFILE_KEY, fields: { appearance: found(), personality: missing(), goals: missing(), background: missing() } });
it("accepts only a bounded, explicit profile request; ordinary field limits stay unchanged", () => {
 expect(validCharacterTextRequest(request())).toBe(true);
 for (const field of [{ ...profileField("en", "history"), mode: undefined }, { ...profileField("en", "history"), profileFields: ["appearance", "appearance"] }, { ...profileField("en", "history"), profileFields: ["scene"] }, { ...profileField("en", "history"), scope: "scene" }, { ...profileField("en", "history"), maxLength: 12001 }, { key: "appearance", scope: "profile", label: "Appearance", maxLength: 6000 }, { key: "appearance", scope: "profile", label: "Appearance", maxLength: 1200, profileFields: ["appearance"] }]) expect(validCharacterTextRequest({ ...request(), field })).toBe(false);
 expect(validCharacterTextRequest({ ...request(), currentText: JSON.stringify(Object.fromEntries(PROFILE_FIELDS.map(key => [key, '"'.repeat(1200)]))) })).toBe(true);
});
it("recovers missing fields without inventing, keeps exact quotes, validates in the isolated transport", () => {
 const value = readProfileProposal(isolatedFieldResult(JSON.stringify(body()), request(), { requestId: id, sources }), [...PROFILE_FIELDS]);
 expect(value.appearance).toEqual({ status: "found", text: "Blue coat.", evidence: [sources[0]!.text] }); expect(value.goals).toEqual(missing());
 expect(JSON.stringify(value)).not.toMatch(/requestId|source|h0/);
});
it.each(["request", "field", "extra", "missing", "quote", "source", "length", "protocol", "mixed"])("rejects a %s error atomically with safe diagnostic metadata", kind => {
 const v: any = body();
 if (kind === "request") v.requestId = "foreign";
 if (kind === "field") v.field = "appearance";
 if (kind === "extra") v.fields.scene = found();
 if (kind === "missing") delete v.fields.background;
 if (kind === "quote") v.fields.appearance.evidence[0].quote = "not in source";
 if (kind === "source") v.fields.appearance.evidence[0].source = "foreign";
 if (kind === "length") v.fields.appearance.text = "x".repeat(1201);
 if (kind === "protocol") v.fields.appearance.text = "entity_abcdefghijkl";
 if (kind === "mixed") v.fields.goals = { status: "suggested", text: "Invented", evidence: [] };
 try { characterProfileResult(JSON.stringify(v), request(), id, sources); throw Error("accepted"); } catch (error: any) { expect(error.message).not.toBe("accepted"); expect(error.issues?.length).toBeGreaterThan(0); expect(error.issues.every(validFieldValidationIssue)).toBe(true); expect(JSON.stringify(error.issues)).not.toMatch(/foreign|not in source|entity_abcdefgh/); }
});
it("keeps validated conflicts for review, without replacing them with fiction", () => {
 const v: any = body(); sources.push({ id: "h1", text: "Mira wears a red coat." });
 v.fields.appearance = { status: "conflict", text: "", evidence: sources.map(s => ({ source: s.id, quote: s.text })) };
 expect(readProfileProposal(characterProfileResult(JSON.stringify(v), request(), id, sources), [...PROFILE_FIELDS]).appearance).toMatchObject({ status: "conflict", text: "" }); sources.pop();
});
it("creative fallback can fill only the requested subset, and never label inventions as facts", () => {
 const draft = request("suggest", ["goals"]), value = { requestId: id, field: PROFILE_KEY, fields: { goals: { status: "suggested", text: "Open a bakery.", evidence: [] } } };
 expect(readProfileProposal(characterProfileResult(JSON.stringify(value), draft, id, []), ["goals"])).toEqual(value.fields);
 expect(() => characterProfileResult(JSON.stringify({ ...value, fields: { ...value.fields, appearance: found() } }), draft, id, sources)).toThrow();
 expect(() => characterProfileResult(JSON.stringify({ ...value, fields: { goals: found() } }), draft, id, sources)).toThrow();
 expect(() => readProfileProposal(JSON.stringify({ goals: { status: "found", text: "A fact?", evidence: [] } }), ["goals"])).toThrow();
});
it.each(["ru", "en"] as const)("profile prompt preserves the seed and does not prepare a roster in %s", locale => {
 const draft = request(); draft.reference.background = locale === "ru" ? "Подруга Миры" : "Mira’s friend";
 const input = { scope: { chatId: "game", chatUrl: "https://chat.deepseek.com/chat/s/game", worldId: "w", bookId: null }, locale, draft, sceneReference: "" };
 const value = isolatedFieldPrompt(input, castRecords(), DEFAULT_SETTINGS, id);
 expect(value.prompt).toContain(draft.reference.background); expect(value.prompt).toContain("ONE character, never a roster"); expect(value.prompt).toContain("Do NOT invent to fill gaps"); expect(value.prompt).toContain("Mira's profile"); expect(value.prompt).not.toContain("PRIVATE_BYTES");
});
it("related people are bounded retrieval hints, not aliases, including a Russian case ending", () => {
 const people = [{ name: "Мира", aliases: [] }, { name: "Ann", aliases: [] }, { name: "Leo", aliases: [] }];
 expect(profileRelatedNames({ name: "Нора", background: "Подруга Миры. Annette is elsewhere." }, people)).toEqual(["Мира"]);
 expect(validFieldHistoryQuery({ name: "Нора", field: PROFILE_KEY, aliases: [], relatedNames: ["Мира"] })).toBe(true);
 expect(validFieldHistoryQuery({ name: "Нора", field: PROFILE_KEY, aliases: [], relatedNames: Array(13).fill("Мира") })).toBe(false);
 const turns = [{ role: "user" as const, text: "Мира живёт у маяка." }, ...Array.from({ length: 5 }, () => ({ role: "assistant" as const, text: "Unrelated recent scene." }))];
 expect(selectFieldHistory(turns, { name: "Нора", field: PROFILE_KEY, aliases: [], relatedNames: ["Мира"] }, "native").sources[0]!.text).toBe(turns[0]!.text);
 expect(selectFieldHistory(turns, { name: "Нора", field: PROFILE_KEY, aliases: [] }, "native").sources).not.toContainEqual(expect.objectContaining({ text: turns[0]!.text }));
});
it("retrieves only explicitly related saved profiles, respects world and exclusions, and never includes images", () => {
 const draft = request("suggest"); draft.reference.name = "Nora"; draft.reference.background = "Mira’s friend";
 const person = (id: string, worldId: string, name: string): DataRecord => ({ kind: "entity", id, data: { id, worldId, name, kind: "character", description: "", aliases: [], memberIds: [], characterSheet: { ...EMPTY_CHARACTER, appearance: name + " USER_CUSTOM_COAT", sprites: { neutral: "PRIVATE_BYTES" } }, createdAt: 1, updatedAt: 1 } });
 const records = [...castRecords(), person("mira", "w", "Mira"), person("other", "w", "Other"), person("foreign", "elsewhere", "Mira")], input = { scope: { chatId: "game", chatUrl: "https://chat.deepseek.com/chat/s/game", worldId: "w", bookId: null }, locale: "en" as const, draft, sceneReference: "" };
 const prepared = isolatedFieldPrompt(input, records, DEFAULT_SETTINGS, id);
 expect(prepared.sources.filter(s => s.id.startsWith("r"))).toEqual([{ id: "r0", text: "Mira\nappearance: Mira USER_CUSTOM_COAT" }]); expect(prepared.prompt).not.toContain("PRIVATE_BYTES");
 expect(isolatedFieldPrompt(input, records, DEFAULT_SETTINGS, id, { includedIds: [], excludedIds: [profileMemoryId("entity", "mira")] }).prompt).not.toContain("USER_CUSTOM_COAT");
});
