import { castServiceScreenCopy, fieldServiceScreenCopy, profileServiceScreenCopy, repairServiceScreenCopy, discoveryServiceScreenCopy, validFieldServicePresentation, type FieldServicePresentation, type FieldServiceScreenStage } from "../core/field-service-screen";
import type { Locale } from "../core/types";
import tokens from "../entrypoints/shared/design-tokens.css?inline";

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
 private hint: HTMLElement;
 private note: HTMLElement;
 private requestLabel: HTMLElement;
 private responseLabel: HTMLElement;
 constructor(private doc: Document, locale: Locale = "ru", readonly kind: "field" | "cast" = "field") {
  this.locale = locale;
  this.host = doc.createElement("deeprole-field-screen");
  this.host.dataset.serviceKind = kind;
  this.host.style.cssText = "position:fixed!important;inset:0!important;z-index:2147483647!important;display:block!important;background:#151a20!important;opacity:1!important;visibility:visible!important";
  this.root = this.host.attachShadow({ mode: "open" });
  // Static markup only. Character/field labels are always assigned with textContent.
  this.root.innerHTML = `<style>${tokens}
   :host{all:initial;color:var(--dr-text);font:14px/1.5 system-ui,sans-serif;color-scheme:dark}
   *{box-sizing:border-box} .screen{height:100%;overflow:auto;background:var(--dr-bg);padding:clamp(20px,6vw,36px);display:flex;flex-direction:column;gap:24px}
   .brand{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:650;letter-spacing:.02em}.brand i{width:10px;height:10px;background:var(--dr-primary);border-radius:50%;box-shadow:0 0 18px #a6dcf047}
   main{width:100%;max-width:520px;margin:auto;display:grid;gap:20px}h1{font-size:24px;line-height:1.25;margin:0;font-weight:650;letter-spacing:-.02em}
   .card{padding:20px;border:1px solid var(--dr-border-strong);border-radius:var(--dr-radius);background:var(--dr-panel);box-shadow:var(--dr-depth-card)}
   .request{width:90%;justify-self:end;background:var(--dr-surface)} .label{font-size:12px;color:var(--dr-muted);margin:0 0 10px} .brief{margin:0;overflow-wrap:anywhere;font-size:16px;font-weight:550}
   .state{display:flex;align-items:center;gap:12px;min-height:28px} .status{font-size:17px;font-weight:600;overflow-wrap:anywhere} .dots{display:flex;gap:4px;flex-shrink:0}.dots i{width:5px;height:5px;border-radius:50%;background:var(--dr-primary);animation:breathe 1.2s ease-in-out infinite}.dots i:nth-child(2){animation-delay:150ms}.dots i:nth-child(3){animation-delay:300ms}
   .skeleton{display:grid;gap:9px;margin-top:20px} .line{height:8px;border-radius:6px;background:var(--dr-raised);overflow:hidden;position:relative}.line:nth-child(2){width:84%}.line:nth-child(3){width:57%}.line:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,#bfdfeb26,transparent);transform:translateX(-100%);animation:shimmer 2s linear infinite}
   .hint,.note{color:var(--dr-muted);font-size:13px;margin:0;overflow-wrap:anywhere}footer{width:100%;max-width:520px;margin:0 auto;display:grid;gap:16px}
   button{font:inherit;min-height:44px;padding:10px 18px;color:var(--dr-text);background:var(--dr-button-neutral);border:1px solid var(--dr-border-strong);border-radius:10px;cursor:pointer;position:relative;transition:transform 160ms var(--dr-ease-out)}button:before{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:var(--dr-button-glow);opacity:0;transition:opacity 160ms var(--dr-ease-out)}button:active{transform:scale(.97)}button:focus-visible{outline:2px solid var(--dr-primary);outline-offset:4px}button:disabled{cursor:default;color:var(--dr-muted)}
   [hidden]{display:none!important} .screen[data-terminal=true] .dots i,.screen[data-terminal=true] .line:after{animation:none}.screen[data-terminal=true] .skeleton{display:none}
   @media(hover:hover) and (pointer:fine){button:not(:disabled):hover:before{opacity:1}}
   @keyframes breathe{0%,100%{opacity:.4}50%{opacity:1}}@keyframes shimmer{to{transform:translateX(100%)}}
   @media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}button:active{transform:none}}
  </style><div class="screen"><header class="brand"><i aria-hidden="true"></i>DeepRole</header><main aria-labelledby="dr-field-heading"><h1 id="dr-field-heading"></h1><section class="card request"><p class="label request-label"></p><p class="brief"></p></section><section class="card response"><p class="label response-label"></p><div class="state"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="status" role="status" aria-live="polite" aria-atomic="true"></span></div><div class="skeleton" aria-hidden="true"><div class="line"></div><div class="line"></div><div class="line"></div></div></section><p class="hint"></p></main><footer><button class="cancel" type="button"></button><button class="reveal" type="button" hidden></button><p class="note"></p></footer></div>`;
  const el = <T extends HTMLElement>(selector: string) => this.root.querySelector<T>(selector)!;
  this.heading = el("h1"); this.brief = el(".brief"); this.status = el(".status"); this.hint = el(".hint"); this.note = el(".note"); this.requestLabel = el(".request-label"); this.responseLabel = el(".response-label"); this.button = el(".cancel"); this.reveal = el(".reveal");
  this.button.disabled = true;
  this.button.onclick = () => { if (this.cancel && !this.button.disabled) { this.update("cleanup"); this.cancel(); } };
  this.reveal.onclick = () => this.dispose();
  this.conceal = doc.createElement("style");
  // Opacity, unlike display/visibility/inert, preserves the site's own layout,
  // generation checks and programmatic menu/composer interaction.
  this.conceal.textContent = "body,body dialog,body [popover]{opacity:0!important}body dialog::backdrop,body [popover]::backdrop{opacity:0!important;background:transparent!important}";
  doc.documentElement.append(this.conceal, this.host);
  const hideRoots = () => {
   const body = doc.body; if (!body) return;
   if (body !== this.observedBody) { this.observedBody = body; this.observer.observe(body, { childList: true }); }
   // Never aria-hide body itself: it is the document accessibility root.
   // Include top-level portals added for native deletion menus/dialogs.
   for (const root of body.children) if (!root.matches("script,style,link") && !this.hiddenRoots.has(root)) { this.hiddenRoots.set(root, root.getAttribute("aria-hidden")); root.setAttribute("aria-hidden", "true"); }
  };
  this.observer = new MutationObserver(hideRoots); this.observer.observe(doc.documentElement, { childList: true }); hideRoots();
  doc.addEventListener("keydown", this.keydown, true);
  this.render(); screens.set(doc, this);
 }
 configure(value: unknown, cancel: () => void) {
  if (this.kind === "field" && validFieldServicePresentation(value)) { this.presentation = value; this.locale = value.locale; }
  this.cancel = cancel; this.render(); this.focus();
 }
 owns(event: Event) { return event.composedPath().includes(this.host); }
 focus() { if (!this.disposed) (!this.button.hidden && !this.button.disabled ? this.button : !this.reveal.hidden ? this.reveal : this.status).focus({ preventScroll: true }); }
 update(stage: FieldServiceScreenStage) { if (this.disposed || this.stage === stage) return; this.stage = stage; this.render(); if (["cleanup", "done", "failed", "cleanup-failed"].includes(stage)) this.focus(); }
 private render() {
  const t = this.kind === "cast" ? castServiceScreenCopy(this.locale) : this.presentation?.kind === "profile" ? profileServiceScreenCopy(this.locale) : this.presentation?.kind === "repair" ? repairServiceScreenCopy(this.locale) : this.presentation?.kind === "discovery" ? discoveryServiceScreenCopy(this.locale) : fieldServiceScreenCopy(this.locale), terminal = ["done", "failed", "cleanup-failed"].includes(this.stage);
  this.root.querySelector<HTMLElement>(".screen")!.dataset.terminal = String(terminal);
  this.host.lang = this.locale;
  this.heading.textContent = t.title; this.requestLabel.textContent = t.request; this.responseLabel.textContent = t.response;
  this.brief.textContent = this.presentation ? t.brief(this.presentation.fieldLabel, this.presentation.characterName) : t.generic;
  this.status.textContent = t.stages[this.stage];
  this.status.tabIndex = -1;
  this.hint.textContent = this.stage === "cleanup-failed" ? t.review : this.stage === "failed" ? t.failed : terminal ? "" : t.hint;
  this.note.textContent = t.privacy; this.button.textContent = t.cancel; this.button.hidden = terminal;
  this.button.disabled = !this.cancel || this.stage === "cleanup"; this.reveal.textContent = t.reveal; this.reveal.hidden = this.stage !== "cleanup-failed" && this.stage !== "failed";
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
 if (url.searchParams.has("deeprole_field_job")) return undefined;
 if (!id) try { const marker = JSON.parse(doc.defaultView?.sessionStorage.getItem(CAST_MARKER) ?? "null"); if (castId(marker?.id)) { id = marker.id; locale = marker.locale === "en" ? "en" : "ru"; } } catch { /* Optional UI marker, not ownership. */ }
 return castId(id) ? new FieldServiceScreen(doc, locale, "cast") : undefined;
}
export function rememberCastServiceScreen(id: string, locale: Locale, doc = document) {
 if (!castId(id)) return;
 try { doc.defaultView?.sessionStorage.setItem(CAST_MARKER, JSON.stringify({ id, locale })); } catch { /* No lore or world names. */ }
}
export function createCastServiceScreen(locale: Locale = "ru", doc = document) { return screens.get(doc) ?? new FieldServiceScreen(doc, locale, "cast"); }
export function finishCastServiceScreenMarker(doc = document) { clearFieldServiceScreenMarker(doc, CAST_MARKER); }
