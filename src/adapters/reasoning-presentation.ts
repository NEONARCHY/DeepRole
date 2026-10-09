import { experienceText } from "../core/experience-i18n";
import type { Locale } from "../core/types";
import { isUserMessage, nativeMessageIdentity, nativeMessageRow } from "./deepseek-message-dom";

const BODY = ".ds-think-content,.ds-think-content-wrapper,[data-testid='thinking-content'],[data-testid='reasoning-content']";
const HEADING = /^(?:thought(?: for)?|thinking|дума(?:л|ет|ю)|размышлял|思考)/iu;
const EXCLUDED = "deeprole-page-widget,form,[data-deeprole-choices-host],[data-deeprole-memory-card],[data-deeprole-illustrations]";
function isHeading(text: string): boolean { return text.length < 160 && HEADING.test(text.replace(/^[^\p{L}]+/u, "")); }
type State = { manual: boolean };
type Record = { body: HTMLElement; state: State; control: HTMLElement | null; fallback?: HTMLButtonElement; display?: { value: string; priority: string } };

/** Presentation only. Uses the site's disclosure, never the DeepThink mode
 * button. A reversible fallback keeps raw reasoning readable by the site. */
export class ReasoningPresentation {
  private show = true;
  private locale: Locale = "en";
  private url = "";
  private automatic = false;
  private observer: MutationObserver | null = null;
  private states = new Map<string, State>();
  private anonymous = new WeakMap<HTMLElement, State>();
  private records = new Map<HTMLElement, Record>();
  private closed = new Map<HTMLElement, Record>();

  constructor(private readonly doc: Document = document) {}

  configure(show: boolean, locale: Locale): void {
    if (this.show && !show) { this.states.clear(); this.anonymous = new WeakMap(); }
    this.show = show; this.locale = locale;
    if (!this.observer) {
      this.doc.addEventListener("click", this.onClick, true);
      this.observer = new MutationObserver(changes => {
        if (changes.some(change => {
          const target = change.target instanceof Element ? change.target : change.target.parentElement;
          if (target?.closest(BODY) || [...this.closed.keys()].some(control => control.contains(target))) return true;
          return change.type === "childList" && [...change.addedNodes, ...change.removedNodes]
            .some(node => node instanceof Element && (node.matches(BODY) || !!node.querySelector(BODY)));
        })) this.sync();
      });
      this.observer.observe(this.doc.documentElement, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "open", "aria-expanded"] });
    }
    this.sync();
  }

  private state(row: HTMLElement): State {
    const key = nativeMessageIdentity(row);
    let state = key ? this.states.get(key) : this.anonymous.get(row);
    if (!state) {
      state = { manual: false };
      if (key) { this.states.set(key, state); if (this.states.size > 2000) this.states.delete(this.states.keys().next().value!); }
      else this.anonymous.set(row, state);
    }
    return state;
  }

  private visible(body: HTMLElement): boolean {
    if (!body.isConnected) return false;
    for (let node: HTMLElement | null = body; node; node = node.parentElement) {
      const style = this.doc.defaultView?.getComputedStyle(node);
      if (node.hidden || style?.display === "none" || style?.visibility === "hidden" || style?.maxHeight === "0px"
        || node instanceof HTMLDetailsElement && !node.open) return false;
    }
    return true;
  }

  private heading(body: HTMLElement, row: HTMLElement): HTMLElement | null {
    const details = body.closest("details");
    if (details && row.contains(details)) return details.querySelector<HTMLElement>(":scope>summary");
    for (let node: HTMLElement | null = body, depth = 0; node && node !== row && depth < 4; node = node.parentElement, depth++) {
      let previous = node.previousElementSibling;
      while (previous?.matches("[data-deeprole-reasoning-toggle]")) previous = previous.previousElementSibling;
      if (!(previous instanceof HTMLElement)) continue;
      const control = previous.matches("button,[role=button]") ? previous : previous.querySelector<HTMLElement>("button,[role=button]") ?? previous;
      const text = control.textContent?.trim() || control.getAttribute("aria-label") || previous.textContent?.trim() || "";
      if (!control.closest(EXCLUDED) && (control.getAttribute("aria-controls") === body.id && !!body.id
        || isHeading(text))) return control;
    }
    return null;
  }

  private nativeToggle(record: Record, open: boolean): void {
    const control = record.control;
    if (!control?.isConnected) return;
    this.automatic = true;
    try {
      const details = control.matches("summary") ? control.parentElement : null;
      if (details instanceof HTMLDetailsElement) details.open = open;
      else control.click();
    } finally { this.automatic = false; }
  }

  private restoreDisplay(record: Record): void {
    if (!record.display) return;
    if (record.body.style.display === "none" && record.body.style.getPropertyPriority("display") === "important") {
      if (record.display.value) record.body.style.setProperty("display", record.display.value, record.display.priority);
      else record.body.style.removeProperty("display");
    }
    delete record.display;
  }

  private fold(record: Record): void {
    if (!record.display || record.body.style.display !== "none" || record.body.style.getPropertyPriority("display") !== "important") record.display = { value: record.body.style.getPropertyValue("display"), priority: record.body.style.getPropertyPriority("display") };
    if (record.body.style.display !== "none" || record.body.style.getPropertyPriority("display") !== "important") record.body.style.setProperty("display", "none", "important");
  }

  private label(record: Record): void {
    if (!record.fallback) return;
    const expanded = this.visible(record.body), text = experienceText(this.locale, expanded ? "reasoningCollapse" : "reasoningExpand");
    if (record.fallback.textContent !== text) record.fallback.textContent = text;
    if (record.fallback.getAttribute("aria-expanded") !== String(expanded)) record.fallback.setAttribute("aria-expanded", String(expanded));
  }

  private restore(native: boolean): void {
    for (const record of this.records.values()) { this.restoreDisplay(record); record.fallback?.remove(); }
    if (native) for (const record of this.closed.values()) {
      if (record.state.manual || !record.control?.isConnected) continue;
      const expanded = record.control.getAttribute("aria-expanded");
      const body = record.body.isConnected ? record.body : nativeMessageRow(record.control)?.querySelector<HTMLElement>(BODY) ?? record.body;
      if (expanded === "false" || expanded !== "true" && !this.visible(body)) this.nativeToggle(record, true);
    }
    this.records.clear(); this.closed.clear();
  }

  sync(): void {
    const url = this.doc.location?.href ?? "";
    if (url !== this.url) { this.restore(false); this.states.clear(); this.anonymous = new WeakMap(); this.url = url; }
    if (this.show) { this.restore(true); return; }
    for (const [body, record] of this.records) if (!body.isConnected) { this.restoreDisplay(record); record.fallback?.remove(); this.records.delete(body); }
    for (const [control] of this.closed) if (!control.isConnected) this.closed.delete(control);
    const seen = new Set<HTMLElement>();
    for (let body of this.doc.querySelectorAll<HTMLElement>(BODY)) {
      if (body.closest(EXCLUDED) || body.matches("button,[role=button]")) continue;
      // Prefer one wrapper, but never take final prose with the reasoning.
      const wrapper = body.closest<HTMLElement>(".ds-think-content-wrapper");
      if (wrapper && !wrapper.querySelector(".ds-markdown,.ds-assistant-message-main-content,button,[role=button],summary")) body = wrapper;
      if (body.querySelector(".ds-markdown,.ds-assistant-message-main-content") || seen.has(body)) continue;
      seen.add(body);
      const row = nativeMessageRow(body) ?? body;
      if (isUserMessage(row)) continue;
      const state = this.state(row), existing = this.records.get(body);
      if (existing) {
        this.label(existing);
        if (!existing.control) {
          const control = this.heading(body, row);
          if (control) { this.restoreDisplay(existing); existing.control = control; existing.fallback?.remove(); delete existing.fallback; }
        }
      }
      if (state.manual) continue;
      if (!this.visible(body)) continue;
      const record = existing ?? { body, state, control: this.heading(body, row) };
      this.records.set(body, record);
      if (record.control && record.control.getAttribute("aria-expanded") !== "false") {
        this.nativeToggle(record, false); this.closed.set(record.control, record);
      }
      if (!this.visible(body)) continue;
      this.fold(record);
      if (!record.control && !record.fallback) {
        const button = this.doc.createElement("button"); button.type = "button"; button.dataset.deeproleReasoningToggle = "true";
        button.style.cssText = "display:block;margin:8px 0;padding:6px 0;border:0;background:transparent;color:var(--dr-muted,#9baab8);font:inherit;cursor:pointer;text-align:start";
        body.before(button); record.fallback = button;
      }
      this.label(record);
    }
  }

  private onClick = (event: MouseEvent): void => {
    if (this.show || this.automatic || !(event.target instanceof Element)) return;
    const target = event.target;
    const record = [...this.records.values(), ...this.closed.values()].find(value => value.fallback?.contains(target) || value.control?.contains(target));
    if (record) {
      record.state.manual = true;
      if (record.fallback) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (this.visible(record.body)) this.fold(record); else this.restoreDisplay(record);
        this.label(record); return;
      }
      if (record.display) {
        this.restoreDisplay(record);
        // A non-native fallback hid an otherwise open panel. Revealing it
        // must not send the same click on to the site's "close" handler.
        if (record.control?.getAttribute("aria-expanded") !== "false" && this.visible(record.body)) { event.preventDefault(); event.stopImmediatePropagation(); }
      }
      return;
    }
    // A virtual list may replace a collapsed header before its body returns.
    const row = nativeMessageRow(target as HTMLElement), control = target.closest<HTMLElement>("button,[role=button],summary");
    if (row && control && !control.closest(BODY) && isHeading(control.textContent?.trim() || control.getAttribute("aria-label") || "")) this.state(row).manual = true;
  };

  dispose(): void {
    this.observer?.disconnect(); this.observer = null;
    this.doc.removeEventListener("click", this.onClick, true);
    this.restore(true); this.states.clear(); this.anonymous = new WeakMap();
  }
}
