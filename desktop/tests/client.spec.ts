import { _electron, expect, test, type ElectronApplication, type Page, type TestInfo } from "@playwright/test";
import { cp, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { EMPTY_CHARACTER, EMPTY_STATUS } from "../../src/core/characters";
import { oldChatNoticeText } from "../../src/core/old-chat-notice";
import { imageText } from "../../src/core/image-i18n";
import { savedMemoryText } from "../../src/core/saved-memory-continuation";
import { hasPortraitCast } from "../../src/core/portrait-presence";
import { nativeStoryMessageKey } from "../../src/core/story-transport";
import { boundStory } from "../../src/core/story-continuation";
import { castBatch, castWorld } from "../../tests/fixtures/cast-data";
import { storyWorld } from "../../tests/fixtures/story-worlds";
import { resetDraft, resetFixture } from "../../tests/fixtures/world-reset";
import { realPng } from "../../tests/image-fixtures";
import type { DataRecord } from "../../src/core/types";
import type { MemoryBatchStatus } from "../../src/core/story-memory-batch";
import { continuationLauncher, continuationMethod } from "../../tests/e2e/continuation-helpers";
import languageSwitch from "../../tests/fixtures/story-language-switch.json";
import portraitContract from "../../tests/fixtures/portrait-presence-contract.json";
import multiplePortraits from "../../tests/fixtures/portrait-multi-npc-contract.json";
import pronounPortraits from "../../tests/fixtures/portrait-pronoun-contract.json";
import returningPortraits from "../../tests/fixtures/portrait-pronoun-return-contract.json";

async function openClient(data: string, portable = false) {
  await mkdir(data, { recursive: true });
  const app = await _electron.launch({
    executablePath: process.env.DEEPROLE_TEST_ELECTRON ?? path.resolve("node_modules/electron/dist/electron.exe"),
    args: process.env.DEEPROLE_TEST_PACKAGED === "1" ? [] : [path.resolve("desktop")],
    env: { ...process.env, DEEPROLE_DESKTOP_DATA: portable ? "" : data },
    timeout: 30_000,
  });
  await expect.poll(() => app.windows().some(page => page.url() === "https://deeprole.local/"), { timeout: 25_000 }).toBe(true);
  const page = app.windows().find(page => page.url() === "https://deeprole.local/")!;
  await page.emulateMedia({ colorScheme: null });
  return { app, page };
}

async function attachModel(page: Page, baseUrl: string) {
  await page.getByRole("button", { name: /Подключить модель|Connect a model/ }).click();
  const dialog = page.getByRole("dialog", { name: /Текстовая модель|Text model/ });
  await dialog.getByLabel(/Адрес API|API base URL/).fill(baseUrl);
  await dialog.getByLabel(/ID модели|Model ID/).fill("test-story");
  await dialog.getByRole("button", { name: /Сохранить подключение|Save connection/ }).click();
  await expect(page.getByRole("button", { name: "test-story" })).toBeVisible();
}

async function libraryRecords(page: Page) {
  return page.evaluate(() => new Promise<{ kind: string; data: Record<string, any> }[]>((resolve, reject) => {
    const open = indexedDB.open("deeprole");
    open.onerror = reject;
    open.onsuccess = () => {
      const read = open.result.transaction("records").objectStore("records").getAll();
      read.onerror = reject;
      read.onsuccess = () => { resolve(read.result); open.result.close(); };
    };
  }));
}

async function seedLibrary(page: Page, records: DataRecord[]) {
  await libraryRecords(page);
  await page.evaluate(rows => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("deeprole");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("records", "readwrite");
      for (const row of rows) tx.objectStore("records").put({ pk: row.kind + ":" + row.id, ...row, updatedAt: Date.now() });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), records);
}

const liveMistralModel = "mistral-small-3-2-24b-instruct";

async function copyLiveMistralProfile(profile: string, data: string) {
  const config = JSON.parse(await readFile(path.join(profile, "model.json"), "utf8"));
  expect(new URL(config.baseUrl).origin).toBe("https://api.venice.ai");
  expect(Boolean(config.key)).toBe(true);
  await cp(path.join(profile, "Local State"), path.join(data, "Local State"));
  await writeFile(path.join(data, "model.json"), JSON.stringify({
    baseUrl: config.baseUrl, key: config.key, model: liveMistralModel, maxTokens: 1024,
  }));
}

async function closeLiveMistralProfile(app: ElectronApplication | undefined, data: string) {
  try {
    await app?.close();
  } finally {
    await Promise.all(["model.json", "Local State"].map(name => unlink(path.join(data, name)).catch(error => {
      if (error.code !== "ENOENT") throw error;
    })));
  }
}

for (const scenario of languageSwitch.cases) {
  test(`live Mistral language switch: ${scenario.id}`, async ({}, info) => {
    const profile = process.env.DEEPROLE_LIVE_VENICE_PROFILE;
    test.skip(!profile, "Requires an explicitly provided Windows test credential source.");
    const data = info.outputPath("language-switch-profile");
    const f = storyWorld("en", 2);
    f.entities[1]!.name = "Mira";
    f.world.storyAutomation = { mode: "automatic", revision: "language-switch" };
    f.entry.content = scenario.old;
    f.entry.activation = "always";
    f.binding.chatUrl = "https://deeprole.local/a/chat/s/" + f.binding.chatId;
    const chats = path.join(data, "Chats");
    const file = path.join(chats, f.binding.chatId + ".json");
    const matches = (quote: string, patterns: string[]) => patterns.every(pattern => new RegExp(pattern, "iu").test(quote));
    let app: ElectronApplication | undefined;
    try {
      await mkdir(chats, { recursive: true });
      await copyLiveMistralProfile(profile!, data);
      await writeFile(path.join(data, "settings.json"), JSON.stringify({
        deeprole_settings: { locale: "en", onboardingComplete: true, sceneChoicesEnabled: false, automaticMetadataRepair: false },
      }));
      await writeFile(file, JSON.stringify({
        id: f.binding.chatId, title: "Synthetic language switch", head: 2, updatedAt: 1,
        messages: [scenario.oldDraft, scenario.old].map((text, index) => ({
          id: index + 1, parent: index || null, role: index ? "assistant" : "user", text, visible: text,
        })),
      }));
      const started = await openClient(data);
      app = started.app;
      const { page } = started;
      const dispatches = await app.evaluateHandle(() => {
        const sent: { model: string; russian: boolean; finalReminder: boolean }[] = [];
        const fetch = globalThis.fetch;
        globalThis.fetch = (url, options) => {
          if (options?.method === "POST" && String(url) === "https://api.venice.ai/api/v1/chat/completions") {
            const packet = JSON.parse(String(options.body));
            sent.push({
              model: packet.model,
              russian: packet.messages[0].content.startsWith("Сцену и диалоги пиши только по-русски."),
              finalReminder: packet.messages.at(-1).content.split("\n\n").at(-1).startsWith("Ответ по-русски."),
            });
          }
          return fetch(url, options);
        };
        return sent;
      });
      await seedLibrary(page, f.records);
      await page.goto(f.binding.chatUrl);
      await expect(page.locator("[data-role=assistant]")).toContainText(scenario.old);
      await expect.poll(async () => page.evaluate(async scope => {
        const [tab] = await window.deepRoleDesktop.call<{ id: number }[]>("tabQuery", { currentWindow: true, active: true });
        return tab ? window.deepRoleDesktop.call("tabSend", tab.id, { type: "DR_STORY_GAME", operation: "start", scope }) : null;
      }, { worldId: f.world.id, chatId: f.binding.chatId })).toMatchObject({ ok: true });
      await page.getByRole("textbox", { name: "Your message", exact: true }).fill(scenario.draft);
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(page.locator("[data-role=assistant]")).toHaveCount(2, { timeout: 35_000 });
      await expect(page.getByTestId("stop-generation")).toHaveCount(0, { timeout: 35_000 });
      const { messages } = JSON.parse(await readFile(file, "utf8"));
      const reply = messages.at(-1);
      expect(messages.at(-2).text).toContain(scenario.old);
      expect(messages.at(-2).text).toContain(scenario.draft);
      const sourceKey = nativeStoryMessageKey(String(reply.id));
      const isSource = (row: Awaited<ReturnType<typeof libraryRecords>>[number]) =>
        row.kind === "story" && row.data.type === "revision" && row.data.role === "assistant" && row.data.nativeMessageKey === sourceKey;
      await expect.poll(async () => (await libraryRecords(page)).some(isSource), { timeout: 12_000 }).toBe(true);
      const rows = await libraryRecords(page);
      const source = rows.find(isSource)!.data;
      const saved = rows.filter(row => row.kind === "story" && row.data.revisionId === source.id
        && row.data.memory && row.data.automation?.status === "saved").map(row => row.data.memory);
      const usage = (await readFile(path.join(data, "Model Usage.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
      const requests = usage.filter(row => row.kind).length;
      console.log(JSON.stringify({ case: scenario.id, reply: reply.visible, saved, diagnostic: source.updateDiagnostic, requests }));
      expect(requests).toBe(1);
      expect(await dispatches.jsonValue()).toEqual([{ model: liveMistralModel, russian: true, finalReminder: true }]);
      for (const fact of saved) {
        expect(reply.visible).toContain(fact.quote);
        expect(source.content).toContain(fact.quote);
        expect(scenario.exclude.some(pattern => new RegExp(pattern, "iu").test(fact.quote))).toBe(false);
      }
      if (scenario.evidence.length) {
        expect(reply.visible).toMatch(/[а-яё]{4}/iu);
        expect(matches(reply.visible, scenario.evidence)).toBe(true);
        expect(saved.some(fact => fact.kind === "event" && matches(fact.quote, scenario.evidence))).toBe(true);
      } else {
        expect(saved.filter(fact => fact.kind === "event")).toEqual([]);
      }
    } finally {
      await closeLiveMistralProfile(app, data);
    }
  });
}

test("live Mistral shows and removes an NPC portrait without a cast list", async ({}, info) => {
  const profile = process.env.DEEPROLE_LIVE_VENICE_PROFILE;
  test.skip(!profile, "Requires an explicitly provided Windows test credential source.");
  const data = info.outputPath("portrait-presence-profile");
  const f = storyWorld("ru", 2);
  const [hero, npc] = f.entities as [typeof f.entities[number], typeof f.entities[number]];
  hero.name = "Ной";
  npc.name = "Мира";
  npc.aliases = ["Mira"];
  npc.characterSheet = { ...EMPTY_CHARACTER, sprites: { neutral: `data:image/png;base64,${realPng}` } };
  f.binding.characterScenes![f.world.id]!.presentIds = [hero.id];
  f.binding.chatUrl = "https://deeprole.local/a/chat/s/" + f.binding.chatId;
  const chats = path.join(data, "Chats");
  const file = path.join(chats, f.binding.chatId + ".json");
  let app: ElectronApplication | undefined;
  try {
    await mkdir(chats, { recursive: true });
    await copyLiveMistralProfile(profile!, data);
    await writeFile(path.join(data, "settings.json"), JSON.stringify({
      deeprole_settings: { locale: "ru", onboardingComplete: true, sceneChoicesEnabled: false, automaticMetadataRepair: false },
    }));
    await writeFile(file, JSON.stringify({
      id: f.binding.chatId, title: "Проверка портретов", head: 2, updatedAt: 1,
      messages: [
        { id: 1, parent: null, role: "user", text: "Я жду у стола.", visible: "Я жду у стола." },
        { id: 2, parent: 1, role: "assistant", text: "Комната пока пуста, на столе горит фонарь.", visible: "Комната пока пуста, на столе горит фонарь." },
      ],
    }));
    const started = await openClient(data);
    app = started.app;
    const { page } = started;
    await seedLibrary(page, f.records);
    await page.goto(f.binding.chatUrl);
    const portrait = page.locator(`.dr-cast-widget[data-character-id=${npc.id}]`);
    await expect(page.locator(`.dr-cast-widget[data-character-id=${hero.id}]`)).toBeVisible();
    await expect(portrait).toHaveCount(0);
    const draft = page.getByRole("textbox", { name: "Ваша реплика", exact: true });
    for (const [index, scenario] of [portraitContract.entry, portraitContract.exit].entries()) {
      await draft.fill(scenario.draft);
      await draft.press("Enter");
      await expect(page.locator(".desktop-story-text")).toHaveCount(index + 2, { timeout: 35_000 });
      await expect(page.getByTestId("stop-generation")).toHaveCount(0, { timeout: 35_000 });
      const { messages } = JSON.parse(await readFile(file, "utf8"));
      const reply = messages.at(-1);
      console.log(JSON.stringify({ expectedPortrait: scenario.expectedPortrait, reply: reply.visible, hasCast: hasPortraitCast(reply.text) }));
      expect(hasPortraitCast(reply.text)).toBe(false);
      if (scenario.expectedPortrait) {
        await expect(portrait).toBeVisible();
        await expect.poll(() => portrait.locator("img[data-current]").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
      } else {
        await expect(portrait).toHaveCount(0);
      }
    }
    const usage = (await readFile(path.join(data, "Model Usage.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
    expect(usage.filter(row => row.kind)).toMatchObject([
      { kind: "story", model: liveMistralModel }, { kind: "story", model: liveMistralModel },
    ]);
  } finally {
    await closeLiveMistralProfile(app, data);
  }
});

type LivePortraitTurn = { draft: string; visibleNpcs: string[]; reply: string | RegExp[] };

function exactPortraitTurn(scenario: { reply: string; visibleNpcs: string[] }): LivePortraitTurn {
  return {
    ...scenario,
    draft: "Напиши следующую реплику рассказчика ровно так, как она дана ниже. Это заготовка ответа, события из неё ещё не произошли. Скопируй текст дословно от первого слова до последней точки. В служебном блоке оставь только идентификатор запроса и пустой список facts. Поля present, partners и updates пропусти.\n\n" + scenario.reply,
  };
}

async function checkLiveNpcPortraits(info: TestInfo, turns: LivePortraitTurn[]) {
  const profile = process.env.DEEPROLE_LIVE_VENICE_PROFILE;
  test.skip(!profile, "Requires an explicitly provided Windows test credential source.");
  const data = info.outputPath("portrait-profile");
  const f = storyWorld("ru", multiplePortraits.npcs.length + 1);
  const [hero, ...characters] = f.entities;
  hero!.name = multiplePortraits.hero;
  const npcs = multiplePortraits.npcs.map((expected, index) => {
    const person = characters[index]!;
    person.name = expected.name;
    person.characterSheet = { ...EMPTY_CHARACTER, sprites: { neutral: `data:image/png;base64,${realPng}` } };
    return { ...expected, id: person.id };
  });
  const before = npcs.filter(npc => npc.before).map(npc => npc.id).sort();
  f.binding.characterScenes![f.world.id]!.presentIds = [hero!.id, ...before];
  f.binding.chatUrl = "https://deeprole.local/a/chat/s/" + f.binding.chatId;
  const chats = path.join(data, "Chats");
  const file = path.join(chats, f.binding.chatId + ".json");
  let app: ElectronApplication | undefined;
  try {
    await mkdir(chats, { recursive: true });
    await copyLiveMistralProfile(profile!, data);
    await writeFile(path.join(data, "settings.json"), JSON.stringify({
      deeprole_settings: { locale: "ru", onboardingComplete: true, sceneChoicesEnabled: false, automaticMetadataRepair: false },
    }));
    await writeFile(file, JSON.stringify({
      id: f.binding.chatId, title: "Три персонажа у письма", head: 2, updatedAt: 1,
      messages: [
        { id: 1, parent: null, role: "user", text: "Я подхожу к столу.", visible: "Я подхожу к столу." },
        { id: 2, parent: 1, role: "assistant", text: multiplePortraits.opening, visible: multiplePortraits.opening },
      ],
    }));
    const started = await openClient(data);
    app = started.app;
    const { page } = started;
    await seedLibrary(page, f.records);
    await page.goto(f.binding.chatUrl);
    const portraits = page.locator(`.dr-cast-widget:not([data-character-id=${hero!.id}])`);
    const shownNpcs = () => portraits.evaluateAll(nodes => nodes.map(node => node.getAttribute("data-character-id")).sort());
    const checkPortraits = async (ids: string[]) => {
      await expect.poll(shownNpcs).toEqual(ids);
      for (const id of ids) {
        const portrait = portraits.and(page.locator(`[data-character-id=${id}]`));
        await expect(portrait).toBeVisible();
        await expect.poll(() => portrait.locator("img[data-current]").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
      }
    };
    await expect.poll(shownNpcs).toEqual(before);
    const draft = page.getByRole("textbox", { name: "Ваша реплика", exact: true });
    let previous = before;
    for (const [index, turn] of turns.entries()) {
      const after = npcs.filter(npc => turn.visibleNpcs.includes(npc.name)).map(npc => npc.id).sort();
      expect(after).toHaveLength(turn.visibleNpcs.length);
      await draft.fill(turn.draft);
      await draft.press("Enter");
      await expect(page.locator(".desktop-story-text")).toHaveCount(index + 2, { timeout: 35_000 });
      await expect(page.getByTestId("stop-generation")).toHaveCount(0, { timeout: 35_000 });
      const { messages } = JSON.parse(await readFile(file, "utf8"));
      const reply = messages.at(-1);
      console.log(JSON.stringify({ reply: reply.visible, hasCast: hasPortraitCast(reply.text), expectedNpcs: after }));
      expect(hasPortraitCast(reply.text)).toBe(false);
      if (typeof turn.reply === "string") {
        const prose = await page.locator(".desktop-story-text").last().locator("p:not(blockquote p, pre p)").allTextContents();
        expect(prose.join(" ").trim().replace(/\s+/g, " ")).toBe(turn.reply);
      } else {
        for (const pattern of turn.reply) expect(reply.visible).toMatch(pattern);
      }
      if (after.length === previous.length && after.every((id, i) => id === previous[i])) {
        // The unchanged portrait set must survive the completed-turn scan.
        await page.waitForTimeout(1_600);
      }
      await checkPortraits(after);
      previous = after;
    }
    await page.reload();
    if (turns.length > 1) await page.waitForTimeout(1_600);
    await checkPortraits(previous);
    const usage = (await readFile(path.join(data, "Model Usage.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
    expect(usage.filter(row => row.kind)).toMatchObject(turns.map(() => ({ kind: "story", model: liveMistralModel })));
  } finally {
    await closeLiveMistralProfile(app, data);
  }
}

test("live Mistral keeps only the NPC who stays in a scene without a cast list", async ({}, info) => {
  await checkLiveNpcPortraits(info, [{
    draft: multiplePortraits.draft,
    visibleNpcs: multiplePortraits.npcs.filter(npc => npc.after).map(npc => npc.name),
    reply: [/Мир[аыеуой]/iu, /Лин[аыеуой]/iu, /Вер[аыеуой]/iu],
  }]);
});

for (const scenario of pronounPortraits) {
  test(`live Mistral pronoun departure without a cast list (${scenario.id})`, async ({}, info) => {
    const draft = "Продолжи сцену следующими двумя фразами дословно, закончив художественный текст точкой после слова «мастерской». Оставь местоимение «Она», без уточнений, кто ушёл или остался. В служебном блоке оставь только идентификатор запроса и пустой список facts. Поля present, partners и updates в этом ответе пропусти.\n\n" + scenario.reply;
    await checkLiveNpcPortraits(info, [{ ...scenario, draft }]);
  });
}

test("live Mistral restores an NPC after a pronoun return without a cast list", async ({}, info) => {
  const turns = returningPortraits.map(exactPortraitTurn);
  const finalTurn = turns.at(-1)!;
  finalTurn.draft = "Продолжи сцену одним коротким предложением рассказчика. Ответ состоит ровно из двух слов и точки. После точки сразу закончи, без списка участников, кода или служебного блока. Вот весь текст ответа:\n\n" + finalTurn.reply;
  await checkLiveNpcPortraits(info, turns);
});

const runtimeCommand = (page: Page, message: object) => page.evaluate(input =>
  (window as unknown as { deepRoleDesktop: { call(method: string, input: object): Promise<any> } }).deepRoleDesktop.call("runtimeSend", input), message);

async function watchNewWindows(app: ElectronApplication) {
  const events = await app.evaluateHandle(({ app: electron }) => {
    const shown: number[] = [];
    electron.on("browser-window-created", (_event, window) => window.on("show", () => shown.push(window.id)));
    return shown;
  });
  return () => events.jsonValue();
}

async function provider(reply: (prompt: string) => string | null | Promise<string | null>, window?: number) {
  const prompts: string[] = [];
  const requests: { messages: { role: string; content: string }[]; max_tokens: number }[] = [];
  const modelRequests: (string | undefined)[] = [];
  const completionAuthorizations: (string | undefined)[] = [];
  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/v1/models") {
      modelRequests.push(request.headers.authorization);
      const data = [{ id: "desktop-image-fixture" }, {
        id: "test-story", ...(window ? { model_spec: { availableContextTokens: window, pricing: { input: { usd: 2 }, output: { usd: 8 } } } } : {}),
      }];
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ data }));
      return;
    }
    if (request.method === "POST" && request.url === "/v1/images/generations") {
      request.resume();
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ data: [{ b64_json: realPng }] }));
      return;
    }
    if (request.url !== "/v1/chat/completions") { response.writeHead(404).end(); return; }
    completionAuthorizations.push(request.headers.authorization);
    let body = "";
    for await (const chunk of request) body += chunk;
    const completion = JSON.parse(body);
    requests.push(completion);
    const prompt = requests.at(-1)!.messages.map(message => message.content).join("\n\n");
    prompts.push(prompt);
    const content = await reply(prompt);
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    if (content === null) { response.end('data: {"choices":[{"delta":{"content":"Незавершённая строка"},"finish_reason":"length"}]}\n\n'); return; }
    const usage = window ? `data: ${JSON.stringify({ choices: [], id: "test-" + prompts.length, usage: { prompt_tokens: 12345, completion_tokens: 9 } })}\n\n` : "";
    response.end(`data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: "stop" }] })}\n\n${usage}data: [DONE]\n\n`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Test server unavailable");
  return { prompts, requests, modelRequests, completionAuthorizations, url: `http://127.0.0.1:${address.port}/v1`, close: () => server.close() };
}

for (const mode of ["off", "automatic"] as const) {
  test(`counts ordinary and additional memory requests with review ${mode}`, async ({}, info) => {
    test.setTimeout(90_000);
    const f = storyWorld("en", 3);
    f.world.storyAutomation = { mode: "automatic", revision: "request-count-inline" };
    f.binding.chatUrl = "https://deeprole.local/a/chat/s/" + f.binding.chatId;
    const clue = "The brass key opens the north gate.";
    const unassessed = "The silver seal carries a backwards letter V.";
    const talk = "I show Iris the brass key.";
    const reply = "Day 4 · 11:40\n\nIris studies the brass key.";
    const data = info.outputPath("memory-review-data");
    const sourcesOf = (prompt: string) => JSON.parse(prompt.slice(prompt.lastIndexOf("\nSources: ") + 10)) as { id: string; role: string; text: string }[];
    const api = await provider(prompt => {
      if (!prompt.includes("[DeepRole Memory Batch]")) return reply;
      const requestId = /\[Request ID: ([^\]]+)\]/u.exec(prompt)?.[1];
      return JSON.stringify({ requestId, results: sourcesOf(prompt).map(source => ({
        source: source.id, complete: true, people: [],
        facts: source.role === "assistant" && ([clue, unassessed].includes(source.text) || source.text.startsWith("The survey continues past door "))
          ? [{ kind: "event", text: source.text, quote: source.text, risk: source.text === unassessed ? undefined : "ordinary" }] : [],
      })) });
    });
    let app: ElectronApplication | undefined;
    try {
      const started = await openClient(data);
      app = started.app;
      const { page } = started;
      await attachModel(page, api.url);
      await page.evaluate(async () => {
        const { deeprole_settings = {} } = await window.deepRoleDesktop.call<{ deeprole_settings?: object }>("storageGet", "local", "deeprole_settings");
        await window.deepRoleDesktop.call("storageSet", "local", {
          deeprole_settings: { ...deeprole_settings, locale: "en", onboardingComplete: true, automaticMetadataRepair: false, sceneChoicesEnabled: false },
        });
      });
      await seedLibrary(page, f.records);
      const chats = path.join(data, "Chats"), file = path.join(chats, f.binding.chatId + ".json");
      await mkdir(chats, { recursive: true });
      const messages: { id: number; parent: number | null; role: "user" | "assistant"; text: string; visible: string }[] = [];
      const append = (role: "user" | "assistant", text: string) => {
        const parent = messages.at(-1)?.id ?? null;
        messages.push({ id: (parent ?? 0) + 1, parent, role, text, visible: text });
      };
      const save = () => writeFile(file, JSON.stringify({
        id: f.binding.chatId, title: "Synthetic workshop", head: messages.at(-1)!.id, messages, updatedAt: 1,
      }));
      append("user", "Start at the workshop.");
      append("assistant", "Day 4 · morning\n\nThe workshop opens.");
      await save();
      await page.goto(f.binding.chatUrl);
      const draft = page.getByRole("textbox", { name: "Your message", exact: true });
      await expect(draft).toBeVisible();
      const send = (input: object) => page.evaluate(async message => {
        const [tab] = await window.deepRoleDesktop.call<{ id: number }[]>("tabQuery", { currentWindow: true, active: true });
        return tab ? window.deepRoleDesktop.call<{ ok: boolean; data?: MemoryBatchStatus }>("tabSend", tab.id, message) : null;
      }, input);
      const scope = { worldId: f.world.id, chatId: f.binding.chatId };
      const batchInput = { ...scope, force: false };
      const operation = (operation: "start" | "sync") => send({ type: "DR_STORY_GAME", operation, scope, manual: "stop" });
      const status = () => send({ type: "DR_MEMORY_BATCH", action: "status", input: batchInput });
      await expect.poll(async () => (await operation("start"))?.ok).toBe(true);
      for (let i = 1; i <= 11; i++) {
        append("user", "I continue the rounds.");
        append("assistant", i === 1 ? clue : i === 2 ? unassessed : `The survey continues past door ${i}.`);
      }
      await save();
      await page.reload();
      await expect(draft).toBeVisible();
      await expect.poll(async () => (await operation("sync"))?.ok).toBe(true);
      await expect.poll(async () => (await status())?.data?.pendingTurns).toBe(11);
      if (mode === "automatic") {
        expect(await send({ type: "DR_MEMORY_BATCH", action: "policy", input: batchInput, mode })).toMatchObject({ ok: true });
      }
      expect(await status()).toMatchObject({ ok: true, data: { mode, due: false } });
      expect(api.prompts).toHaveLength(0);
      await draft.fill(talk);
      await draft.press("Enter");
      await expect(page.locator(".desktop-story-text").last()).toContainText("Iris studies the brass key.");
      const expected = mode === "automatic"
        ? { mode, pendingTurns: 0, processedSources: 24, due: false }
        : { mode, pendingTurns: 12, processedSources: 0, due: false };
      await expect.poll(async () => {
        const result = await status();
        if (result?.data?.reason === "failed") {
          return { ...result.data, services: (await libraryRecords(page)).filter(row => row.kind === "service")
            .map(row => ({ error: row.data.error, phase: row.data.phase, cleanup: row.data.cleanup })) };
        }
        return result?.data;
      }, { timeout: 40_000 }).toMatchObject(expected);
      const batches = api.prompts.filter(prompt => prompt.includes("[DeepRole Memory Batch]"));
      expect(api.prompts.filter(prompt => !batches.includes(prompt))).toHaveLength(1);
      expect(batches).toHaveLength(mode === "automatic" ? 1 : 0);
      if (mode === "automatic") expect(sourcesOf(batches[0]!)).toHaveLength(24);
      const records = await libraryRecords(page);
      const saved = records.find(row => row.kind === "world" && row.data.id === f.world.id)?.data.sharedGame?.facts ?? [];
      expect(saved.some((fact: { text: string }) => fact.text === clue)).toBe(mode === "automatic");
      expect(saved.some((fact: { text: string }) => fact.text === unassessed)).toBe(false);
      expect(records.filter(row => row.kind === "story" && row.data.memoryBatchSourceRevisionId && row.data.memory)
        .map(row => `${row.data.automation.status}: ${row.data.memory.text}`).sort())
        .toEqual(mode === "automatic" ? [`review: ${unassessed}`, `saved: ${clue}`] : []);
      await expect.poll(async () => (await libraryRecords(page)).filter(row => row.kind === "service")
        .map(row => ({ phase: row.data.phase, cleanup: row.data.cleanup }))).toEqual(
        mode === "automatic" ? [{ phase: "result", cleanup: "done" }] : []);
    } finally {
      await app?.close();
      api.close();
    }
  });
}

test("plays a streamed turn and opens the same history from a copied data directory", async ({}, info) => {
  const opening = "За стеной плеснула вода. 👩";
  const speech = "Мы уже проходили здесь утром. На двери осталась меловая черта, а у окна, кажется, кто-то зажёг новый фонарь. Давай сначала посмотрим с лестницы.";
  const scene = "🏽‍💻 В коридоре пахло мокрым деревом, а на стене дрожал отражённый свет.\n\n"
    + "*Мира замерла.* **Тише!** \x60— Слышишь?\x60\n\n\n"
    + "Она подняла фонарь, осветила ступени и лишь потом повернулась к двери.\n\n"
    + "— \x60" + speech + "\x60 — добавила она.\n\n> **Записка**\n> _По лестнице._";
  const captured: any[] = [];
  let startStream!: () => void;
  const holdHeaders = new Promise<void>(resolve => { startStream = resolve; });
  let finishStream!: () => void;
  const keepStreamOpen = new Promise<void>(resolve => { finishStream = resolve; });
  const server = createServer(async (request, response) => {
    if (request.url !== "/v1/chat/completions") { response.writeHead(404).end(); return; }
    let body = "";
    for await (const chunk of request) body += chunk;
    captured.push(JSON.parse(body));
    await holdHeaders;
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: opening } }] })}\n\n`);
    await keepStreamOpen;
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: scene } }] })}\n\n`);
    response.end('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Test server unavailable");
  const packagedExecutable = process.env.DEEPROLE_TEST_PORTABLE_DATA === "1" && process.env.DEEPROLE_TEST_PACKAGED === "1" ? process.env.DEEPROLE_TEST_ELECTRON : undefined;
  const original = packagedExecutable ? path.join(path.dirname(packagedExecutable), "DeepRole Data") : info.outputPath("original");
  const copied = info.outputPath("other-computer");
  let app: ElectronApplication | undefined;
  try {
    const started = await openClient(original, !!packagedExecutable);
    app = started.app;
    expect(await app.evaluate(({ app }) => app.getPath("userData"))).toBe(original);
    const { page } = started;
    const caption = page.locator(".desktop-window-caption");
    if (process.platform === "win32") {
      await expect.poll(() => page.evaluate(() => {
        const overlay = (navigator as Navigator & { windowControlsOverlay?: { visible: boolean } }).windowControlsOverlay;
        return overlay?.visible;
      })).toBe(true);
      await expect(caption).toHaveCSS("height", "32px");
      await expect(caption).toHaveCSS("background-color", "oklch(0.165 0.006 285)");
      await expect(caption).toHaveCSS("-webkit-app-region", "drag");
      expect(await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find(window => window.webContents.getURL() === "https://deeprole.local/");
        return win?.isMinimizable() && win.isMaximizable() && win.isClosable();
      })).toBe(true);
      const blankTab = await page.evaluate(async () => {
        const tab = await window.deepRoleDesktop.call<{ id: number }>("tabCreate", { url: "about:blank", active: false });
        await window.deepRoleDesktop.call("tabRemove", tab.id);
        return tab.id;
      });
      expect(blankTab).toBeGreaterThan(0);
    }
    await attachModel(page, `http://127.0.0.1:${address.port}/v1`);
    await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: null });
    const draft = page.getByRole("textbox", { name: "Ваша реплика" });
    const composer = page.locator(".desktop-composer");
    const composerPaint = () => composer.evaluate(element => {
      const style = getComputedStyle(element);
      return [style.background, style.boxShadow, style.borderWidth];
    });
    const restingPaint = await composerPaint();
    await draft.click();
    await expect(page.locator(".desktop-editor-caret")).toBeVisible();
    expect(await composerPaint()).toEqual(restingPaint);
    await expect(composer).toHaveCSS("border-width", "0px");
    await expect(composer).toHaveCSS("padding", "8px");
    await draft.fill("На мосту ✨");
    const dust = page.locator(".desktop-editor-dissolve");
    await draft.press("Backspace");
    await expect(draft).toHaveValue("На мосту ");
    await expect(dust).toHaveAttribute("data-active", "");
    await expect(dust).not.toHaveAttribute("data-active", "");
    await draft.press("Control+a");
    await draft.press("Backspace");
    await expect(draft).toHaveValue("");
    await expect(dust).toHaveAttribute("data-active", "");
    await draft.press("Control+z");
    await expect(draft).toHaveValue("На мосту ");
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: null });
    await expect(page.locator(".desktop-editor-caret")).toBeHidden();
    await expect(draft).not.toHaveCSS("caret-color", "rgba(0, 0, 0, 0)");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(draft).toHaveCSS("resize", "none");
    const editorHeight = () => draft.evaluate(node => node.clientHeight);
    const restingHeight = await editorHeight();
    await draft.fill("Обычная реплика в разных строках.\n".repeat(4));
    expect(await editorHeight()).toBeGreaterThan(restingHeight);
    await draft.fill("Длинная реплика продолжается.\n".repeat(40));
    const cappedHeight = await editorHeight();
    expect(cappedHeight).toBeLessThanOrEqual(204);
    await draft.fill("Длинная реплика продолжается.\n".repeat(50));
    expect(await editorHeight()).toBe(cappedHeight);
    expect(await draft.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
    await draft.fill("");
    expect(await editorHeight()).toBe(restingHeight);
    await draft.fill("Открываю дверь.");
    await page.getByRole("button", { name: /^(Отправить|Send)$/ }).click();
    await expect(draft).toHaveValue("");
    await expect(page.locator(".desktop-message-bubble")).toHaveText("Открываю дверь.");
    await expect.poll(() => captured.length).toBe(1);
    const reply = page.locator(".desktop-assistant .desktop-story-text");
    await expect(reply).toHaveCount(0);
    startStream();
    await expect(reply).toHaveText("За стеной плеснула вода. 👩");
    await expect(reply.locator(".desktop-text-reveal")).toHaveCSS("animation-name", "desktop-text-in");
    await expect(page.locator(".desktop-user .desktop-text-reveal")).toHaveText("Открываю дверь.");
    await expect(page.getByTestId("stop-generation")).toBeVisible();
    await draft.fill("Открываю дверь.");
    finishStream();
    await expect(page.locator('[data-role="assistant"]')).toContainText("За стеной плеснула вода.");
    await expect(reply.locator("em").first()).toHaveText("Мира замерла.", { useInnerText: true });
    await expect(reply.locator("strong").first()).toHaveText("Тише!", { useInnerText: true });
    const speechParts = reply.locator("code");
    await expect(speechParts.first()).toHaveText("— Слышишь?", { useInnerText: true });
    await expect(speechParts.first()).toHaveCSS("font-family", /Cascadia Mono/);
    await expect(speechParts.last()).toHaveText(speech, { useInnerText: true });
    await expect(speechParts.last()).toHaveCSS("box-decoration-break", "clone");
    await expect(speechParts.last()).toHaveCSS("background-color", "oklch(0.26 0.009 285)");
    const paragraphs = reply.locator(":scope > p");
    await expect(paragraphs).toHaveCount(4);
    await expect(paragraphs.nth(2)).toHaveCSS("margin-block-start", "16px");
    await expect(reply.locator(".desktop-text-reveal").filter({ hasText: "👩🏽‍💻" })).toHaveCount(1);
    await expect(reply.locator("blockquote")).toHaveText("Записка По лестнице.", { useInnerText: true });
    expect(await reply.textContent()).toBe(opening + scene);
    await expect(page.locator(".desktop-chat-link")).toContainText("Открываю дверь.");
    await expect(page.locator("html")).toHaveCSS("background-color", "oklch(0.195 0.007 285)");
    await expect(page.locator("html")).toHaveCSS("font-family", /Manrope/);
    await expect(page.getByTestId("stop-generation")).toHaveCount(0);
    await expect(draft).toHaveValue("Открываю дверь.");
    await expect(page.getByRole("button", { name: "Скрыть список чатов" })).toBeVisible();
    await page.evaluate(() => window.deepRoleDesktop.call("setTheme", "dark"));
    const themeButton = page.getByRole("button", { name: "Светлая тема", exact: true });
    const round = (button: Element) => {
      const face = getComputedStyle(button, "::before");
      return { radius: face.borderRadius, inset: face.left, halo: face.backgroundColor !== "rgba(0, 0, 0, 0)" ? "1" : "0" }; // DeepRole Ink: hover shows a tonal face.
    };
    await draft.hover();
    await expect.poll(() => themeButton.evaluate(round)).toEqual({ radius: "10px", inset: "4px", halo: "0" });
    for (const [control, radius] of [[themeButton, "10px"], [page.getByRole("button", { name: "Игровые панели" }), "10px"]] as const) {
      await control.hover();
      await expect.poll(() => control.evaluate(round)).toEqual({ radius, inset: "4px", halo: "1" });
    }
    const newChat = page.getByRole("link", { name: "Новый чат" });
    await expect(newChat).toHaveText("Новый чат");
    await expect(newChat).toHaveCSS("min-height", "44px");
    const send = page.locator(".desktop-send");
    await page.getByRole("textbox", { name: "Ваша реплика" }).fill("Проверка кнопки.");
    await expect(send).toBeEnabled();
    await expect.poll(() => send.evaluate(button => getComputedStyle(button, "::before").backgroundColor)).toBe("oklch(0.75 0.13 282)");
    await page.getByRole("textbox", { name: "Ваша реплика" }).clear();
    expect(captured).toHaveLength(1);
    expect(captured[0].messages.at(-1).content).toContain("Открываю дверь.");
    await page.screenshot({ path: info.outputPath("chat.png") });
    await themeButton.click();
    await page.emulateMedia({ colorScheme: null });
    await expect(page.locator("html")).toHaveCSS("background-color", "oklch(0.994 0.0015 285)");
    if (process.platform === "win32") await expect(caption).toHaveCSS("background-color", "oklch(0.964 0.004 285)");
    await app.close();
    app = undefined;
    await cp(original, copied, { recursive: true, filter: source => !/(?:^|[\\/])(?:Singleton\w*|LOCK|lockfile|Crashpad|GPUCache|Code Cache|Cache)$/u.test(source) });
    const restored = await openClient(copied);
    app = restored.app;
    await expect(restored.page.locator("html")).toHaveCSS("background-color", "oklch(0.994 0.0015 285)");
    await restored.page.getByRole("link", { name: "Открываю дверь." }).click();
    await expect(restored.page.locator('[data-role="assistant"]')).toContainText("За стеной плеснула вода.");
    const restoredReply = restored.page.locator(".desktop-story-text");
    await expect(restoredReply.locator("code").first()).toHaveText("— Слышишь?", { useInnerText: true });
    await restored.page.setViewportSize({ width: 320, height: 620 });
    const wrappedSpeech = restoredReply.locator("code").last();
    await expect(wrappedSpeech).toHaveCSS("background-color", "oklch(0.966 0.004 285)");
    expect(await wrappedSpeech.evaluate(node => node.getClientRects().length)).toBeGreaterThan(1);
    expect(await restoredReply.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await wrappedSpeech.scrollIntoViewIfNeeded();
    await restored.page.screenshot({ path: info.outputPath("chat-reading-320.png"), animations: "disabled" });
    await expect(restored.page.locator(".desktop-story-text blockquote em")).toHaveText("По лестнице.", { useInnerText: true });
    await expect(restored.page.locator(".desktop-story-text")).toContainText("👩🏽‍💻");
    expect(captured).toHaveLength(1);
    const route = new URL(restored.page.url()).pathname.split("/").at(-1)!;
    expect(JSON.parse(await readFile(path.join(copied, "Chats", route + ".json"), "utf8")).messages).toHaveLength(2);

    await restored.page.setViewportSize({ width: 1440, height: 780 });
    const history = restored.page.getByRole("navigation", { name: "История чатов" });
    const selectedChat = history.getByRole("link", { name: "Открываю дверь." });
    await expect(selectedChat).toHaveAttribute("aria-current", "page");
    await expect(selectedChat).toHaveCSS("min-height", "36px");
    expect(await selectedChat.evaluate(link => getComputedStyle(link.parentElement!, "::before").width)).toBe("3px");
    const chatActions = history.getByRole("button", { name: "Действия чата" });
    await chatActions.focus();
    await expect(chatActions).toHaveCSS("opacity", "1");
    await chatActions.press("Enter");
    const deleteChat = history.getByRole("menuitem", { name: "Удалить чат" });
    await expect(deleteChat).toBeFocused();
    await deleteChat.press("Escape");
    await expect(deleteChat).toHaveCount(0);
    await expect(chatActions).toBeFocused();
    const historyToggle = restored.page.locator('[aria-controls="desktop-chat-history"]');
    const gameToggle = restored.page.getByRole("button", { name: "Игровые панели", exact: true });
    const viewport = restored.page.locator(".desktop-viewport");
    const draftAfterCopy = restored.page.getByRole("textbox", { name: "Ваша реплика" });
    await expect(gameToggle).toHaveAttribute("aria-expanded", "true");
    const beforeCollapse = (await viewport.boundingBox())!.width;
    await draftAfterCopy.fill("Черновик для следующего хода.");
    await expect(restored.page.getByRole("button", { name: "Закрыть панель чатов" })).toHaveCount(0);
    await restored.page.getByRole("button", { name: "Скрыть список чатов" }).click();
    await expect(history).toBeHidden();
    await expect(historyToggle).toBeFocused();
    await expect.poll(async () => (await viewport.boundingBox())!.width).toBeGreaterThan(beforeCollapse + 200);
    await gameToggle.click();
    await expect(gameToggle).toHaveAttribute("aria-expanded", "false");
    await expect(draftAfterCopy).toHaveValue("Черновик для следующего хода.");
    await restored.page.screenshot({ path: info.outputPath("chat-without-sidebars.png") });
    await restored.page.reload();
    await expect(restored.page.locator('[data-role="assistant"]')).toContainText("За стеной плеснула вода.");
    await expect(historyToggle).toHaveAttribute("aria-expanded", "false");
    await expect(gameToggle).toHaveAttribute("aria-expanded", "false");
    await historyToggle.click();
    await gameToggle.click();
    await expect(gameToggle).toHaveAttribute("aria-expanded", "true");
    await restored.page.getByRole("button", { name: "Библиотека" }).click();
    await expect(restored.page.locator(".desktop-app")).toHaveAttribute("data-overlay", "library");
    await expect(gameToggle).toHaveAttribute("aria-expanded", "true");
    await restored.page.frameLocator(".desktop-library iframe").getByRole("button", { name: "Закрыть", exact: true }).first().click();

    await restored.page.setViewportSize({ width: 1000, height: 620 });
    await expect(gameToggle).toHaveAttribute("aria-expanded", "false");
    await gameToggle.click();
    await expect(restored.page.locator(".desktop-app")).toHaveAttribute("data-overlay", "game");
    await restored.page.locator(".desktop-game-shade").click({ position: { x: 500, y: 20 } });
    await expect(gameToggle).toBeFocused();
    await restored.page.setViewportSize({ width: 1320, height: 620 });
    await historyToggle.click();
    await expect(restored.page.locator(".desktop-main")).toHaveAttribute("data-game-docked", "true");
    await expect(gameToggle).toHaveAttribute("aria-expanded", "true");
    await historyToggle.click();

    await restored.page.setViewportSize({ width: 320, height: 620 });
    await restored.page.getByRole("button", { name: "Открыть список чатов" }).click();
    await expect(history).toBeVisible();
    const closeHistory = restored.page.getByRole("button", { name: "Закрыть панель чатов" });
    await expect(closeHistory).toBeFocused();
    await expect(restored.page.locator(".desktop-main")).toHaveAttribute("inert", "");
    await restored.page.screenshot({ path: info.outputPath("chat-history-320.png"), animations: "disabled" });
    await closeHistory.press("Escape");
    await expect(history).toBeHidden();
    await expect(historyToggle).toBeFocused();
    const narrowHeader = restored.page.locator(".desktop-header");
    const storyTitle = narrowHeader.getByRole("heading", { level: 1 });
    const modelControl = narrowHeader.getByRole("button", { name: "test-story", exact: true });
    await expect(narrowHeader).toHaveCSS("height", "88px");
    await expect(storyTitle).toHaveAttribute("title", "Открываю дверь.");
    await expect(restored.page.locator(".desktop-window-caption")).toHaveText("DeepRole");
    const titleBounds = (await storyTitle.boundingBox())!;
    const modelBounds = (await modelControl.boundingBox())!;
    expect(titleBounds.width).toBeGreaterThanOrEqual(280);
    expect(modelBounds.y).toBeGreaterThanOrEqual(titleBounds.y + titleBounds.height);
    await expect(modelControl).toHaveCSS("min-height", "44px");
    await historyToggle.click();
    await restored.page.getByRole("button", { name: "Библиотека" }).first().click();
    const library = restored.page.frameLocator(".desktop-library iframe");
    await expect(library.locator("html")).toHaveCSS("background-color", "oklch(0.994 0.0015 285)");
    await expect(library.locator(".workspace-nav")).toBeInViewport();
    await expect(library.locator(".app-main")).toHaveCSS("padding-inline", "12px");
    const close = library.getByRole("button", { name: "Закрыть", exact: true }).first();
    await close.hover();
    await expect.poll(() => close.evaluate(round)).toEqual({ radius: "10px", inset: "4px", halo: "1" });
    await expect(close).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await library.getByRole("button", { name: "Настройки", exact: true }).click();
    await library.getByRole("button", { name: /Язык и уведомления/ }).click();
    await library.getByRole("button", { name: /^(English|Английский)$/u }).click();
    await expect(library.locator(".app-main")).not.toContainText(/\b(?:DeepSeek|BDS)\b/iu);
    await restored.page.screenshot({ path: info.outputPath("library-narrow-en.png") });
    await library.getByRole("button", { name: "Close", exact: true }).first().click();
    await restored.page.getByRole("button", { name: "test-story", exact: true }).click();
    const modelDialog = restored.page.getByRole("dialog", { name: "Text model" });
    await modelDialog.getByRole("button", { name: "Load model list" }).click();
    await expect(modelDialog.getByRole("status")).toContainText("The list is unavailable");
    await expect(modelDialog.getByLabel("Model ID")).toHaveValue("test-story");
    await modelDialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(restored.page.getByRole("textbox", { name: "Your message" })).toBeInViewport();
    await expect(restored.page.getByRole("button", { name: "Send", exact: true })).toBeInViewport();
    await restored.page.getByRole("textbox", { name: "Your message" }).fill("Wrapped text without a newline. ".repeat(40));
    await expect(restored.page.getByRole("button", { name: "Send", exact: true })).toBeInViewport();
    expect(await restored.page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await restored.page.screenshot({ path: info.outputPath("chat-narrow-en.png") });

    const panels = restored.page.getByRole("button", { name: "Game panels", exact: true });
    const gamePanel = restored.page.getByRole("complementary", { name: "Game", exact: true });
    await expect(panels).toHaveAttribute("aria-expanded", "false");
    await panels.click();
    await expect(panels).toHaveAttribute("aria-expanded", "true");
    await expect(gamePanel.getByRole("button", { name: "Hide game panel" })).toBeFocused();
    await expect(gamePanel).toBeVisible();
    const headerBounds = (await narrowHeader.boundingBox())!;
    expect((await gamePanel.boundingBox())!.y).toBeCloseTo(headerBounds.y + headerBounds.height, 0);
    await expect(restored.page.locator(".desktop-composer-area")).toHaveAttribute("inert", "");
    await restored.page.screenshot({ path: info.outputPath("game-panel-320-en.png"), animations: "disabled" });
    await gamePanel.getByRole("button", { name: "Scene", exact: true }).press("Escape");
    await expect(gamePanel).toBeHidden();
    await expect(panels).toBeFocused();
    await restored.page.emulateMedia({ reducedMotion: "reduce", colorScheme: null });
    await restored.page.getByRole("button", { name: "Open library", exact: true }).click();
    await expect(restored.page.locator(".desktop-library")).toHaveCSS("transition-duration", "0s");
  } finally {
    startStream();
    finishStream();
    await app?.close();
    server.close();
  }
});

test("starts a Windows story with one setup action and keeps the first draft", async ({}, info) => {
  const data = info.outputPath("data");
  const reply = "Мира подняла фонарь у окна.";
  const firstTurn = "Подхожу к окну и осторожно стучу.";
  const api = await provider(() => reply);
  let app: ElectronApplication | undefined;
  try {
    const client = await openClient(data);
    app = client.app;
    const { page } = client;
    let requests = 0;
    page.on("request", request => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/api/v0/chat/completion") requests++;
    });
    const init = page.getByRole("button", { name: "Подключить модель", exact: true });
    await expect(init).toHaveCount(1);
    await expect(init).toBeInViewport();
    await expect(init).toHaveCSS("background-color", "oklch(0.75 0.13 282)");
    await expect(page.locator(".desktop-header .desktop-model")).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("new-story-setup.png"), animations: "disabled" });

    const draft = page.getByRole("textbox", { name: "Ваша реплика" });
    const settings = page.getByRole("dialog", { name: "Текстовая модель", exact: true });
    await draft.fill(firstTurn);
    await draft.press("Enter");
    await expect(settings.getByLabel("Адрес API")).toBeFocused();
    await expect(draft).toHaveValue(firstTurn);
    await expect(page).toHaveURL("https://deeprole.local/");
    expect(requests).toBe(0);
    await page.keyboard.press("Escape");
    await expect(settings).toBeHidden();
    await expect(draft).toBeFocused();
    await expect(draft).toHaveValue(firstTurn);

    await attachModel(page, api.url);
    await expect(draft).toBeFocused();
    await expect(draft).toHaveValue(firstTurn);
    await expect(page).toHaveURL("https://deeprole.local/");
    expect(requests).toBe(0);
    expect(api.prompts).toHaveLength(0);

    await page.evaluate(() => window.deepRoleDesktop.call("setTheme", "light"));
    await page.setViewportSize({ width: 320, height: 620 });
    await page.evaluate(() => window.deepRoleDesktop.call("storageSet", "local", { deeprole_settings: { locale: "en", onboardingComplete: true } }));
    await expect(page.getByRole("heading", { name: "Your first turn", exact: true })).toBeInViewport();
    await expect(page.locator("html")).toHaveCSS("background-color", "oklch(0.994 0.0015 285)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await page.screenshot({ path: info.outputPath("new-story-ready-320.png"), animations: "disabled" });
    const englishDraft = page.getByRole("textbox", { name: "Your message" });
    await expect(englishDraft).toHaveValue(firstTurn);
    await englishDraft.press("Enter");
    await expect(page.locator(".desktop-story-text")).toHaveText(reply);
    await expect(englishDraft).toHaveValue("");
    expect(api.prompts).toHaveLength(1);
    expect(api.requests[0]?.messages.at(-1)?.content).toContain(firstTurn);
  } finally {
    await app?.close();
    api.close();
  }
});

test("uses one desktop history toggle and keeps the close button in the narrow drawer", async ({}, info) => {
  const { app, page } = await openClient(info.outputPath("data"));
  try {
    const history = page.getByRole("complementary", { name: "Чаты", exact: true });
    const show = page.getByRole("button", { name: "Открыть список чатов", exact: true });
    const hide = page.getByRole("button", { name: "Скрыть список чатов", exact: true });
    const close = history.getByRole("button", { name: "Закрыть панель чатов", exact: true });
    await expect(history).toBeVisible();
    await expect(hide).toHaveCount(1);
    await expect(close).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("history-wide.png"), animations: "disabled" });
    await hide.click();
    await expect(history).toBeHidden();
    await show.click();
    await expect(history).toBeVisible();

    await page.setViewportSize({ width: 320, height: 620 });
    await expect(history).toBeHidden();
    await show.press("Enter");
    await expect(close).toBeFocused();
    await page.screenshot({ path: info.outputPath("history-drawer.png"), animations: "disabled" });
    await close.press("Enter");
    await expect(history).toBeHidden();
    await expect(show).toBeFocused();
  } finally {
    await app.close();
  }
});

test("updates lore from the Windows composer and opens the result for review", async ({}, info) => {
  const fact = "Мира оставила ключ под фонарём.";
  const mock = await provider(prompt => prompt.includes("[DeepRole Memory Analysis]")
    ? `Найден один факт.\n<deeprole_data>${JSON.stringify({ type: "memory-suggestions", items: [
        { title: "Ключ под фонарём", content: fact, keywords: ["ключ"], activation: "smart", priority: "normal" },
      ] })}</deeprole_data>`
    : fact);
  let app: ElectronApplication | undefined;
  try {
    const client = await openClient(info.outputPath("data"));
    app = client.app;
    const { page } = client;
    await attachModel(page, mock.url);
    await page.setViewportSize({ width: 320, height: 620 });
    const controls = page.locator(".desktop-composer-controls");
    const initialHeight = (await controls.boundingBox())!.height;
    const update = page.locator(".desktop-composer").getByRole("button", { name: "Обновить лор", exact: true });
    await expect(update).toHaveCount(0);
    const draft = page.getByRole("textbox", { name: "Ваша реплика" });
    await draft.fill("Где остался ключ?");
    await draft.press("Enter");
    await expect(page.locator(".desktop-story-text")).toHaveText(fact);
    await expect(update).toBeInViewport();
    await expect(update).toBeEnabled();
    expect((await controls.boundingBox())!.height).toBe(initialHeight);
    await expect(page.locator(".desktop-game-toggle")).toHaveAttribute("aria-expanded", "false");
    await draft.fill("Черновик следующего хода");
    await update.click();
    await expect(draft).toHaveValue("Черновик следующего хода");
    expect(mock.prompts).toHaveLength(1);
    await draft.clear();
    await page.evaluate(async () => {
      const { deeprole_settings } = await window.deepRoleDesktop.call<{ deeprole_settings: object }>("storageGet", "local", "deeprole_settings");
      await window.deepRoleDesktop.call("storageSet", "local", { deeprole_settings: { ...deeprole_settings, locale: "en" } });
    });
    const englishUpdate = page.locator(".desktop-composer").getByRole("button", { name: "Update lore", exact: true });
    await expect(englishUpdate).toBeInViewport();
    await englishUpdate.press("Enter");
    await expect(page.getByRole("dialog", { name: "Selected memory" })).toContainText("Ключ под фонарём");
    expect(mock.prompts).toHaveLength(2);
    expect(mock.prompts[1]).toContain("[DeepRole Memory Analysis]");
    expect((await libraryRecords(page)).some(row => row.kind === "entry" && row.data.content === fact)).toBe(false);
  } finally { await app?.close(); mock.close(); }
});

test("opens Windows settings directly and lets the empty composer hint fade in", async ({}, info) => {
  const { app, page } = await openClient(info.outputPath("data"));
  try {
    const settings = page.getByRole("button", { name: "Настройки", exact: true });
    const library = page.frameLocator(".desktop-library iframe");
    expect(await settings.evaluate(button => {
      const icon = button.querySelector("svg")!.getBoundingClientRect();
      const label = button.querySelector("span")!.getBoundingClientRect();
      return label.width > 0 && label.left >= icon.right && Math.abs(icon.y + icon.height / 2 - label.y - label.height / 2) < 1;
    })).toBe(true);
    expect(await settings.evaluate(button => getComputedStyle(button, "::before").borderRadius)).toBe("10px");
    await settings.press("Enter");
    await expect(settings).toHaveAttribute("aria-expanded", "true");
    await expect(library.getByRole("heading", { name: "Настройки", exact: true })).toBeFocused();
    await page.screenshot({ path: info.outputPath("settings-dark.png"), animations: "disabled" });
    await library.getByRole("button", { name: "Текстовая модель", exact: true }).click();
    const model = page.getByRole("dialog", { name: "Текстовая модель", exact: true });
    await expect(model).toBeVisible();
    await model.getByLabel("Адрес API").press("Escape");
    await expect(model).toBeHidden();
    await library.getByRole("button", { name: "Вид чата", exact: true }).click();
    await expect(library.getByRole("checkbox", { name: "Показывать портреты", exact: true })).toBeChecked();
    await library.getByRole("heading", { name: "Вид чата", exact: true }).press("Escape");
    await expect(page.locator(".desktop-library")).toBeHidden();
    await expect(settings).toBeFocused();

    await page.emulateMedia({ reducedMotion: "no-preference" });
    const editor = page.getByRole("textbox", { name: "Ваша реплика" });
    const hint = page.locator(".desktop-editor-placeholder");
    await expect(hint).toHaveCSS("opacity", "1");
    await editor.fill("Черновик");
    await expect(hint).toHaveCSS("opacity", "0");
    await editor.press("Control+a");
    await editor.press("Backspace");
    await expect(editor).toHaveValue("");
    await expect(hint).toHaveCSS("transition-delay", "0.25s");
    expect(await hint.evaluate(node => getComputedStyle(node).opacity)).toBe("0");
    await expect(hint).toHaveCSS("opacity", "1");
    await editor.fill("Снова");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await editor.press("Control+a");
    await editor.press("Backspace");
    await expect(hint).toHaveCSS("transition-duration", "0s");
    await expect(hint).toHaveCSS("opacity", "1");

    await page.evaluate(() => window.deepRoleDesktop.call("setTheme", "light"));
    await page.setViewportSize({ width: 320, height: 620 });
    await page.evaluate(async () => {
      const { deeprole_settings } = await window.deepRoleDesktop.call<{ deeprole_settings: object }>("storageGet", "local", "deeprole_settings");
      await window.deepRoleDesktop.call("storageSet", "local", { deeprole_settings: { ...deeprole_settings, locale: "en" } });
    });
    const narrowSettings = page.getByRole("button", { name: "Settings", exact: true });
    await expect(narrowSettings).toHaveCSS("width", "44px");
    expect(await narrowSettings.evaluate(button => getComputedStyle(button, "::before").borderRadius)).toBe("10px");
    await narrowSettings.click();
    await expect(library.getByRole("heading", { name: "Settings", exact: true })).toBeFocused();
    await expect(library.locator("html")).toHaveCSS("background-color", "oklch(0.994 0.0015 285)");
    await expect(library.getByRole("button", { name: "Text model", exact: true })).toBeInViewport();
    expect(await library.locator("html").evaluate(node => node.scrollWidth === node.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("settings-light-320.png"), animations: "disabled" });
  } finally { await app.close(); }
});

test("the Windows game sidebar opens the worlds library directly from an empty scene", async ({}, info) => {
  const { app, page } = await openClient(info.outputPath("data"));
  try {
    const game = page.getByRole("complementary", { name: "Игра", exact: true });
    const empty = game.getByRole("heading", { name: "Подключите мир", exact: true });
    await expect(empty).toBeVisible();
    await expect(game.getByRole("button", { name: "Герои", exact: true })).toHaveCount(0);
    await expect(game.getByRole("button", { name: /^Настроить сцену/ })).toHaveCount(0);
    await expect(game.getByRole("combobox", { name: "Мир", exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("game-start-dark.png"), animations: "disabled" });
    await game.getByRole("button", { name: "Открыть миры", exact: true }).click();
    const library = page.frameLocator(".desktop-library iframe");
    await expect(library.getByRole("heading", { name: "Миры", exact: true })).toBeVisible();
    await expect(library.getByRole("button", { name: "Загрузить мир из файла", exact: true })).toBeVisible();
    await library.getByRole("button", { name: "Закрыть", exact: true }).first().click();
    await expect(page.locator(".desktop-library")).toBeHidden();

    await page.evaluate(() => window.deepRoleDesktop.call("setTheme", "light"));
    await page.setViewportSize({ width: 320, height: 620 });
    await page.evaluate(() => window.deepRoleDesktop.call("storageSet", "local", { deeprole_settings: { locale: "en", onboardingComplete: true } }));
    const toggle = page.getByRole("button", { name: "Game panels", exact: true });
    await toggle.press("Enter");
    const narrowGame = page.getByRole("complementary", { name: "Game", exact: true });
    await expect(narrowGame.getByRole("heading", { name: "Connect a world", exact: true })).toBeVisible();
    const worlds = narrowGame.getByRole("button", { name: "Open worlds", exact: true });
    await expect(worlds).toBeInViewport();
    expect(await narrowGame.locator(".desktop-play-tools-scroll").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("game-start-light-320.png"), animations: "disabled" });
    await worlds.press("Enter");
    await expect(library.getByRole("heading", { name: "Worlds", exact: true })).toBeVisible();
    await library.getByRole("button", { name: "Close", exact: true }).first().press("Escape");
    await expect(page.locator(".desktop-library")).toBeHidden();
    await expect(toggle).toBeFocused();
  } finally { await app.close(); }
});

test("keeps the Windows reading column still beside panels and animates the drawers", async ({}, info) => {
  const { app, page } = await openClient(info.outputPath("data"));
  try {
    await page.emulateMedia({ colorScheme: null, reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1720, height: 940 });
    const historyToggle = page.locator(".desktop-history-toggle");
    const gameToggle = page.locator(".desktop-game-toggle");
    const settingsToggle = page.locator(".desktop-settings-toggle");
    const dockAnimating = () => page.evaluate(() => document.documentElement.matches(":active-view-transition-type(desktop-dock)"));
    const viewport = page.locator(".desktop-viewport");
    const composition = () => Promise.all([page.locator(".desktop-transcript").boundingBox(), page.locator(".desktop-composer").boundingBox()]);
    await expect(historyToggle).toHaveAttribute("aria-expanded", "true");
    await expect(gameToggle).toHaveAttribute("aria-expanded", "true");
    const before = (await viewport.boundingBox())!.width;
    await historyToggle.click();
    await expect.poll(dockAnimating).toBe(true);
    await expect(historyToggle).toHaveAttribute("aria-expanded", "false");
    await expect.poll(dockAnimating).toBe(false);
    expect((await viewport.boundingBox())!.width).toBeGreaterThan(before);
    await historyToggle.click();
    await expect(historyToggle).toHaveAttribute("aria-expanded", "true");
    await expect.poll(dockAnimating).toBe(false);
    const reading = await composition();
    const drawer = page.locator(".desktop-play-tools");
    await gameToggle.click();
    await expect(gameToggle).toHaveAttribute("aria-expanded", "false");
    expect(await composition()).toEqual(reading);
    await gameToggle.click();
    await expect(gameToggle).toHaveAttribute("aria-expanded", "true");
    expect(await composition()).toEqual(reading);
    await settingsToggle.click();
    const library = page.frameLocator(".desktop-library iframe");
    const settings = page.locator(".desktop-library");
    await expect(settings).toHaveAttribute("data-docked", "true");
    await expect(library.getByRole("button", { name: "Закрыть", exact: true }).first()).toBeVisible();
    expect(await composition()).toEqual(reading);
    const [gameBox, settingsBox] = await Promise.all([drawer.boundingBox(), settings.boundingBox()]);
    const [storyBox] = reading;
    expect(gameBox!.x + gameBox!.width).toBeLessThan(storyBox!.x);
    expect(settingsBox!.x).toBeGreaterThan(storyBox!.x + storyBox!.width);
    expect(Math.abs(gameBox!.y - settingsBox!.y)).toBeLessThan(1);
    expect(await settingsToggle.evaluate(button => {
      const rect = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })).toBe(true);
    await page.screenshot({ path: info.outputPath("windows-side-rails.png"), animations: "disabled" });
    await library.getByRole("button", { name: "Закрыть", exact: true }).first().click();
    await expect(page.locator(".desktop-library")).toBeHidden();
    await expect.poll(dockAnimating).toBe(false);
    await settingsToggle.evaluate(button => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect.poll(dockAnimating).toBe(false);
    await expect(settingsToggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".desktop-library")).toHaveCount(0);

    await page.setViewportSize({ width: 1050, height: 730 });
    await expect(page.locator(".desktop-main")).toHaveAttribute("data-game-docked", "false");
    const narrowReading = await composition();
    await settingsToggle.click();
    await expect(settings).toHaveAttribute("data-docked", "false");
    await expect(page.locator(".desktop-app")).toHaveAttribute("data-overlay", "library");
    expect(await composition()).toEqual(narrowReading);
    await library.getByRole("button", { name: "Закрыть", exact: true }).first().click();
    await expect(settings).toBeHidden();
    await gameToggle.click();
    await expect(page.locator(".desktop-app")).toHaveAttribute("data-overlay", "game");
    expect(await composition()).toEqual(narrowReading);
    await drawer.getByRole("button", { name: "Скрыть панель игры", exact: true }).press("Escape");

    await page.setViewportSize({ width: 320, height: 620 });
    const sidebar = page.locator(".desktop-sidebar");
    await expect(page.locator(".desktop-main")).toHaveAttribute("data-game-docked", "false");
    await expect(sidebar).toHaveCSS("visibility", "hidden");
    const sidebarMotion = await page.evaluate(async () => {
      const history = document.querySelector<HTMLElement>(".desktop-sidebar")!;
      document.querySelector<HTMLButtonElement>(".desktop-history-toggle")!.click();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const enter = history.getAnimations().some(animation => animation instanceof CSSTransition && animation.transitionProperty === "translate");
      const close = history.querySelector<HTMLButtonElement>(".desktop-brand button")!;
      await Promise.all(history.getAnimations().map(animation => animation.finished));
      close.click();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { enter, exit: history.getAnimations().some(animation => animation instanceof CSSTransition && animation.transitionProperty === "translate"), inert: history.inert };
    });
    expect(sidebarMotion).toEqual({ enter: true, exit: true, inert: true });
    await expect(sidebar).toBeHidden();
    await expect(historyToggle).toBeFocused();

    const model = page.getByRole("dialog", { name: "Текстовая модель", exact: true });
    await page.getByRole("button", { name: "Подключить модель", exact: true }).click();
    await expect(model.getByLabel("Адрес API")).toBeFocused();
    await model.getByLabel("Адрес API").press("Tab");
    await expect(model.getByLabel("Ключ API")).toBeFocused();
    await page.screenshot({ path: info.outputPath("modal-motion-320.png"), animations: "disabled" });
    await model.getByLabel("Ключ API").press("Escape");
    await expect(model).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Подключить модель", exact: true })).toBeFocused();

    await page.emulateMedia({ colorScheme: null, reducedMotion: "reduce" });
    await gameToggle.click();
    await expect(drawer).toHaveCSS("transition-duration", "0s");
    await drawer.getByRole("button", { name: "Скрыть панель игры", exact: true }).press("Escape");
    await expect(drawer).toBeHidden();
    await expect(gameToggle).toBeFocused();
  } finally { await app.close(); }
});

test("restores the Windows draft when the model sends only hidden metadata", async ({}, info) => {
  const prompt = "Где ключ от мастерской?";
  const answer = "Ключ в ящике стола.";
  let count = 0;
  const mock = await provider(() => ++count === 1
    ? '<deeprole_characters>{"present":[],"updates":[]}</deeprole_characters>'
    : answer);
  let app: ElectronApplication | undefined;
  try {
    const client = await openClient(info.outputPath("data"));
    app = client.app;
    const { page } = client;
    await attachModel(page, mock.url);
    const draft = page.getByRole("textbox", { name: "Ваша реплика" });
    await draft.fill(prompt);
    await draft.press("Enter");
    await expect(page.getByRole("alert")).toContainText("Модель не вернула видимый ответ.");
    await expect(draft).toHaveValue(prompt);
    await expect(page.locator("article[data-role=assistant]")).toHaveCount(0);
    expect(mock.prompts).toHaveLength(1);
    await draft.press("Enter");
    await expect(page.locator("article[data-role=assistant]")).toHaveText(/Ключ в ящике стола\./);
    await expect(draft).toHaveValue("");
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(mock.prompts).toHaveLength(2);
  } finally {
    await app?.close();
    mock.close();
  }
});

test("shows reply progress and restores a stopped Windows draft", async ({}, info) => {
  let releaseHeaders!: () => void;
  let releaseText!: () => void;
  let releaseDone!: () => void;
  const headers = new Promise<void>(resolve => { releaseHeaders = resolve; });
  const text = new Promise<void>(resolve => { releaseText = resolve; });
  const done = new Promise<void>(resolve => { releaseDone = resolve; });
  let attempts = 0;
  let stoppedBeforeHeaders = false;
  let stoppedDuringReply = false;
  const answer = "Мира различила шаги за дверью.";
  const server = createServer(async (request, response) => {
    if (request.url !== "/v1/chat/completions") { response.writeHead(404).end(); return; }
    for await (const _ of request) { /* Read the request before selecting the fixture response. */ }
    const attempt = ++attempts;
    if (attempt === 2) {
      response.once("close", () => { stoppedBeforeHeaders = true; });
      return;
    }
    const send = (delta: object, finish?: string) => response.write(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: finish }] })}\n\n`);
    if (attempt === 1) await headers;
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    if (attempt === 1) {
      send({ reasoning_content: "Шаги могут принадлежать смотрителю." });
      await text;
    }
    send({ content: answer });
    if (attempt === 4) {
      response.once("close", () => { stoppedDuringReply = true; });
      return;
    }
    if (attempt === 1) await done;
    send({}, "stop");
    response.end("data: [DONE]\n\n");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Test server unavailable");
  let app: ElectronApplication | undefined;
  try {
    const client = await openClient(info.outputPath("data"));
    app = client.app;
    const { page } = client;
    await attachModel(page, `http://127.0.0.1:${address.port}/v1`);
    const draft = page.getByRole("textbox", { name: "Ваша реплика" });
    const status = page.locator("#desktop-response-status");
    const stop = page.getByTestId("stop-generation");
    await draft.fill("Прислушиваюсь у двери.");
    await draft.press("Enter");
    await expect.poll(() => attempts).toBe(1);
    await expect(draft).toHaveValue("");
    await expect(status).toHaveText("Ждём ответ");
    await expect(stop).toHaveAccessibleDescription("Ждём ответ");
    await expect(page.locator(".desktop-message-bubble")).toHaveText("Прислушиваюсь у двери.");
    await page.screenshot({ path: info.outputPath("reply-waiting.png"), animations: "disabled" });

    await page.evaluate(() => window.deepRoleDesktop.call("setTheme", "light"));
    await page.setViewportSize({ width: 320, height: 620 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: null });
    await page.evaluate(() => window.deepRoleDesktop.call("storageSet", "local", { deeprole_settings: { locale: "en", onboardingComplete: true } }));
    await expect(status).toHaveText("Waiting for reply");
    const controls = page.locator(".desktop-composer-controls");
    const rowHeight = (await controls.boundingBox())!.height;
    await expect(status.locator("svg")).toHaveCSS("animation-name", "none");
    releaseHeaders();
    await expect(status).toHaveText("Model is reasoning");
    await expect(stop).toHaveAttribute("title", "Stop generation");
    expect(await status.evaluate(node => node.getBoundingClientRect().right <= node.parentElement!.querySelector(".desktop-stop")!.getBoundingClientRect().left)).toBe(true);
    await page.screenshot({ path: info.outputPath("reply-reasoning-320.png"), animations: "disabled" });

    releaseText();
    await expect(status).toHaveText("Receiving reply");
    await expect(page.locator(".desktop-story-text")).toHaveText(answer);
    releaseDone();
    await expect(stop).toHaveCount(0);
    await expect(status).toBeEmpty();
    expect((await controls.boundingBox())!.height).toBe(rowHeight);

    const narrowDraft = page.getByRole("textbox", { name: "Your message" });
    const nextTurn = "Тихо стучу по деревянной раме.";
    await narrowDraft.fill(nextTurn);
    await narrowDraft.press("Enter");
    await expect.poll(() => attempts).toBe(2);
    await expect(status).toHaveText("Waiting for reply");
    const chatId = new URL(page.url()).pathname.split("/").at(-1)!;
    expect(await page.evaluate(async id => {
      const query = new URLSearchParams({ chat_session_id: id, request_id: "a-different-request" });
      return (await fetch("/__desktop/stop-reply?" + query, { method: "POST" })).ok;
    }, chatId)).toBe(true);
    expect(stoppedBeforeHeaders).toBe(false);
    await stop.click();
    await expect(status).toBeEmpty();
    await expect(narrowDraft).toHaveValue(nextTurn);
    await expect.poll(() => stoppedBeforeHeaders).toBe(true);
    await expect(page.locator(".desktop-story-text")).toHaveCount(1);
    await narrowDraft.press("Enter");
    await expect.poll(() => attempts).toBe(3);
    await expect(page.locator(".desktop-story-text")).toHaveCount(2);
    await expect(stop).toHaveCount(0);

    const finalDraft = "Осматриваю замочную скважину.";
    await narrowDraft.fill(finalDraft);
    await narrowDraft.press("Enter");
    await expect(status).toHaveText("Receiving reply");
    await stop.click();
    await expect(status).toBeEmpty();
    await expect(narrowDraft).toHaveValue(finalDraft);
    await expect.poll(() => stoppedDuringReply).toBe(true);
    await expect(page.locator(".desktop-story-text")).toHaveCount(2);
  } finally {
    releaseHeaders();
    releaseText();
    releaseDone();
    await app?.close();
    server.closeAllConnections();
    server.close();
  }
});

test("follows new replies at the bottom and preserves the reading position in Windows", async ({}, info) => {
  const data = info.outputPath("data");
  const title = "Записи у маяка";
  const chats = path.join(data, "Chats");
  const messages = Array.from({ length: 24 }, (_, index) => {
    const role = index % 2 === 0 ? "user" : "assistant";
    const text = role === "user"
      ? `Запись ${index / 2 + 1}. Рассматриваю схему маяка и сверяю её с журналом.`
      : "На схеме отмечена узкая лестница. Мира проверила номер пролёта и отложила журнал к краю стола.";
    return { id: index + 1, parent: index || null, role, text, visible: text };
  });
  await mkdir(chats, { recursive: true });
  await writeFile(path.join(chats, "lighthouse-log.json"), JSON.stringify({
    id: "lighthouse-log", title, head: messages.length, updatedAt: 1, messages,
  }));
  let release!: () => void;
  const holdReply = new Promise<void>(resolve => { release = resolve; });
  const newReply = "На площадке у окна лежит медный ключ.";
  const api = await provider(async () => {
    await holdReply;
    return Array.from({ length: 8 }, (_, index) => index ? "Ветер тронул ставни, и лестница снова стихла." : newReply).join("\n\n");
  });
  let app: ElectronApplication | undefined;
  try {
    const client = await openClient(data);
    app = client.app;
    const { page } = client;
    await attachModel(page, api.url);
    await page.getByRole("link", { name: title, exact: true }).click();
    const view = page.getByRole("region", { name: "Переписка", exact: true });
    const latest = page.getByRole("button", { name: "К последнему сообщению", exact: true });
    const distance = () => view.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop);
    await expect(view.locator("article")).toHaveCount(messages.length);
    await expect.poll(distance).toBeLessThan(2);
    await expect(latest).toHaveCount(0);

    const composer = page.getByRole("textbox", { name: "Ваша реплика" });
    await composer.fill("Поднимаюсь по лестнице к окну.");
    await composer.press("Enter");
    await expect.poll(() => api.prompts.length).toBe(1);
    await view.evaluate(node => { node.scrollTop = 220; });
    await expect(latest).toBeVisible();
    const readingAt = await view.evaluate(node => node.scrollTop);
    await composer.fill("Собираю заметки для следующего хода.\n".repeat(6));
    release();
    await expect(view.locator(".desktop-story-text").last()).toContainText(newReply);
    await expect(page.getByTestId("stop-generation")).toHaveCount(0);
    expect(await view.evaluate(node => node.scrollTop)).toBe(readingAt);
    await expect(latest).toBeVisible();
    const readingAnchor = () => view.evaluate(node => {
      const top = node.getBoundingClientRect().top;
      const row = [...node.querySelectorAll("article")].find(article => article.getBoundingClientRect().bottom > top + 1)!;
      return { id: row.dataset.messageId, offset: row.getBoundingClientRect().top - top };
    });
    const anchor = await readingAnchor();
    await page.locator(".desktop-history-toggle").click();
    await expect(page.locator(".desktop-history-toggle")).toHaveAttribute("aria-expanded", "false");
    expect(await readingAnchor()).toEqual(anchor);
    await page.locator(".desktop-history-toggle").click();
    await expect(page.locator(".desktop-history-toggle")).toHaveAttribute("aria-expanded", "true");
    expect(await readingAnchor()).toEqual(anchor);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: info.outputPath("chat-jump.png"), animations: "disabled" });

    await page.evaluate(() => window.deepRoleDesktop.call("setTheme", "light"));
    await page.setViewportSize({ width: 320, height: 620 });
    await page.evaluate(() => window.deepRoleDesktop.call("storageSet", "local", { deeprole_settings: { locale: "en", onboardingComplete: true } }));
    const narrowView = page.getByRole("region", { name: "Conversation", exact: true });
    const jump = page.getByRole("button", { name: "Go to latest message", exact: true });
    await expect(jump).toBeVisible();
    await expect(page.locator("html")).toHaveCSS("background-color", "oklch(0.994 0.0015 285)");
    const buttonBox = (await jump.boundingBox())!;
    const controlsBox = (await page.locator(".desktop-composer-controls").boundingBox())!;
    expect(Math.abs((buttonBox.x + buttonBox.width / 2) - (controlsBox.x + controlsBox.width / 2))).toBeLessThan(1);
    expect(buttonBox.y).toBeGreaterThanOrEqual(controlsBox.y);
    expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(controlsBox.y + controlsBox.height);
    expect(await jump.evaluate(button => {
      const rect = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })).toBe(true);
    await page.screenshot({ path: info.outputPath("chat-jump-320.png"), animations: "disabled" });
    await jump.press("Enter");
    await expect(narrowView).toBeFocused();
    await expect(jump).toHaveCount(0);
    const narrowDistance = () => narrowView.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop);
    await expect.poll(narrowDistance).toBeLessThan(2);
    const narrowComposer = page.getByRole("textbox", { name: "Your message" });
    await narrowComposer.clear();
    const compactViewport = await narrowView.evaluate(node => node.clientHeight);
    await narrowComposer.fill("I write the next turn while following the chat.\n".repeat(8));
    await expect.poll(() => narrowView.evaluate(node => node.clientHeight)).toBeLessThan(compactViewport);
    await expect.poll(narrowDistance).toBeLessThan(2);
    await expect(jump).toHaveCount(0);
    expect(api.prompts).toHaveLength(1);
  } finally {
    release();
    await app?.close();
    api.close();
  }
});

test("keeps the Windows draft and keyboard focus while browsing saved replies", async ({}, info) => {
  const data = info.outputPath("data");
  const chatId = "saved-replies";
  const title = "Записка у двери";
  const question = "Что написано на записке?";
  const replies = [
    "Мира развернула записку. На обороте был нарисован мост.",
    "Мира поднесла записку к фонарю. Под рисунком моста проступило время встречи.",
    "Мира разгладила бумагу и прочла подпись. Послание оставил смотритель моста.",
  ];
  const draft = "Спрашиваю, где найти смотрителя.";
  const revision = "При свете фонаря внимательно читаю записку.";
  const chats = path.join(data, "Chats");
  await mkdir(chats, { recursive: true });
  await writeFile(path.join(chats, chatId + ".json"), JSON.stringify({
    id: chatId, title, head: 2, updatedAt: 1,
    messages: [
      { id: 1, parent: null, role: "user", text: question, visible: question },
      ...replies.map((text, index) => ({ id: index + 2, parent: 1, role: "assistant", text, visible: text })),
    ],
  }));
  let rejectEdit = true;
  const api = await provider(() => {
    if (!rejectEdit) return "Новый ответ.";
    rejectEdit = false;
    return null;
  });
  let app: ElectronApplication | undefined;
  try {
    const client = await openClient(data);
    app = client.app;
    const { page } = client;
    await attachModel(page, api.url);
    await page.getByRole("link", { name: title, exact: true }).click();
    const composer = page.getByRole("textbox", { name: "Ваша реплика" });
    const reply = page.locator(".desktop-story-text");
    await expect(reply).toHaveText(replies[0]!);
    await composer.fill(draft);

    const group = (position: number) => page.getByRole("group", { name: `Ответ ${position} из 3`, exact: true });
    const next = (position: number) => group(position).getByRole("button", { name: "Следующий ответ" });
    const previous = (position: number) => group(position).getByRole("button", { name: "Предыдущий ответ" });
    await expect(previous(1)).toBeDisabled();
    await next(1).press("Enter");
    await expect(reply).toHaveText(replies[1]!);
    await expect(next(2)).toBeFocused();
    await expect(composer).toHaveValue(draft);
    await composer.focus();
    await page.mouse.move(0, 0);
    await expect.poll(() => next(2).evaluate(button => getComputedStyle(button, "::before").backgroundColor)).toBe("rgba(0, 0, 0, 0)"); // No face at rest.
    await page.screenshot({ path: info.outputPath("message-actions.png"), animations: "disabled" });
    await next(2).press("Enter");
    await expect(reply).toHaveText(replies[2]!);
    await expect(previous(3)).toBeFocused();
    await expect(next(3)).toBeDisabled();
    await expect(composer).toHaveValue(draft);
    expect(api.prompts).toHaveLength(0);

    await page.evaluate(() => {
      Object.defineProperty(navigator.clipboard, "writeText", {
        value: async (text: string) => { sessionStorage.setItem("test-copied-text", text); },
      });
    });
    const copy = page.locator(".desktop-assistant").getByRole("button", { name: "Копировать", exact: true });
    await copy.click();
    await expect(copy).toHaveAttribute("title", "Скопировано");
    await expect(page.locator(".desktop-copy-status")).toHaveText("Скопировано");
    expect(await page.evaluate(() => sessionStorage.getItem("test-copied-text"))).toBe(replies[2]);
    await expect(copy).toHaveAttribute("title", "Копировать");
    await expect(page.locator(".desktop-copy-status")).toBeEmpty();

    const edit = page.getByRole("button", { name: "Редактировать", exact: true });
    await edit.click();
    await expect(composer).toHaveValue(question);
    await expect(composer).toHaveAccessibleDescription(/Черновик вернётся в поле/u);
    await composer.fill(revision);
    await edit.click();
    await expect(composer).toHaveValue(revision);
    await composer.press("Escape");
    await expect(composer).toHaveValue(draft);
    await expect(composer).toBeFocused();
    await expect(page.locator(".desktop-edit")).toHaveCount(0);
    expect(api.prompts).toHaveLength(0);

    await edit.click();
    await composer.fill(revision);
    await previous(3).press("Enter");
    await expect(reply).toHaveText(replies[1]!);
    await expect(composer).toHaveValue(revision);
    await expect(page.getByText("Редактирование хода", { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("editing-draft.png"), animations: "disabled" });

    await page.getByRole("button", { name: "Отправить правку", exact: true }).click();
    await expect(composer).toHaveValue(draft);
    await expect(page.getByRole("alert").filter({ hasText: "Ответ оборвался" })).toBeVisible();
    await expect(reply).toHaveText(replies[1]!);
    const restore = page.getByRole("button", { name: "Вернуть правку", exact: true });
    await expect(restore).toBeVisible();
    await page.screenshot({ path: info.outputPath("edit-recovery.png"), animations: "disabled" });
    await restore.click();
    await expect(composer).toHaveValue(revision);
    await expect(composer).toBeFocused();
    await expect(page.getByRole("alert").filter({ hasText: "Ответ оборвался" })).toHaveCount(0);

    await page.getByRole("button", { name: "Светлая тема", exact: true }).click();
    await page.setViewportSize({ width: 320, height: 620 });
    await page.evaluate(() => window.deepRoleDesktop.call("storageSet", "local", { deeprole_settings: { locale: "en", onboardingComplete: true } }));
    const english = page.getByRole("group", { name: "Reply 2 of 3", exact: true });
    await expect(english.getByRole("button", { name: "Next reply" })).toHaveAttribute("title", "Next reply");
    const englishComposer = page.getByRole("textbox", { name: "Your message" });
    await expect(englishComposer).toHaveValue(revision);
    await expect(englishComposer).toHaveAccessibleDescription(/Your draft will return/u);
    await expect(page.locator("html")).toHaveCSS("background-color", "oklch(0.994 0.0015 285)");
    expect(await english.evaluate(node => node.closest(".desktop-message-actions")!.scrollWidth)).toBeLessThanOrEqual(288);
    await english.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("editing-draft-320.png"), animations: "disabled" });
    await page.getByRole("button", { name: "Send edit", exact: true }).click();
    await expect(englishComposer).toHaveValue(draft);
    await expect(reply).toHaveText("Новый ответ.");
    expect(api.requests.map(request => request.messages.at(-1)?.content)).toEqual([revision, revision]);
  } finally {
    await app?.close();
    api.close();
  }
});

test("sends the saved API key and persists adaptive or custom pacing", async ({}, info) => {
  const plainScene = "Стражник кивнул.\n\n— Проходите.";
  const api = await provider(() => plainScene, 128_000);
  let app: ElectronApplication | undefined;
  try {
    const client = await openClient(info.outputPath("style"));
    app = client.app;
    const { page } = client;
    await page.setViewportSize({ width: 320, height: 620 });
    await attachModel(page, api.url);
    const model = page.getByRole("button", { name: "test-story" });
    const dialog = page.getByRole("dialog", { name: "Текстовая модель" });
    const style = dialog.getByLabel("Длина и подача");
    const save = dialog.getByRole("button", { name: "Сохранить подключение" });
    const customStyle = "Больше диалогов, короче описания. Диалоги моноширным шрифтом всегда. Действия italic.";
    const defaultStyle = "Adapt the length, pace, and balance of dialogue, action, and description";
    async function send(text: string, index: number) {
      await page.getByRole("textbox", { name: "Ваша реплика" }).fill(text);
      await page.getByRole("button", { name: "Отправить", exact: true }).click();
      await expect(page.locator('[data-role="assistant"]')).toHaveCount(index + 1);
      await expect(page.locator('[data-role="assistant"]').last()).toContainText("Стражник кивнул.");
      await expect(page.getByTestId("stop-generation")).toHaveCount(0);
      const request = api.requests[index];
      const instruction = request?.messages[0];
      if (!request || !instruction) throw Error("Missing completion request or style instruction");
      expect(request.max_tokens).toBe(4096);
      return instruction;
    }

    expect(await send("Открываю дверь.", 0)).toMatchObject({
      role: "system", content: expect.stringContaining(defaultStyle),
    });
    await model.click();
    await expect(style).toHaveValue("");
    await expect(dialog.getByRole("combobox", { name: "Лимит ответа", exact: true })).toHaveValue("auto");
    await style.fill(customStyle);
    const key = dialog.getByLabel("Ключ API");
    const paste = (text: string) => key.evaluate((input, value) => {
      const clipboard = new DataTransfer();
      clipboard.setData("text/plain", value);
      input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }));
    }, text);
    const testKey = "synthetic-completion-key";
    await paste(testKey + "\r\nsecond-test-key");
    await expect(key).toHaveAttribute("aria-invalid", "true");
    await expect(key).toHaveValue("");
    await save.click();
    await expect(dialog.getByRole("alert")).toContainText("Вставьте один ключ API");
    await paste("  " + testKey + "\r\n");
    await expect(key).toHaveValue(testKey);
    await dialog.getByLabel("ID модели").clear();
    await dialog.getByRole("button", { name: "Загрузить список моделей" }).click();
    const models = dialog.getByRole("combobox", { name: "Модель", exact: true });
    await expect(models.locator('option[value="test-story"]')).toHaveText(/test-story · 128\s000 ток\./u);
    await models.selectOption("test-story");
    await expect(dialog.getByLabel("ID модели")).toHaveCount(0);
    expect(api.modelRequests.filter(Boolean)).toEqual(["Bearer " + testKey]);
    await save.click();
    await expect(dialog).toBeHidden();
    await page.reload();
    await model.click();
    await expect(style).toHaveValue(customStyle);
    await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
    const custom = await send("> **Кто здесь?**", 1);
    const latest = page.locator(".desktop-story-text").last();
    await expect(latest.locator("code")).toHaveText("— Проходите.");
    await expect(latest.locator("em")).toHaveText("Стражник кивнул.");
    await expect(page.locator(".desktop-user").last().locator("blockquote strong")).toHaveText("Кто здесь?", { useInnerText: true });
    expect(await latest.textContent()).toBe(plainScene);
    expect(api.requests[1]?.messages.at(-1)?.content).toContain("> **Кто здесь?**");
    expect(api.completionAuthorizations[1]).toBe("Bearer " + testKey);
    expect(api.modelRequests.filter(Boolean)).toEqual(["Bearer " + testKey]);
    expect(custom.content).toContain(customStyle);
    expect(custom.content).toContain("literal Markdown");
    expect(custom.content).not.toContain(defaultStyle);

    await model.click();
    await style.fill("Реплики цитатами, действия жирным.");
    await save.click();
    await expect(dialog).toBeHidden();
    await expect(latest.locator("blockquote")).toHaveText("— Проходите.");
    await expect(latest.locator("strong")).toHaveText("Стражник кивнул.");
    expect(await latest.textContent()).toBe(plainScene);

    await model.click();
    await style.clear();
    await save.click();
    await expect(dialog).toBeHidden();
    expect((await send("Жду ответа.", 2)).content).toContain(defaultStyle);
    await expect(page.locator(".desktop-story-text code, .desktop-story-text em")).toHaveCount(0);
    expect(api.completionAuthorizations[2]).toBe("Bearer " + testKey);
  } finally {
    await app?.close();
    api.close();
  }
});

test("prepares a cast in a hidden Windows service window and removes its temporary chat", async ({}, info) => {
  let prepared = 0;
  let releaseReply!: () => void;
  let heldReply = new Promise<void>(resolve => { releaseReply = resolve; });
  const api = await provider(async prompt => {
    await heldReply;
    if (!/Now prepare the complete roster|Prepare the NEXT batch/u.test(prompt)) return "received";
    const id = /Request: (cast[\w-]+)/u.exec(prompt)?.[1];
    if (!id || prepared > 1) return "Unexpected request";
    const batch = castBatch(id, prepared === 0 ? 0 : 1);
    prepared++;
    return `<deeprole_cast>${JSON.stringify(batch)}</deeprole_cast>`;
  });
  let app: ElectronApplication | undefined;
  try {
    const started = await openClient(info.outputPath("cast"));
    app = started.app;
    const { page } = started;
    await attachModel(page, api.url);
    await seedLibrary(page, [{ kind: "world", id: castWorld.id, data: castWorld }]);
    await page.reload();
    const gameToggle = page.getByRole("button", { name: "Игровые панели", exact: true });
    if (await gameToggle.getAttribute("aria-expanded") !== "true") await gameToggle.click();
    const game = page.locator("#desktop-play-tools");
    await game.locator('.scene-world select').selectOption(castWorld.id, { force: true });
    await game.getByRole("button", { name: "Герои", exact: true }).click();
    const draft = page.getByRole("textbox", { name: "Ваша реплика" });
    await draft.fill("Черновик основного чата.");
    const command = (message: object) => runtimeCommand(page, message);
    const windowsShown = await watchNewWindows(app);
    await game.getByRole("button", { name: "Создать персонажей из лора" }).click();
    await expect(game.getByRole("button", { name: "Отменить подготовку" })).toBeVisible();
    await expect.poll(() => api.prompts.length).toBe(1);
    expect(await windowsShown()).toEqual([]);
    await draft.press("End");
    await draft.press("Space");
    await expect(draft).toHaveValue("Черновик основного чата. ");
    await draft.press("Backspace");
    releaseReply();
    const status = () => command({ type: "DR_CAST", action: "status", worldId: castWorld.id });
    await expect.poll(async () => ({ phase: (await status()).job?.phase, calls: api.prompts.length }), { timeout: 30_000 }).toMatchObject({ phase: "ready", calls: 3 });
    await expect.poll(async () => (await status()).job?.cleanup, { timeout: 15_000 }).toBe("done");
    const { job } = await status();
    expect(job.draft.characters.map((character: { name: string }) => character.name)).toEqual(["Leon", "Mira"]);
    await expect(game.getByText("Персонажи готовы к проверке")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Персонажи из лора" })).toHaveCount(0);
    await game.getByRole("button", { name: "Проверить персонажей" }).click();
    const review = page.getByRole("dialog", { name: "Персонажи из лора" });
    await expect(review).toBeVisible();
    await expect(review).not.toContainText(/\bDeepSeek\b/iu);
    await review.getByLabel("Закрыть", { exact: true }).click();
    const saved = await command({ type: "DR_CAST", action: "apply", id: job.id, draft: job.draft, selected: ["p1", "p2"], hero: "p1" });
    expect(saved.ok).toBe(true);
    const records = await libraryRecords(page);
    expect(records.filter(record => record.kind === "entity").map(record => record.data.name).sort()).toEqual(["Leon", "Mira"]);
    const chats = await page.evaluate(() => fetch("/__desktop/chats").then(response => response.json()));
    expect(chats).toEqual([]);
    await expect(draft).toHaveValue("Черновик основного чата.");

    heldReply = new Promise<void>(resolve => { releaseReply = resolve; });
    await game.getByRole("button", { name: "Создать персонажей из лора" }).click();
    await expect.poll(() => api.prompts.length).toBe(4);
    await game.getByRole("button", { name: "Отменить подготовку" }).click();
    await expect.poll(async () => (await status()).job, { timeout: 25_000 }).toMatchObject({ phase: "cancelled", cleanup: "done" });
    releaseReply();
    expect(await page.evaluate(() => fetch("/__desktop/chats").then(response => response.json()))).toEqual([]);
    await expect(draft).toHaveValue("Черновик основного чата.");
    expect(await windowsShown()).toEqual([]);
  } finally {
    releaseReply();
    await app?.close();
    api.close();
  }
});

test("a Windows world reset waits for confirmation and opens a fresh story", async ({}, info) => {
  test.setTimeout(120_000);
  const f = resetFixture(), data = info.outputPath("world-reset");
  const scene = f.binding.characterScenes?.[f.world.id];
  if (!scene) throw Error("Reset fixture is missing the old scene.");
  f.binding.chatUrl = "https://deeprole.local/a/chat/s/" + f.binding.chatId;
  f.world.contextBudget = 6000;
  f.world.sharedGame = {
    version: 1, id: "old-game", revision: "old-rev", activationId: "old-active", activeBindingId: f.binding.id,
    activeChatId: f.binding.chatId, managed: false, scene, profileSeeds: {}, identitySeeds: {}, mergeSeeds: {},
    memoryOverrides: { includedIds: [f.event.id], excludedIds: [] },
    facts: [{ kind: "event", text: "They hugged yesterday.", quote: "They hugged yesterday." }], updatedAt: 1,
  };
  const cast = resetDraft("placeholder", f.records);
  let prepared = 0;
  let lastDecisions: unknown = null;
  let releaseReply!: () => void;
  const heldReply = new Promise<void>(resolve => { releaseReply = resolve; });
  const api = await provider(async prompt => {
    await heldReply;
    if (/Approved world reset/iu.test(prompt)) return "Original story begins.";
    const request = /Request: (cast[\w-]+)/u.exec(prompt)?.[1] ?? /"request"\s*:\s*"(cast[\w-]+)"/u.exec(prompt)?.[1];
    if (prompt.includes("[DeepRole World Reset Entries]")) {
      const sections = [...prompt.matchAll(/(?:^|\n)Entries:\r?\n([^\r\n]+)/gu)];
      const entriesLine = sections.at(-1)?.[1] ?? "[]";
      const entries = JSON.parse(entriesLine) as { id: string; content: string }[];
      const decisions = entries.map(entry => ({
        id: entry.id, action: entry.id === f.event.id ? "remove" : entry.id === f.mixed.id ? "rewrite" : "keep",
        content: entry.id === f.mixed.id ? "Mother is Tyoma's mother." : "",
        reason: "Preserve original lore and remove played events.", quote: entry.content.trim().slice(0, 240),
      }));
      lastDecisions = { entries, decisions, markers: [...prompt.matchAll(/\[Request ID: ([^\]]+)\]/gu)].map(match => match[1]), sections: sections.length };
      return `<deeprole_cast>${JSON.stringify({ version: 1, request, decisions })}</deeprole_cast>`;
    }
    if (/Prepare the NEXT batch|Now prepare the complete roster/u.test(prompt)) {
      const character = cast.characters[prepared++];
      return `<deeprole_cast>${JSON.stringify({ version: 1, request, characters: [character], present: [], partners: [], warnings: [], more: prepared < cast.characters.length })}</deeprole_cast>`;
    }
    return "received";
  });
  let app: ElectronApplication | undefined;
  try {
    const launched = await openClient(data);
    app = launched.app;
    const { page } = launched;
    await attachModel(page, api.url);
    await seedLibrary(page, f.records);
    const chats = path.join(data, "Chats");
    await mkdir(chats, { recursive: true });
    await writeFile(path.join(chats, f.binding.chatId + ".json"), JSON.stringify({
      id: f.binding.chatId, title: "Old story", head: 2, updatedAt: 1,
      messages: [
        { id: 1, parent: null, role: "user", text: "How did yesterday go?", visible: "How did yesterday go?" },
        { id: 2, parent: 1, role: "assistant", text: "They hugged yesterday.", visible: "They hugged yesterday." },
      ],
    }));
    await page.goto(f.binding.chatUrl);
    const draft = page.getByRole("textbox", { name: "Ваша реплика" });
    await draft.fill("Старый черновик.");
    const toggle = page.getByRole("button", { name: "Игровые панели", exact: true });
    if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
    const game = page.locator("#desktop-play-tools");
    const command = (message: object) => runtimeCommand(page, message);
    const windowsShown = await watchNewWindows(app);
    const start = await command({
      type: "DR_CAST", action: "start", worldId: f.world.id, locale: "ru",
      reset: { chatId: f.binding.chatId, revision: "old-rev", start: "Tyoma has just returned after six years abroad." },
    });
    expect(start).toMatchObject({ ok: true });
    let service: Page | undefined;
    await expect.poll(async () => {
      for (const candidate of launched.app.windows()) {
        if (candidate !== page && await candidate.locator("deeprole-field-screen").count().catch(() => 0)) {
          service = candidate;
          return true;
        }
      }
      return false;
    }, { timeout: 12_000 }).toBe(true);
    if (!service) throw Error("The reset screen is missing.");
    const screen = service.locator("deeprole-field-screen");
    await expect(screen.locator("h1")).toHaveText("Подготовка сброса мира");
    await expect(screen.locator(".screen")).not.toContainText(/\bDeepSeek\b/iu);
    await expect(service).toHaveTitle("Подготовка сброса мира — DeepRole");
    await service.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await expect(screen.locator(".screen")).toHaveCSS("background-color", "oklch(0.195 0.007 285)");
    const nativeWindow = await launched.app.browserWindow(service);
    expect(await nativeWindow.evaluate(window => window.isVisible())).toBe(false);
    expect(await windowsShown()).toEqual([]);
    await expect(game.getByRole("button", { name: "Отменить подготовку" })).toBeVisible();
    await toggle.click();
    const mainWindow = await launched.app.browserWindow(page);
    await mainWindow.evaluate(window => window.minimize());
    releaseReply();
    const status = () => command({ type: "DR_CAST", action: "status", worldId: f.world.id, reset: true });
    await expect.poll(async () => {
      const { job } = await status();
      if (job?.phase === "error") throw Error(JSON.stringify({ error: job.error, step: job.step, decisions: lastDecisions, diagnostics: job.diagnostics }));
      return job?.phase;
    }, { timeout: 55_000 }).toBe("ready");
    await expect.poll(async () => (await status()).job?.cleanup, { timeout: 15_000 }).toBe("done");
    await mainWindow.evaluate(window => window.restore());
    await page.setViewportSize({ width: 320, height: 620 });
    await expect.poll(() => toggle.evaluate(button => getComputedStyle(button, "::after").width)).toBe("6px");
    await toggle.click();
    await expect(game.getByText("План сброса готов — мир ещё не сброшен")).toBeVisible();
    const review = page.getByRole("dialog", { name: "Вернуть мир к началу по лору" });
    await expect(review).toHaveCount(0);
    await game.getByRole("button", { name: "Проверить предложения" }).click();
    await expect(review).toBeVisible();
    expect(await windowsShown()).toEqual([]);
    await review.getByRole("button", { name: "Закрыть" }).click();
    const { job } = await status();
    const count = api.prompts.length;
    const confirmed = await command({ type: "DR_CAST", action: "confirm-reset", id: job.id, draft: job.draft, entries: [f.event.id, f.mixed.id] });
    expect(confirmed.ok).toBe(true);
    expect(await command({ type: "DR_CAST", action: "apply-reset", id: job.id, token: confirmed.token, worldName: "Wrong" }))
      .toMatchObject({ ok: false, error: "reset-confirmation-required" });
    expect(api.prompts).toHaveLength(count);
    expect((await libraryRecords(page)).find(row => row.kind === "world")?.data.sharedGame.id).toBe("old-game");
    await expect(draft).toHaveValue("Старый черновик.");
    expect(await command({ type: "DR_CAST", action: "apply-reset", id: job.id, token: confirmed.token, worldName: f.world.name }))
      .toMatchObject({ ok: true, chatOpened: true });
    await expect.poll(() => api.prompts.length, { timeout: 15_000 }).toBe(count + 1);
    expect(api.prompts.at(-1)).toContain("No events from the previous playthrough happened");
    expect(api.prompts.at(-1)).not.toContain("They hugged yesterday");
    await expect.poll(async () => (await libraryRecords(page)).find(row => row.kind === "world")?.data.sharedGame.activeChatId).not.toBe(f.binding.chatId);
    const records = await libraryRecords(page);
    expect(records.some(row => row.data.id === f.event.id)).toBe(false);
    expect(records.find(row => row.data.id === f.mixed.id)?.data.content).toBe("Mother is Tyoma's mother.");
    expect(records.find(row => row.data.id === f.foreign.id)?.data.content).toBe("OTHER WORLD");
    await expect(draft).toHaveValue("Старый черновик.");
  } finally {
    releaseReply();
    await app?.close();
    api.close();
  }
});

test("fits long Windows turns to the model window, checkpoints the same chat, and reports API usage", async ({}, info) => {
  const api = await provider(() => "The door stays open.", 24_000);
  const data = info.outputPath("data");
  let app: ElectronApplication | undefined;
  try {
    const client = await openClient(data);
    app = client.app;
    const { page } = client;
    await page.setViewportSize({ width: 320, height: 620 });
    await attachModel(page, api.url);
    const composer = page.getByRole("textbox", { name: "Ваша реплика" });
    const send = page.getByRole("button", { name: "Отправить", exact: true });
    const budgetChecks: string[] = [];
    page.on("request", request => {
      if (new URL(request.url()).pathname === "/__desktop/memory-budget") budgetChecks.push(request.url());
    });
    const first = "First turn. " + "a description of the hall ".repeat(1600);
    const next = "Next turn. " + "the far side of the table ".repeat(1600);
    await composer.fill(first);
    await send.click();
    await expect(composer).toHaveValue("");
    await expect(page.getByTestId("stop-generation")).toHaveCount(0);
    const url = page.url();
    await composer.fill(next);
    await send.click();
    await expect(composer).toHaveValue("");
    await expect(page.getByTestId("stop-generation")).toHaveCount(0);
    expect(page.url()).toBe(url);
    const id = new URL(url).pathname.split("/").at(-1);
    const saved = JSON.parse(await readFile(path.join(data, "Chats", id + ".json"), "utf8"));
    expect(saved.messages).toHaveLength(4);
    expect(saved.messages[0].visible).toBe(first);
    expect(saved.contextCheckpoint).toMatchObject({ parent: 2, omittedThrough: 2, scene: "The door stays open." });
    expect(saved.lastContext).toMatchObject({ window: 24_000, omittedMessages: 2, input: 12345, output: 9 });
    expect(saved.lastContext.timings).toMatchObject({ preparationMs: expect.any(Number), firstTextMs: expect.any(Number), totalMs: expect.any(Number) });
    expect(saved.lastContext.timings.firstTextMs).toBeLessThanOrEqual(saved.lastContext.timings.totalMs);
    expect(api.requests[1]?.messages.map(message => message.role)).toEqual(["system", "user"]);
    expect(api.requests[1]).toMatchObject({ stream_options: { include_usage: true }, max_tokens: 4096 });
    const game = page.getByRole("complementary", { name: "Игра", exact: true });
    await page.getByRole("button", { name: "Игровые панели", exact: true }).click();
    await game.getByRole("button", { name: "Память", exact: true }).click();
    await game.getByText("Последний запрос", { exact: true }).click();
    await expect(game.getByText("До отправки", { exact: true })).toBeVisible();
    await expect(game.getByText("Первый текст от API", { exact: true })).toBeVisible();
    await expect(game.getByText("Весь ответ от API", { exact: true })).toBeVisible();
    expect(await game.locator(".desktop-play-tools-scroll").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("last-request-timings-320.png"), animations: "disabled" });
    await game.getByRole("button", { name: "Скрыть панель игры" }).click();

    const oversized = "Above the model window. ".repeat(5000);
    await composer.fill(oversized);
    await send.click();
    await expect(page.getByRole("alert")).toContainText("не помещаются в окно модели");
    await expect(composer).toHaveValue(oversized);
    expect(api.requests).toHaveLength(2);
    expect(budgetChecks).toHaveLength(0);

    await page.getByRole("button", { name: "Открыть список чатов" }).click();
    await page.getByRole("button", { name: "Расходы", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Расходы" });
    await expect(dialog.getByRole("listitem")).toHaveCount(7);
    await expect(dialog).toContainText("Данные API получены для 2 из 2 текстовых запросов");
    await expect(dialog).toContainText("≈");
    await expect(dialog).toContainText("Этот чат с начала учёта");
    await dialog.getByText("Бюджет и сверка Venice", { exact: true }).click();
    await dialog.getByLabel("Недельный бюджет, USD").fill("0.06");
    await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(dialog).toContainText("Настройки расходов сохранены.");
    await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
    const notice = page.getByRole("status").filter({ hasText: /Недельный бюджет/u });
    await expect(notice).toContainText("≈");
    await notice.getByRole("button", { name: "Закрыть уведомление", exact: true }).click();
    await page.reload();
    await expect(page.getByRole("status").filter({ hasText: /Недельный бюджет/u })).toHaveCount(0);
  } finally {
    await app?.close();
    api.close();
  }
});

test("imports and connects an existing world, sends its lore, renders choices, and retains a rejected draft", async ({}, info) => {
  const options = [
    { kind: "positive", label: "Пойти к реке", text: "Иду к реке." },
    { kind: "neutral", label: "Подождать", text: "Жду у двери." },
    { kind: "negative", label: "Закрыть дверь", text: "Закрываю дверь." },
    { kind: "surprise", label: "Осмотреть чердак", text: "Осматриваю чердак." },
  ];
  let allowFailure!: () => void;
  let triedShortReply = false;
  const holdFailure = new Promise<void>(resolve => { allowFailure = resolve; });
  const mock = await provider(async prompt => {
    if (prompt.endsWith("Проверка нового черновика.")) { await holdFailure; return null; }
    if (prompt.endsWith("Проверка обрыва.") && !triedShortReply) { triedShortReply = true; return null; }
    return `У моста ждёт Мира.\n<deeprole_choices>${JSON.stringify({ version: 1, options })}</deeprole_choices>`;
  });
  let app: ElectronApplication | undefined;
  try {
    const started = await openClient(info.outputPath("game"));
    app = started.app;
    const { page } = started;
    await page.evaluate(() => window.deepRoleDesktop.call("storageSet", "local", { deeprole_settings: { locale: "ru", onboardingComplete: true } }));
    await attachModel(page, mock.url);
    await page.getByRole("button", { name: "Библиотека" }).click();
    const library = page.frameLocator(".desktop-library iframe");
    await library.getByRole("button", { name: "Миры", exact: true }).click();
    await library.getByRole("button", { name: "Загрузить мир из файла", exact: true }).click();
    await expect(library.locator(".lore-import-modal")).not.toContainText(/\b(?:DeepSeek|BDS)\b/iu);
    await library.getByLabel("Выбрать JSON", { exact: true }).setInputFiles({
      name: "Мастерская.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ Rule: { value: "У реки есть медный фонарь.", importance: "always" } })),
    });
    await expect(library.getByText("Распознаны записи памяти", { exact: true })).toBeVisible();
    await library.getByRole("checkbox", { name: "Подключить к открытому чату", exact: true }).check();
    await library.getByRole("checkbox", { name: "Подготовить персонажей из лора", exact: true }).uncheck();
    await library.getByRole("button", { name: "Импортировать и подключить", exact: true }).click();
    await library.getByRole("button", { name: "Миры", exact: true }).click();
    await expect(library.locator(".lore-connection.is-attached")).toContainText("Подключён к этому чату");
    await library.getByRole("button", { name: "Закрыть", exact: true }).first().click();
    await expect(page.locator(".desktop-library")).toHaveCount(0);
    const draft = page.getByRole("textbox", { name: "Ваша реплика" });
    await draft.fill("Подхожу к мосту.");
    await page.getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(page.locator("[data-role=assistant]")).toContainText("У моста ждёт Мира.");
    await expect(page.locator("[data-deeprole-choices-host]")).toContainText("Пойти к реке");
    expect(mock.prompts[0]).toContain("У реки есть медный фонарь.");
    await expect(draft).toHaveValue("");
    await draft.fill("Проверка обрыва.");
    await page.getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Ответ оборвался" })).toBeVisible();
    await expect(draft).toHaveValue("Проверка обрыва.");
    await expect(page.locator("[data-role=assistant]")).toHaveCount(1);
    await page.getByRole("button", { name: "Повторить с большим лимитом", exact: true }).click();
    await expect(page.locator("[data-role=assistant]")).toHaveCount(2);
    await expect(draft).toHaveValue("");
    expect(mock.requests.slice(1, 3).map(request => request.max_tokens)).toEqual([4096, 8192]);
    const sceneRequests = mock.requests.slice(1, 3).map(request => request.messages.at(-1)!.content);
    const withoutReceipt = (prompt: string) => prompt.replace(/"request"\s*:\s*"[\w-]+"/gu, '"request":"receipt"');
    expect(sceneRequests[1]).toContain("У реки есть медный фонарь.");
    expect(withoutReceipt(sceneRequests[1]!)).toBe(withoutReceipt(sceneRequests[0]!));
    await draft.fill("Проверка нового черновика.");
    await draft.press("Enter");
    await expect(draft).toHaveValue("");
    await draft.fill("Следующая реплика уже начата.");
    allowFailure();
    await expect(page.getByRole("alert").filter({ hasText: "Ответ оборвался" })).toBeVisible();
    await expect(draft).toHaveValue("Следующая реплика уже начата.");
    await expect(page.getByRole("button", { name: "Скопировать реплику" })).toBeVisible();
    await draft.clear();
    await page.getByRole("button", { name: "Вернуть в поле" }).click();
    await expect(draft).toHaveValue("Проверка нового черновика.");
    await page.screenshot({ path: info.outputPath("world-and-choices.png") });

    await page.getByRole("button", { name: "Библиотека" }).click();
    await library.getByRole("button", { name: "Настройки", exact: true }).click();
    await library.getByRole("button", { name: /Генерация изображений/ }).click();
    const image = (key: Parameters<typeof imageText>[1]) => imageText("ru", key);
    const imageSettings = library.locator(".dr-image-settings");
    await imageSettings.getByRole("button", { name: image("add"), exact: true }).click();
    await imageSettings.getByLabel(image("label"), { exact: true }).fill("Тестовое подключение");
    await imageSettings.getByLabel(image("baseUrl"), { exact: true }).fill(mock.url);
    await imageSettings.getByRole("switch", { name: image("active"), exact: true }).check();
    await imageSettings.getByRole("button", { name: image("allow"), exact: true }).click();
    await imageSettings.getByLabel(image("key"), { exact: true }).fill("desktop-image-test-key");
    await imageSettings.getByRole("button", { name: image("keySave"), exact: true }).click();
    await imageSettings.getByRole("button", { name: image("models"), exact: true }).click();
    await expect.poll(() => mock.modelRequests.filter(Boolean)).toEqual(["Bearer desktop-image-test-key"]);
    await expect(imageSettings.locator("option[value=desktop-image-fixture]").first()).toHaveCount(1);
    await imageSettings.locator('select:has(option[value="desktop-image-fixture"])').first().selectOption("desktop-image-fixture", { force: true });
    await imageSettings.getByRole("button", { name: image("save"), exact: true }).click();
    const imageEnabled = imageSettings.getByRole("switch", { name: image("enabled"), exact: true });
    await imageEnabled.click();
    await expect(imageEnabled).toBeChecked();
    const profiles = await page.evaluate(async () => {
      const desktop = (window as unknown as { deepRoleDesktop: { call(...args: string[]): Promise<any> } }).deepRoleDesktop;
      return (await desktop.call("storageGet", "local", "deeprole_image_settings")).deeprole_image_settings.profiles;
    });
    const chatUrl = page.url(), chatId = new URL(chatUrl).pathname.split("/").at(-1);
    const world = (await libraryRecords(page)).find(row => row.kind === "world");
    const illustration = await runtimeCommand(page, {
      type: "DR_IMAGE_GENERATE",
      input: { worldId: world?.data.id, chatId, chatUrl, messageKey: "test-bridge-illustration",
        providerId: profiles[0].id, prompt: "A copper lantern on a bridge", referenceKeys: [] },
    });
    expect(illustration).toMatchObject({ ok: true, illustration: { chatId, modelId: "desktop-image-fixture" } });
    expect((await libraryRecords(page)).some(row => row.kind === "illustration" && row.data.chatId === chatId)).toBe(true);
    const usage = await page.evaluate(id => fetch("/__desktop/usage?chat_session_id=" + encodeURIComponent(id ?? ""))
      .then(response => response.json()), chatId);
    expect(usage.images).toMatchObject({ requests: 1, unknown: 1 });
  } catch (error) {
    const page = app?.windows().find(window => window.url().startsWith("https://deeprole.local/") && !window.url().endsWith("background.html"));
    if (page) {
      const frame = page.frames().find(frame => frame.url().includes("sidepanel.html"));
      if (frame) await info.attach("library-state", { body: await frame.locator("body").innerText(), contentType: "text/plain" });
      await page.screenshot({ path: info.outputPath("failure.png") });
    }
    throw error;
  } finally {
    await app?.close();
    allowFailure();
    mock.close();
  }
});

test("shows an updated saved scene before opening a Windows chat", async ({}, info) => {
  const data = info.outputPath("data");
  const firstScene = "Мира оставила ключ на полке у измерительных приборов.";
  const fact = "Мира переложила ключ в нижний ящик стола.";
  const fixture = storyWorld("ru", 2);
  const { world, binding } = fixture;
  binding.chatUrl = "https://deeprole.local/a/chat/s/" + binding.chatId;
  world.sharedGame = {
    version: 1, id: "saved-game", revision: "saved-progress", activationId: "active",
    activeBindingId: binding.id, activeChatId: binding.chatId, managed: false,
    profileSeeds: {}, identitySeeds: {}, mergeSeeds: {}, memoryOverrides: { includedIds: [], excludedIds: [] },
    facts: [], recentStory: boundStory([{ role: "assistant", text: firstScene }], "history"), updatedAt: 1,
  };
  const api = await provider(() => "Ключ лежит в нижнем ящике.");
  let app: ElectronApplication | undefined;
  try {
    const client = await openClient(data);
    app = client.app;
    const { page } = client;
    await attachModel(page, api.url);
    await seedLibrary(page, fixture.records);
    const chats = path.join(data, "Chats");
    const sourceFile = path.join(chats, binding.chatId + ".json");
    const source = JSON.stringify({
      id: binding.chatId, title: "Сохранённая сцена", head: 2, updatedAt: 1,
      messages: [
        { id: 1, parent: null, role: "user", text: "Где ключ?", visible: "Где ключ?" },
        { id: 2, parent: 1, role: "assistant", text: firstScene, visible: firstScene },
      ],
    });
    await mkdir(chats, { recursive: true });
    await writeFile(sourceFile, source);
    await page.goto(binding.chatUrl);
    const game = page.getByRole("complementary", { name: "Игра", exact: true });
    const gameToggle = page.getByRole("button", { name: "Игровые панели", exact: true });
    if (await gameToggle.getAttribute("aria-expanded") !== "true") await gameToggle.click();
    await game.getByRole("button", { name: /^Память/u }).click();
    await continuationLauncher(page, "ru").press("Enter");
    await continuationMethod(page, "ru", "saved").press("Enter");
    const saved = savedMemoryText("ru");
    const preview = page.getByRole("dialog", { name: saved.title, exact: true });
    await expect(preview.locator("blockquote")).toHaveText(firstScene);
    await seedLibrary(page, [{
      kind: "world", id: world.id, data: { ...world, sharedGame: {
        ...world.sharedGame, revision: "later-progress", recentStory: boundStory([{ role: "assistant", text: fact }], "history"), updatedAt: 2,
      } },
    }]);
    await preview.getByRole("button", { name: saved.open, exact: true }).click();
    const updated = preview.getByRole("status").filter({ hasText: saved.updated });
    await expect(preview.locator("blockquote")).toHaveText(fact);
    await expect(updated).toBeFocused();
    await expect(page).toHaveURL(binding.chatUrl);
    expect(api.prompts).toHaveLength(0);
    expect((await libraryRecords(page)).filter(row => row.kind === "snapshot")).toHaveLength(0);
    await page.screenshot({ path: info.outputPath("updated-scene.png"), animations: "disabled" });
    await page.setViewportSize({ width: 320, height: 620 });
    await page.evaluate(() => window.deepRoleDesktop.call("storageSet", "local", { deeprole_settings: { locale: "en", onboardingComplete: true } }));
    const english = savedMemoryText("en");
    const englishPreview = page.getByRole("dialog", { name: english.title, exact: true });
    await expect(englishPreview.getByRole("status")).toHaveText(english.updated);
    await expect(englishPreview.locator("blockquote")).toHaveText(fact);
    expect(await englishPreview.locator(".dr-memory-dialog-body").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("updated-scene-320-en.png"), animations: "disabled" });
    await englishPreview.getByRole("button", { name: english.openUpdated, exact: true }).click();
    await expect(page).toHaveURL("https://deeprole.local/");
    await expect(page.getByText(english.queued, { exact: true })).toBeVisible();
    const composer = page.getByRole("textbox", { name: "Your message" });
    await expect(composer).toHaveValue("");
    expect(api.prompts).toHaveLength(0);
    await composer.fill("Открываю нижний ящик. Где ключ?");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator("[data-role=assistant]")).toContainText("Ключ лежит в нижнем ящике.");
    expect(api.prompts).toHaveLength(1);
    expect(api.prompts[0]).toContain(fact);
    expect(await readFile(sourceFile, "utf8")).toBe(source);
  } finally {
    await app?.close();
    api.close();
  }
});

test("recovers character instructions after a library refresh and shows named participants without a cast packet", async ({}, info) => {
  const world = { id: "lantern-room", name: "Комната у маяка", description: "", color: "#527788", contextBudget: 3000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
  const hero = { id: "noah", name: "Ной", worldId: world.id, kind: "character", description: "", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1, characterSheet: { ...EMPTY_CHARACTER, protagonist: true } };
  const person = { ...hero, id: "mira", name: "Мира", characterSheet: { ...EMPTY_CHARACTER, sprites: { neutral: `data:image/png;base64,${realPng}` } } };
  const binding = { id: "binding:lantern-probe", chatId: "lantern-probe", chatUrl: "https://deeprole.local/a/chat/s/lantern-probe", worldId: world.id,
    focusIds: [], bookId: null, messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1 };
  const mock = await provider(prompt => prompt.endsWith("Вхожу в комнату.") ? portraitContract.entry.prose
    : prompt.endsWith("Смотрю на фонарь.") ? portraitContract.quiet.prose + '\n\n<deeprole_characters>{"version":2,"world":"lantern-room","chat":"lantern-probe","facts":[]}</deeprole_characters>'
    : portraitContract.exit.prose);
  const data = info.outputPath("data");
  const chats = path.join(data, "Chats");
  await mkdir(chats, { recursive: true });
  await writeFile(path.join(chats, "lantern-probe.json"), JSON.stringify({
    id: "lantern-probe", title: "У маяка", head: 2, updatedAt: 1,
    messages: [
      { id: 1, role: "user", parent: null, text: "Подхожу к маяку.", visible: "Подхожу к маяку." },
      { id: 2, role: "assistant", parent: 1, text: "Дверь приоткрыта.", visible: "Дверь приоткрыта." },
    ],
  }));
  const { app, page } = await openClient(data);
  const preparation: string[] = [];
  page.on("console", message => {
    if (message.text().startsWith("[DeepRole memory preparation]")) preparation.push(message.text());
  });
  try {
    await attachModel(page, mock.url);
    await seedLibrary(page, [
      { kind: "world", id: world.id, data: world }, { kind: "binding", id: binding.id, data: binding },
      ...[hero, person].map(data => ({ kind: "entity" as const, id: data.id, data: { ...data, kind: "character" as const } })),
    ]);
    await page.goto(binding.chatUrl);
    const draft = page.getByRole("textbox", { name: "Ваша реплика" });
    await page.evaluate(() => {
      const originalFetch = window.fetch;
      let reads = 0;
      window.fetch = async (resource, options) => {
        if (typeof resource !== "string" || new URL(resource, location.href).pathname !== "/__desktop/memory-budget") return originalFetch(resource, options);
        document.documentElement.dataset.testBudgetReads = String(++reads);
        if (reads === 1) {
          const { deeprole_settings } = await window.deepRoleDesktop.call<{ deeprole_settings: object }>("storageGet", "local", "deeprole_settings");
          await window.deepRoleDesktop.call("storageSet", "local", { deeprole_settings: { ...deeprole_settings, animationsEnabled: false } });
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }
        return Response.json({ bytes: 80_000 });
      };
    });
    await draft.fill("Вхожу в комнату.");
    await draft.press("Enter");
    await expect(page.locator(".desktop-story-text").last()).toContainText(portraitContract.entry.prose);
    expect(mock.prompts).toHaveLength(1);
    const reads = await page.locator("html").getAttribute("data-test-budget-reads");
    expect(mock.prompts[0], [...preparation, `Budget reads ${reads}`].join("\n")).toContain("<deeprole_character_mode>");
    await expect(page.locator("html")).toHaveAttribute("data-test-budget-reads", "2");
    const portrait = page.locator(".dr-cast-widget[data-character-id=mira]");
    await expect(portrait).toBeVisible();
    await expect.poll(() => portrait.locator("img[data-current]").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    expect((await libraryRecords(page)).some(row => row.kind === "binding"
      && row.data.characterScenes?.[world.id]?.presentIds.includes(person.id))).toBe(false);
    await page.reload();
    await expect(portrait).toBeVisible();
    await draft.fill("Смотрю на фонарь.");
    await draft.press("Enter");
    await expect(page.locator(".desktop-story-text").last()).toContainText(portraitContract.quiet.prose);
    await expect(page.getByTestId("stop-generation")).toHaveCount(0);
    await page.reload();
    await expect(portrait).toBeVisible();
    await seedLibrary(page, [{ kind: "binding", id: binding.id, data: { ...binding, characterScenes: {
      [world.id]: { revision: "known-cast", updatedAt: 2, presentIds: [hero.id, person.id], states: {} },
    } } }]);
    await page.reload();
    await expect(portrait).toBeVisible();
    await draft.fill("Остаюсь в комнате один.");
    await draft.press("Enter");
    await expect(page.locator(".desktop-story-text").last()).toContainText("Дверь закрылась");
    await expect(portrait).toHaveCount(0);
    expect((await libraryRecords(page)).some(row => row.kind === "binding"
      && row.data.characterScenes?.[world.id]?.presentIds.includes(person.id))).toBe(true);
    await page.reload();
    await expect(page.locator(".desktop-story-text").last()).toContainText(portraitContract.exit.prose);
    await expect(portrait).toHaveCount(0);
    expect(mock.prompts).toHaveLength(3);
  } finally {
    await app.close();
    mock.close();
  }
});

test("records character states and sourced memory and recalls them after moving the client data", async ({}, info) => {
  const fact = "Мира положила ключ в жестяную банку с белой звездой.";
  const sceneTime = "День 2 · 09:20";
  const world = { id: "observatory", name: "Мастерская у моста", description: "", color: "#527788", contextBudget: 3000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
  const hero = { id: "noah", name: "Ной", worldId: world.id, kind: "character", description: "", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1, characterSheet: { ...EMPTY_CHARACTER, protagonist: true } };
  const person = { ...hero, id: "mira", name: "Мира", characterSheet: EMPTY_CHARACTER };
  const mock = await provider(prompt => {
    if (prompt.endsWith("Наблюдаю за пристанью.")) return "На пристани тихо. Мира смотрит на воду.";
    if (prompt.endsWith("Где ключ в этой сцене?") || prompt.endsWith("Мира, забираю ключ. Где он?")) return "В жестяной банке с белой звездой.";
    const state = {
      present: ["Ной", "Мира"], partners: ["Мира"],
      updates: [{ id: "Мира", state: { ...EMPTY_STATUS, action: "talking", condition: "Оставила ключ в банке.", stats: [{ label: "Энергия", value: "Бодра" }] } }],
    };
    const options = ["positive", "neutral", "negative", "surprise"].map((kind, i) => ({
      kind, label: ["Уточнить", "Подождать", "Уйти", "Осмотреть мост"][i], text: ["Где ключ?", "Я жду.", "Я ухожу.", "Я осматриваю мост."][i],
    }));
    const evidence = { kind: "event", anchor: "в жестяную банку с белой звездой", risk: "ordinary" };
    const metadata = { facts: [evidence], state: { op: "set", value: state } };
    return `${sceneTime}\n\n${fact}\n${JSON.stringify(evidence)}\n<deeprole_characters>${JSON.stringify(metadata)}\n<deeprole_choices>${JSON.stringify({ version: 1, options })}</deeprole_choices>`;
  });
  let app: ElectronApplication | undefined;
  const data = info.outputPath("game-data");
  try {
    const started = await openClient(data);
    app = started.app;
    const page = started.page;
    await attachModel(page, mock.url);
    await page.getByRole("button", { name: "Библиотека" }).click();
    const library = page.frameLocator(".desktop-library iframe");
    await library.getByRole("button", { name: "Миры", exact: true }).click();
    await library.getByRole("button", { name: "Загрузить мир из файла", exact: true }).click();
    const portrait = await page.evaluate(() => {
      const source = document.createElement("canvas");
      source.width = 750;
      source.height = 1000;
      const context = source.getContext("2d")!;
      context.fillStyle = "#335477";
      context.fillRect(0, 0, 750, 1000);
      context.fillStyle = "#edac90";
      context.fillRect(240, 180, 280, 500);
      return source.toDataURL("image/png");
    });
    person.characterSheet = { ...EMPTY_CHARACTER, sprites: { neutral: portrait } };
    await library.getByLabel("Выбрать JSON", { exact: true }).setInputFiles({
      name: "Мастерская.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({
        format: "deeprole-world", version: 1,
        records: [{ kind: "world", id: world.id, data: world }, ...[hero, person].map(data => ({ kind: "entity", id: data.id, data }))],
      })),
    });
    await library.getByRole("checkbox", { name: "Подключить к открытому чату", exact: true }).check();
    const auto = library.getByRole("checkbox", { name: "Подготовить персонажей из лора", exact: true });
    if (await auto.count()) await auto.uncheck();
    await library.getByRole("button", { name: "Импортировать и подключить", exact: true }).click();
    await library.getByRole("button", { name: "Миры", exact: true }).click();
    await expect(library.locator(".lore-connection.is-attached")).toBeVisible();
    await library.getByRole("button", { name: "Закрыть", exact: true }).first().click();
    const textbox = page.getByRole("textbox", { name: "Ваша реплика" });
    await textbox.fill("Мира, куда ты положила ключ?");
    await page.getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(page.locator("[data-role=assistant]")).toContainText(fact);
    await expect(page.locator(".dr-cast-portrait.right small")).toHaveText("Разговаривает");
    await expect.poll(() => page.locator(".dr-cast-portrait.right img[data-current]").evaluate((image: HTMLImageElement) => image.naturalHeight)).toBe(1000);
    await expect(page.locator("[data-deeprole-choices-host]")).toContainText("Уточнить");
    const setChoices = (sceneChoicesEnabled: boolean) => page.evaluate(async sceneChoicesEnabled => {
      const { deeprole_settings } = await window.deepRoleDesktop.call<{ deeprole_settings: object }>("storageGet", "local", "deeprole_settings");
      await window.deepRoleDesktop.call("storageSet", "local", { deeprole_settings: { ...deeprole_settings, sceneChoicesEnabled } });
    }, sceneChoicesEnabled);
    await setChoices(false);
    await expect(page.locator("[data-deeprole-choices-host]")).toHaveCount(0);
    const currentPortrait = page.locator(".dr-cast-portrait.right img[data-current]");
    await expect(currentPortrait).toBeVisible();
    await page.reload();
    await expect.poll(() => currentPortrait.evaluate((image: HTMLImageElement) => image.naturalHeight)).toBe(1000);
    await expect(page.locator("[data-deeprole-choices-host]")).toHaveCount(0);
    await page.setViewportSize({ width: 320, height: 620 });
    const strip = page.locator(".dr-cast-frame[data-adaptive-compact]");
    await expect(strip).toBeVisible();
    await expect.poll(async () => {
      const [portraits, form] = await Promise.all([strip.boundingBox(), page.locator(".desktop-composer").boundingBox()]);
      return !!(portraits && form && portraits.y + portraits.height <= form.y);
    }).toBe(true);
    await page.screenshot({ path: info.outputPath("portraits-without-choices-320.png"), animations: "disabled" });
    await page.setViewportSize({ width: 1440, height: 940 });
    await setChoices(true);
    await expect(page.locator("[data-deeprole-choices-host]")).toContainText("Уточнить");
    await expect.poll(async () => (await libraryRecords(page)).some(row => row.kind === "story" && row.data.automation?.status === "saved" && row.data.memory?.text.includes("белой звездой"))).toBe(true);
    const gamePanel = page.getByRole("complementary", { name: "Игра", exact: true });
    const context = gamePanel.getByRole("navigation", { name: "Разделы игры" });
    await expect(context.getByRole("button", { name: "Сцена", exact: true })).toHaveAttribute("aria-pressed", "true");
    const setup = gamePanel.getByRole("group", { name: "Настройки сцены" });
    await expect(setup.getByRole("combobox", { name: "Мир", exact: true }).locator("option:checked")).toHaveText(world.name);
    const scene = setup.getByRole("button", { name: /^Настроить сцену/ });
    await expect(scene).toContainText("По диалогу");
    await scene.click();
    await gamePanel.getByRole("checkbox", { name: "Мира", exact: true }).check();
    await expect(scene).toContainText("Мира");
    await gamePanel.locator(".scene-clear").click();
    await expect(gamePanel.getByRole("checkbox", { name: "Мира", exact: true })).not.toBeChecked();
    await scene.click();
    const suggestions = setup.getByRole("switch", { name: "Варианты хода" });
    await expect(suggestions).toHaveAttribute("aria-checked", "true");
    await suggestions.click();
    await expect(suggestions).toHaveAttribute("aria-checked", "false");
    await suggestions.click();
    await expect(suggestions).toHaveAttribute("aria-checked", "true");
    await context.getByRole("button", { name: "Герои", exact: true }).click();
    await gamePanel.locator(".dr-character-row").filter({ hasText: "Мира" }).click();
    const character = page.locator(".dr-character-dialog");
    await expect(character).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(character).toHaveCount(0);
    await expect(gamePanel.locator(".dr-character-row").filter({ hasText: "Мира" })).toBeFocused();
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({ path: info.outputPath("game-cast.png"), animations: "disabled" });
    await context.getByRole("button", { name: "Сцена", exact: true }).click();
    await page.screenshot({ path: info.outputPath("game.png") });
    await page.emulateMedia({ colorScheme: "light" });
    const choices = page.locator("[data-deeprole-choices-host]");
    await expect(choices.locator("section")).toHaveCSS("background-color", "oklch(1 0 0)");
    await expect(page.locator(".dr-cast-widget").first()).toHaveCSS("background-color", "oklch(1 0 0)");
    const optionFills = await choices.locator(".grid button").evaluateAll(buttons => buttons.map(button => getComputedStyle(button).backgroundImage));
    expect(new Set(optionFills).size).toBe(4);
    expect(optionFills.every(fill => fill.startsWith("linear-gradient"))).toBe(true);
    await page.screenshot({ path: info.outputPath("game-light.png") });

    await page.setViewportSize({ width: 320, height: 620 });
    const gameToggle = page.getByRole("button", { name: "Игровые панели", exact: true });
    await expect(gameToggle).toHaveAttribute("aria-expanded", "false");
    await gameToggle.click();
    await expect(scene).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await page.evaluate(() => window.deepRoleDesktop.call("storageSet", "local", { deeprole_settings: { locale: "en", onboardingComplete: true } }));
    const englishSetup = page.getByRole("group", { name: "Scene settings", exact: true });
    await expect(englishSetup.getByRole("button", { name: /^Configure scene/ })).toBeVisible();
    await expect(englishSetup.getByRole("switch", { name: "Scene choices" })).toHaveAttribute("aria-checked", "true");
    await page.screenshot({ path: info.outputPath("scene-panel-320.png"), animations: "disabled" });
    await page.evaluate(() => window.deepRoleDesktop.call("storageSet", "local", { deeprole_settings: { locale: "ru", onboardingComplete: true } }));
    await expect(scene).toBeVisible();
    await scene.press("Escape");
    await expect(gameToggle).toBeFocused();

    await app.close();
    app = undefined;
    const copied = info.outputPath("copied");
    await cp(data, copied, { recursive: true, filter: source => !/(?:^|[\\/])(?:Singleton\w*|LOCK|lockfile|Crashpad|GPUCache|Code Cache|Cache)$/u.test(source) });
    const restored = await openClient(copied);
    app = restored.app;
    await restored.page.getByRole("link", { name: "Мира, куда ты положила ключ?" }).click();
    await expect(restored.page.locator("[data-role=assistant]")).toContainText(fact);
    await expect(restored.page.locator('[data-deeprole-scene-clock="present"]')).toHaveText(sceneTime);
    await restored.page.getByRole("textbox", { name: "Ваша реплика" }).fill("Где ключ в этой сцене?");
    await restored.page.getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(restored.page.locator("[data-role=assistant]").last()).toContainText("В жестяной банке с белой звездой.");
    expect(mock.prompts[1]).toContain(fact);
    expect(mock.prompts[1]).toContain("<deeprole_story_time>");
    expect(mock.prompts[1]).toContain(sceneTime);

    await restored.page.getByRole("button", { name: "Библиотека", exact: true }).click();
    const journalLibrary = restored.page.frameLocator(".desktop-library iframe");
    await journalLibrary.getByRole("button", { name: "Память игры", exact: true }).click();
    await journalLibrary.getByRole("button", { name: "Журнал", exact: true }).click();
    const journal = journalLibrary.getByRole("region", { name: "Журнал событий", exact: true });
    await expect(journal).toBeVisible();
    await journal.getByText("Время сцен", { exact: true }).click();
    await expect(journal.locator(".dr-story-clock-list")).toContainText(sceneTime);
    await journal.getByText(/^Эпизод 1/u).click();
    await expect(journal.locator(".dr-story-review-entry > .dr-story-review-source").filter({ hasText: fact })).toBeVisible();
    await journalLibrary.getByRole("button", { name: "Закрыть", exact: true }).first().click();

    const saved = savedMemoryText("ru");
    const previousChat = restored.page.url();
    const restoredPage = restored.page;
    const memoryTab = restoredPage.locator(".desktop-play-tools-tabs");
    await memoryTab.getByRole("button", { name: /^Память/u }).click();
    const nextTurnMemory = restoredPage.getByRole("button", { name: /^Память для следующего хода/u });
    const lastRequest = restoredPage.locator(".desktop-context-reading");
    await expect(nextTurnMemory).toContainText(/Источников: \d+/u);
    await expect(lastRequest.locator("dl")).toBeHidden();
    await restored.page.emulateMedia({ colorScheme: "dark" });
    await restoredPage.mouse.move(600, 88);
    await restored.page.screenshot({ path: info.outputPath("memory-panel.png"), animations: "disabled" });
    await nextTurnMemory.click();
    const selectedMemory = restoredPage.getByRole("dialog", { name: "Подключённая память", exact: true });
    await expect(selectedMemory.getByRole("heading", { name: "Для следующей реплики" })).toBeVisible();
    const budgetInput = selectedMemory.getByRole("spinbutton", { name: "Лимит памяти · токены" });
    await expect(budgetInput).toBeHidden();
    await restoredPage.screenshot({ path: info.outputPath("selected-memory.png"), animations: "disabled" });
    await selectedMemory.getByText("Лимит памяти мира", { exact: false }).press("Enter");
    await expect(budgetInput).toHaveValue("3000");
    await restoredPage.keyboard.press("Escape");
    await expect(nextTurnMemory).toBeFocused();

    await restoredPage.setViewportSize({ width: 320, height: 620 });
    await restoredPage.evaluate(() => window.deepRoleDesktop.call("storageSet", "local", { deeprole_settings: { locale: "en", onboardingComplete: true } }));
    const gamePanelToggle = restoredPage.getByRole("button", { name: "Game panels", exact: true });
    await expect(gamePanelToggle).toHaveAttribute("aria-expanded", "false");
    await gamePanelToggle.click();
    await expect(restoredPage.getByRole("button", { name: /^Memory for the next turn/u })).toBeVisible();
    await lastRequest.getByText("Last request", { exact: true }).press("Enter");
    await expect(lastRequest.locator("dl")).toBeVisible();
    await expect(lastRequest.getByText("Model window", { exact: true })).toBeVisible();
    await expect(lastRequest.getByText("Before sending", { exact: true })).toBeVisible();
    await expect(lastRequest.getByText("First text from API", { exact: true })).toBeVisible();
    await expect(lastRequest.getByText("Full reply from API", { exact: true })).toBeVisible();
    expect(await restoredPage.evaluate(() => document.querySelector(".desktop-play-tools-scroll")!.scrollWidth)).toBeLessThanOrEqual(320);
    await restoredPage.emulateMedia({ colorScheme: "light" });
    await restoredPage.screenshot({ path: info.outputPath("memory-panel-320.png"), animations: "disabled" });
    const englishMemory = restoredPage.getByRole("button", { name: /^Memory for the next turn/u });
    await englishMemory.press("Enter");
    const englishDialog = restoredPage.getByRole("dialog", { name: "Selected memory", exact: true });
    await expect(englishDialog.getByRole("heading", { name: "For the next message" })).toBeVisible();
    const memoryBody = englishDialog.locator(".dr-memory-dialog-body");
    expect(await memoryBody.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await restoredPage.screenshot({ path: info.outputPath("selected-memory-320.png"), animations: "disabled" });
    await restoredPage.keyboard.press("Escape");
    await expect(englishMemory).toBeFocused();
    const englishLauncher = continuationLauncher(restoredPage, "en");
    await englishLauncher.press("Enter");
    const englishReview = continuationMethod(restoredPage, "en", "review");
    const englishSaved = continuationMethod(restoredPage, "en", "saved");
    await expect(englishReview).toHaveAccessibleDescription(/DeepRole takes the first turn/u);
    await expect(englishSaved).toHaveAccessibleDescription(/You take the first turn/u);
    await restoredPage.screenshot({ path: info.outputPath("continue-picker-320.png"), animations: "disabled" });
    await englishSaved.press("Enter");
    const englishPreview = restoredPage.getByRole("dialog", { name: savedMemoryText("en").title, exact: true });
    await expect(englishPreview.locator("blockquote")).toContainText("белой звездой");
    await expect(englishPreview.locator("time")).toBeVisible();
    expect(await englishPreview.locator(".dr-memory-dialog-body").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await restoredPage.screenshot({ path: info.outputPath("continue-preview-320.png"), animations: "disabled" });
    await restoredPage.keyboard.press("Escape");
    await expect(englishLauncher).toBeFocused();
    await restoredPage.setViewportSize({ width: 1440, height: 940 });
    await restoredPage.evaluate(() => window.deepRoleDesktop.call("storageSet", "local", { deeprole_settings: { locale: "ru", onboardingComplete: true } }));
    await expect(nextTurnMemory).toBeVisible();
    await restoredPage.emulateMedia({ colorScheme: "dark" });
    await continuationLauncher(restoredPage, "ru").press("Enter");
    await expect(continuationMethod(restoredPage, "ru", "saved")).toBeVisible();
    await restoredPage.screenshot({ path: info.outputPath("continue-picker.png"), animations: "disabled" });
    await continuationMethod(restoredPage, "ru", "saved").press("Enter");
    const preview = restored.page.getByRole("dialog", { name: saved.title, exact: true });
    await expect(preview.locator("blockquote")).toContainText("белой звездой");
    await preview.getByRole("button", { name: "К выбору способа", exact: true }).press("Enter");
    await expect(continuationMethod(restoredPage, "ru", "review")).toBeVisible();
    await continuationMethod(restoredPage, "ru", "saved").click();
    await expect(preview.locator("blockquote")).toContainText("белой звездой");
    await restoredPage.screenshot({ path: info.outputPath("continue-preview.png"), animations: "disabled" });
    await preview.getByRole("button", { name: saved.open, exact: true }).click();
    const updatedSceneAction = preview.getByRole("button", { name: saved.openUpdated, exact: true });
    await expect.poll(async () => restoredPage.url() === "https://deeprole.local/" || await updatedSceneAction.isEnabled({ timeout: 200 }).catch(() => false)).toBe(true);
    if (restoredPage.url() === previousChat) {
      await expect(preview.locator("blockquote")).toContainText("белой звездой");
      await updatedSceneAction.click();
    }
    await expect(restoredPage).toHaveURL("https://deeprole.local/");
    await expect(restored.page.getByText(saved.queued, { exact: true })).toBeVisible();
    expect(mock.prompts).toHaveLength(2);
    await restored.page.getByRole("textbox", { name: "Ваша реплика" }).fill("Мира, забираю ключ. Где он?");
    await restored.page.getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(restored.page.locator("[data-role=assistant]")).toContainText("В жестяной банке с белой звездой.");
    expect(mock.prompts[2]).toContain(fact);
    const currentChat = restored.page.url();
    expect(currentChat).not.toBe(previousChat);
    const currentId = new URL(currentChat).pathname.split("/").at(-1);
    await expect.poll(async () => (await libraryRecords(restored.page)).find(row => row.kind === "world")?.data.sharedGame?.activeChatId).toBe(currentId);
    await expect(restored.page.getByTestId("stop-generation")).toHaveCount(0);
    await restored.page.getByRole("link", { name: "Мира, куда ты положила ключ?" }).click();
    await expect(restored.page).toHaveURL(previousChat);
    const notice = oldChatNoticeText("ru");
    const openCurrent = restored.page.getByRole("region", { name: notice.title }).getByRole("link", { name: notice.open });
    await expect(openCurrent).toHaveAttribute("href", currentChat);

    await restored.page.getByRole("button", { name: "Библиотека" }).click();
    const restoredLibrary = restored.page.frameLocator(".desktop-library iframe");
    await restoredLibrary.getByRole("button", { name: "Настройки", exact: true }).click();
    await restoredLibrary.getByRole("button", { name: /Резервные копии и защита/ }).click();
    await restoredLibrary.getByRole("button", { name: "Экспорт", exact: true }).click();
    const exportDialog = restoredLibrary.getByRole("dialog", { name: "Экспорт" });
    await exportDialog.getByRole("radio", { name: /Полная резервная копия/ }).check();
    const exportPath = info.outputPath("world-backup.json");
    await restored.app.evaluate(({ session }, file) => {
      session.defaultSession.once("will-download", (_event, item) => { item.setSavePath(file); });
    }, exportPath);
    await exportDialog.getByRole("button", { name: "Скачать файл", exact: true }).click();
    await expect(exportDialog).toHaveCount(0);
    await expect.poll(() => readFile(exportPath, "utf8").catch(() => ""), { timeout: 15_000 }).toContain("deeprole-backup");
    const backup = JSON.parse(await readFile(exportPath, "utf8"));
    expect(backup.format).toBe("deeprole-backup");
    expect(backup.records.some((record: { kind: string; data: { name?: string } }) => record.kind === "world" && record.data.name === world.name)).toBe(true);

    // Recreate the URLs in an extension backup. The browser transcript is not available.
    for (const entry of backup.records) {
      if (entry.kind === "binding") entry.data.chatUrl = entry.data.chatUrl.replace("https://deeprole.local", "https://chat.deepseek.com");
      if (entry.kind === "snapshot") entry.data.sourceChatUrl = entry.data.sourceChatUrl.replace("https://deeprole.local", "https://chat.deepseek.com");
    }
    await app.close();
    app = undefined;
    const imported = await openClient(info.outputPath("extension-import"));
    app = imported.app;
    await attachModel(imported.page, mock.url);
    await imported.page.getByRole("button", { name: "Библиотека" }).click();
    const importLibrary = imported.page.frameLocator(".desktop-library iframe");
    await importLibrary.getByRole("button", { name: "Настройки", exact: true }).click();
    await importLibrary.getByRole("button", { name: /Резервные копии и защита/ }).click();
    await importLibrary.locator('.dr-settings-page:not([hidden]) input[type="file"]').setInputFiles({
      name: "extension-backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)),
    });
    const restore = importLibrary.getByRole("dialog", { name: "Восстановление копии" });
    await restore.getByRole("button", { name: "Добавить недостающее", exact: true }).click();
    await expect(restore).toHaveCount(0);
    await importLibrary.getByRole("button", { name: "Закрыть", exact: true }).first().click();
    await expect(imported.page.locator(".desktop-chat-link")).toHaveCount(0);
    await imported.page.locator(".desktop-play-tools-tabs").getByRole("button", { name: /^Память/u }).click();
    await imported.page.getByRole("button", { name: saved.title, exact: true }).click({ timeout: 8_000 });
    const migratedPreview = imported.page.getByRole("dialog", { name: saved.title, exact: true });
    await expect(migratedPreview.locator("blockquote")).toContainText("белой звездой");
    await migratedPreview.getByRole("button", { name: saved.connect, exact: true }).click();
    await expect(imported.page.getByText(saved.queued, { exact: true })).toBeVisible();
    expect(mock.prompts).toHaveLength(3);
    await imported.page.getByRole("textbox", { name: "Ваша реплика" }).fill("Мира, забираю ключ. Где он?");
    await imported.page.getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(imported.page.locator("[data-role=assistant]")).toContainText("В жестяной банке с белой звездой.");
    expect(mock.prompts[3]).toContain(fact);

    const activeUrl = imported.page.url();
    const id = new URL(activeUrl).pathname.split("/").at(-1);
    const importedData = info.outputPath("extension-import");
    await imported.page.getByRole("button", { name: "test-story", exact: true }).click();
    const model = imported.page.getByRole("dialog", { name: "Текстовая модель" });
    await model.getByRole("combobox", { name: "Лимит ответа", exact: true }).selectOption("manual");
    await model.getByLabel("Лимит токенов на ответ").fill("256");
    await model.getByLabel("Окно контекста вручную").fill("8192");
    await model.getByRole("button", { name: "Сохранить подключение", exact: true }).click();
    await expect(model).toBeHidden();
    test.setTimeout(150_000);
    const longSends: { path: string; status: number; bytes?: number; body?: string }[] = [];
    imported.page.on("response", response => {
      const pathname = new URL(response.url()).pathname;
      if (pathname !== "/__desktop/memory-budget" && pathname !== "/api/v0/chat/completion") return;
      const data = response.request().postDataJSON();
      const entry = { path: pathname, status: response.status(), bytes: typeof data?.prompt === "string" ? Buffer.byteLength(data.prompt) : undefined };
      longSends.push(entry);
      if (pathname === "/__desktop/memory-budget" || !response.ok()) void response.text().then(body => Object.assign(entry, { body }));
    });
    for (const [index, heading] of ["Утро. ", "Полдень. "].entries()) {
      const draft = imported.page.getByRole("textbox", { name: "Ваша реплика" });
      await draft.fill(heading + "The dock is quiet today. ".repeat(525) + "Наблюдаю за пристанью.");
      await imported.page.getByRole("button", { name: "Отправить", exact: true }).click();
      await expect(draft).toHaveValue("", { timeout: 16_000 });
      await expect(imported.page.locator("[data-role=assistant]")).toHaveCount(2 + index, { timeout: 16_000 }).catch(async error => {
        throw Error(JSON.stringify({ alert: await imported.page.getByRole("alert").allTextContents(), longSends }), { cause: error });
      });
      await expect(imported.page.locator("[data-role=assistant]").last()).toContainText("Мира смотрит на воду.");
      await expect(imported.page.getByTestId("stop-generation")).toHaveCount(0, { timeout: 16_000 });
    }
    const chatFile = path.join(importedData, "Chats", id + ".json");
    const checkpoint = JSON.parse(await readFile(chatFile, "utf8")).contextCheckpoint;
    expect(checkpoint).toMatchObject({ scene: "На пристани тихо. Мира смотрит на воду." });
    await app.close();
    app = undefined;
    const reopened = await openClient(importedData);
    app = reopened.app;
    await reopened.page.goto(activeUrl);
    const reopenedDraft = reopened.page.getByRole("textbox", { name: "Ваша реплика" });
    await expect(reopened.page.locator("[data-role=assistant]").last()).toContainText("Мира смотрит на воду.");
    expect(JSON.parse(await readFile(chatFile, "utf8")).contextCheckpoint).toEqual(checkpoint);
    await reopenedDraft.fill("Где ключ в этой сцене?");
    await reopened.page.getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(reopened.page.locator("[data-role=assistant]").last()).toContainText("В жестяной банке с белой звездой.");
    expect(reopened.page.url()).toBe(activeUrl);
    const sent = mock.requests.at(-1)?.messages ?? [];
    expect(sent.slice(1, -1).map(message => message.content).join("\n")).not.toContain("белой звездой");
    expect(sent.at(-1)?.content).toContain(fact);
  } finally {
    await app?.close();
    mock.close();
  }
});
