import { afterEach, expect, it, vi } from "vitest";
import { FieldServiceScreen, bootstrapCastServiceScreen, bootstrapFieldServiceScreen, rememberCastServiceScreen, rememberFieldServiceScreen, finishCastServiceScreenMarker, finishFieldServiceScreenMarker } from "../src/adapters/field-service-screen";
import { castServiceScreenCopy, fieldServiceScreenCopy, validFieldServicePresentation } from "../src/core/field-service-screen";

const mounted: FieldServiceScreen[] = [];
const id = "field_01234567-89ab-4cde-8fab-0123456789ab";
const screen = (locale: "ru" | "en" = "en") => { const value = new FieldServiceScreen(document, locale); mounted.push(value); return value; };
it.each(["ru", "en"] as const)("labels a one-character profile for review, not field insertion, in %s", locale => {
 const value = screen(locale), presentation = { locale, fieldLabel: "Profile", characterName: "Mira", kind: "profile" };
 expect(validFieldServicePresentation(presentation)).toBe(true); expect(validFieldServicePresentation({ ...presentation, kind: "foreign" })).toBe(false);
 value.configure(presentation, vi.fn()); value.update("generating");
 expect(value.host.shadowRoot!.querySelector("h1")!.textContent).toBe(locale === "ru" ? "Подготовка анкеты" : "Preparing a profile");
 expect(value.host.shadowRoot!.querySelector(".brief")!.textContent).toContain("Mira"); expect(value.host.shadowRoot!.querySelector(".hint")!.textContent).toContain(locale === "ru" ? "для проверки" : "for review");
});
afterEach(() => { mounted.splice(0).forEach(v => v.dispose()); sessionStorage.clear(); document.body.removeAttribute("aria-hidden"); document.body.replaceChildren(); history.replaceState({}, "", "/"); });
it("masks native prompt, reasoning and reply while preserving native DOM/layout flags", () => {
 document.body.innerHTML = '<main><textarea>PRIVATE_PROMPT</textarea><article>PRIVATE_REPLY</article><div>PRIVATE_REASONING</div></main>';
 const value = screen(); value.configure({ locale: "en", fieldLabel: "Appearance", characterName: "Mira" }, vi.fn());
 expect(value.host.shadowRoot!.textContent).not.toMatch(/PRIVATE_/u); expect(document.body.textContent).toContain("PRIVATE_REPLY");
 expect(document.body.hasAttribute("aria-hidden")).toBe(false); expect(document.querySelector("main")!.getAttribute("aria-hidden")).toBe("true"); expect(getComputedStyle(document.body).opacity).toBe("0"); expect(getComputedStyle(document.body).display).not.toBe("none"); expect(getComputedStyle(document.body).visibility).not.toBe("hidden");
 value.dispose(); expect(document.body.hasAttribute("aria-hidden")).toBe(false); expect(document.body.textContent).toContain("PRIVATE_REASONING"); expect(document.querySelector("deeprole-field-screen")).toBeNull();
});
it("treats names as inert text, renders only local labels, and honors reduced motion", () => {
 const value = screen(); const name = '<img src=x onerror="alert(1)">'; value.configure({ locale: "ru", fieldLabel: "Внешность", characterName: name }, vi.fn());
 expect(value.host.shadowRoot!.querySelector(".brief")!.textContent).toContain(name); expect(value.host.shadowRoot!.querySelector("img")).toBeNull();
 expect(value.host.lang).toBe("ru"); expect(value.host.shadowRoot!.querySelector("style")!.textContent).toContain("prefers-reduced-motion:reduce");
});
it("allows exactly one cancel click, keeps cleanup masked, then offers explicit inspection on failure", () => {
 const value = screen(), cancel = vi.fn(); value.configure({ locale: "en", fieldLabel: "Goals", characterName: "Mira" }, cancel);
 const button = value.host.shadowRoot!.querySelector<HTMLButtonElement>(".cancel")!; button.click(); button.click(); expect(cancel).toHaveBeenCalledTimes(1); expect(button.disabled).toBe(true);
 expect(value.host.shadowRoot!.querySelector(".status")!.textContent).toBe("Deleting the temporary chat"); value.update("cleanup-failed");
 expect(value.host.shadowRoot!.querySelector(".hint")!.textContent).toContain("technical content will become visible");
 value.host.shadowRoot!.querySelector<HTMLButtonElement>(".reveal")!.click(); expect(value.host.isConnected).toBe(false);
});
it("restores prior accessibility attributes without removing native changes", () => {
 document.body.innerHTML = '<main aria-hidden="false"></main>'; const root = document.querySelector("main")!;
 const value = screen(); value.dispose(); expect(root.getAttribute("aria-hidden")).toBe("false");
 const other = screen(); root.setAttribute("aria-hidden", "false"); other.dispose(); expect(root.getAttribute("aria-hidden")).toBe("false");
});
it("masks late native portals without observing generated message text", async () => {
 const value = screen(); const portal = document.createElement("dialog"); portal.setAttribute("open", ""); portal.setAttribute("role", "dialog"); portal.textContent = "PRIVATE_DELETE_DIALOG"; document.body.append(portal);
 await Promise.resolve(); expect(portal.getAttribute("aria-hidden")).toBe("true"); expect(document.body.hasAttribute("aria-hidden")).toBe(false);
 expect(getComputedStyle(portal).opacity).toBe("0"); expect(getComputedStyle(portal).visibility).not.toBe("hidden");
 value.dispose(); expect(portal.hasAttribute("aria-hidden")).toBe(false); expect(portal.isConnected).toBe(true);
});
it("keeps masking when a native page replaces its body", async () => {
 const value = screen(); const body = document.createElement("body"); body.innerHTML = "<main>PRIVATE_RELOADED</main>"; document.body.replaceWith(body);
 await Promise.resolve(); expect(body.querySelector("main")!.getAttribute("aria-hidden")).toBe("true"); expect(getComputedStyle(body).opacity).toBe("0"); expect(value.host.isConnected).toBe(true);
});
it("bootstraps before async claim only for a valid service marker, including reload, with no text persisted", () => {
 expect(bootstrapFieldServiceScreen()).toBeUndefined(); history.replaceState({}, "", "/?deeprole_field_job=invalid"); expect(bootstrapFieldServiceScreen()).toBeUndefined();
 history.replaceState({}, "", "/?deeprole_field_job=" + id + "&deeprole_field_locale=en"); const early = bootstrapFieldServiceScreen()!; mounted.push(early); expect(bootstrapFieldServiceScreen()).toBe(early); expect(early.host.lang).toBe("en"); early.dispose();
 rememberFieldServiceScreen(id, "ru"); expect(sessionStorage.getItem("deeprole_field_screen")).toBe(JSON.stringify({ id, locale: "ru" })); history.replaceState({}, "", "/chat/s/owned"); const resumed = bootstrapFieldServiceScreen()!; mounted.push(resumed); expect(resumed.host.lang).toBe("ru");
 finishFieldServiceScreenMarker(); expect(sessionStorage.getItem("deeprole_field_screen")).toBeNull();
});
it("rejects unbounded or extra presentation data without changing the local interface", () => {
 const valid = { locale: "en", fieldLabel: "Appearance", characterName: "Mira" };
 expect(validFieldServicePresentation(valid)).toBe(true);
 for (const bad of [{ ...valid, characterName: "x".repeat(81) }, { ...valid, fieldLabel: "x".repeat(201) }, { ...valid, prompt: "PRIVATE" }, { ...valid, locale: "fr" }, { ...valid, fieldLabel: "" }]) expect(validFieldServicePresentation(bad)).toBe(false);
 const value = screen(); value.configure({ ...valid, prompt: "PRIVATE" }, vi.fn()); expect(value.host.shadowRoot!.querySelector(".brief")!.textContent).toBe("Prepare a character field");
});
it.each(["ru", "en"] as const)("uses locale-only labels and fixed truthful states in %s", locale => {
 const t = fieldServiceScreenCopy(locale); expect(t.stages.waiting).toBe(locale === "ru" ? "Ожидаем ответ" : "Waiting for a reply"); expect(t.stages.generating).toBe(locale === "ru" ? "Генерирую описание" : "Generating the description");
 expect(JSON.stringify(t)).not.toMatch(/100%|ETA|Читаю историю|Reading history/u);
});
it.each(["ru", "en"] as const)("shows roster-specific copy, never field/name or lore data in %s", locale => {
 const value = new FieldServiceScreen(document, locale, "cast"); mounted.push(value);
 value.configure({ locale, fieldLabel: "PRIVATE_FIELD", characterName: "PRIVATE_NAME" }, vi.fn());
 const t = castServiceScreenCopy(locale); expect(value.host.shadowRoot!.querySelector(".brief")!.textContent).toBe(t.generic);
 expect(value.host.shadowRoot!.textContent).not.toMatch(/PRIVATE_|карточке персонажа|character profile/u);
 for (const stage of ["reading", "generating", "repairing", "done"] as const) { value.update(stage); expect(value.host.shadowRoot!.querySelector(".status")!.textContent).toBe(t.stages[stage]); }
});
it("isolates roster bootstrap/markers from field workers and ordinary pages", () => {
 const cast = id.replace("field_", "cast_"); rememberFieldServiceScreen(id, "en");
 history.replaceState({}, "", "/?deeprole_cast_job="+cast+"&deeprole_cast_locale=ru");
 expect(bootstrapFieldServiceScreen()).toBeUndefined(); const early = bootstrapCastServiceScreen()!; mounted.push(early);
 expect(early.kind).toBe("cast"); expect(bootstrapCastServiceScreen()).toBe(early); expect(bootstrapFieldServiceScreen()).toBeUndefined();
 early.dispose(); expect(sessionStorage.getItem("deeprole_field_screen")).not.toBeNull(); sessionStorage.clear();
 rememberCastServiceScreen(cast,"en"); history.replaceState({},"","/chat/s/owned");
 const reloaded = bootstrapCastServiceScreen()!; mounted.push(reloaded); expect(reloaded.host.lang).toBe("en");
 expect(sessionStorage.getItem("deeprole_cast_screen")).toBe(JSON.stringify({id:cast,locale:"en"})); finishCastServiceScreenMarker();
 expect(sessionStorage.getItem("deeprole_cast_screen")).toBeNull(); reloaded.dispose();
 history.replaceState({},"","/?deeprole_cast_job=invalid"); expect(bootstrapCastServiceScreen()).toBeUndefined();
});
