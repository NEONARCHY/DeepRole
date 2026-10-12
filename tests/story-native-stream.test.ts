import { describe, expect, it } from "vitest";
import { createNativeStoryStreamObserver, validNativeStoryStreamPacket, type NativeStoryStreamPacket } from "../src/core/story-native-stream";
const route = { requestId: "local-request", identity: { chatId: "chat", nativeParentKey: '["message","42"]' } };
const ready = 'event: ready\ndata: {"request_message_id":43,"response_message_id":44,"model_type":"PRIVATE_MODEL"}\n\n';
const delta = 'data: {"p":"response/fragments/0/content","o":"APPEND","v":"PRIVATE_REPLY_PRIVATE_THOUGHTS"}\n\n';
const finish = 'event: finish\ndata: {}\n\n', close = 'event: close\ndata: {"click_behavior":"none"}\n\n';
function observer() {
  const packets: NativeStoryStreamPacket[] = [], reader = createNativeStoryStreamObserver(route, p => packets.push(p))!;
  return { reader, packets };
}
describe("bounded SSE metadata observer, never a completion/selection proof", () => {
  it.each(["whole", "characters", "crlf", "cr"])("captures exact wire IDs while dropping content with %s chunks", style => {
    const { reader, packets } = observer(); let text = ready + delta + finish + close;
    if (style === "crlf") text = text.replaceAll("\n", "\r\n"); if (style === "cr") text = text.replaceAll("\n", "\r");
    if (style === "whole") reader.feed(text); else for (const char of text) reader.feed(char);
    reader.end(); expect(packets.map(p => p.phase)).toEqual(["ready", "finish", "closed"]);
    expect(packets[0]!.link).toEqual({ requestId: "local-request", chatId: "chat", nativeParentKey: '["message","42"]', userMessageKey: '["message","43"]', assistantMessageKey: '["message","44"]' });
    expect(packets.every(validNativeStoryStreamPacket)).toBe(true); expect(JSON.stringify(packets)).not.toMatch(/PRIVATE|fragments|content|model|completion|selected/);
  });
  it("does not let SSE id/retry, JSON echoes, EOF or HTTP alone create a link", () => {
    const { reader, packets } = observer(); reader.feed('id: 44\nretry: 1\n: heartbeat\ndata: {"requestId":"local-request","response_message_id":44}\n\n');
    expect(packets).toEqual([]); reader.end(); expect(packets).toMatchObject([{ phase: "failed", link: null, sawFinish: false, issue: "format" }]);
  });
  it.each([ready + ready, finish, close, 'event: ready\ndata: not-json\n\n', ready.replace('43', '"43"'), ready.replace('43', '44'), ready.replace('43', '-1'), ready.replace('43', '1.2'), 'event: unknown\ndata: PRIVATE\n\n'])("pauses malformed or out-of-order metadata %#", text => {
    const { reader, packets } = observer(); reader.feed(text); reader.feed(ready + finish + close); reader.end();
    expect(packets.at(-1)).toMatchObject({ phase: "failed", issue: "format" }); expect(packets.filter(p => p.phase === "failed")).toHaveLength(1); expect(packets.some(p => p.phase === "closed")).toBe(false);
  });
  it.each(["aborted", "network", "superseded"] as const)("keeps %s independent from already accepted HTTP delivery", issue => {
    const { reader, packets } = observer(); reader.feed(ready + delta); reader.fail(issue); reader.feed(finish + close); reader.end();
    expect(packets.map(p => p.phase)).toEqual(["ready", "failed"]); expect(packets.at(-1)).toMatchObject({ link: { assistantMessageKey: '["message","44"]' }, issue });
  });
  it.each(["hint", "toast"])("does not emit the private %s text or call it a successful reply", name => {
    const { reader, packets } = observer(); reader.feed(ready + `event: ${name}\ndata: {"content":"PRIVATE_REFUSAL"}\n\n` + finish + close);
    expect(packets.at(-1)).toMatchObject({ phase: "failed", issue: "native-hint" }); expect(JSON.stringify(packets)).not.toContain("PRIVATE");
  });
  it("records close without finish only as a wire close, never as completion", () => {
    const { reader, packets } = observer(); reader.feed(ready + close.replace('"none"', '"retry"')); reader.end();
    expect(packets.at(-1)).toMatchObject({ phase: "closed", sawFinish: false }); expect(validNativeStoryStreamPacket(packets.at(-1))).toBe(true);
  });
  it("does not promote an unterminated frame to a valid close at EOF", () => {
    const { reader, packets } = observer(); reader.feed(ready + finish + close.slice(0, -1)); reader.end();
    expect(packets.map(p => p.phase)).toEqual(["ready", "finish", "failed"]);
  });
  it.each([1_000_001, 30_000_001])("bounds a %i-character frame or stream", size => {
    const { reader, packets } = observer(); reader.feed(" ".repeat(size)); expect(packets).toMatchObject([{ phase: "failed", issue: "too-large", link: null }]);
  });
  it("isolates two routes and copies caller/emitted metadata", () => {
    const input = structuredClone(route), first: NativeStoryStreamPacket[] = [], second = observer();
    const reader = createNativeStoryStreamObserver(input, p => first.push(p))!; input.identity.chatId = "other";
    reader.feed(ready); first[0]!.identity.chatId = "mutated"; first[0]!.link!.assistantMessageKey = '["message","99"]';
    second.reader.feed(ready.replace('44', '45') + finish + close); reader.feed(finish + close);
    expect(first.at(-1)).toMatchObject({ identity: { chatId: "chat" }, link: { assistantMessageKey: '["message","44"]' } });
    expect(second.packets.at(-1)).toMatchObject({ link: { assistantMessageKey: '["message","45"]' } });
  });
  it("ignores reporter exceptions without blocking or retrying the website", () => {
    const reader = createNativeStoryStreamObserver(route, () => { throw Error("reporter"); })!;
    expect(() => reader.feed(ready + finish + close)).not.toThrow();
  });
  it.each([
    (p: any) => { p.content = "PRIVATE"; }, (p: any) => { p.issue = "PRIVATE"; }, (p: any) => { p.phase = "complete"; },
    (p: any) => { p.sawFinish = true; }, (p: any) => { p.link.requestId = "other"; }, (p: any) => { p.link.chatId = "other"; },
    (p: any) => { p.link.nativeParentKey = null; }, (p: any) => { p.link = null; }, (p: any) => { p.transport = "fetch"; },
  ])("rejects leaking/inconsistent packets %#", mutate => { const { reader, packets } = observer(); reader.feed(ready); mutate(packets[0]); expect(validNativeStoryStreamPacket(packets[0])).toBe(false); });
  it("does not observe absent/invalid captured native requests", () => {
    expect(createNativeStoryStreamObserver(undefined, () => {})).toBeNull(); expect(createNativeStoryStreamObserver({ ...route, identity: { chatId: "bad id", nativeParentKey: null } }, () => {})).toBeNull();
  });
});
