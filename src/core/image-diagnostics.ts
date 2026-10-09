import { object, validImageHeaders } from "./image-generation";

/** Bounded diagnostics only: never retain a request body, credentials, image bytes or HTML. */
export interface ImageDiagnostic {
  source: "provider" | "deepseek" | "deeprole";
  phase: "models" | "request" | "plan" | "download" | "response" | "local";
  status?: number;
  endpoint?: string;
  model?: string;
  providerCode?: string;
  message?: string;
  fields?: string[];
}
const bounded = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/u.test(v);
export function validImageDiagnostic(v: unknown): v is ImageDiagnostic {
  return object(v) && ["provider", "deepseek", "deeprole"].includes(String(v.source))
    && ["models", "request", "plan", "download", "response", "local"].includes(String(v.phase))
    && Object.keys(v).every(k => ["source", "phase", "status", "endpoint", "model", "providerCode", "message", "fields"].includes(k))
    && (v.status === undefined || Number.isInteger(v.status) && Number(v.status) >= 100 && Number(v.status) <= 599)
    && (v.endpoint === undefined || bounded(v.endpoint, 100) && /^\/[a-zA-Z0-9/_-]+$/u.test(v.endpoint))
    && (v.model === undefined || bounded(v.model, 200))
    && (v.providerCode === undefined || bounded(v.providerCode, 100))
    && (v.message === undefined || bounded(v.message, 600))
    && (v.fields === undefined || Array.isArray(v.fields) && v.fields.length <= 12 && v.fields.every(f => bounded(f, 100) && /^[a-zA-Z0-9_.\[\]-]+$/u.test(f)));
}
export function imageDiagnostic(error: unknown): ImageDiagnostic | undefined {
  return object(error) && validImageDiagnostic(error.diagnostic) ? error.diagnostic : undefined;
}
export function imageFailureDetails(error: unknown): { diagnostic?: ImageDiagnostic; headers?: import("./image-generation").ImageResponseHeaders } {
  return { ...(imageDiagnostic(error) ? { diagnostic: imageDiagnostic(error) } : {}), ...(object(error) && validImageHeaders(error.headers) ? { headers: error.headers } : {}) };
}

/** Redact BEFORE truncating, including server reflections of the key and submitted visual data. */
export function diagnosticText(value: unknown, secrets: readonly string[], max = 600): string | undefined {
  if (typeof value !== "string") return undefined;
  let text = value;
  for (const secret of [...new Set(secrets.filter(Boolean))].sort((a, b) => b.length - a.length)) {
    for (const form of new Set([secret, encodeURIComponent(secret)])) text = text.replaceAll(form, "[redacted]");
  }
  text = text.replace(/data:image\/[^\s"'<>]+/giu, "[image]")
    .replace(/https?:\/\/[^\s"'<>]+/giu, "[URL]")
    .replace(/\bBearer\s+[^\s"'<>]+/giu, "Bearer [redacted]")
    .replace(/[A-Za-z0-9+/=_-]{80,}/gu, "[data]")
    .replace(/[\u0000-\u001f\u007f]/gu, " ").trim();
  return text ? text.slice(0, max) : undefined;
}

/** Venice documents error + details._errors; OpenAI-compatible APIs use error.code/message/param.
 * Unknown bodies are deliberately not dumped. Field VALUES and unrelated response keys are ignored. */
export function providerDiagnostic(value: unknown, base: ImageDiagnostic, secrets: readonly string[]): ImageDiagnostic {
  if (!object(value)) return base;
  const error = object(value.error) ? value.error : undefined;
  const message = diagnosticText(error?.message ?? (typeof value.error === "string" ? value.error : undefined), secrets);
  const code = diagnosticText(error?.code ?? value.code, secrets, 100);
  const fields: string[] = [];
  function field(path: unknown) { if (typeof path === "string" && /^[a-zA-Z0-9_.\[\]-]{1,100}$/u.test(path) && !secrets.some(s => s && path.includes(s)) && fields.length < 12) fields.push(path); }
  field(error?.param);
  function walk(v: unknown, path: string, depth: number) {
    if (!object(v) || depth > 4 || fields.length >= 12) return;
    if (path && Array.isArray(v._errors) && v._errors.length) field(path);
    for (const [key, nested] of Object.entries(v).slice(0, 32)) if (key !== "_errors") walk(nested, path ? path + "." + key : key, depth + 1);
  }
  walk(value.details, "", 0);
  return { ...base, ...(code ? { providerCode: code } : {}), ...(message ? { message } : {}), ...(fields.length ? { fields: [...new Set(fields)] } : {}) };
}
