import { imageDiagnostic } from "../../core/image-diagnostics";
import { validImageHeaders } from "../../core/image-generation";
import { imageErrorKey, imageText } from "../../core/image-i18n";
import type { Locale } from "../../core/types";

export function ImageErrorDetails({ error, locale, id }: { error: unknown; locale: Locale; id?: string }) {
  const t = (key: Parameters<typeof imageText>[1]) => imageText(locale, key);
  const code = imageErrorKey(error), diagnostic = imageDiagnostic(error);
  const headers = typeof error === "object" && error !== null && "headers" in error && validImageHeaders(error.headers) ? error.headers : undefined;
  const tooltip = [code, diagnostic?.status ? `HTTP ${diagnostic.status}` : "", diagnostic?.providerCode ?? ""].filter(Boolean).join(" · ");
  return <div className="dr-image-error-details" id={id}>
    <p className="error-text" role="alert" title={tooltip}>{t(code)}</p>
    <details><summary>{t("errorDetails")}</summary><dl>
      <div><dt>{t("errorCode")}</dt><dd><code>{code}</code></dd></div>
      {diagnostic && <div><dt>{t("errorSource")}</dt><dd>{t(diagnostic.source === "provider" ? "sourceProvider" : diagnostic.source === "deepseek" ? "sourceDeepseek" : "sourceDeeprole")}</dd></div>}
      {diagnostic?.status && <div><dt>{t("errorStatus")}</dt><dd><code>{diagnostic.status}</code></dd></div>}
      {diagnostic?.endpoint && <div><dt>{t("errorEndpoint")}</dt><dd><code>{diagnostic.endpoint}</code></dd></div>}
      {diagnostic?.model && <div><dt>{t("errorModel")}</dt><dd><code>{diagnostic.model}</code></dd></div>}
      {diagnostic?.providerCode && <div><dt>{t("errorProviderCode")}</dt><dd><code>{diagnostic.providerCode}</code></dd></div>}
      {diagnostic?.message && <div><dt>{t("errorMessage")}</dt><dd>{diagnostic.message}</dd></div>}
      {!!diagnostic?.fields?.length && <div><dt>{t("errorFields")}</dt><dd><code>{diagnostic.fields.join(", ")}</code></dd></div>}
      {headers && Object.entries(headers).map(([name, value]) => <div key={name}><dt><code>{name}</code></dt><dd>{value}</dd></div>)}
    </dl>{!diagnostic?.status && <p>{t("noErrorDetails")}</p>}{[400, 404, 413, 415].includes(diagnostic?.status ?? 0) && <p>{t("errorConfigHint")}</p>}<p>{t("errorPrivacy")}</p></details>
  </div>;
}
