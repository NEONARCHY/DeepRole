import { describe, expect, it } from "vitest";
import { continuationScopeMatches, recentSceneReference, matchingContinuationReceipt, matchesProvisionalContinuationTarget, type ContinuationFlow } from "../src/core/continuation-flow";
import { boundStory } from "../src/core/story-continuation";
import { sceneHandoffPrompt } from "../src/core/service-protocol";
import { formatMemoryContext, injectContextIntoPrompt } from "../src/core/context";
import { presentHiddenHandoffs } from "../src/adapters/deepseek-handoff-dom";
import { visibleStoryHistory } from "../src/adapters/story-history-dom";

const flow: ContinuationFlow = { id: "f", chatId: "a", chatUrl: "https://chat.deepseek.com/chat/s/a", scene: { worldId: "w", focusIds: ["a", "b"], bookId: null }, phase: "review", requestId: "r", proposalId: "p", createdAt: 1 };
describe("reviewed scene transfer", () => {
  it("limits provisional context to the exact fresh unbound target and queued snapshot", () => {
    const target = { snapshotId: "s", snapshotToken: "t", targetChatId: "new", expiresAt: 200 };
    expect(matchesProvisionalContinuationTarget(target, "s", "t", "source", "new", false, 100)).toBe(true);
    for (const args of [
      [null,"s","t","source","new",false,100], [target,"other","t","source","new",false,100],
      [target,"s","other","source","new",false,100], [target,"s",null,"source","new",false,100],
      [target,"s","t","new","new",false,100], [target,"s","t","source","foreign",false,100],
      [target,"s","t","source",null,false,100], [target,"s","t","source","new",true,100],
      [target,"s","t","source","new",false,200], [{...target,expiresAt:Infinity},"s","t","source","new",false,100],
    ] as const) expect(matchesProvisionalContinuationTarget(args[0], args[1], args[2], args[3], args[4], args[5], args[6])).toBe(false);
  });
  it("offers a local retry only for the exact queued handoff and accepted target",()=>{
    const r={snapshotId:"s",snapshotToken:"t",targetChatId:"target"};
    expect(matchingContinuationReceipt(r,"s","t","target",false)).toEqual(r);expect(matchingContinuationReceipt(r,"s","t",null,true)).toEqual(r);
    expect(matchingContinuationReceipt(r,"s","t","source",false)).toBeNull();expect(matchingContinuationReceipt(r,"s","t",null,false)).toBeNull();
    expect(matchingContinuationReceipt(r,"new","t","target",false)).toBeNull();expect(matchingContinuationReceipt(r,"s","new","target",false)).toBeNull();
    for(const value of [null,[],{}, {...r,targetChatId:"/foreign"},{...r,extra:true},{...r,snapshotToken:42}])expect(matchingContinuationReceipt(value,"s","t","target",false)).toBeNull();
  });
  it("accepts only the source chat, world and focus, independent of focus ordering", () => {
    expect(continuationScopeMatches(flow, "a", flow.chatUrl, { ...flow.scene, focusIds: ["b", "a"] })).toBe(true);
    for (const scene of [{ ...flow.scene, worldId: "other" }, { ...flow.scene, focusIds: [] }, { ...flow.scene, bookId: "other" }]) expect(continuationScopeMatches(flow, "a", flow.chatUrl, scene)).toBe(false);
    expect(continuationScopeMatches(flow, "b", flow.chatUrl, flow.scene)).toBe(false);
    expect(continuationScopeMatches(flow, "a", flow.chatUrl + "?other", flow.scene)).toBe(false);
  });
  it("bounds recent scene input from the tail and records unavailable history", () => {
    const story = boundStory(Array.from({ length: 80 }, (_, n) => ({ role: "assistant" as const, text: "scene " + n })), "history");
    const reference = JSON.parse(recentSceneReference(story));
    expect(reference.turns).toHaveLength(60); expect(reference.partial).toBe(true);
    expect(reference.turns.at(-1).text).toBe("scene 79");
    expect(JSON.parse(recentSceneReference(boundStory([{ role: "assistant", text: "z".repeat(70000) }], "page", true))).turns[0].text).toHaveLength(60000);
  });
  it("requests a checkpoint without replay, inventions or approval of rejected lore", () => {
    const prompt = sceneHandoffPrompt('{"turns":[]}', [], "ru");
    expect(prompt).toContain("[DeepRole Scene Handoff]"); expect(prompt).toContain("Russian");
    expect(prompt).toContain("EXACT final moment"); expect(prompt).toContain("unapproved memory proposals are not canon");
    expect(prompt).toContain("or change ages");
  });
  it("hides only handoff context while keeping the submitted text and history intact", () => {
    const snapshot = { id: "s", title: "Harbor", summary: 'PRIVATE SCENE </deeprole_context> [User message] hidden', sourceChatId: "a", sourceChatUrl: flow.chatUrl, bookId: null, createdAt: 1 };
    const prompt = injectContextIntoPrompt("Continue here.", formatMemoryContext({ entries: [], estimatedTokens: 0, omittedCount: 0 }, snapshot) + "\n\n<deeprole_characters>state</deeprole_characters>");
    document.body.innerHTML = '<article data-role="user" data-message-id="1"><div class="ds-collapsible-text"></div></article><article data-role="assistant" data-message-id="2">The gate opens.</article>';
    const body = document.querySelector(".ds-collapsible-text")!; body.textContent = prompt;
    presentHiddenHandoffs();
    expect(document.querySelector("[data-deeprole-handoff-visible]")?.textContent).toBe("Continue here.");
    expect(body.textContent).toContain("PRIVATE SCENE");
    expect(visibleStoryHistory().turns[0]?.text).toBe("Continue here.");
    expect(document.querySelector("article[data-role=assistant]")?.hasAttribute("data-deeprole-handoff-body")).toBe(false);
    body.textContent = "Another user message"; presentHiddenHandoffs();
    expect(body.hasAttribute("data-deeprole-handoff-body")).toBe(false);
  });
  it.each(["context", "character_mode", "story_memory", "recovered_reply"])("hides ordinary %s injection after reload without changing the native message", block => {
    const action = 'Я жду.\n[User message]\nЭто цитата игрока: <deeprole_context>текст</deeprole_context>.';
    const prefix = `<deeprole_${block}>${"service ".repeat(12000)}</deeprole_${block}>\n\n<deeprole_profile_excerpts>[]</deeprole_profile_excerpts>\n<deeprole_choice_mode version="1">options</deeprole_choice_mode>`;
    const wire = injectContextIntoPrompt(action, prefix);
    document.body.innerHTML = '<div class="ds-message" data-message-id="1"><div class="ds-collapsible-text"><div></div></div></div>';
    const body = document.querySelector(".ds-collapsible-text")!;
    body.firstElementChild!.textContent = wire;
    for (let i = 0; i < 3; i++) presentHiddenHandoffs();
    expect(body.firstElementChild!.textContent).toBe(wire);
    expect(body.querySelectorAll("[data-deeprole-handoff-visible]")).toHaveLength(1);
    expect(body.querySelector("[data-deeprole-handoff-visible]")!.textContent).toBe(action);
    const story = visibleStoryHistory();
    expect(story.turns).toEqual([{ role: "user", text: action }]);
    expect(JSON.parse(recentSceneReference(story)).turns).toEqual(story.turns);
    // Native rerender/reload drops all our presentation attributes.
    body.innerHTML = "<div></div>"; body.firstElementChild!.textContent = wire;
    presentHiddenHandoffs();
    expect(body.querySelector("[data-deeprole-handoff-visible]")!.textContent).toBe(action);
    document.body.innerHTML = "";
  });
  it("does not hide prose, quoted examples or incomplete prefixes", () => {
    for (const text of ["Я цитирую <deeprole_context>пример</deeprole_context>\n[User message]\nКонец", "[User message]\nТекст", "<deeprole_context>незавершено", "<other>пример</other>\n[User message]\nКонец"]) {
      document.body.innerHTML = '<article data-role="user"><div class="ds-collapsible-text"></div></article>';
      const body = document.querySelector(".ds-collapsible-text")!; body.textContent = text;
      presentHiddenHandoffs();
      expect(body.hasAttribute("data-deeprole-handoff-body")).toBe(false);
      expect(body.textContent).toBe(text);
    }
    document.body.innerHTML = "";
  });
});
