import { afterEach, expect, it, vi } from "vitest";
import { readFieldHistory, selectFieldHistory, validFieldHistoryReference, type FieldHistoryQuery } from "../src/core/field-history";
import { fieldHistoryAnchor, requestFieldHistory } from "../src/adapters/field-history-client";
import { fieldFactsPrompt, fieldFactsResult } from "../src/core/field-facts";
import { characterTextRequest, validCharacterTextRequest } from "../src/core/character-text";
import { EMPTY_CHARACTER, EMPTY_STATUS } from "../src/core/characters";
import { isolatedFieldPrompt, validIsolatedFieldInput } from "../src/core/isolated-character-text";
import { DEFAULT_SETTINGS } from "../src/core/defaults";

it("uses a unique exact virtual key only for diagnostics, never for fact retrieval or ID guessing", () => {
 document.body.innerHTML = '<div data-virtual-list-item-key="146"><div class="ds-message">Last reply</div></div>';
 expect(fieldHistoryAnchor()).toBeNull(); expect(fieldHistoryAnchor(document, true)).toBe("146");
 document.body.innerHTML += '<div data-virtual-list-item-key="146"><div class="ds-message">Duplicate</div></div>'; expect(fieldHistoryAnchor(document, true)).toBeNull();
 document.body.innerHTML = '<div data-virtual-list-item-key="146"><article data-message-id="other">Conflict</article></div>'; expect(fieldHistoryAnchor(document, true)).toBeNull();
 document.body.innerHTML = '<div data-virtual-list-item-key="[146]"><div class="ds-message">Composite</div></div>'; expect(fieldHistoryAnchor(document, true)).toBeNull();
 document.body.innerHTML = '<div data-virtual-list-item-key="145"><div class="ds-message">Visible</div></div><div data-virtual-list-item-key="146" hidden><div class="ds-message">Hidden</div></div>'; expect(fieldHistoryAnchor(document, true)).toBe("145");
});
const query: FieldHistoryQuery = { name: "Mira", aliases: ["Мира"], field: "appearance" };
const message = (id: string, parent: string | null, role: "user" | "assistant", content = "Mira wears a blue coat.") => ({ message_id: id, parent_message_id: parent, role, content });
const envelope = (messages: unknown[], more = false) => ({ data: { biz_data: { chat_session_id: "game", messages, has_more: more } } });
const draft = () => characterTextRequest({ key: "appearance", label: "Appearance", scope: "profile", maxLength: 1200, mode: "history" }, "", "Mira", null, EMPTY_CHARACTER, EMPTY_STATUS);
const sources = [{ id: "h0", role: "user" as const, text: "Mira wears a blue coat. She has short dark hair." }];
const reply = (extras: object = {}) => JSON.stringify({ requestId: "field_test", field: "appearance", status: "found", text: "Blue coat.", evidence: [{ source: "h0", quote: "Mira wears a blue coat." }], ...extras });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.innerHTML = ""; });
it("finds an early description beyond the old 12k, without sending the intervening whole conversation", () => {
 const messages = [message("0", null, "user")];
 for (let n = 1; n < 60; n++) messages.push(message(String(n), String(n - 1), n % 2 ? "assistant" : "user", "Unrelated landscape. ".repeat(900)));
 const result = readFieldHistory(envelope(messages), "game", "59", query)!;
 expect(validFieldHistoryReference(result)).toBe(true); expect(result.sources.some(s => s.text.includes("Mira wears a blue coat."))).toBe(true);
 expect(JSON.stringify(result).length).toBeLessThan(49000); expect(result).toMatchObject({ origin: "native", partial: true });
});
it("uses only the exact anchored path, not a different regeneration or list order", () => {
 const a = message("a", "u", "assistant", "Mira wears a blue coat."), b = message("b", "u", "assistant", "Mira wears a RED coat. FOREIGN_BRANCH");
 const value = envelope([b, message("u", null, "user", "Describe Mira."), a]);
 expect(JSON.stringify(readFieldHistory(value, "game", "a", query))).not.toContain("FOREIGN_BRANCH");
 expect(JSON.stringify(readFieldHistory(value, "game", "b", query))).toContain("FOREIGN_BRANCH");
 expect(readFieldHistory(value, "game", "missing", query)).toBeNull();
});
it.each([
 [message("a", null, "user"), message("a", null, "user")],
 [{ ...message("a", null, "user"), id: "different" }],
 [{ message_id: "a", role: "user", content: "Mira" }],
 [message("a", "b", "user"), message("b", "a", "assistant")],
 [message("a", null, "assistant"), message("b", "a", "assistant")],
].map(messages => ({ messages })))("rejects ambiguous/invalid ancestry rather than guessing (%#)", ({ messages }) => { expect(readFieldHistory(envelope(messages), "game", "a", query)).toBeNull(); });
it("requires the requested chat and accepts a partial explicit parent window only as reference", () => {
 const value = envelope([message("a", "outside", "assistant")], true);
 expect(readFieldHistory(value, "other", "a", query)).toBeNull();
 expect(readFieldHistory(value, "game", "a", query)).toMatchObject({ partial: true, origin: "native" });
 expect(readFieldHistory({ messages: [], history: [] }, "game", "a", query)).toBeNull();
});
it("excludes old service pairs by parent identity, leaving the next real story turn", () => {
 const result = readFieldHistory(envelope([message("u", null, "user", "[DeepRole Service]\nGenerate Mira."), message("a", "u", "assistant", "Mira has INVENTED_PURPLE_HAIR."), message("u2", "a", "user", "Mira wears a blue coat."), message("a2", "u2", "assistant", "Mira opens the gate.")]), "game", "a2", query);
 expect(JSON.stringify(result)).not.toContain("INVENTED_PURPLE_HAIR"); expect(JSON.stringify(result)).not.toContain("[DeepRole Service]"); expect(JSON.stringify(result)).toContain("blue coat");
});
it("forwards only recognized final-text fragments, never reasoning or unknown fragment kinds", () => {
 const result = readFieldHistory(envelope([{ ...message("a", null, "assistant", "PRIVATE_FALLBACK"), fragments: [{ type: "THINK", content: "PRIVATE_REASONING" }, { type: "RESPONSE", content: "Mira wears a blue coat." }, { type: "UNKNOWN", content: "PRIVATE_UNKNOWN" }] }]), "game", "a", query);
 expect(JSON.stringify(result)).toContain("blue coat"); expect(JSON.stringify(result)).not.toContain("PRIVATE_");
});
it("keeps Cyrillic aliases and exact quote characters while bounding escaped JSON", () => {
 const result = selectFieldHistory([{ role: "user", text: 'Мира носит зелёную куртку. ' + '"\\'.repeat(9000) }], query, "visible");
 expect(validFieldHistoryReference(result)).toBe(true); expect(result.sources[0]?.text).toContain("зелёную");
 expect(validFieldHistoryReference({ ...result, sources: [...result.sources, ...result.sources] })).toBe(false);
 expect(validFieldHistoryReference({ ...result, partial: false })).toBe(false);
 expect(validFieldHistoryReference({ ...result, extra: "PRIVATE_UNUSED_TEXT" })).toBe(false);
 expect(validFieldHistoryReference({ ...result, sources: [{ ...result.sources[0], extra: "PRIVATE_UNUSED_TEXT" }] })).toBe(false);
});
it("uses a unique exact visible message ID, never a virtual position/hash or hidden service", () => {
 document.body.innerHTML = '<article data-message-id="a">Mira.</article><article data-message-id="service" data-deeprole-service-reply>Draft.</article>';
 expect(fieldHistoryAnchor()).toBe("a"); document.body.innerHTML += '<article data-message-id="a">Duplicate.</article>'; expect(fieldHistoryAnchor()).toBeNull();
 document.body.innerHTML = '<article data-virtual-list-item-key="a">Mira.</article>'; expect(fieldHistoryAnchor()).toBeNull();
});
it("matches bridge request/chat/anchor/scope and cleans the one-shot listener", async () => {
 document.body.innerHTML = '<article data-message-id="a">Mira.</article>'; const post = vi.spyOn(window, "postMessage").mockImplementation(() => {}), remove = vi.spyOn(window, "removeEventListener");
 const promise = requestFieldHistory("game", query, () => true); const request = post.mock.calls[0]![0] as any;
 const packet = { source: "deeprole-page-bridge", type: "FIELD_HISTORY_RESULT", requestId: request.requestId, chatId: "game", anchorId: "a", reference: { origin: "native", partial: true, sources } };
 window.dispatchEvent(new MessageEvent("message", { source: window, origin: location.origin, data: { ...packet, requestId: "foreign" } }));
 window.dispatchEvent(new MessageEvent("message", { source: window, origin: location.origin, data: packet }));
 expect(await promise).toMatchObject({ origin: "native" }); expect(remove).toHaveBeenCalledWith("message", expect.any(Function));
});
it("rejects a late reference after a new native turn or changed scope; times out without retry", async () => {
 vi.useFakeTimers(); document.body.innerHTML = '<article data-message-id="a">Mira.</article>'; const post = vi.spyOn(window, "postMessage").mockImplementation(() => {});
 const promise = requestFieldHistory("game", query, () => true), request = post.mock.calls[0]![0] as any; document.body.innerHTML += '<article data-message-id="b">New.</article>';
 window.dispatchEvent(new MessageEvent("message", { source: window, origin: location.origin, data: { ...request, source: "deeprole-page-bridge", type: "FIELD_HISTORY_RESULT", reference: { origin: "native", partial: true, sources } } })); expect(await promise).toBeNull();
 const timeout = requestFieldHistory("game", query, () => true); await vi.advanceTimersByTimeAsync(6500); expect(await timeout).toBeNull(); expect(post).toHaveBeenCalledTimes(2);
 expect(await requestFieldHistory("game", query, () => false)).toBeNull();
});
it.each(["ru", "en"] as const)("history prompt requires no new facts and exact quotes in %s", locale => {
 const prompt = fieldFactsPrompt(draft(), sources, locale, "field_test"); expect(prompt).toContain("Do not invent"); expect(prompt).toContain("not-found"); expect(prompt).toContain("exact continuous substring"); expect(prompt).toContain(locale === "ru" ? "Russian" : "English");
});
it("accepts supported field text, without exposing evidence IDs in the inserted value", () => { expect(fieldFactsResult(reply(), draft(), "field_test", sources)).toBe("Blue coat."); });
it.each([
 { requestId: "other" }, { field: "goals" }, { extra: true }, { evidence: [] }, { text: "entity_12345678-0000" },
 { evidence: [{ source: "missing", quote: "Mira wears a blue coat." }] },
 { evidence: [{ source: "h0", quote: "Mira wears a red coat." }] },
 { evidence: [{ source: "h0", quote: "Mira wears…blue coat." }] },
 { status: "not-found", text: "Still invent it" }, { status: "conflict", text: "", evidence: [] },
])("rejects malformed/unbound/unsupported history results (%#)", extras => { expect(() => fieldFactsResult(reply(extras), draft(), "field_test", sources)).toThrow(); });
it("returns safe not-found/conflict codes rather than applying invented text", () => {
 expect(() => fieldFactsResult(reply({ status: "not-found", text: "", evidence: [] }), draft(), "field_test", sources)).toThrow("facts-not-found");
 expect(() => fieldFactsResult(reply({ status: "conflict", text: "", evidence: [{ source: "h0", quote: "blue coat" }, { source: "h0", quote: "short dark hair" }] }), draft(), "field_test", sources)).toThrow("conflicting-facts");
});
it("validates transport bounds and keeps image-plan out of the fact mode", () => {
 expect(validCharacterTextRequest(draft())).toBe(true); expect(validCharacterTextRequest({ ...draft(), field: { ...draft().field, mode: "unknown" } })).toBe(false);
 expect(validCharacterTextRequest({ ...draft(), field: { ...draft().field, key: "image-plan" } })).toBe(false);
 const input = { scope: { chatId: "game", chatUrl: "https://chat.deepseek.com/chat/s/game", worldId: null, bookId: null }, locale: "en" as const, draft: draft(), sceneReference: "", historyReference: { origin: "native" as const, partial: true as const, sources } };
 expect(validIsolatedFieldInput(input)).toBe(true); const result = isolatedFieldPrompt(input, [], DEFAULT_SETTINGS, "field_test"); expect(result.prompt).toContain("Mira wears a blue coat."); expect(result.partialContext).toBe(true); expect(result.sources).toEqual(expect.arrayContaining(sources));
 expect(validIsolatedFieldInput({ ...input, scope: { ...input.scope, extra: "PRIVATE_SCOPE_TEXT" } })).toBe(false);
 expect(validIsolatedFieldInput({ ...input, historyReference: { ...input.historyReference, sources: [{ ...sources[0], text: "x".repeat(48001) }] } })).toBe(false);
});
it("cancels the explicit history read promptly and sends nothing for an already cancelled request", async () => {
 document.body.innerHTML = '<article data-message-id="a">Mira.</article>';
 const post = vi.spyOn(window, "postMessage").mockImplementation(() => {}), remove = vi.spyOn(window, "removeEventListener"); const controller = new AbortController();
 const pending = requestFieldHistory("game", { name: "Mira", aliases: [], field: "appearance" }, () => true, document, controller.signal); controller.abort(); expect(await pending).toBeNull();
 expect(remove).toHaveBeenCalledWith("message", expect.any(Function)); expect(await requestFieldHistory("game", { name: "Mira", aliases: [], field: "appearance" }, () => true, document, controller.signal)).toBeNull(); expect(post).toHaveBeenCalledTimes(1);
});
