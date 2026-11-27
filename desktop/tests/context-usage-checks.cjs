const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdir, mkdtemp, readFile, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { modelCatalog, modelProfile, modelLimits, fitMessages, availableMemoryBytes, earlierSceneQuery, withEarlierStoryScene } = require("../model-context.cjs");
const { chatRequest } = require("../chat-store.cjs");
const { recordUsage, readTokenUsage, estimatedCost, usageSummary } = require("../usage.cjs");
const { saveSpending, spendingNotices } = require("../spending.cjs");
const { imageRequest, imageReceipt, veniceCharges, memoryBudget, providerSettings, saveProvider } = require("../provider.cjs");

test("one catalog serves selection and context fitting, and refresh doesn't hold a warm request", async t => {
  const base = new URL("https://catalog.example.test/v1");
  const first = [{ id: "alpha", context_length: 12_000 }, { id: "beta", context_length: 16_000 }];
  const second = [{ id: "alpha", context_length: 20_000 }];
  const requests = [];
  let finishRefresh;
  const refresh = new Promise(resolve => { finishRefresh = resolve; });
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const key = options.headers.Authorization;
    requests.push({ url: url.href, key });
    if (key === "Bearer second-account") return Response.json({ data: second });
    if (requests.filter(request => request.key === key).length === 1) return Response.json({ data: first });
    await refresh;
    return Response.json({ data: second });
  });
  const signal = new AbortController().signal;
  try {
    assert.deepEqual(await modelCatalog(base, "first-account"), first);
    const beta = await modelProfile(base, "first-account", "beta", signal);
    assert.equal(beta.context_length, 16_000);
    assert.equal(requests.length, 1);
    assert.deepEqual(await modelCatalog(base, "second-account"), second);
    now += 300_001;
    const warmed = await modelProfile(base, "first-account", "alpha", AbortSignal.timeout(500));
    assert.equal(warmed.context_length, 12_000);
    assert.equal(requests.length, 3);
    finishRefresh();
    assert.deepEqual(await modelCatalog(base, "first-account"), second);
    assert.equal(requests.length, 3);
  } finally { finishRefresh(); }
});

test("a cold send starts before discovery and measures time to text separately from reasoning", { timeout: 3000 }, async t => {
  const data = await mkdtemp(join(tmpdir(), "DeepRole-timing-test-"));
  await writeFile(join(data, "model.json"), JSON.stringify({ baseUrl: "http://127.0.0.1:9902/v1", model: "slow-catalogue", maxTokens: 1024 }));
  let finishDiscovery;
  const discovery = new Promise(resolve => { finishDiscovery = resolve; });
  t.after(() => { finishDiscovery(); });
  let discoveryCalls = 0, completionCalls = 0, clock = 100;
  t.mock.method(Date, "now", () => 10_000);
  t.mock.method(performance, "now", () => clock);
  let upstream;
  const encoder = new TextEncoder();
  t.mock.method(globalThis, "fetch", async (target, options) => {
    if (target.pathname.endsWith("/models")) {
      discoveryCalls++;
      await discovery;
      return Response.json({ data: [{ id: "slow-catalogue", context_length: 256_000 }] });
    }
    completionCalls++;
    assert.equal(JSON.parse(options.body).client_started_at, undefined);
    return new Response(new ReadableStream({ start(stream) { upstream = stream; } }), { headers: { "Content-Type": "text/event-stream" } });
  });
  assert.ok(await memoryBudget(data, {}, 32, new AbortController().signal) > 0);
  const response = await chatRequest(data, {}, new Request("https://deeprole.local/api/v0/chat/completion", {
    method: "POST", body: JSON.stringify({ chat_session_id: "timed-reply", parent_message_id: null, visible: "Короткая реплика.", prompt: "Короткая реплика.", client_started_at: 9960 }),
  }));
  assert.equal(response.status, 200);
  assert.equal(completionCalls, 1);
  assert.equal(discoveryCalls, 1);
  const client = response.body.getReader();
  const read = async () => new TextDecoder().decode((await client.read()).value);
  const write = packet => upstream.enqueue(encoder.encode(`data: ${JSON.stringify(packet)}\n\n`));
  assert.match(await read(), /event: ready/);
  clock = 130;
  write({ choices: [{ delta: { reasoning_content: "Размышления." } }] });
  assert.match(await read(), /Размышления/);
  clock = 190;
  write({ choices: [{ delta: { content: "Ответ." } }] });
  assert.match(await read(), /Ответ/);
  clock = 250;
  upstream.enqueue(encoder.encode("data: [DONE]\n\n"));
  upstream.close();
  while (!(await client.read()).done) { /* Read through the save and close. */ }
  const saved = JSON.parse(await readFile(join(data, "Chats", "timed-reply.json"), "utf8"));
  assert.equal(saved.lastContext.windowSource, "fallback");
  assert.deepEqual(saved.lastContext.timings, { preparationMs: 40, firstTextMs: 90, totalMs: 150 });

  const oversizedBudget = memoryBudget(data, {}, 160_000, new AbortController().signal);
  finishDiscovery();
  assert.ok(await oversizedBudget > 0);
  assert.equal(discoveryCalls, 1);
});

test("cold discovery can expand the window before a long turn would drop dialogue", { timeout: 3000 }, async t => {
  const data = await mkdtemp(join(tmpdir(), "DeepRole-cold-history-test-"));
  const id = "long-cold-chat";
  await mkdir(join(data, "Chats"));
  await writeFile(join(data, "Chats", id + ".json"), JSON.stringify({ id, head: 2, title: "Long chat", messages: [
    { id: 1, parent: null, role: "user", visible: "One earlier scene. ".repeat(3000) },
    { id: 2, parent: 1, role: "assistant", text: "Another earlier scene. ".repeat(3000) },
  ] }));
  await writeFile(join(data, "model.json"), JSON.stringify({ baseUrl: "http://127.0.0.1:9903/v1", model: "wide", maxTokens: 1024 }));
  let announceDiscovery, finishDiscovery;
  const started = new Promise(resolve => { announceDiscovery = resolve; });
  const discovery = new Promise(resolve => { finishDiscovery = resolve; });
  t.after(() => { finishDiscovery(); });
  const posts = [];
  t.mock.method(globalThis, "fetch", async (target, options) => {
    if (target.pathname.endsWith("/models")) {
      announceDiscovery();
      await discovery;
      return Response.json({ data: [{ id: "wide", context_length: 256_000 }] });
    }
    posts.push(JSON.parse(options.body));
    return Response.json({ choices: [{ message: { content: "The scene continues." } }] });
  });
  const reply = chatRequest(data, {}, new Request("https://deeprole.local/api/v0/chat/completion", {
    method: "POST", body: JSON.stringify({ chat_session_id: id, parent_message_id: 2, visible: "Continue.", prompt: "Continue." }),
  }));
  await started;
  await new Promise(setImmediate);
  assert.equal(posts.length, 0);
  finishDiscovery();
  const response = await reply;
  assert.equal(response.status, 200);
  await response.text();
  assert.deepEqual(posts.map(post => post.messages.map(({ role }) => role)), [["system", "user", "assistant", "user"]]);
});

test("model window reserves the answer and keeps contiguous complete exchanges", () => {
  const limits = modelLimits({ maxTokens: 4096 }, { model_spec: { availableContextTokens: 24_000 } });
  const system = { role: "system", content: "Play the scene." };
  const oldest = { role: "user", content: "a".repeat(41_000) };
  const reply = { role: "assistant", content: "An answer." };
  const current = { role: "user", content: "b".repeat(41_000) };
  const room = availableMemoryBytes(system, limits, 41_000);
  assert.ok(room > 0);
  assert.equal(fitMessages(system, [{ ...current, content: current.content + "b".repeat(room + 3) }], limits), null);
  assert.deepEqual(fitMessages(system, [oldest, reply, current], limits)?.messages, [system, current]);
  assert.deepEqual(modelLimits({ maxTokens: 4096, contextTokens: 1200 }, { context_length: 24_000 }),
    { window: 1200, windowSource: "manual", replyTokens: 600 });
  assert.deepEqual(modelLimits({ maxTokens: 4096 }, { max_context_length: 128_000 }),
    { window: 128_000, windowSource: "provider", replyTokens: 4096 });
});

test("Auto learns only from length, keeps the sent scene on retry and scopes the learned limit to the model", async t => {
  const data = await mkdtemp(join(tmpdir(), "deeprole-reply-limit-"));
  const baseUrl = "http://127.0.0.1:9912/v1";
  const settings = { baseUrl, model: "alpha", maxTokens: 4096 };
  await writeFile(join(data, "model.json"), JSON.stringify(settings));
  const posts = [];
  const catalogue = [
    { id: "alpha", model_spec: { availableContextTokens: 128_000, maxCompletionTokens: 7000 } },
    { id: "beta", model_spec: { availableContextTokens: 128_000, maxCompletionTokens: 16_000 } },
  ];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url.pathname.endsWith("/models")) return Response.json({ data: catalogue });
    const body = JSON.parse(options.body);
    posts.push(body);
    const reason = ["length", "stop", null, "length", null, "length"][posts.length - 1] ?? null;
    const packet = { choices: [{ delta: { content: "The lantern is beside the bridge." }, finish_reason: reason }] };
    return new Response("data: " + JSON.stringify(packet) + "\n\n", { headers: { "content-type": "text/event-stream" } });
  });
  await modelCatalog(new URL(baseUrl), "");
  assert.equal((await providerSettings(data)).replyMode, "auto");
  const visible = "Where is the lantern?";
  const bodyFor = contextId => ({
    chat_session_id: "lantern-chat", parent_message_id: null, visible, desktop_context_id: contextId,
    prompt: '<deeprole_context>Beside the bridge.</deeprole_context>\n<deeprole_character_mode>Schema: {"request":"' + contextId
      + '"}</deeprole_character_mode>\n\n[User message]\n' + visible,
  });
  const call = (requestId, body) => chatRequest(data, undefined, new Request(
    "https://deeprole.local/api/v0/chat/completion?request_id=" + requestId, { method: "POST", body: JSON.stringify(body) }));
  const first = await call("cut-one", bodyFor("receipt-one"));
  assert.match(await first.text(), /"error":"model-reply-length","reply_retry_id":"cut-one"/u);
  assert.deepEqual(posts.map(post => post.max_tokens), [4096]);

  const retry = { ...bodyFor("receipt-two"), reply_retry_id: "cut-one" };
  const stale = await call("wrong-scene", { ...retry, prompt: retry.prompt.replace("bridge", "market") });
  assert.equal(stale.status, 409);
  const sent = await call("retry-one", retry);
  assert.match(await sent.text(), /event: close/u);
  assert.deepEqual(posts.map(post => post.max_tokens), [4096, 7000]);
  assert.equal(posts[1].messages.at(-1).content.replaceAll("receipt-two", "receipt-one"), posts[0].messages.at(-1).content);
  const saved = JSON.parse(await readFile(join(data, "Chats", "lantern-chat.json"), "utf8"));
  assert.deepEqual(saved.messages.map(message => message.role), ["user", "assistant"]);

  const next = { ...bodyFor("receipt-three"), parent_message_id: saved.head };
  assert.match(await (await call("stream-cut", next)).text(), /"error":"model-incomplete"/u);
  assert.equal(posts.at(-1).max_tokens, 7000);
  const cap = await (await call("at-cap", next)).text();
  assert.match(cap, /"error":"model-reply-length"/u);
  assert.doesNotMatch(cap, /reply_retry_id/u);
  const config = JSON.parse(await readFile(join(data, "model.json"), "utf8"));
  assert.deepEqual(Object.values(config.replyLimits), [7000]);

  await saveProvider(data, { ...settings, key: "", model: "beta", replyMode: "auto" });
  const beta = { ...bodyFor("receipt-four"), chat_session_id: "other-chat" };
  assert.match(await (await call("beta-turn", beta)).text(), /"error":"model-incomplete"/u);
  assert.equal(posts.at(-1).max_tokens, 4096);
  assert.deepEqual(Object.values(JSON.parse(await readFile(join(data, "model.json"), "utf8")).replyLimits), [7000]);

  await saveProvider(data, { ...settings, key: "", model: "beta", replyMode: "manual", maxTokens: 8000 });
  const manual = await (await call("manual-turn", beta)).text();
  assert.equal(posts.at(-1).max_tokens, 8000);
  assert.match(manual, /"error":"model-reply-length"/u);
  assert.doesNotMatch(manual, /reply_retry_id/u);
  assert.deepEqual(Object.values(JSON.parse(await readFile(join(data, "model.json"), "utf8")).replyLimits), [7000]);
});

test("ambiguous, speculative and already-visible passages do not get an archived excerpt", () => {
  const limits = { window: 1_500, replyTokens: 256 };
  const system = { role: "system", content: "Play the scene." };
  const current = { role: "user", content: "Scene settings.\n\n[User message]\nWhere is the spare pass?", sceneQuery: earlierSceneQuery("Where is the spare pass?") };
  const user = { role: "user", content: "Continue." };
  const old = content => ({ role: "assistant", content, recordedScene: true });
  const gap = { role: "assistant", content: "Rain fell. ".repeat(500) };
  for (const [older, retained] of [
    [[old("The spare pass is in box 29."), old("The spare pass is inside the slate cupboard.")], "Rain fell."],
    [[old("If the spare pass is in box 29, we can look for it."), old("Rain fell." )], "Rain fell."],
    [[old("The spare pass is in box 29."), old("Rain fell.")], "The spare pass has been moved."],
  ]) {
    const messages = [user, older[0], user, older[1], user, gap, user, { role: "assistant", content: retained }, current];
    const plan = fitMessages(system, messages, limits);
    assert.equal(plan.omittedMessages, 6);
    assert.equal(withEarlierStoryScene(plan, messages, limits), plan);
  }
});

test("reveals the earlier or later location according to the request, within a 2,000-token window", () => {
  const limits = { window: 2_000, replyTokens: 256 };
  const system = { role: "system", content: "Play the scene." };
  const before = "Мира оставила запасной пропуск в ящике № 84 под лампой.";
  const moved = "Мира переложила запасной пропуск из ящика № 84 в серый сейф № 12.";
  const user = { role: "user", content: "Смотрю вокруг." };
  const scene = content => ({ role: "assistant", content, recordedScene: true });
  const gap = [user, scene("Шёл дождь над мастерской. ".repeat(360))];
  const ask = (draft, line, memory = "Scene settings.") => {
    const current = { role: "user", content: `${memory}\n\n[User message]\n${draft}`, sceneQuery: earlierSceneQuery(draft) };
    const messages = [...line, current];
    const plan = withEarlierStoryScene(fitMessages(system, messages, limits), messages, limits);
    assert.ok(plan.estimatedInput + limits.replyTokens <= limits.window);
    return plan.messages.at(-1).content.match(/<deeprole_earlier_scene>[^\n]*\n(.*?)\n<\/deeprole_earlier_scene>/u)?.[1];
  };
  const now = "Где сейчас запасной пропуск?", earlier = "Где раньше был запасной пропуск?";
  const archived = [user, scene(before), user, scene(moved), ...gap, user, scene("За окном дождь.")];
  assert.equal(ask(now, archived, `<deeprole_story_memory>${before}</deeprole_story_memory>`), JSON.stringify(moved));
  assert.equal(ask(earlier, archived), JSON.stringify(before));
  assert.equal(ask(now, archived, `<deeprole_story_memory>${before}\nЗапасной пропуск вернулся в портфель.</deeprole_story_memory>`), undefined);
  const retained = [user, scene(before), ...gap, user, scene(moved)];
  assert.equal(ask(now, retained), undefined);
  assert.equal(ask(earlier, retained), JSON.stringify(before));
  for (const misleading of [
    "Мира не переложила запасной пропуск из ящика № 84 в сейф № 12.",
    "Мира сказала, что переложила запасной пропуск из ящика № 84 в сейф № 12.",
    "Мира переложила старый фонарь из ящика, где лежит запасной пропуск, в серый сейф № 12.",
    `${moved} Мира переложила запасной пропуск из сейфа № 12 в сумку.`,
  ]) assert.equal(ask(now, [user, scene(before), user, scene(misleading), ...gap]), undefined);
  const short = [user, scene(before), ...gap, user, scene("Мира переложила пропуск из ящика № 84 в серый сейф № 12.")];
  assert.equal(ask(now, short), undefined);
  assert.equal(earlierSceneQuery("Где сейчас и где раньше был запасной пропуск?"), undefined);
});

test("a native turn sends one matching omitted scene from its own branch in the same completion", async context => {
  const data = await mkdtemp(join(tmpdir(), "DeepRole-scene-recall-test-"));
  const id = "scene-chat";
  const prompt = (draft, branch = "main", legacy = false) => "<deeprole_story_update_mode>"
    + (legacy ? 'world:"observatory",chat:"scene-chat",branch:"' + branch + '"'
      : JSON.stringify({ version: 2, world: "observatory", chat: id, branch }))
    + '</deeprole_story_update_mode>\n<deeprole_game_automation>{"world":"observatory","mode":"automatic","revision":"p"}</deeprole_game_automation>\n\n[User message]\n' + draft;
  const excerpt = "Мира положила запасной пропуск в ящик № 29 под кобальтовым светильником.";
  const turns = [["Осматриваю пропуск.", excerpt], ["Другая ветка.", "Запасной пропуск остался в красном сейфе № 81.", "alternate"],
    ["День дождя.", "Шёл дождь над мастерской. ".repeat(240)], ["Подхожу к окну.", "За окном стучит дождь."]];
  const messages = turns.flatMap(([visible, text, branch], index) => [
    { id: index * 2 + 1, parent: index * 2 || null, role: "user", visible, text: prompt(visible, branch, true) },
    { id: index * 2 + 2, parent: index * 2 + 1, role: "assistant", visible: text, text },
  ]);
  await mkdir(join(data, "Chats"));
  const file = join(data, "Chats", id + ".json");
  await writeFile(file, JSON.stringify({ id, title: "Мастерская", messages, head: 8 }));
  await writeFile(join(data, "model.json"), JSON.stringify({ baseUrl: "http://127.0.0.1:9901/v1", model: "recall-test", maxTokens: 256, contextTokens: 1_800 }));
  const posts = [];
  const sceneAnswer = "Запасной пропуск был в ящике № 29.";
  const echo = '{"kind":"event","anchor":"запасной пропуск в ящике","risk":"ordinary"}';
  context.mock.method(globalThis, "fetch", async (target, options) => {
    if (target.pathname.endsWith("/models")) return Response.json({ data: [] });
    posts.push(JSON.parse(options.body));
    return Response.json({ choices: [{ message: { content: `${sceneAnswer}\n\n${echo}` }, finish_reason: "stop" }] });
  });
  const visible = "Напомни, где запасной пропуск?";
  const response = await chatRequest(data, {}, new Request("https://deeprole.local/api/v0/chat/completion", {
    method: "POST", body: JSON.stringify({ chat_session_id: id, parent_message_id: 8, visible, prompt: prompt(visible) }),
  }));
  assert.equal(response.status, 200);
  assert.match(await response.text(), /в ящике № 29/);
  assert.equal(posts.length, 1);
  const sent = posts[0].messages;
  assert.ok(sent.some(message => message.content === "За окном стучит дождь."));
  assert.match(sent.at(-1).content, /<deeprole_earlier_scene>/);
  assert.ok(sent.at(-1).content.includes(excerpt));
  assert.ok(!sent.some(message => message.content.includes("красном сейфе")));
  const stored = JSON.parse(await readFile(file, "utf8"));
  assert.equal(stored.messages.at(-2).text, prompt(visible));
  assert.equal(stored.messages.at(-1).visible, sceneAnswer);
  const explicitlyRequested = "Покажи JSON этой записи.";
  const shown = await chatRequest(data, {}, new Request("https://deeprole.local/api/v0/chat/completion", {
    method: "POST", body: JSON.stringify({ chat_session_id: id, parent_message_id: stored.head, visible: explicitlyRequested, prompt: prompt(explicitlyRequested) }),
  }));
  assert.equal(shown.status, 200);
  await shown.text();
  const final = JSON.parse(await readFile(file, "utf8"));
  assert.equal(final.messages.at(-1).visible, `${sceneAnswer}\n\n${echo}`);
});

test("a service-only model reply fails the story turn without replacing its history or retrying", async t => {
  const data = await mkdtemp(join(tmpdir(), "DeepRole-visible-reply-"));
  const id = "visible-reply";
  const scoped = draft => '<deeprole_story_update_mode>world:"world",chat:"visible-reply",branch:"main"</deeprole_story_update_mode>\n'
    + '<deeprole_game_automation>{"mode":"automatic"}</deeprole_game_automation>\n\n[User message]\n' + draft;
  const packet = '{"version":2,"world":"world","chat":"visible-reply","branch":"main","updates":[]}';
  const tagged = "<deeprole_characters>" + packet + "</deeprole_characters>";
  const fact = '{"kind":"promise","text":"Iris promised to return the ledger."}';
  const scene = "The ledger is on the desk.";
  const file = join(data, "Chats", id + ".json");
  const old = { id, title: "Archivist", updatedAt: 1, head: 2, messages: [
    { id: 1, parent: null, role: "user", visible: "I wait.", text: scoped("I wait.") },
    { id: 2, parent: 1, role: "assistant", visible: scene.repeat(410), text: scene.repeat(410) },
  ] };
  await mkdir(join(data, "Chats"));
  await writeFile(file, JSON.stringify(old));
  await writeFile(join(data, "model.json"), JSON.stringify({ baseUrl: "http://127.0.0.1:9903/v1", model: "visible-reply-test", maxTokens: 256, contextTokens: 4096 }));
  let content, posts = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url.pathname.endsWith("/models")) return Response.json({ data: [] });
    posts++;
    return Response.json({ choices: [{ message: { content }, finish_reason: "stop" }] });
  });
  const send = (draft, parent = 2, messageId) => chatRequest(data, {}, new Request("https://deeprole.local/api/v0/chat/completion", {
    method: "POST", body: JSON.stringify({ chat_session_id: id, parent_message_id: parent, message_id: messageId, visible: draft, prompt: scoped(draft) }),
  })).then(response => response.text());
  for (const [index, bad] of [tagged, "```json\n" + tagged + "\n```", "<deeprole_choices>{}", fact, packet].entries()) {
    content = bad;
    const events = await send("Where is the ledger?", 2, index === 1 ? 1 : undefined);
    assert.match(events, /event: hint\ndata: \{"error":"model-empty"\}/);
    assert.doesNotMatch(events, /event: (?:finish|close)/);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), old);
    assert.equal(posts, index + 1);
  }
  content = scene + "\n\n" + tagged;
  assert.match(await send("Where is the ledger?"), /event: finish/);
  let saved = JSON.parse(await readFile(file, "utf8"));
  assert.equal(saved.messages.at(-1).visible, scene);
  assert.equal(saved.messages.at(-1).text, content);
  assert.deepEqual(saved.messages.slice(0, 2), old.messages);
  assert.equal(saved.contextCheckpoint.omittedThrough, 2);
  content = fact;
  assert.match(await send("Show the promise as JSON.", saved.head), /event: finish/);
  saved = JSON.parse(await readFile(file, "utf8"));
  assert.equal(saved.messages.at(-1).visible, fact);
  assert.match(await send("[DeepRole Service]\nCheck the promise.", saved.head), /event: finish/);
  assert.equal(posts, 8);
});

test("actual usage survives a ledger reload and matched charges replace estimates", async () => {
  const data = await mkdtemp(join(tmpdir(), "DeepRole-usage-test-"));
  const now = new Date(2026, 10, 25, 12).getTime();
  const tokens = readTokenUsage({ prompt_tokens: 1000, completion_tokens: 500, completion_tokens_details: { reasoning_tokens: 5 } });
  const estimatedUsd = estimatedCost(tokens, { input: { usd: 2 }, output: { usd: 8 } });
  assert.equal(estimatedUsd, 0.006);
  await recordUsage(data, { id: "one", chatId: "active", at: now - 10, venice: true });
  await recordUsage(data, { id: "one", requestId: "match", tokens, estimatedUsd });
  await recordUsage(data, { id: "interrupted", chatId: "active", at: now - 9 });
  await recordUsage(data, { id: "old", chatId: "active", at: now - 8 * 86_400_000, tokens, estimatedUsd });
  const charges = new Map([["match", { usd: 0.001, diem: 0.02, bundled: 0.03, earned: 0.04 }], ["someone-else", { usd: 200, diem: 0 }]]);
  await usageSummary(data, "active", async () => ({ status: "ok", charges }), now);
  const summary = await usageSummary(data, "active", undefined, now);
  assert.equal(summary.days.length, 7);
  assert.deepEqual(summary.week, { requests: 2, measured: 1, input: 1000, output: 500, unknown: 1, estimated: 0, usd: 0.001, diem: 0.02, bundled: 0.03, earned: 0.04 });
  assert.equal(summary.chat.requests, 3);
  assert.equal(summary.chat.estimated, estimatedUsd);
  assert.equal(estimatedCost({ ...tokens, cached: 5 }, { input: { usd: 2 }, output: { usd: 8 } }), undefined);
});

test("weekly and low balance notices are deduplicated and use the selected currency", async () => {
  const data = await mkdtemp(join(tmpdir(), "DeepRole-spending-test-"));
  const now = new Date(2026, 10, 25, 12).getTime();
  const saved = await saveSpending(data, { encryptStringAsync: async () => Buffer.from("encrypted") }, {
    weeklyUsd: 10, lowBalance: { currency: "DIEM", threshold: 4 }, billingKey: "test-billing-key", clearBillingKey: false,
  });
  assert.equal(saved.hasBillingKey, true);
  assert.equal(Object.hasOwn(saved, "billingKey"), false);
  const spend = async () => ({ usd: 7, estimated: 1 });
  const balances = async () => ({ USD: 100, DIEM: 2 });
  const checks = await Promise.all([spendingNotices(data, spend, balances, now), spendingNotices(data, spend, balances, now)]);
  assert.deepEqual(checks.flat(), [{ type: "weekly", spent: 8, threshold: 10, estimated: true }, { type: "balance", amount: 2, currency: "DIEM" }]);
  await spendingNotices(data, spend, async () => ({ DIEM: 8 }), now);
  assert.deepEqual(await spendingNotices(data, spend, balances, now), [{ type: "balance", amount: 2, currency: "DIEM" }]);
  assert.deepEqual(await spendingNotices(data, spend, balances, now + 7 * 86_400_000), [{ type: "weekly", spent: 8, threshold: 10, estimated: true }]);
});

test("an illustration is charged only with an exact receipt match", async context => {
  const data = await mkdtemp(join(tmpdir(), "DeepRole-media-usage-test-"));
  const api = "https://api.venice.ai/api/v1/image/generate";
  context.mock.method(globalThis, "fetch", async (target, options) => {
    assert.equal(target.href, api);
    assert.equal(options.headers.has("x-deeprole-usage-chat"), false);
    return Response.json({ id: "generate-image-receipt", images: ["synthetic"] });
  });
  const request = new Request("https://deeprole.local/__desktop/image", { method: "POST", body: JSON.stringify({
    url: api, method: "POST", headers: { "X-DeepRole-Usage-Chat": "scene-chat" }, body: "{}",
  }) });
  const generated = await imageRequest(request, new Set(["https://api.venice.ai/*"]), data);
  const record = generated.headers.get("x-deeprole-usage-id");
  assert.ok(record);
  assert.equal((await usageSummary(data, "scene-chat")).images.unknown, 1);
  const receipt = await imageReceipt(data, new Request("https://deeprole.local/__desktop/image-receipt", {
    method: "POST", body: JSON.stringify({ record, requestId: (await generated.json()).id }),
  }));
  assert.equal(receipt.status, 204);
  const summary = await usageSummary(data, "scene-chat", async () => ({
    status: "ok", charges: new Map([["generate-image-receipt", { usd: 0.03, diem: 0 }], ["unrelated", { usd: 100, diem: 0 }]]),
  }));
  assert.equal(summary.images.usd, 0.03);
  assert.equal(summary.images.measured, 0);
  assert.equal(summary.images.unknown, 0);
  assert.equal(summary.chat.usd, 0.03);
});

test("a restricted inference key stays separate from a key with billing access", async context => {
  const data = await mkdtemp(join(tmpdir(), "DeepRole-billing-key-test-"));
  const safeStorage = {
    encryptStringAsync: async value => Buffer.from(value),
    decryptStringAsync: async value => ({ result: value.toString() }),
  };
  await writeFile(join(data, "model.json"), JSON.stringify({
    baseUrl: "https://api.venice.ai/api/v1", model: "test-story", key: Buffer.from("inference-key").toString("base64"),
  }));
  context.mock.method(globalThis, "fetch", async (target, options) => {
    assert.equal(target.origin, "https://api.venice.ai");
    assert.equal(target.pathname, "/api/v1/billing/usage-history");
    if (options.headers.Authorization === "Bearer inference-key") return new Response(null, { status: 401 });
    assert.equal(options.headers.Authorization, "Bearer billing-only-key");
    return Response.json({ data: [
      { currency: "BUNDLED_CREDITS", amount: -0.02, inferenceDetails: { requestId: "matched" } },
      { currency: "USD", amount: -0.03, inferenceDetails: { requestId: "matched" } },
      { currency: "USD", amount: -1, inferenceDetails: null },
    ] });
  });
  const now = Date.now();
  assert.deepEqual(await veniceCharges(data, safeStorage, now - 1000, now), { status: "restricted" });
  await saveSpending(data, safeStorage, { billingKey: "billing-only-key", clearBillingKey: false });
  const result = await veniceCharges(data, safeStorage, now - 1000, now);
  assert.equal(result.status, "ok");
  assert.deepEqual([...result.charges], [["matched", { usd: 0.03, diem: 0, bundled: 0.02, earned: 0 }]]);
});
