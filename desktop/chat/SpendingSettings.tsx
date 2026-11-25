import { useEffect, useState } from "react";
import { request } from "./native";

export type BalanceCurrency = "USD" | "DIEM" | "BUNDLED_CREDITS";
export type SpendingNotice =
  | { type: "weekly"; spent: number; threshold: number; estimated: boolean }
  | { type: "balance"; currency: BalanceCurrency; amount: number };
type Settings = {
  weeklyUsd: number | null;
  lowBalance: { currency: BalanceCurrency; threshold: number } | null;
  hasBillingKey: boolean;
};

export function currencyName(value: BalanceCurrency, ru: boolean) {
  return value === "BUNDLED_CREDITS" ? ru ? "включённых кредитов" : "bundled credits" : value;
}

export function SpendingSettings({ ru, onChange }: { ru: boolean; onChange: () => void }) {
  const [settings, setSettings] = useState<Settings>();
  const [weekly, setWeekly] = useState("");
  const [balance, setBalance] = useState("");
  const [currency, setCurrency] = useState<BalanceCurrency>("USD");
  const [key, setKey] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "saving" | "saved" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    void request<Settings>("/__desktop/spending-settings", { signal: controller.signal }).then(value => {
      setSettings(value);
      setWeekly(value.weeklyUsd?.toString() ?? "");
      setBalance(value.lowBalance?.threshold.toString() ?? "");
      setCurrency(value.lowBalance?.currency ?? "USD");
      setState("ready");
    }).catch(() => { if (!controller.signal.aborted) setState("error"); });
    return () => controller.abort();
  }, []);

  async function save(clearBillingKey = false) {
    setState("saving");
    try {
      setSettings(await request<Settings>("/__desktop/spending-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weeklyUsd: weekly === "" ? null : Number(weekly),
          lowBalance: balance === "" ? null : { currency, threshold: Number(balance) },
          billingKey: key, clearBillingKey,
        }),
      }));
      setKey("");
      setState("saved");
      onChange();
    } catch { setState("error"); }
  }

  return <details className="desktop-spending-settings">
    <summary>{ru ? "Бюджет и сверка Venice" : "Budget and Venice billing"}</summary>
    {settings && <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <label>{ru ? "Недельный бюджет, USD" : "Weekly budget, USD"}
        <input type="number" min="0.000001" max="1000000" step="any" value={weekly} onChange={event => setWeekly(event.currentTarget.value)} />
      </label>
      <small>{ru ? "Сообщим один раз за неделю при достижении 80%. Неделя начинается в понедельник." : "One notice per week at 80%. The week starts on Monday."}</small>
      <div className="desktop-spending-balance">
        <label>{ru ? "Баланс Venice ниже" : "Venice balance below"}
          <input type="number" min="0.000001" max="1000000" step="any" value={balance} onChange={event => setBalance(event.currentTarget.value)} />
        </label>
        <label>{ru ? "Единица" : "Unit"}<select value={currency} onChange={event => setCurrency(event.currentTarget.value as BalanceCurrency)}>
          <option value="USD">USD</option><option value="DIEM">DIEM</option>
          <option value="BUNDLED_CREDITS">{ru ? "Включённые кредиты" : "Bundled credits"}</option>
        </select></label>
      </div>
      <small>{ru ? "Пустые поля отключают предупреждения." : "Blank fields disable the notices."}</small>
      <label>{ru ? "Отдельный ключ для истории списаний" : "Separate key for billing history"}
        <input type="password" value={key} maxLength={4096} autoComplete="off"
          placeholder={settings.hasBillingKey ? ru ? "Ключ сохранён" : "Key saved" : undefined}
          onChange={event => setKey(event.currentTarget.value)} />
      </label>
      <small>{ru ? "Необязательно. DeepRole использует этот ключ только для чтения истории списаний Venice." : "Optional. DeepRole uses this key only to read Venice billing history."}</small>
      <footer>
        {settings.hasBillingKey && <button type="button" disabled={state === "saving"} onClick={() => void save(true)}>{ru ? "Удалить ключ сверки" : "Remove billing key"}</button>}
        <button className="desktop-primary" type="submit" disabled={state === "saving"}>{ru ? "Сохранить" : "Save"}</button>
      </footer>
    </form>}
    {state === "error" && <p role="alert">{ru ? "Не удалось применить настройки расходов." : "Unable to apply spending settings."}</p>}
    {state === "saved" && <small role="status">{ru ? "Настройки расходов сохранены." : "Spending settings saved."}</small>}
  </details>;
}
