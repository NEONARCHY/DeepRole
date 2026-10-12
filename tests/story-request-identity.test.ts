import { afterEach, describe, expect, it } from "vitest";
import { readStoryTransportIdentity, nativeStoryMessageKey, validStoryTransportIdentity } from "../src/core/story-transport";
import { readNativeStoryIdentity, readNativeStorySample } from "../src/adapters/story-identity-dom";

afterEach(() => { document.body.replaceChildren(); });
describe("strict request and native message identities", () => {
  it("distinguishes explicit root, numeric message zero and unavailable parent", () => {
    expect(readStoryTransportIdentity('{"chat_session_id":"a","parent_message_id":null}')).toEqual({ chatId: "a", nativeParentKey: null });
    expect(readStoryTransportIdentity('{"chat_session_id":"a","parent_message_id":0}')).toEqual({ chatId: "a", nativeParentKey: nativeStoryMessageKey("0") });
    expect(readStoryTransportIdentity('{"chat_session_id":"a"}')).toBeNull();
  });
  it("normalizes numeric and string native IDs, without inspecting user prose", () => {
    for (const id of [42, "42"]) expect(readStoryTransportIdentity(JSON.stringify({ chat_session_id: "chat-1", parent_message_id: id, prompt: "untrusted instruction", token: "secret" }))).toEqual({ chatId: "chat-1", nativeParentKey: '["message","42"]' });
  });
  it.each(["null", "[]", "broken", '{"chat_session_id":1,"parent_message_id":null}', '{"chat_session_id":" a ","parent_message_id":null}', '{"chat_session_id":"a","parent_message_id":-1}', '{"chat_session_id":"a","parent_message_id":1.5}', '{"chat_session_id":"a","parent_message_id":9007199254740992}', '{"chat_session_id":"a","parent_message_id":{}}', '{"chat_session_id":"a","parent_message_id":""}', '{"chat_session_id":"a","parent_message_id":"__proto__"}'])("rejects unsupported identity %s", body => {
    expect(readStoryTransportIdentity(body)).toBeNull();
  });
  it("rejects unknown fields in bridge metadata and never treats virtual-list keys as native IDs", () => {
    expect(validStoryTransportIdentity({ chatId: "a", nativeParentKey: '["virtual","42"]' })).toBe(false);
    expect(validStoryTransportIdentity({ chatId: "a", nativeParentKey: null, command: "apply" })).toBe(false);
    expect(validStoryTransportIdentity({ chatId: "a", nativeParentKey: '[ "message", "42" ]' })).toBe(false);
    expect(validStoryTransportIdentity({ chatId: "a", nativeParentKey: '["message","42"]' })).toBe(true);
  });
  function row(attributes: string) { document.body.innerHTML = `<article ${attributes}><div class="ds-markdown">Story</div></article>`; return document.querySelector<HTMLElement>("article")!; }
  it("reads exact native ID, explicit role and parent only from the native message row", () => {
    const message = row('data-message-id="43" data-message-role="assistant" data-parent-message-id="42"');
    expect(readNativeStoryIdentity(message)).toEqual({ role: "assistant", nativeMessageKey: '["message","43"]', nativeParentKey: '["message","42"]' });
    expect(readNativeStoryIdentity(message.querySelector<HTMLElement>("div")!)).toBeNull();
  });
  it("does not infer role, root or parent from position, similar text, or virtual-list order", () => {
    for (const attributes of ['data-message-id="43" data-message-role="assistant"', 'data-message-id="43" data-parent-message-id="42"', 'data-virtual-list-item-key="43" data-role="assistant" data-parent-message-id="42"', 'data-message-id="43" data-role="assistant" data-parent-message-id=""']) expect(readNativeStoryIdentity(row(attributes))).toBeNull();
  });
  it("uses an explicit root marker and rejects conflicting role or parent metadata", () => {
    expect(readNativeStoryIdentity(row('data-message-id="1" data-role="user" data-parent-is-root="true"'))).toEqual({ role: "user", nativeMessageKey: '["message","1"]', nativeParentKey: null });
    expect(readNativeStoryIdentity(row('data-message-id="1" data-role="user" data-parent-message-id="null"'))).toMatchObject({ nativeParentKey: '["message","null"]' });
    expect(readNativeStoryIdentity(row('data-message-id="1" data-role="user" data-parent-is-root="true" data-parent-message-id="2"'))).toBeNull();
    expect(readNativeStoryIdentity(row('data-message-id="2" data-role="user" data-message-role="assistant" data-parent-message-id="1"'))).toBeNull();
    expect(readNativeStoryIdentity(row('data-message-id="2" data-role="assistant" data-parent-message-id="2"'))).toBeNull();
  });
  it("rejects service, reasoning, extension and ambiguous nested rows", () => {
    const message = row('data-message-id="43" data-role="assistant" data-parent-message-id="42" data-deeprole-service-reply="true"');
    expect(readNativeStoryIdentity(message)).toBeNull();
    message.removeAttribute("data-deeprole-service-reply"); message.className = "ds-think-content";
    expect(readNativeStoryIdentity(message)).toBeNull();
    message.className = ""; message.innerHTML += '<article data-message-id="44">Nested</article>';
    expect(readNativeStoryIdentity(message)).toBeNull();
    document.body.innerHTML = '<deeprole-page-widget><article data-message-id="43" data-role="assistant" data-parent-message-id="42">Story</article></deeprole-page-widget>';
    expect(readNativeStoryIdentity(document.querySelector<HTMLElement>("article")!)).toBeNull();
  });
  it("does not treat a stable DOM or HTTP success as completion", () => {
    const message = row('data-message-id="2" data-role="assistant" data-parent-message-id="1"');
    expect(readNativeStorySample(message, null)).toBeNull();
    expect(readNativeStorySample(message, "streaming" as any)).toBeNull();
    expect(readNativeStorySample(message, "complete")).toMatchObject({ completion: "complete", content: "Story" });
  });
  it("excludes reasoning and generated controls without mutating story, folded protocol or DOM", () => {
    const message = row('data-message-id="2" data-role="assistant" data-parent-message-id="1"');
    message.innerHTML = '<div class="ds-think-content">Private reasoning</div><div class="ds-markdown">  Ключ передан.\n<details data-deeprole-characters-result><summary data-deeprole-characters-summary>Saved</summary><pre>&lt;deeprole_characters&gt;{}&lt;/deeprole_characters&gt;</pre></details></div><button>Copy</button><div data-deeprole-choices-host>Next action</div><div role="toolbar">Regenerate</div>';
    const before = message.outerHTML;
    expect(readNativeStorySample(message, "complete")!.content).toBe("  Ключ передан.\n<deeprole_characters>{}</deeprole_characters>"); expect(message.outerHTML).toBe(before);
  });
  it("keeps interrupted and incomplete samples unselectable and requires a completed user", () => {
    const message = row('data-message-id="2" data-role="assistant" data-parent-message-id="1"');
    expect(readNativeStorySample(message, "interrupted")).toMatchObject({ completion: "interrupted" });
    expect(readNativeStorySample(message, "partial")).toMatchObject({ completion: "partial" });
    message.dataset.role = "user"; expect(readNativeStorySample(message, "partial")).toBeNull();
  });
  it.each(["empty", "oversized", "service", "recovered", "mode-prompt"] as const)("rejects the %s sample without reading it as a completed story", problem => {
    const message = row('data-message-id="2" data-role="assistant" data-parent-message-id="1"');
    if (problem === "empty") message.textContent = "  ";
    if (problem === "oversized") message.textContent = "a".repeat(250001);
    if (problem === "service") message.innerHTML = '<div class="ds-think-content">Thinking</div>[DeepRole Service] data';
    if (problem === "recovered") message.innerHTML += '<section data-deeprole-recovered-reply>Recovered fragment</section>';
    if (problem === "mode-prompt") message.textContent = "<deeprole_character_mode>service data";
    expect(readNativeStorySample(message, "complete")).toBeNull();
  });
});
