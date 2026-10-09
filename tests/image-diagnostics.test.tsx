import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ImageTransport } from "../src/adapters/image/transport";
import { VeniceNativeProvider } from "../src/adapters/image/venice-native";
import { diagnosticText, providerDiagnostic, validImageDiagnostic } from "../src/core/image-diagnostics";
import { imageModelsFor, DEFAULT_IMAGE_SETTINGS } from "../src/core/image-generation";
import { imageErrorKey, IMAGE_STRINGS } from "../src/core/image-i18n";
import { ImageErrorDetails } from "../src/entrypoints/shared/ImageErrorDetails";
import { ImageSettings } from "../src/entrypoints/sidepanel/ImageSettings";
import { saveImageSettings, getImageSettings } from "../src/storage/image-settings";
import { profile } from "./image-fixtures";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const key = "SYNTHETIC-SECRET-KEY", prompt = "Private appearance and private scene";
const base = { source: "provider" as const, phase: "request" as const, status: 400, endpoint: "/image/edit", model: "synthetic-edit" };
test("extracts documented error formats, never arbitrary bodies or field values", () => {
  const result = providerDiagnostic({ error: `Invalid request ${key}; ${prompt}`, code: "INVALID_MODEL", details: { model: { _errors: ["required"] }, image: { _errors: [key] } }, request: { authorization: key } }, base, [key, prompt]);
  expect(result).toMatchObject({ providerCode: "INVALID_MODEL", fields: ["model", "image"], message: "Invalid request [redacted]; [redacted]" });
  expect(JSON.stringify(result)).not.toContain(key); expect(JSON.stringify(result)).not.toContain(prompt);
  expect(providerDiagnostic({ unrelated: key }, base, [key])).toEqual(base);
  expect(providerDiagnostic({ error: { code: "invalid_model", message: "Unknown model", param: "model" } }, base, [key])).toMatchObject({ providerCode: "invalid_model", message: "Unknown model", fields: ["model"] });
  expect(validImageDiagnostic(result)).toBe(true);
});
test("redacts before clipping and bounds malicious provider strings", () => {
  const result = diagnosticText(`Bearer ${key} ${encodeURIComponent(key)} https://evil.example/?key=${key} data:image/png;base64,${"A".repeat(500)}\n` + "z".repeat(1000), [key]);
  expect(result).not.toContain(key); expect(result).not.toContain("https:"); expect(result).not.toContain("data:image"); expect(result!.length).toBeLessThanOrEqual(600);
  expect(validImageDiagnostic({ ...base, rawBody: key })).toBe(false);
  expect(validImageDiagnostic({ ...base, endpoint: "/image/edit?key=secret" })).toBe(false);
  expect(validImageDiagnostic({ ...base, message: "x".repeat(601) })).toBe(false);
});
test.each([400, 404, 413, 429, 500])("keeps HTTP %s and a bounded safe response without retry", async status => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ error: { code: "INVALID_MODEL", message: `Invalid model ${key} ${prompt}`, param: "model" }, unrelated: key }), { status, headers: { "content-type": "application/json", "x-venice-is-content-violation": "false" } }));
  vi.stubGlobal("fetch", fetch);
  const error = await new ImageTransport(profile, key, async () => true).request("/image/edit", { model: "synthetic-edit", prompt }).catch(e => e);
  expect(error.diagnostic).toMatchObject({ ...base, status, providerCode: "INVALID_MODEL", fields: ["model"] });
  expect(error.headers).toEqual({ "x-venice-is-content-violation": "false" }); expect(JSON.stringify(error)).not.toContain(key); expect(JSON.stringify(error)).not.toContain(prompt); expect(fetch).toHaveBeenCalledOnce();
});
test.each(["text", "malformed", "large"])("keeps known status for an unreadable %s response", async kind => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(kind === "large" ? "x".repeat(40_000) : "not-json", { status: 400, headers: { "content-type": kind === "text" ? "text/plain" : "application/json" } })));
  const error = await new ImageTransport(profile, key, async () => true).request("/image/edit", { model: "synthetic-edit", prompt }).catch(e => e);
  expect(error.code).toBe("badRequest"); expect(error.diagnostic.status).toBe(400); expect(error.diagnostic.message).toBeUndefined();
});
test("merges both real catalog capabilities without overwriting a dual-purpose model", async () => {
  const fetch = vi.fn(async (url: string) => new Response(JSON.stringify({ data: [{ id: "synthetic-dual" }, { id: url.includes("inpaint") ? "synthetic-edit-only" : "synthetic-generation-only" }] }), { headers: { "content-type": "application/json" } })); vi.stubGlobal("fetch", fetch);
  const models = await new VeniceNativeProvider(profile, new ImageTransport(profile, key, async () => true)).listModels();
  expect(models.find(m => m.id === "synthetic-dual")).toMatchObject({ supportsEdit: true, supportsGenerate: true });
  expect(imageModelsFor(models, "edit").map(m => m.id)).toEqual(["synthetic-dual", "synthetic-edit-only"]);
  expect(imageModelsFor(models, "generate").map(m => m.id)).toEqual(["synthetic-dual", "synthetic-generation-only"]);
  expect(imageModelsFor([{ id: "unknown", label: "Unknown" }], "edit")).toHaveLength(1);
  expect(fetch).toHaveBeenCalledTimes(2);
});
for (const locale of ["ru", "en"] as const) {
  test(`error disclosure has a hover code, keyboard disclosure and no retry ${locale}`, () => {
    const view = render(<ImageErrorDetails locale={locale} error={{ code: "badRequest", diagnostic: { ...base, providerCode: "INVALID_MODEL", message: "Unknown model", fields: ["model"] } }} />);
    expect(view.getByRole("alert")).toHaveAttribute("title", "badRequest · HTTP 400 · INVALID_MODEL");
    const disclosure = view.container.querySelector("details")!;
    expect(disclosure.open).toBe(false); fireEvent.click(view.getByText(locale === "ru" ? "Подробности ошибки" : "Error details"));
    expect(view.container.textContent).toContain("INVALID_MODEL"); expect(view.container.textContent).toContain("/image/edit");
    expect(view.queryAllByRole("button")).toHaveLength(0);
  });
  test(`old errors stay readable without invented HTTP codes ${locale}`, () => {
    const view = render(<ImageErrorDetails locale={locale} error="invalidPlan" />);
    expect(view.getByRole("alert")).toHaveAttribute("title", "invalidPlan");
    expect(view.container.textContent).not.toContain("400"); expect(imageErrorKey("invalidPlan")).toBe("invalidPlan");
  });
  test(`catalog selectors filter API capabilities and preserve a saved incompatible selection ${locale}`, async () => {
    const config = { ...profile, editModelId: "synthetic-generation" };
    await saveImageSettings({ ...DEFAULT_IMAGE_SETTINGS, profiles: [config] });
    const onModels = vi.fn(async () => [{ id: "synthetic-generation", label: "Generation", supportsGenerate: true, supportsEdit: false }, { id: "synthetic-edit", label: "Edit", supportsGenerate: false, supportsEdit: true }]);
    const view = render(<ImageSettings locale={locale} onModels={onModels} />);
    fireEvent.click(await view.findByRole("button", { name: profile.label }));
    fireEvent.click(view.getByRole("button", { name: locale === "ru" ? "Загрузить модели" : "Load models" }));
    await view.findByText(IMAGE_STRINGS.editModelMismatch[locale === "ru" ? 0 : 1]);
    const gen = view.getByRole("combobox", { name: locale === "ru" ? "Модель генерации" : "Generation model" });
    expect(gen.querySelector('option[value="synthetic-edit"]')).toBeNull();
    const edit = view.getByRole("combobox", { name: locale === "ru" ? "Модель для референсов" : "Reference model" });
    expect(edit).toHaveValue("synthetic-generation"); expect(edit.querySelector('option[value="synthetic-edit"]')).not.toBeNull();
    expect((await getImageSettings()).profiles[0]?.editModelId).toBe("synthetic-generation"); expect(onModels).toHaveBeenCalledOnce();
  });
}
