import { expect, it } from "vitest";
import { matchingStoryAssistantCapture, matchingStoryUserCaptures } from "../src/core/story-dispatch-match";
import { validStoryDispatchCapture, type StoryDispatchCapture } from "../src/core/story-dispatch-capture";
import { nativeStoryMessageKey as key, type NativeStorySample } from "../src/core/story-transport";

const scope = { bindingId: "binding", worldId: "world", chatId: "chat" };
const capture = (): StoryDispatchCapture => ({
  format: "deeprole-story-dispatch", contractVersion: 1, id: "capture-actual", bindingId: scope.bindingId, worldId: scope.worldId,
  identity: { chatId: scope.chatId, nativeParentKey: key("2") }, ownerTabId: 7, origin: "local", purpose: "user-turn",
  transport: "xhr", sceneRevision: null, originalDraft: "Act", proposedContext: "Memory", injection: "context",
  started: true, delivery: { status: "accepted", httpStatus: 200 }, createdAt: 1, updatedAt: 1,
  wire: { phase: "ready", link: { requestId: "capture-actual", chatId: scope.chatId, nativeParentKey: key("2"), userMessageKey: key("3"), assistantMessageKey: key("4") }, sawFinish: false, issue: null },
  roleRoster: [{ id: "nora", name: "Nora", aliases: [] }],
});
const make = capture;
const user = (): NativeStorySample => ({ identity: { role: "user", nativeParentKey: key("2"), nativeMessageKey: key("3") }, content: "Memory\n\n[User message]\nAct", completion: "complete" });
const assistant = (): NativeStorySample => ({ identity: { role: "assistant", nativeParentKey: key("3"), nativeMessageKey: key("4") }, content: "Nora promised.", completion: "complete" });
const match = (rows: StoryDispatchCapture[], u = user(), a = assistant()) => matchingStoryAssistantCapture(matchingStoryUserCaptures(rows, scope, u), a);

it("uses an exact immutable wire pair, independent of record order", () => {
  const actual = make(), other = make(); other.id = "capture-other"; other.wire.link!.requestId = other.id; other.wire.link!.assistantMessageKey = key("99");
  expect(validStoryDispatchCapture(actual)).toBe(true); expect(validStoryDispatchCapture(other)).toBe(true);
  const before = structuredClone([actual, other]);
  expect(match([other, actual])?.id).toBe(actual.id); expect(match([actual, other])?.id).toBe(actual.id);
  expect([actual, other]).toEqual(before);
});
it.each(["binding", "world", "chat", "parent", "user", "assistant", "draft", "prefix", "unconfirmed", "failed", "missing-link", "invalid-roster"])("does not infer a pair from %s evidence", mode => {
  const c = make();
  if (mode === "binding") c.bindingId = "another";
  if (mode === "world") c.worldId = "another";
  if (mode === "chat") { c.identity.chatId = "another"; c.wire.link!.chatId = "another"; }
  if (mode === "parent") { c.identity.nativeParentKey = key("77"); c.wire.link!.nativeParentKey = key("77"); }
  if (mode === "user") c.wire.link!.userMessageKey = key("77");
  if (mode === "assistant") c.wire.link!.assistantMessageKey = key("77");
  if (mode === "draft") c.originalDraft = "Different";
  if (mode === "prefix") c.proposedContext += " changed";
  if (mode === "unconfirmed" || mode === "failed" || mode === "missing-link") {
    c.wire = { phase: "waiting", link: null, sawFinish: false, issue: null };
    if (mode === "unconfirmed") { c.injection = "unconfirmed"; c.started = false; c.delivery = null; }
    if (mode === "failed") c.delivery = { status: "failed", code: "aborted" };
  }
  if (mode === "invalid-roster") c.roleRoster!.push(structuredClone(c.roleRoster![0]!));
  expect(validStoryDispatchCapture(c)).toBe(mode !== "invalid-roster"); expect(match([c])).toBeUndefined();
});
it.each(["user-partial", "assistant-partial", "wrong-user-role", "wrong-assistant-role", "wrong-assistant-parent", "body-substring"])("requires complete native identities: %s", mode => {
  const c = make(), u = user(), a = assistant();
  if (mode === "user-partial") u.completion = "partial";
  if (mode === "assistant-partial") a.completion = "partial";
  if (mode === "wrong-user-role") u.identity.role = "assistant";
  if (mode === "wrong-assistant-role") a.identity.role = "user";
  if (mode === "wrong-assistant-parent") a.identity.nativeParentKey = key("99");
  if (mode === "body-substring") u.content += " more";
  expect(match([c], u, a)).toBeUndefined();
});
it("abstains from multiple exact claims regardless of matching or changed rosters", () => {
  const a = make(), b = make(); b.id = "capture-other"; b.wire.link!.requestId = b.id;
  expect(match([a, b])).toBeUndefined(); expect(match([b, a])).toBeUndefined();
  b.roleRoster![0]!.id = "another-nora"; expect(match([a, b])).toBeUndefined();
});
it("retains only the sole scoped fetch fallback, never a competing request", () => {
  const f = make(); f.transport = "fetch"; f.wire = { phase: "waiting", link: null, sawFinish: false, issue: null };
  expect(validStoryDispatchCapture(f)).toBe(true); expect(match([f])?.id).toBe(f.id);
  const wrong = make(); wrong.wire.link!.assistantMessageKey = key("99");
  expect(match([wrong, f])).toBeUndefined();
});
it("keeps historical restored records readable without granting local send authority", () => {
  const c = make(); c.origin = "restored"; expect(validStoryDispatchCapture(c)).toBe(true);
  expect(match([c])?.origin).toBe("restored");
});
