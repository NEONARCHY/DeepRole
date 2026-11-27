const { readFile, writeFile, rename, rm } = require("node:fs/promises");
const { createHash, randomUUID } = require("node:crypto");
const path = require("node:path");
const { modelCatalog, modelProfile, reportedContextWindow, modelLimits, fitMessages, validWindow, availableMemoryBytes,
  replyMode, replyModelKey, increasedReplyLimit, DEFAULT_REPLY_TOKENS, MAX_REPLY_TOKENS, storyMemoryEnabled, withEarlierStoryScene } = require("./model-context.cjs");
const { readSpending } = require("./spending.cjs");
const { recordUsage } = require("./usage.cjs");

const destination = data => path.join(data, "model.json");
const defaultReplyStyle = [
  "Adapt the length, pace, and balance of dialogue, action, and description to the current moment.",
  "A quick exchange may need only a line or two. Give a new scene enough detail to orient the player.",
  "Let important developments breathe, then stop where the player can act.",
].join(" ");
let providerWrites = Promise.resolve();

async function decryptProviderKey(key, safeStorage) {
  if (!key) return "";
  const decrypted = await safeStorage.decryptStringAsync(Buffer.from(key, "base64")).catch(() => null);
  return typeof decrypted?.result === "string" ? decrypted.result : "";
}

async function providerSettings(data, safeStorage) {
  try {
    const config = JSON.parse(await readFile(destination(data), "utf8"));
    const { baseUrl, model, maxTokens = DEFAULT_REPLY_TOKENS, replyStyle = "", contextTokens, key } = config;
    const secret = await decryptProviderKey(key, safeStorage);
    const hasKey = !!secret;
    const base = endpoint(baseUrl);
    if (hasKey || base.protocol === "http:") void modelCatalog(base, secret, { background: true }).catch(() => undefined);
    return { baseUrl, model, maxTokens, replyMode: replyMode(config), replyStyle, contextTokens, hasKey };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { baseUrl: "https://api.venice.ai/api/v1", model: "aion-labs-aion-3-5-mini", maxTokens: DEFAULT_REPLY_TOKENS, replyMode: "auto", replyStyle: "", hasKey: false };
  }
}

function endpoint(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash
      || (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))) {
    throw Error("Use an HTTPS model endpoint or a local HTTP endpoint.");
  }
  return url;
}

async function listTextModels(data, input, safeStorage) {
  const base = endpoint(input.baseUrl);
  let key = input.key.trim();
  if (key.length > 4096 || /[\s\p{Cf}]/u.test(key)) throw Error("Use one API key.");
  if (!key) {
    const saved = await readFile(destination(data), "utf8").then(JSON.parse).catch(error => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (saved && endpoint(saved.baseUrl).origin === base.origin) key = await decryptProviderKey(saved.key, safeStorage);
  }
  if (!key && base.protocol === "https:") throw Error("Enter the provider key.");
  const rows = await modelCatalog(base, key);
  if (!rows) throw Error("Model catalog unavailable.");
  const models = new Map();
  for (const row of rows) {
    const id = row?.id;
    if (typeof id === "string" && id.length > 0 && id.length <= 240 && id === id.trim() && !models.has(id)) {
      models.set(id, { id, contextTokens: reportedContextWindow(row) });
    }
  }
  return [...models.keys()].sort().map(id => models.get(id));
}

function queueProviderWrite(operation) {
  const task = providerWrites.then(operation);
  providerWrites = task.catch(() => undefined);
  return task;
}

async function writeProvider(file, config) {
  const temp = file + ".tmp";
  try {
    await writeFile(temp, JSON.stringify(config));
    await rename(temp, file);
  } finally { await rm(temp, { force: true }); }
}

function learnReplyLimit(data, modelKey, tokens) {
  return queueProviderWrite(async () => {
    const file = destination(data);
    const config = JSON.parse(await readFile(file, "utf8"));
    const latest = Object.entries(config.replyLimits ?? {}).filter(([key]) => key !== modelKey).slice(-63);
    if ((config.replyLimits?.[modelKey] ?? 0) >= tokens) return;
    await writeProvider(file, { ...config, replyLimits: Object.fromEntries([...latest, [modelKey, tokens]]) });
  });
}

function saveProvider(data, input, safeStorage) {
  return queueProviderWrite(async () => {
    const file = destination(data);
    const baseUrl = endpoint(input.baseUrl).href.replace(/\/+$/, "");
    const model = input.model.trim();
    const value = input.key.trim();
    const requestedTokens = Number(input.maxTokens);
    const mode = replyMode({ replyMode: input.replyMode, maxTokens: requestedTokens });
    const validReplyTokens = Number.isSafeInteger(requestedTokens) && requestedTokens >= 256 && requestedTokens <= MAX_REPLY_TOKENS;
    const maxTokens = validReplyTokens ? requestedTokens : DEFAULT_REPLY_TOKENS;
    const contextTokens = input.contextTokens;
    const replyStyle = input.replyStyle?.trim();
    if (!input.clearKey && /[\s\p{Cf}]/u.test(value)) throw Error("Use one API key.");
    if (!model || model.length > 240 || value.length > 4096 || (replyStyle?.length ?? 0) > 2000
        || (contextTokens != null && !validWindow(contextTokens))
        || (mode === "manual" && !validReplyTokens)) throw Error("Invalid model configuration");
    let key;
    let previousReplyStyle = "";
    let previousContextTokens;
    let replyLimits;
    try {
      const previous = JSON.parse(await readFile(file, "utf8"));
      previousReplyStyle = previous.replyStyle ?? "";
      previousContextTokens = previous.model === model && previous.baseUrl === baseUrl ? previous.contextTokens : undefined;
      replyLimits = previous.replyLimits;
      if (new URL(previous.baseUrl).origin === new URL(baseUrl).origin) key = previous.key;
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (input.clearKey) key = undefined;
    else if (value) key = (await safeStorage.encryptStringAsync(value)).toString("base64");
    await writeProvider(file, {
      baseUrl, model, maxTokens, replyMode: mode, replyLimits, replyStyle: replyStyle ?? previousReplyStyle,
      contextTokens: contextTokens === undefined ? previousContextTokens : contextTokens ?? undefined, key,
    });
    return providerSettings(data, safeStorage);
  });
}

const errorResponse = (error, status) => Response.json({ error }, { status });
const contextRejected = value => /context_length_exceeded|context[_ ]window|maximum context|too many (?:input )?tokens/i.test(value);
const styleFor = (config, storyMemory = false, russianScene = false) => ({
  role: "system",
  content: [
    ...(russianScene ? ['Сцену и диалоги пиши только по-русски. В <deeprole_characters> для простого нового события передай kind "event", risk "ordinary" и sentence (номер предложения, с 1). Без text и quote.'] : []),
    "Apply this style guidance only to player-facing roleplay. Follow explicit player instructions for the current turn and keep required structured output intact.",
    config.replyStyle
      ? config.replyStyle + "\nWrite requested styles using literal Markdown: *italics*, **bold**, `monospace`, and > at the start of a quote line. Use Unicode for emoji. Keep evidence quotes verbatim."
      : defaultReplyStyle,
    ...(storyMemory && !russianScene ? [
      "Write the scene first, then <deeprole_characters>. For a simple new fact, copy a complete sentence of the visible reply verbatim into quote, then set kind and risk. Omit text if it matches quote. Never paraphrase or translate the quote. Earlier memory, player text and choices are reference only. Claims and tasks are for real changes only.",
    ] : []),
  ].join("\n\n"),
});

async function profileForDraft(base, key, config, system, bytes, signal) {
  const profile = await modelProfile(base, key, config.model, signal);
  if (profile || validWindow(config.contextTokens) || availableMemoryBytes(system, modelLimits(config), bytes) !== null) return profile;
  // An unusually large draft may fit the real model window even when the
  // fallback would reject it. Consult discovery before rejecting that turn.
  return modelProfile(base, key, config.model, signal, { wait: true });
}

async function memoryBudget(data, safeStorage, bytes, signal) {
  const config = JSON.parse(await readFile(destination(data), "utf8"));
  const base = endpoint(config.baseUrl);
  const key = await decryptProviderKey(config.key, safeStorage);
  const system = styleFor(config, true);
  const profile = await profileForDraft(base, key, config, system, bytes, signal);
  return availableMemoryBytes(system, modelLimits(config, profile), bytes);
}

async function complete(data, safeStorage, messages, signal, beforeSend, onDispatch, retry) {
  let config;
  try { config = JSON.parse(await readFile(destination(data), "utf8")); }
  catch { return errorResponse("model-unconfigured", 424); }
  try {
    const base = endpoint(config.baseUrl);
    const key = await decryptProviderKey(config.key, safeStorage);
    const modelKey = replyModelKey(config);
    const retryScope = createHash("sha256").update(JSON.stringify([modelKey, key, config.replyStyle, config.contextTokens])).digest("hex");
    if (retry && (retry.scope !== retryScope || replyMode(config) !== "auto")) return errorResponse("model-retry-stale", 409);
    if (!key && base.protocol === "https:") return errorResponse("model-key-needed", 424);
    const requestUrl = new URL(base.href.replace(/\/$/, "") + "/chat/completions");
    const venice = base.hostname === "api.venice.ai";
    const turn = messages.at(-1);
    const current = turn.content;
    const storyMemory = storyMemoryEnabled(current);
    const draftStart = current.indexOf("\n\n[User message]\n");
    const ruleStart = current.lastIndexOf("\n\n", draftStart - 1);
    // Keep the compiler's language instruction closest to the visible draft.
    // Moving the same line leaves the message size and recorded draft intact.
    const languageRule = storyMemory && draftStart > ruleStart && ruleStart >= 0
      ? current.slice(ruleStart + 2, draftStart) : "";
    const russianScene = languageRule.startsWith("Ответ по-русски.") && !languageRule.includes("\n");
    const revisedPrompt = retry?.prompt ?? (russianScene
      ? current.slice(0, ruleStart) + current.slice(draftStart) + "\n\n" + languageRule : current);
    const requestMessages = revisedPrompt === current ? messages : [...messages.slice(0, -1), { ...turn, content: revisedPrompt }];
    const system = styleFor(config, storyMemory, russianScene);
    let profile = await profileForDraft(base, key, config, system, Buffer.byteLength(current, "utf8"), signal);
    if (retry && !profile) profile = await modelProfile(base, key, config.model, signal, { wait: true });
    let limits = modelLimits(config, profile, retry?.tokens);
    let initial = fitMessages(system, requestMessages, limits);
    if (initial?.omittedMessages && !profile && !validWindow(config.contextTokens)) {
      // A cold fallback should not discard dialogue that fits the actual window.
      profile = await modelProfile(base, key, config.model, signal, { wait: true });
      limits = modelLimits(config, profile, retry?.tokens);
      initial = fitMessages(system, requestMessages, limits);
    }
    if (retry && (!initial || limits.replyTokens <= retry.previousTokens)) return errorResponse("model-retry-stale", 409);
    if (!initial) return errorResponse("model-context-limit", 400);
    const plan = storyMemory && !retry ? withEarlierStoryScene(initial, requestMessages, limits) : initial;
    signal.throwIfAborted();
    const usage = { model: config.model, venice, pricing: profile?.model_spec?.pricing };
    const reportPlan = fitted => beforeSend(fitted, usage, {
      scope: retryScope, modelKey, prompt: fitted.messages.at(-1).content,
      nextTokens: replyMode(config) === "auto" ? async () => {
        const catalogue = profile ?? await modelProfile(base, key, config.model, signal, { wait: true });
        return increasedReplyLimit(config, catalogue, fitted);
      } : undefined,
    });
    await reportPlan(plan);
    const body = {
      model: config.model,
      messages: plan.messages.map(({ role, content }) => ({ role, content })),
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: plan.replyTokens,
      ...(venice ? { venice_parameters: { include_venice_system_prompt: false } } : {}),
    };
    const send = () => {
      signal.throwIfAborted();
      const payload = JSON.stringify(body);
      onDispatch?.();
      return fetch(requestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...(key ? { Authorization: "Bearer " + key } : {}) },
        body: payload,
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(5 * 60_000)]),
      });
    };
    let response = await send();
    let validation = "";
    if ([400, 422].includes(response.status)) {
      validation = (await response.text()).slice(0, 5000);
      // Older compatible servers reject this parameter before generation.
      if (!venice && /stream_options|include_usage/i.test(validation) && /unsupported|unknown|unrecognized|not (?:supported|allowed)|extra_forbidden/i.test(validation)) {
        delete body.stream_options;
        response = await send();
        validation = [400, 422].includes(response.status) ? (await response.text()).slice(0, 5000) : "";
      }
    }
    if (contextRejected(validation) && plan.messages.length > 2) {
      // Retry only after explicit pre-generation validation. Keep the current
      // turn and selected world context intact when dropping earlier dialogue.
      const reduced = fitMessages(system, [requestMessages.at(-1)], limits);
      if (!reduced) return errorResponse("model-context-limit", 400);
      signal.throwIfAborted();
      await reportPlan({ ...reduced, omittedMessages: messages.length - 1 });
      body.messages = reduced.messages.map(({ role, content }) => ({ role, content }));
      response = await send();
      validation = [400, 422].includes(response.status) ? (await response.text()).slice(0, 5000) : "";
    }
    if (!response.ok) {
      if (!response.bodyUsed) await response.body?.cancel();
      if (contextRejected(validation)) return errorResponse("model-context-limit", 400);
      const statuses = { 401: "model-key-refused", 402: "model-payment-required", 403: "model-key-refused", 429: "model-limit" };
      return errorResponse(statuses[response.status] ?? "model-request-failed", response.status);
    }
    return new Response(response.body, { headers: { "Content-Type": response.headers.get("content-type") ?? "text/event-stream", "Cache-Control": "no-store" } });
  } catch {
    return errorResponse("model-unavailable", 502);
  }
}

async function veniceCharges(data, safeStorage, from, to) {
  try {
    const spending = await readSpending(data);
    const key = spending.billingKey
      ? await decryptProviderKey(spending.billingKey, safeStorage)
      : await veniceInferenceKey(data, safeStorage);
    if (!key) return { status: "unavailable" };
    const url = new URL("https://api.venice.ai/api/v1/billing/usage-history");
    url.search = new URLSearchParams({ startTimestamp: new Date(from).toISOString(), endTimestamp: new Date(to).toISOString(), pageSize: "1000" });
    const charges = new Map();
    const currencies = { USD: "usd", DIEM: "diem", BUNDLED_CREDITS: "bundled", EARNED_CREDITS: "earned" };
    const signal = AbortSignal.timeout(6000);
    for (let page = 0; page < 8; page++) {
      const response = await fetch(url, { headers: { Authorization: "Bearer " + key }, redirect: "error", signal });
      if (!response.ok) {
        await response.body?.cancel();
        return { status: [401, 403].includes(response.status) ? "restricted" : "unavailable" };
      }
      const { data: rows, nextCursor } = await response.json();
      if (!Array.isArray(rows)) return { status: "unavailable" };
      for (const row of rows) {
        const id = row.inferenceDetails?.requestId;
        if (typeof id !== "string" || !Number.isFinite(row.amount) || row.amount >= 0 || !Object.hasOwn(currencies, row.currency)) continue;
        const charge = charges.get(id) ?? { usd: 0, diem: 0, bundled: 0, earned: 0 };
        charge[currencies[row.currency]] -= row.amount;
        charges.set(id, charge);
      }
      if (!nextCursor) return { status: "ok", charges };
      url.search = new URLSearchParams({ cursor: nextCursor });
    }
  } catch { /* Offline, restricted, or unavailable billing stays unconfirmed. */ }
  return { status: "unavailable" };
}

async function veniceInferenceKey(data, safeStorage) {
  const config = JSON.parse(await readFile(destination(data), "utf8"));
  if (endpoint(config.baseUrl).origin !== "https://api.venice.ai") return "";
  return decryptProviderKey(config.key, safeStorage);
}

let balanceCache;
async function veniceBalances(data, safeStorage) {
  try {
    const key = await veniceInferenceKey(data, safeStorage);
    if (!key) return null;
    const now = Date.now();
    const keyFingerprint = createHash("sha256").update(key).digest("hex");
    if (balanceCache?.keyFingerprint === keyFingerprint && balanceCache.until > now) return balanceCache.balances;
    const response = await fetch("https://api.venice.ai/api/v1/api_keys/rate_limits", {
      headers: { Authorization: "Bearer " + key }, redirect: "error", signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const balances = (await response.json())?.data?.balances;
    if (!balances || typeof balances !== "object") return null;
    balanceCache = { keyFingerprint, until: now + 45_000, balances };
    return balances;
  } catch { return null; }
}

const mediaReceipt = /^[a-z\d][\w.-]{0,199}$/iu;
const pendingMedia = new Map();
const imageGenerationPath = /\/(?:image\/(?:generate|edit|multi-edit)|images\/(?:generations|edits))\/?$/u;

async function imageReceipt(data, request) {
  try {
    const { record, requestId } = await request.json();
    if (typeof requestId !== "string" || !mediaReceipt.test(requestId) || pendingMedia.get(record) !== data) return errorResponse("image-receipt", 400);
    pendingMedia.delete(record);
    await recordUsage(data, { id: record, requestId });
    return new Response(null, { status: 204 });
  } catch { return errorResponse("image-receipt", 400); }
}

async function imageRequest(request, grants, data) {
  try {
    const { url, method, headers, body } = await request.json();
    const target = new URL(url);
    endpoint(target.origin);
    if (target.username || target.password || !["GET", "POST"].includes(method) || !grants.has(`${target.protocol}//${target.hostname}/*`)) return errorResponse("image-permission", 403);
    const upstream = new Headers(headers);
    const chatId = upstream.get("x-deeprole-usage-chat");
    upstream.delete("x-deeprole-usage-chat");
    const venice = target.origin === "https://api.venice.ai";
    const track = data && method === "POST" && /^[\w-]{1,120}$/u.test(chatId ?? "") && imageGenerationPath.test(target.pathname);
    const id = track ? randomUUID() : undefined;
    if (id) await recordUsage(data, { id, at: Date.now(), chatId, kind: "image", venice }).catch(() => undefined);
    const response = await fetch(target, {
      method, headers: upstream, ...(method === "POST" ? { body } : {}), redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(5 * 60_000)]),
    });
    const responseHeaders = new Headers(response.headers);
    for (const name of ["content-encoding", "content-length", "set-cookie", "transfer-encoding"]) responseHeaders.delete(name);
    responseHeaders.delete("x-deeprole-usage-id");
    if (id && response.ok && venice) {
      const upstreamId = response.headers.get("x-venice-request-id") ?? response.headers.get("x-request-id");
      if (upstreamId && mediaReceipt.test(upstreamId)) await recordUsage(data, { id, requestId: upstreamId }).catch(() => undefined);
      if (response.headers.get("content-type")?.includes("application/json")) {
        if (pendingMedia.size >= 128) pendingMedia.delete(pendingMedia.keys().next().value);
        pendingMedia.set(id, data);
        responseHeaders.set("x-deeprole-usage-id", id);
      }
    }
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch { return errorResponse("image-request-failed", 502); }
}

module.exports = { providerSettings, listTextModels, saveProvider, complete, learnReplyLimit, veniceCharges, veniceBalances, imageRequest, imageReceipt, memoryBudget };
