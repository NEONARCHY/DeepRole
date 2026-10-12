import { describe, expect, it } from "vitest";
import { createStoryDispatchTracker, validStoryDispatchPacket, type StoryDispatchIdentity, type StoryDispatchPacket } from "../src/core/story-dispatch";

const input = (): StoryDispatchIdentity => ({ requestId: "call-123", identity: { chatId: "synthetic-chat", nativeParentKey: '["message","42"]' } });
function setup(transport: "fetch" | "xhr" = "fetch") {
  const packets: StoryDispatchPacket[] = [];
  const tracker = createStoryDispatchTracker(input(), transport, packet => packets.push(packet))!;
  return { tracker, packets };
}
describe("transient outgoing story dispatch metadata", () => {
  it.each(["fetch", "xhr"] as const)("publishes one start and one HTTP outcome for %s, never reply completion", transport => {
    const { tracker, packets } = setup(transport);
    expect(tracker.headers(200)).toBe(false);
    expect(tracker.fail("aborted")).toBe(false);
    expect(tracker.start()).toBe(true); expect(tracker.start()).toBe(false);
    expect(tracker.headers(200)).toBe(true);
    expect(tracker.fail("network")).toBe(false); expect(tracker.headers(503)).toBe(false);
    expect(packets).toEqual([
      { ...input(), transport, phase: "started" },
      { ...input(), transport, phase: "settled", delivery: { status: "accepted", httpStatus: 200 } },
    ]);
    for (const packet of packets) expect(validStoryDispatchPacket(packet)).toBe(true);
    expect(JSON.stringify(packets)).not.toMatch(/completion|prompt|quote|token|reply|url/i);
  });
  it.each([200, 201, 204, 299])("accepts HTTP %s without claiming a finished response", httpStatus => {
    const { tracker, packets } = setup(); tracker.start(); tracker.headers(httpStatus);
    expect(packets[1]).toMatchObject({ delivery: { status: "accepted", httpStatus } });
  });
  it.each([100, 199, 300, 401, 429, 500, 599])("records HTTP rejection %s once", httpStatus => {
    const { tracker, packets } = setup(); tracker.start(); tracker.headers(httpStatus); tracker.fail("network");
    expect(packets).toHaveLength(2); expect(packets[1]).toMatchObject({ delivery: { status: "failed", code: "http", httpStatus } });
  });
  it.each([0, 600, NaN, 200.5, "200", null, undefined])("does not treat unavailable/invalid status %s as accepted", status => {
    const { tracker, packets } = setup(); tracker.start(); tracker.headers(status as number);
    expect(packets[1]).toMatchObject({ delivery: { status: "failed", code: "unavailable" } });
    expect(validStoryDispatchPacket(packets[1])).toBe(true);
  });
  it("does not accept a redirected 200 as delivery to the original endpoint", () => {
    const { tracker, packets } = setup(); tracker.start(); tracker.headers(200, true);
    expect(packets[1]).toMatchObject({ delivery: { status: "failed", code: "redirected", httpStatus: 200 } });
  });
  it.each(["aborted", "network", "superseded"] as const)("does not replace %s by late successful headers", code => {
    const { tracker, packets } = setup(); tracker.start(); tracker.fail(code); tracker.headers(200);
    expect(packets).toHaveLength(2); expect(packets[1]).toMatchObject({ delivery: { status: "failed", code } });
  });
  it("snapshots the original native parent and protects it from emitted packet mutation", () => {
    const original = input(); const packets: StoryDispatchPacket[] = [];
    const tracker = createStoryDispatchTracker(original, "xhr", packet => packets.push(packet))!;
    original.requestId = "new-call"; original.identity.chatId = "different-chat";
    tracker.start(); packets[0]!.identity.nativeParentKey = null;
    tracker.headers(200);
    expect(packets[1]).toMatchObject({ ...input(), transport: "xhr" });
  });
  it("does not let a broken reporter prevent sending or leak duplicate outcomes", () => {
    let calls = 0;
    const tracker = createStoryDispatchTracker(input(), "fetch", () => { calls++; throw new Error("reporter broken"); })!;
    expect(() => { tracker.start(); tracker.headers(200); tracker.fail("network"); }).not.toThrow();
    expect(calls).toBe(2);
  });
  it.each([undefined, {}, { ...input(), secret: "not-permitted" }, { ...input(), requestId: "bad/id" }, { ...input(), identity: { chatId: "synthetic-chat" } }])("does not guess missing identity or accept excess capture data", value => {
    expect(createStoryDispatchTracker(value as StoryDispatchIdentity, "fetch", () => undefined)).toBeNull();
  });
  it("rejects an unknown runtime transport", () => {
    expect(createStoryDispatchTracker(input(), "other" as "fetch", () => undefined)).toBeNull();
  });
  it.each([null, '["message","0"]', '["message","null"]'])("preserves exact root/zero/string-null parent %s", nativeParentKey => {
    const packets: StoryDispatchPacket[] = [];
    createStoryDispatchTracker({ ...input(), identity: { chatId: "synthetic-chat", nativeParentKey } }, "fetch", p => packets.push(p))!.start();
    expect(packets[0]!.identity.nativeParentKey).toBe(nativeParentKey);
    expect(validStoryDispatchPacket(packets[0])).toBe(true);
  });
  const valid = () => ({ ...input(), transport: "fetch", phase: "settled", delivery: { status: "accepted", httpStatus: 200 } });
  it.each([undefined, null, [], 7, { ...valid(), delivery: null }, { ...valid(), delivery: [] }])("rejects non-object envelopes and delivery values %#", value => {
    expect(validStoryDispatchPacket(value)).toBe(false);
  });
  it.each([
    { ...valid(), url: "https://private.example" }, { ...valid(), prompt: "private text" }, { ...valid(), completion: "complete" },
    { ...valid(), requestId: "bad/id" }, { ...valid(), transport: "other" }, { ...valid(), phase: "complete" },
    { ...valid(), identity: { ...input().identity, text: "private text" } },
    { ...valid(), identity: { chatId: "synthetic-chat", nativeParentKey: "42" } },
    { ...valid(), delivery: { status: "accepted", httpStatus: 503 } },
    { ...valid(), delivery: { status: "accepted", httpStatus: 200, replyId: "42" } },
    { ...valid(), delivery: { status: "failed", code: "http" } },
    { ...valid(), delivery: { status: "failed", code: "http", httpStatus: 200 } },
    { ...valid(), delivery: { status: "failed", code: "network", httpStatus: undefined } },
    { ...valid(), delivery: { status: "failed", code: "unknown" } },
    { ...valid(), delivery: { status: "failed", code: "network", error: "private text" } },
    { ...input(), transport: "fetch", phase: "started", delivery: { status: "accepted", httpStatus: 200 } },
  ])("rejects malformed packets and content-bearing extras %#", value => {
    expect(validStoryDispatchPacket(value)).toBe(false);
  });
});
