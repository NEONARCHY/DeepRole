const { appendFile, mkdir, readFile } = require("node:fs/promises");
const path = require("node:path");

let writes = Promise.resolve();
const ledger = data => path.join(data, "Model Usage.jsonl");
const tokenCount = value => Number.isSafeInteger(value) && value >= 0;

function readTokenUsage(usage) {
  if (!tokenCount(usage?.prompt_tokens) || !tokenCount(usage?.completion_tokens)) return undefined;
  const cached = usage.prompt_tokens_details?.cached_tokens;
  const reasoning = usage.completion_tokens_details?.reasoning_tokens;
  const write = usage.prompt_tokens_details?.cache_write_tokens ?? usage.prompt_tokens_details?.cache_creation_input_tokens;
  return {
    input: usage.prompt_tokens, output: usage.completion_tokens,
    ...(tokenCount(cached) && cached <= usage.prompt_tokens ? { cached } : {}),
    ...(tokenCount(reasoning) ? { reasoning } : {}),
    ...(tokenCount(write) ? { cacheWrite: write } : {}),
  };
}

function estimatedCost(tokens, pricing) {
  const input = pricing?.input?.usd;
  const output = pricing?.output?.usd;
  const cached = tokens?.cached ?? 0;
  const cache = cached ? pricing?.cache_read_input?.usd : 0;
  if (!tokens || tokens.cacheWrite || ![input, output, cache].every(value => Number.isFinite(value) && value >= 0)) return undefined;
  return ((tokens.input - cached) * input + cached * cache + tokens.output * output) / 1_000_000;
}

function recordUsage(data, event) {
  const write = writes.then(async () => {
    await mkdir(data, { recursive: true });
    await appendFile(ledger(data), "\n" + JSON.stringify(event), "utf8");
  });
  writes = write.catch(() => undefined);
  return write;
}

async function readUsage(data) {
  await writes;
  const text = await readFile(ledger(data), "utf8").catch(error => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const requests = new Map();
  for (const line of text.split("\n")) {
    if (!line) continue;
    try {
      const event = JSON.parse(line);
      if (typeof event.id !== "string") continue;
      if (Number.isFinite(event.at) || requests.has(event.id)) requests.set(event.id, { ...requests.get(event.id), ...event });
    } catch { /* Recover preceding records after a partial write. */ }
  }
  return [...requests.values()];
}

const empty = () => ({ requests: 0, measured: 0, input: 0, output: 0, unknown: 0, estimated: 0, usd: 0, diem: 0, bundled: 0, earned: 0 });

function total(rows) {
  const result = empty();
  for (const row of rows) {
    result.requests++;
    if (row.tokens) {
      result.measured++;
      result.input += row.tokens.input;
      result.output += row.tokens.output;
    }
    if (row.charged) {
      result.usd += row.charged.usd;
      result.diem += row.charged.diem;
      result.bundled += row.charged.bundled ?? 0;
      result.earned += row.charged.earned ?? 0;
    } else if (Number.isFinite(row.estimatedUsd)) result.estimated += row.estimatedUsd;
    else result.unknown++;
  }
  return result;
}

async function usageSummary(data, chatId, fetchCharges, now = Date.now()) {
  const date = new Date(now);
  const days = Array.from({ length: 8 }, (_, i) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - 6 + i).getTime());
  const requests = await readUsage(data);
  const week = requests.filter(row => row.at >= days[0] && row.at < days[7]);
  const venice = week.filter(row => row.venice && row.requestId);
  let billing;
  if (venice.length && fetchCharges) {
    const result = await fetchCharges(days[0], now);
    billing = result?.status;
    const charges = result?.charges;
    if (charges) await Promise.all(venice.map(async row => {
      const charge = charges.get(row.requestId);
      if (charge && ["usd", "diem", "bundled", "earned"].some(unit => charge[unit] !== row.charged?.[unit])) {
        row.charged = charge;
        await recordUsage(data, { id: row.id, charged: charge }).catch(() => undefined);
      }
    }));
  }
  return {
    billing,
    days: days.slice(0, -1).map((at, index) => ({ at, ...total(week.filter(row => row.at >= at && row.at < days[index + 1])) })),
    week: total(week),
    services: total(week.filter(row => row.kind === "service")),
    images: total(week.filter(row => row.kind === "image")),
    chat: chatId ? total(requests.filter(row => row.chatId === chatId)) : null,
  };
}

async function spendingSince(data, from, to) {
  return total((await readUsage(data)).filter(row => row.at >= from && row.at <= to));
}
module.exports = { recordUsage, readTokenUsage, estimatedCost, usageSummary, spendingSince };
