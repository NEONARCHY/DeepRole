import type { ReactNode } from "react";
import type { Locale } from "../../core/types";

/** Keep actionable errors outside this disclosure; only reports belong here. */
export function SupportDetails({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <details className="dr-support-details">
    <summary>{locale === "ru" ? "Для технической поддержки" : "For technical support"}</summary>
    <p className="setting-copy">{locale === "ru" ? "Служебные сведения для разбора неполадки. Для обычной игры их открывать не нужно." : "Service information for investigating a problem. You do not need it for normal play."}</p>
    <details><summary>{locale === "ru" ? "Открыть технические данные" : "Open technical data"}</summary>{children}</details>
  </details>;
}
