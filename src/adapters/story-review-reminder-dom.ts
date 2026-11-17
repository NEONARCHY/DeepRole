import { canonicalNativeMessageIdentity, isUserMessage, nativeMessageIdentity, nativeMessageRows } from "./deepseek-message-dom";
import { navigationText } from "../core/navigation-i18n";
import { storyAutomationText } from "../core/story-automation-i18n";
import type { Locale } from "../core/types";
import designTokens from "../entrypoints/shared/design-tokens.css?raw";

const styles = `
  :host { display: block; min-width: 0; max-width: 100%; margin-block: 8px; }
  aside { box-sizing: border-box; color: var(--dr-muted); background: var(--dr-panel);
    border: 1px solid var(--dr-border-strong); border-inline-start: 2px solid var(--dr-primary);
    border-radius: 8px; padding: 8px 12px; font: .8125rem/1.5 system-ui, sans-serif;
    overflow-wrap: anywhere; }
  strong { color: var(--dr-text); font-weight: 600; }
`;

export class StoryReviewReminderPresenter {
  private host?: HTMLElement;
  private row?: HTMLElement;

  clear() {
    this.host?.remove();
    this.host = undefined;
    this.row = undefined;
  }

  sync(key: string | undefined, locale: Locale, generating: boolean, doc: Document = document) {
    if (!key) { this.clear(); return; }
    const nativeKey = canonicalNativeMessageIdentity(key);
    const rows = nativeMessageRows(doc);
    const row = rows.findLast(item => canonicalNativeMessageIdentity(nativeMessageIdentity(item) ?? "") === nativeKey && !isUserMessage(item));
    if (!row || row.hasAttribute("data-deeprole-service-reply") || generating && row === rows.at(-1)) { this.clear(); return; }
    if (this.row === row && this.host?.parentElement === row.parentElement && this.host?.lang === locale) return;

    this.clear();
    const host = doc.createElement("div");
    host.dataset.deeproleReviewReminder = "true";
    host.lang = locale;
    const shadow = host.attachShadow({ mode: "open" });
    const style = doc.createElement("style");
    style.textContent = designTokens + styles;
    const note = doc.createElement("aside");
    note.setAttribute("role", "note");
    const text = locale === "ru" ? "Есть записи на проверку. " : "Some entries are waiting for review. ";
    const path = doc.createElement("strong");
    path.textContent = `DeepRole → ${navigationText(locale, "story")} → ${storyAutomationText(locale).inbox}`;
    note.append(text, path);
    shadow.append(style, note);
    row.after(host);
    this.host = host;
    this.row = row;
  }
}
