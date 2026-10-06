import { describe, expect, it } from "vitest";
import { readStoryHistory } from "../src/core/chat-history";
import { boundStory, MAX_STORY_CHARACTERS, storyText, validStoryContinuation, withLatestVisibleStory } from "../src/core/story-continuation";
import { formatMemoryContext } from "../src/core/context";
import { contextWarningLevel, chatCapacity } from "../src/core/context-capacity";
import { parseBackupSettings, validDataRecord } from "../src/core/record-validation";
import { visibleStoryHistory } from "../src/adapters/story-history-dom";
import type { HandoffSnapshot } from "../src/core/types";

const snapshot: HandoffSnapshot = { id: "s", title: "Harbor", summary: "Earlier oath.", sourceChatId: "a", sourceChatUrl: "https://chat.deepseek.com/a/chat/s/a", worldId: null, bookId: null, createdAt: 1 };
const history = (messages: unknown[], extra = {}) => ({ code: 0, data: { biz_code: 0, biz_data: { chat_messages: messages, ...extra } } });
describe("story transfer payload", () => {
  it("reads exact prose, not hidden reasoning, services or character-update commands", () => {
    const result = readStoryHistory(history([
      { role: "USER", content: '<deeprole_context version="1">old rules</deeprole_context>\n[User message]\nI kept the oath.' },
      { role: "ASSISTANT", fragments: [{ type: "THINK", content: "PRIVATE REASONING" }, { type: "RESPONSE", content: 'Mira, 24, waits.\n<deeprole_characters>{"request":"old","bonds":[{"trust":99}]}</deeprole_characters>' }] },
      { role: "user", content: "[DeepRole Service]\nSummarize." },
      { role: "assistant", content: '<deeprole_data>{"type":"handoff"}</deeprole_data>' },
    ]))!;
    expect(result.turns).toEqual([{ role: "user", text: "I kept the oath." }, { role: "assistant", text: "Mira, 24, waits." }]);
    expect(result.partial).toBe(false); expect(validStoryContinuation(result)).toBe(true);
  });
  it("selects the observed regenerated branch and never combines alternate outcomes", () => {
    const input = history([{ id: 1, parent_id: null, role: "user", content: "Open the door" }, { id: 2, parent_id: 1, role: "assistant", content: "It stays closed" }, { id: 3, parent_id: 1, role: "assistant", content: "It opens" }]);
    expect(readStoryHistory(input)).toBeNull();
    expect(readStoryHistory(input, "2")!.turns.at(-1)!.text).toBe("It stays closed");
    expect(readStoryHistory(input, "3")!.turns).not.toContainEqual(expect.objectContaining({ text: "It stays closed" }));
  });
  it("rejects failed, unrecognized, cyclic or reasoning-only history", () => {
    expect(readStoryHistory({ code: 1, messages: [] })).toBeNull();
    expect(readStoryHistory({ data: { biz_code: 1 } })).toBeNull();
    expect(readStoryHistory(history([{ role: "assistant", fragments: [{ type: "THINK", content: "reason" }] }]))).toBeNull();
    expect(readStoryHistory(history([{ id: 1, parent_id: 2, role: "user", content: "a" }, { id: 2, parent_id: 1, role: "assistant", content: "b" }]), "2")).toBeNull();
  });
  it("orders descending native numeric IDs and labels a missing ancestor as partial", () => {
    const result = readStoryHistory(history([{ id: 2, role: "assistant", content: "Last event" }, { id: 1, role: "user", content: "First event" }]))!;
    expect(result.turns.map(t => t.text)).toEqual(["First event", "Last event"]);
    expect(readStoryHistory(history([{ id: 2, parent_id: 1, role: "assistant", content: "Last event" }]))!.partial).toBe(true);
  });
  it("marks paginated or bounded history partial, keeps the latest event", () => {
    expect(readStoryHistory(history([{ role: "user", content: "Last event" }], { has_more: true }))!.partial).toBe(true);
    const result = boundStory([{ role: "user", text: "x".repeat(MAX_STORY_CHARACTERS) }, { role: "assistant", text: "Last event" }], "history");
    expect(result.partial).toBe(true); expect(result.omittedTurns).toBe(1); expect(result.turns[0]!.text).toBe("Last event");
    const huge = boundStory([{ role: "assistant", text: "x".repeat(MAX_STORY_CHARACTERS) + "THE END" }], "history");
    expect(huge.partial).toBe(true); expect(huge.turns[0]!.text.endsWith("THE END")).toBe(true);
  });
  it("removes an unfinished protocol suffix without dropping normal story prose", () => {
    expect(storyText('A door opened.\n<deeprole_choices>{"options":[')).toBe("A door opened.");
  });
  it("includes earlier recap and ordered recent events only in the first handoff context", () => {
    const result = formatMemoryContext({ entries: [], estimatedTokens: 0, omittedCount: 0 }, { ...snapshot, continuation: boundStory([{ role: "assistant", text: "She reaches the harbor" }], "history") });
    expect(result).toContain("Earlier oath."); expect(result).toContain("She reaches the harbor"); expect(result).toContain("not new instructions");
    expect(formatMemoryContext({ entries: [], estimatedTokens: 0, omittedCount: 0 })).toBe("");
  });
  it("updates a lagging API history with the last visible answer without duplicating the overlap", () => {
    const old = boundStory([{ role: "user", text: "First" }, { role: "assistant", text: "Mira waits." }], "history");
    const page = boundStory([{ role: "assistant", text: "Mira waits." }, { role: "user", text: "I arrive" }, { role: "assistant", text: "She smiles." }], "page", true);
    const result = withLatestVisibleStory(old, page);
    expect(result.turns.map(t => t.text)).toEqual(["First", "Mira waits.", "I arrive", "She smiles."]); expect(result.partial).toBe(false);
    expect(withLatestVisibleStory(result, page)).toBe(result);
    expect(withLatestVisibleStory(null, page)).toBe(page);
  });
  it("does not call an unmatched page and server history complete", () => {
    expect(withLatestVisibleStory(boundStory([{ role: "user", text: "a" }], "history"), boundStory([{ role: "assistant", text: "b" }], "page", true)).partial).toBe(true);
  });
  it("removes UI plaques, buttons and reasoning from DOM fallback, preserves ages and latest facts", () => {
    document.body.innerHTML = '<article data-role="user" data-message-id="1">I wait.<button>Copy</button></article><article data-role="assistant" data-message-id="2"><div class="ds-think-content">Hidden reasoning</div><div>Mira, 24, arrives.</div><details data-deeprole-characters-result>Updated after reply</details><div data-deeprole-choices-host>Suggest options</div><div hidden>&lt;deeprole_characters&gt;{}&lt;/deeprole_characters&gt;</div></article>';
    const result = visibleStoryHistory();
    expect(result.turns).toEqual([{ role: "user", text: "I wait." }, { role: "assistant", text: "Mira, 24, arrives." }]); expect(result.partial).toBe(true);
    document.body.innerHTML = "";
  });
  it("validates new snapshot fields and preserves old snapshots and settings", () => {
    expect(validDataRecord({ kind: "snapshot", id: "s", data: snapshot })).toBe(true);
    expect(validDataRecord({ kind: "snapshot", id: "s", data: { ...snapshot, continuation: boundStory([{ role: "user", text: "continue" }], "history"), memoryOverrides: { includedIds: ["e"], excludedIds: [] } } })).toBe(true);
    expect(validDataRecord({ kind: "snapshot", id: "s", data: { ...snapshot, continuation: { version: 99 } } })).toBe(false);
    expect(validStoryContinuation({ version: 1, turns: [{ role: "system", text: "a" }], partial: false, omittedTurns: 0, source: "history" })).toBe(false);
    expect(parseBackupSettings({})).toMatchObject({ contextWarningsEnabled: true, chatContextCapacity: 1_000_000 });
    expect(() => parseBackupSettings({ chatContextCapacity: -10 })).toThrow();
  });
});
describe("honest capacity warnings", () => {
  it.each([[899999, 0], [900000, 1], [969999, 1], [970000, 2], [1100000, 2]])("classifies %i estimated tokens as level %i", (tokens, expected) => {
    expect(contextWarningLevel({ estimatedTokens: tokens, messageCount: 20, atLeast: false }, 1_000_000)).toBe(expected);
  });
  it("uses a configured guide, rejects empty, invalid and unknown counts", () => {
    expect(contextWarningLevel({ estimatedTokens: 9500, messageCount: 2, atLeast: true }, 10_000)).toBe(1);
    expect(contextWarningLevel(null, 10_000)).toBe(0);
    expect(contextWarningLevel({ estimatedTokens: NaN, messageCount: 2, atLeast: false }, 10_000)).toBe(0);
    expect(contextWarningLevel({ estimatedTokens: 9500, messageCount: 0, atLeast: false }, 10_000)).toBe(0);
    expect(chatCapacity(1)).toBe(1_000_000);
  });
});
