const { mkdir, readFile, rename, writeFile } = require("node:fs/promises");
const path = require("node:path");

const file = data => path.join(data, "Spending Settings.json");
const balanceCurrencies = ["USD", "DIEM", "BUNDLED_CREDITS"];
const validAmount = value => typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1_000_000;
let writes = Promise.resolve();

async function readSpending(data) {
  try { return JSON.parse(await readFile(file(data), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return {}; throw error; }
}

function updateSpending(data, update) {
  const task = writes.then(async () => {
    const previous = await readSpending(data);
    const { next, result } = await update(previous);
    if (next && JSON.stringify(previous) !== JSON.stringify(next)) {
      await mkdir(data, { recursive: true });
      const target = file(data);
      await writeFile(target + ".tmp", JSON.stringify(next), "utf8");
      await rename(target + ".tmp", target);
    }
    return result;
  });
  writes = task.catch(() => undefined);
  return task;
}

const publicSettings = value => ({
  weeklyUsd: value.weeklyUsd ?? null, lowBalance: value.lowBalance ?? null,
  hasBillingKey: typeof value.billingKey === "string" && !!value.billingKey,
});

async function spendingSettings(data) {
  await writes;
  return publicSettings(await readSpending(data));
}

function saveSpending(data, safeStorage, input) {
  const { weeklyUsd, lowBalance, clearBillingKey } = input;
  const billingKey = (input.billingKey ?? "").trim();
  if ((weeklyUsd != null && !validAmount(weeklyUsd))
      || (lowBalance != null && (!validAmount(lowBalance.threshold) || !balanceCurrencies.includes(lowBalance.currency)))
      || typeof clearBillingKey !== "boolean" || /[\s\p{Cf}]/u.test(billingKey) || billingKey.length > 4096) throw Error("Invalid spending settings");
  return updateSpending(data, async previous => {
    const next = { ...previous, weeklyUsd: weeklyUsd ?? null, lowBalance: lowBalance ?? null };
    if (weeklyUsd !== previous.weeklyUsd) delete next.weeklyNotice;
    if (JSON.stringify(lowBalance) !== JSON.stringify(previous.lowBalance)) delete next.lowNotice;
    if (clearBillingKey) delete next.billingKey;
    else if (billingKey) next.billingKey = (await safeStorage.encryptStringAsync(billingKey)).toString("base64");
    return { next, result: publicSettings(next) };
  });
}

async function spendingNotices(data, weekSpent, balances, now = Date.now()) {
  const current = await readSpending(data);
  if (!current.weeklyUsd && !current.lowBalance) return [];
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const [spend, available] = await Promise.all([
    current.weeklyUsd ? weekSpent(monday.getTime(), now) : null,
    current.lowBalance ? balances() : null,
  ]);
  return updateSpending(data, async previous => {
    const next = { ...previous }, result = [];
    if (spend && previous.weeklyUsd && previous.weeklyUsd === current.weeklyUsd
        && previous.weeklyNotice !== monday.getTime() && spend.usd + spend.estimated >= previous.weeklyUsd * 0.8) {
      next.weeklyNotice = monday.getTime();
      result.push({ type: "weekly", spent: spend.usd + spend.estimated, threshold: previous.weeklyUsd, estimated: spend.estimated > 0 });
    }
    const setting = previous.lowBalance;
    if (available && setting && JSON.stringify(setting) === JSON.stringify(current.lowBalance)) {
      const balance = available[setting.currency];
      if (Number.isFinite(balance)) {
        if (balance < setting.threshold && !previous.lowNotice) {
          next.lowNotice = true;
          result.push({ type: "balance", amount: balance, currency: setting.currency });
        } else if (balance >= setting.threshold) delete next.lowNotice;
      }
    }
    return { next, result };
  });
}

module.exports = { readSpending, spendingSettings, saveSpending, spendingNotices };
