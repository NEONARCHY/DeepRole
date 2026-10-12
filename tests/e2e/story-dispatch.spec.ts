import { expect, test, type Page, type Route } from "@playwright/test";

async function install(page: Page) {
  await page.goto("/tests/fixtures/deepseek.html");
  await page.evaluate(async () => {
    const state = { packets: [] as any[], contexts: [] as any[], responses: [] as Response[], invalid: false, pending: {} as Record<string, Promise<unknown>> };
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => { const response = await originalFetch(input, init); state.responses.push(response); return response; };
    (window as any).dispatchTest = state;
    const validateUrl = "/src/core/story-dispatch.ts", bridgeUrl = "/src/entrypoints/injected.ts";
    const { validStoryDispatchPacket } = await import(validateUrl);
    window.addEventListener("message", event => {
      if (event.source !== window || event.data?.source !== "deeprole-page-bridge") return;
      if (event.data.type === "REQUEST_CONTEXT") {
        state.contexts.push(event.data);
        window.postMessage({ source: "deeprole-extension", type: "CONTEXT_READY", id: event.data.id, ok: true, context: "" }, location.origin);
      }
      if (event.data.type === "NATIVE_STORY_DISPATCH") {
        const { source, type, ...packet } = event.data; state.invalid ||= !validStoryDispatchPacket(packet); state.packets.push(packet);
      }
    });
    (window as any).defineUnlistedScript = (callback: () => void) => callback;
    const bridge = await import(bridgeUrl); bridge.default();
  });
}
const packetList = (page: Page) => page.evaluate(() => (window as any).dispatchTest.packets as any[]);
function safe(packets: any[]) { expect(JSON.stringify(packets)).not.toMatch(/PRIVATE|completion|prompt|reply|url|token|Authorization/); }

test("ordinary real fetch keeps exact request metadata and leaves the returned response unread", async ({ page }) => {
  const received: any[] = [];
  await page.route("**/api/v0/chat/completion", route => {
    received.push(route.request().postDataJSON());
    return route.fulfill({ status: received.length === 2 ? 503 : 200, contentType: "text/event-stream", body: "data: PRIVATE_STREAM\n\n" });
  });
  await install(page);
  const responses = await page.evaluate(async () => {
    const results = [];
    for (const parent of [null, 0, "native-42"]) {
      const response = await fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ prompt: "PRIVATE_DRAFT", chat_session_id: "fixture-chat", parent_message_id: parent }) });
      results.push({ status: response.status, bodyUsed: response.bodyUsed, original: response === (window as any).dispatchTest.responses.at(-1) });
    }
    return results;
  });
  expect(responses).toEqual([{ status: 200, bodyUsed: false, original: true }, { status: 503, bodyUsed: false, original: true }, { status: 200, bodyUsed: false, original: true }]);
  await expect.poll(async () => (await packetList(page)).length).toBe(6);
  const packets = await packetList(page), contexts = await page.evaluate(() => (window as any).dispatchTest.contexts);
  for (let index = 0; index < 3; index++) {
    expect(packets[index * 2]).toEqual({ requestId: contexts[index].id, identity: contexts[index].storyIdentity, transport: "fetch", phase: "started" });
    expect(packets[index * 2 + 1].delivery).toEqual(index === 1 ? { status: "failed", code: "http", httpStatus: 503 } : { status: "accepted", httpStatus: 200 });
  }
  expect(received).toEqual([null, 0, "native-42"].map(parent_message_id => ({ prompt: "PRIVATE_DRAFT", chat_session_id: "fixture-chat", parent_message_id })));
  safe(packets); expect(await page.evaluate(() => (window as any).dispatchTest.invalid)).toBe(false);
});

test("real fetch cancellation and out-of-order headers never cross native parents or retry", async ({ page }) => {
  const held = new Map<string, Route>();
  await page.route("**/api/v0/chat/completion?turn=*", route => { held.set(new URL(route.request().url()).searchParams.get("turn")!, route); });
  await install(page);
  await page.evaluate(() => {
    const state = (window as any).dispatchTest;
    state.controller = new AbortController();
    for (const parent of [41, 42]) state.pending[parent] = fetch(`/api/v0/chat/completion?turn=${parent}`, { method: "POST", signal: parent === 41 ? state.controller.signal : undefined,
      body: JSON.stringify({ prompt: "PRIVATE_DRAFT", chat_session_id: "fixture-chat", parent_message_id: parent }) }).then(r => ({ status: r.status, bodyUsed: r.bodyUsed }), e => ({ name: e.name }));
  });
  await expect.poll(() => held.size).toBe(2); await expect.poll(async () => (await packetList(page)).length).toBe(2);
  await held.get("42")!.fulfill({ status: 200, body: "PRIVATE_STREAM" });
  expect(await page.evaluate(() => (window as any).dispatchTest.pending[42])).toEqual({ status: 200, bodyUsed: false });
  await page.evaluate(() => (window as any).dispatchTest.controller.abort());
  expect(await page.evaluate(() => (window as any).dispatchTest.pending[41])).toEqual({ name: "AbortError" });
  await expect.poll(async () => (await packetList(page)).length).toBe(4);
  await held.get("41")!.fulfill({ status: 200, body: "LATE_PRIVATE_STREAM" }).catch(() => undefined);
  const packets = await packetList(page), settled = packets.filter(packet => packet.phase === "settled");
  expect(settled).toMatchObject([
    { identity: { nativeParentKey: '["message","42"]' }, delivery: { status: "accepted", httpStatus: 200 } },
    { identity: { nativeParentKey: '["message","41"]' }, delivery: { status: "failed", code: "aborted" } },
  ]);
  expect(new Set(packets.map(packet => packet.requestId)).size).toBe(2); expect(held.size).toBe(2); safe(packets);
});

test("real XHR reuse settles the replaced call once without reading response text", async ({ page }) => {
  const held = new Map<string, Route>();
  await page.route("**/api/v0/chat/completion?turn=*", route => { held.set(new URL(route.request().url()).searchParams.get("turn")!, route); });
  await install(page);
  const send = (parent: number) => page.evaluate(parent => {
    const state = (window as any).dispatchTest, xhr: XMLHttpRequest = state.xhr ??= new XMLHttpRequest();
    xhr.open("POST", `/api/v0/chat/completion?turn=${parent}`);
    state.pending[parent] = new Promise(resolve => { xhr.addEventListener("load", () => resolve(xhr.status), { once: true }); });
    xhr.send(JSON.stringify({ prompt: "PRIVATE_DRAFT", chat_session_id: "fixture-chat", parent_message_id: parent }));
  }, parent);
  await send(41); await expect.poll(() => held.size).toBe(1); await expect.poll(async () => (await packetList(page)).length).toBe(1);
  await send(42); await expect.poll(() => held.size).toBe(2);
  await held.get("42")!.fulfill({ status: 200, body: "PRIVATE_STREAM" });
  expect(await page.evaluate(() => (window as any).dispatchTest.pending[42])).toBe(200);
  await expect.poll(async () => (await packetList(page)).length).toBe(4);
  await held.get("41")!.fulfill({ status: 200, body: "LATE_PRIVATE_STREAM" }).catch(() => undefined);
  const packets = await packetList(page);
  expect(packets.filter(packet => packet.phase === "settled")).toMatchObject([
    { identity: { nativeParentKey: '["message","41"]' }, delivery: { status: "failed", code: "superseded" } },
    { identity: { nativeParentKey: '["message","42"]' }, delivery: { status: "accepted", httpStatus: 200 } },
  ]); safe(packets); expect(await page.evaluate(() => (window as any).dispatchTest.invalid)).toBe(false);
});
