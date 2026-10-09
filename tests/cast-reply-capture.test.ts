import { afterEach, expect, it, vi } from "vitest";
import { CastReplyCapture, completeCastReply } from "../src/adapters/cast-reply-capture";
import { castDraft } from "./fixtures/cast-data";
const request = "cast-job", marker = "[Request ID: cast-job-1]", refusal = "Sorry, that's beyond my current scope. Let's talk about something else.";
const raw = () => "<deeprole_cast>" + JSON.stringify(castDraft(request)) + "</deeprole_cast>";
const captures: CastReplyCapture[] = [];
afterEach(() => { captures.forEach(c => c.stop()); captures.length = 0; document.body.innerHTML = ""; history.replaceState({}, "", "/"); });
function fixture() {
  history.replaceState({}, "", "/chat/s/owned");
  document.body.innerHTML = '<article data-message-role="user">' + marker + '</article><article data-message-role="assistant" data-message-id="r1"><div class="ds-think-content"></div><div class="ds-assistant-message-main-content"></div></article>';
  const remember = vi.fn(), c = new CastReplyCapture(request, marker, true, document, remember); captures.push(c); c.start();
  return { c, remember, body: document.querySelector<HTMLElement>(".ds-assistant-message-main-content")! };
}
const tick = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };
it("accepts only complete matching transport data, not partial, old, or oversized JSON", () => {
  expect(completeCastReply(raw(), request)).toBe(true);
  expect(completeCastReply(JSON.stringify(castDraft(request)), request)).toBe(true);
  expect(completeCastReply(raw().slice(0, -5), request)).toBe(false);
  expect(completeCastReply(raw(), "different")).toBe(false);
  expect(completeCastReply("x".repeat(180001), request)).toBe(false);
  expect(completeCastReply(raw() + raw(), request)).toBe(false);
});
it("captures a complete streamed answer before a refusal and resolves it for the parser", async () => {
  const f = fixture(); f.body.textContent = raw(); await tick();
  f.body.textContent = refusal; await tick();
  expect(f.c.resolve(f.c.scan())).toEqual({ raw: raw(), recovered: true });
  expect(f.remember).toHaveBeenCalledExactlyOnceWith(raw(), JSON.stringify(["message", "r1"]));
});
it("recovers text mounted and replaced in the same mutation batch", async () => {
  const f = fixture(); f.body.textContent = raw(); f.body.textContent = refusal; await tick();
  expect(f.c.resolve(f.c.scan())).toEqual({ raw: raw(), recovered: true });
});
it("recovers old characterData in the same microtask", async () => {
  const f = fixture(); const text = document.createTextNode(""); f.body.append(text); await tick();
  text.data = raw(); text.data = refusal; await tick();
  expect(f.c.resolve(f.c.scan()).recovered).toBe(true);
});
it("recovers a complete answer split across removed Markdown nodes", async () => {
  const f = fixture(), answer = raw(), cut = answer.indexOf('"characters"');
  const first = document.createElement("span"), second = document.createElement("span"); first.textContent = answer.slice(0, cut); second.textContent = answer.slice(cut);
  f.body.append(first, second); f.body.replaceChildren(document.createTextNode(refusal)); await tick();
  expect(f.c.resolve(f.c.scan())).toEqual({ raw: answer, recovered: true });
});
it("ignores complete JSON in reasoning, neighboring turns and an old request", async () => {
  const f = fixture(); document.querySelector(".ds-think-content")!.textContent = raw(); f.body.textContent = refusal;
  const neighbor = document.createElement("article"); neighbor.dataset.messageRole = "assistant"; neighbor.textContent = raw(); document.body.append(neighbor); await tick();
  expect(f.c.resolve(f.c.scan()).recovered).toBe(false); expect(f.remember).not.toHaveBeenCalled();
  document.querySelector("[data-message-role=user]")!.textContent = "[Request ID: cast-job-1-repair]"; f.body.textContent = raw(); await tick();
  expect(f.c.resolve(f.c.scan()).recovered).toBe(false); expect(f.remember).not.toHaveBeenCalled();
});
it("never captures a reasoning Markdown fallback when the final answer is empty", async () => {
  const f = fixture(); f.body.remove(); const markdown = document.createElement("div"); markdown.className = "ds-markdown"; markdown.textContent = raw(); document.querySelector(".ds-think-content")!.append(markdown); await tick();
  expect(f.c.scan()).toBe(""); expect(f.remember).not.toHaveBeenCalled();
});
it("does not recover a cut first character or never received data", async () => {
  const f = fixture(); f.body.textContent = raw().slice(0, 100); await tick(); f.body.textContent = refusal; await tick();
  expect(f.c.resolve(f.c.scan())).toEqual({ raw: refusal, recovered: false });
});
it("reads multiple Markdown blocks belonging to one final reply", async () => {
  const f = fixture(), answer = raw(), cut = answer.indexOf('"characters"');
  const a = document.createElement("div"), b = document.createElement("div");
  a.className = b.className = "ds-markdown"; a.textContent = answer.slice(0, cut); b.textContent = answer.slice(cut);
  f.body.replaceWith(a, b); await tick();
  expect(f.c.resolve(f.c.scan())).toEqual({ raw: answer, recovered: false });
  b.textContent = refusal; a.remove(); await tick();
  expect(f.c.resolve(f.c.scan()).recovered).toBe(true);
});
it("keeps finished characters when the next character is cut and replaced", async () => {
  const f = fixture(), member = castDraft(request).characters[0]!;
  f.body.textContent = '<deeprole_cast>{"version":1,"request":"' + request + '","characters":[' + JSON.stringify(member) + ',{"key":"cut"';
  await tick(); f.body.textContent = refusal; await tick();
  const result = f.c.resolve(f.c.scan()); expect(result.recovered).toBe(true);
  const data = JSON.parse(result.raw.slice(15, -16)); expect(data.partial).toBe(true); expect(data.characters).toEqual([member]);
  expect(f.remember).toHaveBeenCalledOnce();
});
it("drops saved data on chat navigation or a different reply branch", async () => {
  const f = fixture(); f.body.textContent = raw(); await tick();
  f.body.parentElement!.dataset.messageId = "r2"; f.body.textContent = refusal;
  expect(f.c.resolve(f.c.scan()).recovered).toBe(false);
  f.body.textContent = raw(); await tick(); history.replaceState({}, "", "/chat/s/personal");
  expect(f.c.resolve(refusal).recovered).toBe(false);
});
it("restores an owned checkpoint after reload and tolerates request virtualization", () => {
  history.replaceState({}, "", "/chat/s/owned");
  document.body.innerHTML = '<article data-message-role="assistant" data-message-id="r1"><div class="ds-assistant-message-main-content"></div></article>';
  document.querySelector(".ds-assistant-message-main-content")!.textContent = refusal;
  const c = new CastReplyCapture(request, marker, true, document, vi.fn(), { step: 1, repair: false, chatId: "owned", replyIdentity: JSON.stringify(["message", "r1"]), raw: raw() }); captures.push(c); c.start();
  expect(c.resolve(c.scan())).toEqual({ raw: raw(), recovered: true });
});
it("prefers newer complete live data and stops observing on disposal", async () => {
  const f = fixture(); f.body.textContent = raw(); await tick();
  const updated = castDraft(request); updated.characters[0]!.sheet.appearance = "Green coat";
  const next = "<deeprole_cast>" + JSON.stringify(updated) + "</deeprole_cast>"; f.body.textContent = next; await tick();
  expect(f.c.resolve(f.c.scan())).toEqual({ raw: next, recovered: false });
  expect(f.remember.mock.calls.map(call => call[0])).toEqual([raw(), next]);
  f.c.stop(); f.body.textContent = refusal; await tick(); expect(f.c.resolve(refusal).recovered).toBe(false);
});
