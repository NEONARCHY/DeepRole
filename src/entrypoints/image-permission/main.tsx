import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import { requestImagePermission } from "../../storage/image-permissions";
import { getSettings } from "../../storage/settings";
import { imageText, type ImageCopyKey } from "../../core/image-i18n";
import type { Locale } from "../../core/types";
import "../sidepanel/styles.css";
function PermissionPage() {
  const [locale, setLocale] = useState<Locale>("en"), [origin, setOrigin] = useState(""), [busy, setBusy] = useState(false), [status, setStatus] = useState<ImageCopyKey | null>(null);
  const ticketId = new URL(location.href).searchParams.get("ticket") ?? "";
  useEffect(() => { void getSettings().then(s => { setLocale(s.locale); document.documentElement.lang = s.locale; }); void browser.runtime.sendMessage({ type: "DR_IMAGE_TICKET", ticketId }).then(result => { if (result?.ok) setOrigin(result.origin); else setStatus(result?.error ?? "expired"); }); }, [ticketId]);
  return <main className="app-shell"><div className="app-main"><section className="settings-card"><header><h1>{imageText(locale, "downloadResult")}</h1></header><div><p>{imageText(locale, "downloadOrigin")}</p><strong>{origin}</strong><button className="button primary" disabled={!origin || busy || status === "downloaded"} onClick={() => {
    // Permission request happens directly in this extension-page user gesture.
    const permission = requestImagePermission(origin); setBusy(true); setStatus(null);
    void permission.then(async allowed => { if (!allowed) { setStatus("permission"); return; } const result = await browser.runtime.sendMessage({ type: "DR_IMAGE_DOWNLOAD", ticketId }); setStatus(result?.ok ? "downloaded" : result?.error ?? "failed"); }).catch(() => setStatus("failed")).finally(() => setBusy(false));
  }}>{imageText(locale, "downloadPermission")}</button><p role="status" aria-live="polite">{busy ? imageText(locale, "busy") : status ? imageText(locale, status) : ""}</p></div></section></div></main>;
}
createRoot(document.getElementById("root")!).render(<PermissionPage />);
