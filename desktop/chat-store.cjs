const { mkdir, readFile, writeFile, rename, readdir, rm } = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { complete, veniceCharges, veniceBalances, memoryBudget } = require("./provider.cjs");
const { storyMemoryEnabled, earlierSceneQuery } = require("./model-context.cjs");
const { recordUsage, readTokenUsage, estimatedCost, usageSummary, spendingSince } = require("./usage.cjs");
const { spendingSettings, saveSpending, spendingNotices } = require("./spending.cjs");

const idPattern = /^[\w-]{1,120}$/u;
const loading = new Map();
const encoder = new TextEncoder();

function chatPath(data, id) {
  if (typeof id !== "string" || !idPattern.test(id)) throw Error("Invalid chat");
  return path.join(data, "Chats", id + ".json");
}
async function readChat(data, id) {
  try {
    return JSON.parse(await readFile(chatPath(data, id), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { id, title: "", messages: [], head: null, updatedAt: 0 };
  }
}
async function saveChat(data, chat) {
  const file = chatPath(data, chat.id);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file + ".tmp", JSON.stringify(chat));
  await rename(file + ".tmp", file);
}
function lineAt(chat, tip) {
  const messages = new Map(chat.messages.map(message => [message.id, message]));
  const seen = new Set();
  const line = [];
  while (tip !== null) {
    const message = messages.get(tip);
    if (!message || seen.has(tip)) throw Error("Chat history changed");
    seen.add(tip);
    line.push(message);
    tip = message.parent;
  }
  return line.reverse();
}
const effectFree = text => text.replace(/<deeprole_[^>]*>[\s\S]*?<\/deeprole_[^>]*>/gu, "").replace(/<deeprole_[^>]*>[\s\S]*$/gu, "").trim();
const storyTransportKeys = ["request", "version", "world", "chat", "branch", "present", "partners", "updates", "attributes", "bonds", "selfies", "facts", "people"];
const echoCopulas = new Set(["is", "are", "was", "were", "был", "была", "было", "были"]);
const echoWords = text => (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(word => !echoCopulas.has(word));

function trailingFactEcho(prefix) {
  const line = /\n[ \t]*(\{[^\r\n]{1,500}\})[ \t]*\s*$/u.exec(prefix);
  if (!line) return;
  let echo;
  try { echo = JSON.parse(line[1]); } catch { return; }
  if (Object.keys(echo).length !== 3 || echo.kind !== "event" || typeof echo.anchor !== "string" || echo.anchor.length < 12
      || !["ordinary", "uncertain", "conflict"].includes(echo.risk)) return;
  const prose = prefix.slice(0, line.index);
  const words = echoWords(echo.anchor), phrase = ` ${words.join(" ")} `;
  // Only presentation can ignore an omitted copula. Memory evidence still
  // uses the exact source and the normal scope checks.
  const found = prose.toLowerCase().includes(echo.anchor.toLowerCase()) || words.length >= 2
    && prose.split(/[.!?\r\n]/u).some(sentence => ` ${echoWords(sentence).join(" ")} `.includes(phrase));
  if (found) return { echo, prose: prose.trimEnd() };
}

function withoutFactEcho(prefix, facts) {
  if (!Array.isArray(facts)) return prefix;
  const trailing = trailingFactEcho(prefix);
  if (!trailing) return prefix;
  const { echo, prose } = trailing;
  const duplicate = facts.some(fact => fact?.kind === echo.kind && fact.risk === echo.risk
    && (fact.anchor === echo.anchor || typeof fact.quote === "string" && fact.quote.includes(echo.anchor)));
  return duplicate ? `${prose}\n\n` : prefix;
}

function storyMetadataRoute(prompt, chatId) {
  const scope = /<deeprole_story_update_mode>[^<]*\bworld:\s*"([\w-]+)",\s*chat:\s*"([\w-]+)",\s*branch:\s*"([\w-]+)"/u.exec(prompt);
  return scope?.[2] === chatId ? { world: scope[1], chat: chatId, branch: scope[3] } : undefined;
}

function recordedStoryRoute(prompt, chatId) {
  if (typeof prompt !== "string") return;
  const separator = prompt.indexOf("\n\n[User message]\n");
  if (separator < 0) return;
  const context = prompt.slice(0, separator);
  if (storyMemoryEnabled(context)) return storyMetadataRoute(context, chatId);
}

function normalizeStoryMetadata(text, prompt, chatId, draft) {
  const route = storyMetadataRoute(prompt, chatId);
  if (!route) return text;
  const keepJson = /\bjson\b/iu.test(draft);
  const characterMode = /<deeprole_character_mode>([\s\S]*?)<\/deeprole_character_mode>/u.exec(prompt)?.[1] ?? "";
  const requestId = /(?:^|\n)Schema:\s*\{"request":\s*"([\w-]+)"/u.exec(characterMode)?.[1];
  const tags = text.match(/<deeprole_characters>/gu) ?? [];
  const tagged = /<deeprole_characters>\s*(\{[\s\S]*?\})\s*(?:<\/deeprole_characters>|(?=<deeprole_choices>|$))/u.exec(text);
  if (tags.length > 1 || (tags.length || text.includes("</deeprole_characters>")) && !tagged) return text;
  // A known fact object at the very end is a display artifact. Without a
  // scoped packet it is never used to apply effects. Keep requested JSON.
  if (!tagged && !keepJson && recordedStoryRoute(prompt, chatId)) {
    const orphan = trailingFactEcho(text);
    if (orphan) return orphan.prose;
  }
  const blocks = tagged ? [tagged] : [...text.matchAll(/(^|\n)```json[ \t]*\r?\n(\{[\s\S]*?\})[ \t]*\r?\n```(?=\s|$)/giu)];
  const candidates = [];
  for (const block of blocks) {
    const source = tagged ? block[1] : block[2];
    if (source.length > 64_000) continue;
    let value;
    try { value = JSON.parse(source); } catch { continue; }
    // Native completion owns this response. Only a tagged packet can inherit
    // omitted identifiers. An ordinary code fence must identify itself in full.
    const hasRoute = Object.entries(route).every(([key, id]) => value[key] === id);
    if (Object.entries(route).some(([key, id]) => Object.hasOwn(value, key) && value[key] !== id)
        || (value.version !== undefined && value.version !== 2)
        || (requestId && value.request !== undefined && value.request !== requestId)
        || (!tagged && (!hasRoute || value.version !== 2))) continue;
    const before = text.slice(0, block.index);
    const prefix = tagged ? (keepJson ? before : withoutFactEcho(before, value.facts)) : before + block[1];
    if (tagged && hasRoute && tagged[0].endsWith("</deeprole_characters>")) return prefix + text.slice(block.index);
    const cast = value.deeprole_characters ?? (value.state?.op === "set" ? value.state.value : undefined);
    if (!Array.isArray(value.facts) && !Array.isArray(value.updates) && !Array.isArray(cast?.updates)) continue;
    const packet = { version: 2, ...route };
    for (const key of storyTransportKeys) {
      const field = Object.hasOwn(value, key) ? value[key] : ["present", "partners", "updates"].includes(key) ? cast?.[key] : undefined;
      if (field !== undefined) packet[key] = field;
    }
    candidates.push({ block, packet, prefix });
  }
  if (candidates.length !== 1) return text;
  const [{ block, packet, prefix }] = candidates;
  const json = JSON.stringify(packet).replaceAll("<", "\\u003c");
  return `${prefix}<deeprole_characters>${json}</deeprole_characters>\n${text.slice(block.index + block[0].length)}`;
}

const json = (value, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

async function streamDelta(response, consume, captureMetadata) {
  if (!response.body) throw Error("model-empty");
  if (response.headers.get("content-type")?.includes("application/json")) {
    const result = await response.json();
    captureMetadata(result);
    const message = result.choices?.[0]?.message;
    if (!message || typeof message.content !== "string") throw Error("model-empty");
    if (result.choices[0].finish_reason && result.choices[0].finish_reason !== "stop") throw Error("model-incomplete");
    consume(message.content, message.reasoning_content ?? "");
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", doneMarker = false, finished = false;
  function parse(frame) {
    const data = frame.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    if (!data) return;
    if (data === "[DONE]") { doneMarker = true; return; }
    const packet = JSON.parse(data);
    if (packet.error) throw Error("model-request-failed");
    captureMetadata(packet);
    const choice = packet.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason && choice.finish_reason !== "stop") throw Error("model-incomplete");
    finished ||= choice.finish_reason === "stop";
    const delta = choice.delta;
    if (delta) consume(typeof delta.content === "string" ? delta.content : "", typeof delta.reasoning_content === "string" ? delta.reasoning_content : "");
  }
  try {
    while (!doneMarker) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 2_000_000) throw Error("model-incomplete");
      const frames = buffer.split(/\r?\n\r?\n/u);
      buffer = frames.pop() ?? "";
      for (const frame of frames) parse(frame);
      if (done) { if (buffer.trim()) parse(buffer); break; }
    }
    if (!doneMarker && !finished) throw Error("model-incomplete");
  } finally { await reader.cancel().catch(() => undefined); }
}

async function generate(data, safeStorage, request) {
  const body = await request.json();
  const id = body.chat_session_id;
  if (typeof id !== "string" || !idPattern.test(id) || typeof body.prompt !== "string" || body.prompt.length > 2_000_000
      || typeof body.visible !== "string" || body.visible.length > 2_000_000 || !body.visible.trim()) return json({ error: "invalid-request" }, 400);
  if (loading.has(id)) return json({ error: "chat-busy" }, 409);
  const controller = new AbortController();
  loading.set(id, controller);
  let delegated = false;
  let attempt, providerRequestId, tokens;
  async function finishUsage(status) {
    if (!attempt) return;
    const { id, pricing } = attempt;
    attempt = undefined;
    await recordUsage(data, { id, status, requestId: providerRequestId, tokens, estimatedUsd: estimatedCost(tokens, pricing) }).catch(() => undefined);
  }
  try {
    const chat = await readChat(data, id);
    const original = chat.messages.find(message => message.id === body.message_id && message.role === "user");
    if (body.message_id !== undefined && !original) return json({ error: "chat-stale" }, 409);
    const parent = original ? original.parent : body.parent_message_id;
    if (!original && parent !== chat.head) return json({ error: "chat-stale" }, 409);
    const line = lineAt(chat, parent);
    const kind = body.visible.trimStart().startsWith("[DeepRole") ? "service" : "story";
    const sceneQuery = kind === "story" ? earlierSceneQuery(body.visible) : undefined;
    const route = sceneQuery ? recordedStoryRoute(body.prompt, id) : undefined;
    const context = line.map((message, index) => {
      if (message.role !== "assistant") return { role: message.role, content: message.visible };
      const author = line[index - 1];
      const source = route && author?.role === "user" ? recordedStoryRoute(author.text, id) : undefined;
      const recordedScene = Boolean(source && source.world === route.world && source.branch === route.branch);
      return { role: message.role, content: effectFree(message.text), recordedScene };
    });
    const current = { role: "user", content: body.prompt, sceneQuery: route ? sceneQuery : undefined };
    const signal = AbortSignal.any([request.signal, controller.signal]);
    let contextStats;
    const response = await complete(data, safeStorage, [...context, current], signal, async (plan, profile) => {
      const { window, windowSource, replyTokens, estimatedInput, omittedMessages } = plan;
      contextStats = { window, windowSource, replyTokens, estimatedInput, omittedMessages };
      const omittedThrough = line[omittedMessages - 1]?.id;
      const retainedLast = line.at(-1);
      if (kind === "story" && omittedThrough && retainedLast && chat.contextCheckpoint?.omittedThrough !== omittedThrough) {
        const separator = body.prompt.indexOf("\n\n[User message]\n");
        chat.contextCheckpoint = {
          at: Date.now(), parent, omittedThrough,
          memory: separator >= 0 && body.prompt.startsWith("<deeprole_") ? body.prompt.slice(0, separator) : "",
          scene: retainedLast.visible,
        };
        await saveChat(data, chat);
      }
      if (attempt) return;
      const row = { id: randomUUID(), at: Date.now(), chatId: id, kind, ...profile };
      attempt = row;
      await recordUsage(data, { id: row.id, at: row.at, chatId: id, kind, model: row.model, venice: row.venice }).catch(() => undefined);
    });
    if (!response.ok) return response;
    const last = chat.messages.at(-1)?.id ?? 0;
    const user = { id: last + 1, parent, role: "user", text: body.prompt, visible: body.visible };
    const reply = { id: last + 2, parent: user.id, role: "assistant", text: "", visible: "", reasoning: "" };
    delegated = true;
    const stream = new ReadableStream({
      async start(output) {
        const send = (event, value) => output.enqueue(encoder.encode("event: " + event + "\ndata: " + JSON.stringify(value) + "\n\n"));
        try {
          send("ready", { request_message_id: user.id, response_message_id: reply.id });
          await streamDelta(response, (text, reasoning) => {
            if (signal.aborted) throw signal.reason;
            reply.text += text;
            reply.reasoning += reasoning;
            if (reply.text.length > 250_000 || reply.reasoning.length > 500_000) throw Error("model-incomplete");
            if (text || reasoning) send("delta", { text, reasoning });
          }, packet => {
            if (typeof packet.id === "string" && packet.id) providerRequestId = packet.id;
            tokens = readTokenUsage(packet.usage) ?? tokens;
          });
          if (signal.aborted) throw signal.reason;
          if (!reply.text.trim()) throw Error("model-empty");
          if (kind === "story") reply.text = normalizeStoryMetadata(reply.text, body.prompt, id, body.visible);
          reply.visible = effectFree(reply.text);
          chat.messages.push(user, reply);
          chat.head = reply.id;
          chat.title ||= user.visible.trim().replace(/\s+/g, " ").slice(0, 76);
          chat.updatedAt = Date.now();
          chat.lastContext = { ...contextStats, ...(tokens ? { input: tokens.input, output: tokens.output } : {}) };
          await saveChat(data, chat);
          await finishUsage("complete");
          send("finish", {});
          send("close", { click_behavior: "none" });
          output.close();
        } catch (error) {
          await finishUsage("interrupted");
          try { send("hint", { error: ["model-empty", "model-incomplete"].includes(error.message) ? error.message : "model-interrupted" }); output.close(); } catch { /* The app stopped this request. */ }
        } finally { loading.delete(id); }
      },
      cancel() { controller.abort(); },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } });
  } finally {
    if (!delegated) {
      await finishUsage(controller.signal.aborted ? "interrupted" : "failed");
      loading.delete(id);
    }
  }
}

async function chatRequest(data, safeStorage, request) {
  const url = new URL(request.url);
  try {
    if (url.pathname === "/__desktop/spending-settings") {
      if (request.method === "GET") return json(await spendingSettings(data));
      if (request.method === "POST") {
        try { return json(await saveSpending(data, safeStorage, await request.json())); }
        catch { return json({ error: "invalid-spending-settings" }, 400); }
      }
    }
    if (url.pathname === "/__desktop/spending-notices" && request.method === "POST") {
      return json(await spendingNotices(data, (from, to) => spendingSince(data, from, to), () => veniceBalances(data, safeStorage)));
    }
    if (url.pathname === "/__desktop/memory-budget" && request.method === "GET") {
      const bytes = Number(url.searchParams.get("bytes"));
      if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > 8_000_000) return json({ error: "invalid-request" }, 400);
      return json({ bytes: await memoryBudget(data, safeStorage, bytes, request.signal) });
    }
    if (url.pathname === "/__desktop/usage" && request.method === "GET") {
      const chatId = url.searchParams.get("chat_session_id");
      if (chatId && !idPattern.test(chatId)) return json({ error: "invalid-chat" }, 400);
      return json(await usageSummary(data, chatId, (from, to) => veniceCharges(data, safeStorage, from, to)));
    }
    if (url.pathname === "/__desktop/chats" && request.method === "GET") {
      const files = await readdir(path.join(data, "Chats")).catch(error => { if (error.code === "ENOENT") return []; throw error; });
      const list = await Promise.all(files.filter(name => name.endsWith(".json")).map(async name => {
        const { id, title, updatedAt } = await readChat(data, name.slice(0, -5));
        return { id, title, updatedAt };
      }));
      return json(list.sort((a, b) => b.updatedAt - a.updatedAt));
    }
    if (["/api/v0/chat/completion", "/api/v0/chat/edit_message"].includes(url.pathname) && request.method === "POST") return await generate(data, safeStorage, request);
    const id = url.searchParams.get("chat_session_id");
    if (!id || !idPattern.test(id)) return json({ error: "invalid-chat" }, 400);
    if (url.pathname === "/api/v0/chat/history_messages" && request.method === "GET") {
      const chat = await readChat(data, id);
      const chat_messages = chat.messages.map(message => ({
        message_id: message.id,
        parent_id: message.parent,
        role: message.role.toUpperCase(),
        status: "FINISHED",
        has_pending_fragment: false,
        fragments: [{ type: message.role === "user" ? "REQUEST" : "RESPONSE", content: message.text }],
      }));
      return json({ code: 0, data: { biz_code: 0, biz_data: { chat_session: { id, current_message_id: chat.head }, chat_messages } } });
    }
    if (url.pathname === "/__desktop/chat" && request.method === "GET") return json(await readChat(data, id));
    const deleting = url.pathname === "/__desktop/chat" && request.method === "DELETE";
    if (deleting || url.pathname === "/__desktop/select" && request.method === "POST") {
      if (loading.has(id)) {
        // An owned service worker may cancel before the renderer has received
        // any response headers. Wait for generation to release the chat.
        if (deleting && url.searchParams.get("cancel_generation") === "1") loading.get(id)?.abort();
        return json({ error: "chat-busy" }, 409);
      }
      loading.set(id, null);
      try {
        if (deleting) {
          await rm(chatPath(data, id), { force: true });
          return json({ ok: true });
        }
        const { head } = await request.json();
        const chat = await readChat(data, id);
        if (!chat.messages.some(message => message.id === head && message.role === "assistant")) return json({ error: "invalid-chat" }, 400);
        chat.head = head;
        chat.updatedAt = Date.now();
        await saveChat(data, chat);
        return json(chat);
      } finally { loading.delete(id); }
    }
    return json({ error: "not-found" }, 404);
  } catch { return json({ error: "chat-unavailable" }, 502); }
}

module.exports = { chatRequest };
