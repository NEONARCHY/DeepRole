import { useState } from "react";
import type { Locale } from "../../core/types";
import type { MemoryDeliveryView } from "../../core/memory-delivery-view";
import { memoryDeliveryText } from "../../core/memory-delivery-i18n";

export function MemoryDeliverySummary({locale,receipt}: {locale: Locale; receipt?: MemoryDeliveryView}) {
 const [open,setOpen] = useState(false);
 if (!receipt) return null;
 const t = memoryDeliveryText(locale);
 return <details className="dr-context-budget dr-memory-delivery">
  <summary>{t.title}</summary>
  <p><strong>{t[receipt.stage]}</strong></p>
  <p>{t.date}: {new Intl.DateTimeFormat(locale,{dateStyle:"short",timeStyle:"medium"}).format(receipt.at)}</p>
  <p>{t.historical}</p>
  {receipt.injection === "unconfirmed" && <p>{t.unknown}</p>}
  {receipt.injection === "none" && <p>{t.none}</p>}
  {receipt.context !== undefined && <details onToggle={event=>setOpen(event.currentTarget.open)}>
   <summary>{t.payload}</summary>
   {open && <><p>{t.payloadHint}</p><textarea aria-label={t.payload} readOnly rows={8} value={receipt.context}/></>}
  </details>}
  {receipt.responseInterrupted && <p>{t.interrupted}</p>}
  <p>{t.use}</p>
 </details>;
}
