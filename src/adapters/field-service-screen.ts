import { memoryServiceScreenCopy, castServiceScreenCopy, resetServiceScreenCopy, fieldServiceScreenCopy, profileServiceScreenCopy, repairServiceScreenCopy, discoveryServiceScreenCopy, validFieldServicePresentation, type FieldServicePresentation, type FieldServiceScreenStage } from "../core/field-service-screen";
import type { Locale } from "../core/types";
import { IS_DESKTOP } from "../core/chat-host";
import appearance from "../entrypoints/shared/workspace-appearance.css?inline";
import material from "../entrypoints/shared/workspace-material.css?inline";
import styles from "./field-service-screen.css?inline";

const MARKER = "deeprole_field_screen";
const CAST_MARKER = "deeprole_cast_screen";
const ownedId = (value: unknown): value is string => typeof value === "string" && /^(?:field|repair|discover)_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
const castId = (value: unknown): value is string => typeof value === "string" && /^cast_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
const screens = new WeakMap<Document, FieldServiceScreen>();

/** An opaque local presentation, not encryption or a native transport adapter.
 * Native layout and controls remain mounted for the ownership-checked worker.
 */
export class FieldServiceScreen {
 readonly host: HTMLElement;
 private root: ShadowRoot;
 private locale: Locale;
 private presentation?: FieldServicePresentation;
 private stage: FieldServiceScreenStage = "opening";
 private cancel?: () => void;
 private observer: MutationObserver;
 private conceal: HTMLStyleElement;
 private hiddenRoots = new Map<Element, string | null>();
 private observedBody?: HTMLElement;
 private disposed = false;
 private button: HTMLButtonElement;
 private reveal: HTMLButtonElement;
 private heading: HTMLElement;
 private brief: HTMLElement;
 private status: HTMLElement;
  private progress: HTMLElement;
 private hint: HTMLElement;
 private note: HTMLElement;
 private requestLabel: HTMLElement;
 private responseLabel: HTMLElement;
  private caption: HTMLElement;
 constructor(private doc: Document, locale: Locale = "ru", readonly kind: "field" | "cast" = "field", private castMode: "cast" | "reset" = "cast") {
  this.locale = locale;
  this.host = doc.createElement("deeprole-field-screen");
  this.host.dataset.serviceKind = kind;
  this.host.toggleAttribute("data-native", IS_DESKTOP);
  this.host.style.cssText = "position:fixed!important;inset:0!important;z-index:2147483647!important;display:block!important;background:var(--dr-bg,#171717)!important;opacity:1!important;visibility:visible!important";
  this.root = this.host.attachShadow({ mode: "open" });
  // Static markup only. Character/field labels are always assigned with textContent.
  this.root.innerHTML = `<style>${appearance}\n${material}\n${styles}</style>
   <div class="caption" aria-hidden="true"><span></span></div>
   <div class="screen"><div class="service-page">
    <header class="brand"><span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 6c-2.6-2-5.8-2.4-9-1v13c3.2-1.4 6.4-1 9 1 2.6-2 5.8-2.4 9-1V5c-3.2-1.4-6.4-1-9 1zm0 0v13"/></svg></span>DeepRole</header>
    <main aria-labelledby="dr-field-heading">
     <h1 id="dr-field-heading"></h1>
     <section class="request"><p class="label request-label"></p><p class="brief"></p></section>
     <section class="response">
      <p class="label response-label" id="dr-service-progress-label"></p>
      <div class="state"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="status" role="status" aria-live="polite" aria-atomic="true" tabindex="-1"></span></div>
      <div class="skeleton" role="progressbar" aria-labelledby="dr-service-progress-label"><span></span></div>
     </section>
     <p class="hint"></p>
    </main>
    <footer><button class="cancel dr-feedback-button" type="button"></button><button class="reveal dr-feedback-button" type="button" hidden></button><p class="note"></p></footer>
   </div></div>`;
  const el = <T extends HTMLElement>(selector: string) => this.root.querySelector<T>(selector)!;
  this.heading = el("h1"); this.brief = el(".brief"); this.status = el(".status"); this.hint = el(".hint"); this.note = el(".note"); this.requestLabel = el(".request-label"); this.responseLabel = el(".response-label"); this.button = el(".cancel"); this.reveal = el(".reveal");
  this.caption = el(".caption span"); this.progress = el(".skeleton");
  this.button.disabled = true;
  this.button.onclick = () => { if (this.cancel && !this.button.disabled) { this.update("cleanup"); this.cancel(); } };
  this.reveal.onclick = () => this.dispose();
  this.conceal = doc.createElement("style");
  // Opacity, unlike display/visibility/inert, preserves the site's own layout,
  // generation checks and programmatic menu/composer interaction.
  this.conceal.textContent = "body,body dialog,body [popover]{opacity:0!important}body dialog::backdrop,body [popover]::backdrop{opacity:0!important;background:transparent!important}";
  doc.documentElement.append(this.conceal, this.host);
  const hideRoots = () => {
   if (doc.documentElement.dataset.motion === "off") this.host.dataset.motion = "off";
   else delete this.host.dataset.motion;
   const body = doc.body; if (!body) return;
   if (body !== this.observedBody) { this.observedBody = body; this.observer.observe(body, { childList: true }); }
   // Never aria-hide body itself: it is the document accessibility root.
   // Include top-level portals added for native deletion menus/dialogs.
   for (const root of body.children) if (!root.matches("script,style,link") && !this.hiddenRoots.has(root)) { this.hiddenRoots.set(root, root.getAttribute("aria-hidden")); root.setAttribute("aria-hidden", "true"); }
  };
  this.observer = new MutationObserver(hideRoots);
  this.observer.observe(doc.documentElement, { childList: true, attributeFilter: ["data-motion"] });
  hideRoots();
  doc.addEventListener("keydown", this.keydown, true);
  this.render(); screens.set(doc, this);
 }
 configure(value: unknown, cancel: () => void) {
  if (this.kind === "field" && validFieldServicePresentation(value)) { this.presentation = value; this.locale = value.locale; }
  this.cancel = cancel; this.render(); this.focus();
 }
 /** Background ownership is checked separately; this changes presentation only. */
 setCastMode(reset: boolean, locale: Locale) {
  if (this.kind !== "cast") return;
  this.castMode = reset ? "reset" : "cast"; this.locale = locale; this.render();
 }
 get isReset() { return this.kind === "cast" && this.castMode === "reset"; }
  setCastProgress(prepared: number, total?: number) {
    if (this.kind !== "cast" || !Number.isSafeInteger(prepared) || prepared < 0) return;
    let progress = this.root.querySelector<HTMLElement>(".cast-progress");
    if (!progress) { progress = this.doc.createElement("p"); progress.className = "hint cast-progress"; this.status.closest("section")!.append(progress); }
    const maximum = total !== undefined && Number.isSafeInteger(total) && total > 0 && total >= prepared ? total : undefined;
    const label = this.isReset
      ? this.locale === "ru" ? "Исходные состояния" : "Starting states"
      : this.locale === "ru" ? "Подготовлено анкет" : "Profiles prepared";
    progress.textContent = `${label}: ${prepared}${maximum === undefined ? "" : " / " + maximum}`;
    if (maximum === undefined) {
      this.progress.removeAttribute("aria-valuenow");
      this.progress.removeAttribute("aria-valuemax");
      this.progress.style.removeProperty("--service-progress");
    } else {
      this.progress.setAttribute("aria-valuemax", String(maximum));
      this.progress.setAttribute("aria-valuenow", String(prepared));
      this.progress.style.setProperty("--service-progress", `${100 * prepared / maximum}%`);
    }
  }
 owns(event: Event) { return event.composedPath().includes(this.host); }
 focus() { if (!this.disposed) (!this.button.hidden && !this.button.disabled ? this.button : !this.reveal.hidden ? this.reveal : this.status).focus({ preventScroll: true }); }
 update(stage: FieldServiceScreenStage) { if (this.disposed || this.stage === stage) return; this.stage = stage; this.render(); if (["cleanup", "done", "failed", "cleanup-failed"].includes(stage)) this.focus(); }
 private render() {
  const t = this.presentation?.kind === "memory" ? memoryServiceScreenCopy(this.locale) : this.kind === "cast" ? this.castMode === "reset" ? resetServiceScreenCopy(this.locale) : castServiceScreenCopy(this.locale) : this.presentation?.kind === "profile" ? profileServiceScreenCopy(this.locale) : this.presentation?.kind === "repair" ? repairServiceScreenCopy(this.locale) : this.presentation?.kind === "discovery" ? discoveryServiceScreenCopy(this.locale) : fieldServiceScreenCopy(this.locale), terminal = ["done", "failed", "cleanup-failed"].includes(this.stage);
   const screen = this.root.querySelector<HTMLElement>(".screen")!;
   screen.dataset.terminal = String(terminal);
   screen.dataset.stage = this.stage;
  this.host.lang = this.locale;
   this.heading.textContent = t.title; this.caption.textContent = `${t.title} — DeepRole`;
   if (IS_DESKTOP && this.doc.title !== this.caption.textContent) this.doc.title = this.caption.textContent;
   this.requestLabel.textContent = t.request; this.responseLabel.textContent = t.response;
  this.brief.textContent = this.presentation ? t.brief(this.presentation.fieldLabel, this.presentation.characterName) : t.generic;
  this.status.textContent = t.stages[this.stage];
  this.hint.textContent = this.stage === "cleanup-failed" ? t.review : this.stage === "failed" ? t.failed : terminal ? "" : t.hint;
  this.note.textContent = t.privacy; this.button.textContent = t.cancel; this.button.hidden = terminal;
   this.button.disabled = !this.cancel || this.stage === "cleanup";
   this.reveal.textContent = IS_DESKTOP ? this.locale === "ru" ? "Открыть служебный чат" : "Open service chat" : t.reveal;
   this.reveal.hidden = this.stage !== "cleanup-failed" && this.stage !== "failed";
 }
 private keydown = (event: KeyboardEvent) => {
  if (!event.isTrusted || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === "Tab") { event.preventDefault(); this.focus(); }
  else if (event.key === "Escape" && !this.button.hidden && !this.button.disabled) { event.preventDefault(); this.button.click(); }
  else if (!this.owns(event)) { event.preventDefault(); this.focus(); }
 };
 dispose() {
  if (this.disposed) return; this.disposed = true;
  this.observer.disconnect(); this.doc.removeEventListener("keydown", this.keydown, true);
  for (const [root, before] of this.hiddenRoots) if (root.getAttribute("aria-hidden") === "true") { if (before === null) root.removeAttribute("aria-hidden"); else root.setAttribute("aria-hidden", before); }
  this.conceal.remove(); this.host.remove(); screens.delete(this.doc); clearFieldServiceScreenMarker(this.doc, this.kind === "cast" ? CAST_MARKER : MARKER);
 }
}
function clearFieldServiceScreenMarker(doc: Document, key = MARKER) { try { doc.defaultView?.sessionStorage.removeItem(key); } catch { /* Optional presentation marker only. */ } }
export function rememberFieldServiceScreen(id: string, locale: Locale, doc = document) {
 if (!ownedId(id)) return;
 try { doc.defaultView?.sessionStorage.setItem(MARKER, JSON.stringify({ id, locale })); } catch { /* Never a protocol authority. */ }
}
/** Synchronous at document_start, before injection/IPC can expose a native frame.
 * A reload marker masks only; background claim is still mandatory for all work.
 */
export function bootstrapFieldServiceScreen(doc = document): FieldServiceScreen | undefined {
 const existing = screens.get(doc); if (existing) return existing.kind === "field" ? existing : undefined;
 const url = new URL(doc.location.href); let id = url.searchParams.get("deeprole_field_job"), locale: Locale = url.searchParams.get("deeprole_field_locale") === "en" ? "en" : "ru";
 if (url.searchParams.has("deeprole_cast_job")) return undefined;
 if (!id) try { const marker = JSON.parse(doc.defaultView?.sessionStorage.getItem(MARKER) ?? "null"); if (ownedId(marker?.id)) { id = marker.id; locale = marker.locale === "en" ? "en" : "ru"; } } catch { /* Invalid markers don't hide ordinary chats. */ }
 return ownedId(id) ? new FieldServiceScreen(doc, locale) : undefined;
}
export function createFieldServiceScreen(locale: Locale = "ru", doc = document) { return screens.get(doc) ?? new FieldServiceScreen(doc, locale); }
export function finishFieldServiceScreenMarker(doc = document) { clearFieldServiceScreenMarker(doc); }
export function bootstrapCastServiceScreen(doc = document): FieldServiceScreen | undefined {
 const existing = screens.get(doc); if (existing) return existing.kind === "cast" ? existing : undefined;
 const url = new URL(doc.location.href); let id = url.searchParams.get("deeprole_cast_job"), locale: Locale = url.searchParams.get("deeprole_cast_locale") === "en" ? "en" : "ru";
 let mode: "cast" | "reset" = url.searchParams.get("deeprole_cast_mode") === "reset" ? "reset" : "cast";
 if (url.searchParams.has("deeprole_field_job")) return undefined;
 if (!id) try { const marker = JSON.parse(doc.defaultView?.sessionStorage.getItem(CAST_MARKER) ?? "null"); if (castId(marker?.id)) { id = marker.id; locale = marker.locale === "en" ? "en" : "ru"; mode = marker.mode === "reset" ? "reset" : "cast"; } } catch { /* Optional UI marker, not ownership. */ }
 return castId(id) ? new FieldServiceScreen(doc, locale, "cast", mode) : undefined;
}
export function rememberCastServiceScreen(id: string, locale: Locale, doc = document, reset = false) {
 if (!castId(id)) return;
 try { doc.defaultView?.sessionStorage.setItem(CAST_MARKER, JSON.stringify({ id, locale, ...(reset ? { mode: "reset" } : {}) })); } catch { /* No lore or world names. */ }
}
export function createCastServiceScreen(locale: Locale = "ru", doc = document) { return screens.get(doc) ?? new FieldServiceScreen(doc, locale, "cast"); }
export function finishCastServiceScreenMarker(doc = document) { clearFieldServiceScreenMarker(doc, CAST_MARKER); }
