import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { request } from "./native";
import { SpendingSettings } from "./SpendingSettings";
import { useNativeDialog } from "./motion";

type Total = { requests: number; measured: number; input: number; output: number; unknown: number; estimated: number; usd: number; diem: number; bundled: number; earned: number };
type Usage = { days: (Total & { at: number })[]; week: Total; services: Total; images: Total; chat: Total | null; billing?: "ok" | "restricted" | "unavailable" };

export function UsageDialog({ chatId, locale, onClose, onSpendingChange }: { chatId: string; locale: "ru" | "en"; onClose: () => void; onSpendingChange: () => void }) {
  const ru = locale === "ru";
  const { modal, dismiss } = useNativeDialog();
  const close = () => dismiss(onClose);
  const [data, setData] = useState<Usage>();
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const number = new Intl.NumberFormat(locale);
  const dollars = new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 6 });
  const diem = new Intl.NumberFormat(locale, { maximumFractionDigits: 6 });
  const date = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" });

  useEffect(() => {
    const controller = new AbortController();
    const url = chatId ? `/__desktop/usage?chat_session_id=${encodeURIComponent(chatId)}` : "/__desktop/usage";
    void request<Usage>(url, { signal: controller.signal }).then(setData).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, [chatId, refresh]);

  function amount(item: Total) {
    if (item.requests && item.requests === item.unknown) return "—";
    const parts = [
      item.usd ? dollars.format(item.usd) : "",
      item.estimated ? `≈${dollars.format(item.estimated)}` : "",
      item.diem ? `${diem.format(item.diem)} DIEM` : "",
      item.bundled ? `${diem.format(item.bundled)} ${ru ? "включ. кредитов" : "bundled credits"}` : "",
      item.earned ? `${diem.format(item.earned)} ${ru ? "накопл. кредитов" : "earned credits"}` : "",
    ].filter(Boolean);
    return parts.join(" · ") || dollars.format(0);
  }

  function totals(title: string, item: Total) {
    return <div className="desktop-usage-summary"><span>{title}</span><strong>{amount(item)}</strong>
      <small>{ru ? `Запросы: ${number.format(item.requests)}` : `Requests: ${number.format(item.requests)}`}</small></div>;
  }

  const maxUsd = Math.max(0, ...data?.days.map(day => day.usd + day.estimated) ?? []);
  const maxDiem = Math.max(0, ...data?.days.map(day => day.diem) ?? []);
  const maxBundled = Math.max(0, ...data?.days.map(day => day.bundled) ?? []);
  const maxEarned = Math.max(0, ...data?.days.map(day => day.earned) ?? []);
  return <dialog ref={modal} className="desktop-dialog" data-window-motion aria-labelledby="desktop-usage-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header>
      <h2 id="desktop-usage-title">{ru ? "Расходы" : "Spending"}</h2>
      <button type="button" autoFocus className="desktop-icon" aria-label={ru ? "Закрыть" : "Close"} onClick={close}><X size={18} /></button>
    </header>
    {!data && <p role={error ? "alert" : "status"}>{error ? ru ? "Не удалось прочитать расходы." : "Unable to read usage." : ru ? "Загружаем расходы…" : "Loading usage…"}</p>}
    {data && <>
      <div className="desktop-usage-totals">
        {totals(ru ? "Последние 7 дней" : "Last 7 days", data.week)}
        {data.chat && totals(ru ? "Этот чат с начала учёта" : "This chat since tracking began", data.chat)}
      </div>
      <ol className="desktop-usage-chart" aria-label={ru ? "Расходы по дням" : "Daily spending"}>
        {data.days.map(day => <li key={day.at}>
          <time dateTime={new Date(day.at).toISOString()}>{date.format(day.at)}</time>
          <div className="desktop-usage-tracks" aria-hidden="true">
            {maxUsd > 0 && <div className="desktop-usage-track"><i style={{ width: `${day.usd / maxUsd * 100}%` }} /><i data-estimated style={{ width: `${day.estimated / maxUsd * 100}%` }} /></div>}
            {maxDiem > 0 && <div className="desktop-usage-track"><i data-diem style={{ width: `${day.diem / maxDiem * 100}%` }} /></div>}
            {maxBundled > 0 && <div className="desktop-usage-track"><i data-diem style={{ width: `${day.bundled / maxBundled * 100}%` }} /></div>}
            {maxEarned > 0 && <div className="desktop-usage-track"><i data-diem style={{ width: `${day.earned / maxEarned * 100}%` }} /></div>}
          </div>
          <span>{amount(day)}</span>
        </li>)}
      </ol>
      <p>{ru
        ? `Токены за неделю: ${number.format(data.week.input)} на входе · ${number.format(data.week.output)} в ответах. Данные API получены для ${data.week.measured} из ${data.week.requests - data.images.requests} текстовых запросов.`
        : `Weekly tokens: ${number.format(data.week.input)} input · ${number.format(data.week.output)} output. The API reported usage for ${data.week.measured} of ${data.week.requests - data.images.requests} text requests.`}</p>
      {data.services.requests > 0 && <p>{ru
        ? `В том числе служебные запросы: ${number.format(data.services.requests)} · ${amount(data.services)}.`
        : `Including background requests: ${number.format(data.services.requests)} · ${amount(data.services)}.`}</p>}
      {data.images.requests > 0 && <p>{ru
        ? `В том числе иллюстрации: ${number.format(data.images.requests)} · ${amount(data.images)}.`
        : `Including illustrations: ${number.format(data.images.requests)} · ${amount(data.images)}.`}</p>}
      <p>{ru ? "≈ — оценка по тарифу. USD, DIEM и кредиты показаны отдельно." : "≈ means estimated at the listed rate. USD, DIEM, and credits are shown separately."}</p>
      {!!(data.week.unknown || data.chat?.unknown) && <p>{ru ? "Для части запросов сумма пока неизвестна." : "Some requests have an unknown cost."}</p>}
      {data.billing === "restricted" && <p>{ru ? "Venice отклонила доступ к истории списаний. Можно добавить отдельный ключ в настройках сверки ниже." : "Venice denied access to billing history. You can add a separate key in the settings below."}</p>}
    </>}
    <SpendingSettings ru={ru} onChange={() => { setRefresh(value => value + 1); onSpendingChange(); }} />
  </dialog>;
}
