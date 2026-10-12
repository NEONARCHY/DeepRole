import type { NativeStoryHistoryDiagnostics } from "../core/story-native-history";
import { readNativeStoryServerSnapshot } from "../core/story-native-snapshot";

const MAX_BYTES = 30_000_000;
export type NativeStoryHistoryProbeResult = { status: "read"; diagnostics: NativeStoryHistoryDiagnostics } | { status: "unavailable"; code: "http" | "format" | "too-large" | "unreadable" };
export type NativeHistoryPayload = { status: "read"; value: unknown } | Extract<NativeStoryHistoryProbeResult, { status: "unavailable" }>;

/** Consume only an explicitly requested history response, NEVER a site's completion stream.
 * The page keeps its credentials and transcript; only bounded types and allowlisted
 * status-code counts leave it. The status codes are observations, not completion proof.
 */
export async function probeNativeStoryHistory(response: Response, chatId: string, anchorId?: string | null): Promise<NativeStoryHistoryProbeResult> {
  const payload = await readNativeHistoryPayload(response);
  return payload.status === "read" ? { status: "read", diagnostics: readNativeStoryServerSnapshot(payload.value, chatId, anchorId).diagnostics } : payload;
}
/** Shared bounded reader for an explicit history GET. Never call on completion streams. */
export async function readNativeHistoryPayload(response: Response): Promise<NativeHistoryPayload> {
  if (!response.ok || response.redirected) return { status: "unavailable", code: "http" };
  const type = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (!type || !/^application\/(?:json|[a-z0-9.+-]+\+json)$/u.test(type)) return { status: "unavailable", code: "format" };
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > MAX_BYTES)) return { status: "unavailable", code: "too-large" };
  if (!response.body) return { status: "unavailable", code: "unreadable" };
  const reader = response.body.getReader();
  let bytes = 0, text = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel().catch(() => undefined); return { status: "unavailable", code: "too-large" }; }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return { status: "read", value: JSON.parse(text) as unknown };
  } catch { await reader.cancel().catch(() => undefined); return { status: "unavailable", code: "unreadable" }; }
  finally { reader.releaseLock(); }
}
