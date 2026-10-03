import type { AdapterStatus, DeepSeekAdapter } from "../core/types";
import { estimateTokens } from "../core/text";

const COMPOSER_SELECTORS = [
  "textarea:not([disabled])",
  "[contenteditable='true'][role='textbox']",
  "[contenteditable='true']",
];

const MESSAGE_SELECTORS = [
  "[data-message-id]",
  "[data-testid*='message']",
  "[class*='message']",
];

const ATTACHMENT_LABEL = /attach(?:ment)?|paperclip|upload(?:\s+(?:a\s+)?(?:file|image))?|add\s+(?:a\s+)?(?:file|image)|select\s+file|прикреп|вложен|загрузить\s+файл|добавить\s+файл|выбрать\s+файл|附件|上传文件/i;

export class DeepSeekDomAdapter implements DeepSeekAdapter {
  getChatId(): string | null {
    const match = location.pathname.match(/\/chat\/s\/([^/?#]+)/i)
      ?? location.pathname.match(/\/chat\/([^/?#]+)/i);
    return match?.[1] ?? null;
  }

  getDraft(): string {
    const composer = this.findComposer();
    if (!composer) return "";
    return composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement
      ? composer.value
      : composer.textContent ?? "";
  }

  getRecentMessages(limit: number, includeServiceTurns = false): string[] {
    const values: { element: HTMLElement; text: string }[] = [];
    const seen = new Set<string>();
    const identifiedTurns: HTMLElement[] = [];
    for (const selector of MESSAGE_SELECTORS) {
      for (const element of document.querySelectorAll<HTMLElement>(selector)) {
        if (element.closest("deeprole-page-widget")) continue;
        const text = (element.innerText || (element.querySelector("[data-deeprole-choices-payload]") ? "" : element.textContent) || "").trim();
        const serviceTurn = Boolean(element.closest("[data-deeprole-service-reply='true']"))
          || text.startsWith("[DeepRole Service]")
          || text.includes("<deeprole_data>");
        if (serviceTurn && !includeServiceTurns) continue;
        const identified = selector === "[data-message-id]";
        if (text.length < (identified ? 1 : 2) || text.length > (includeServiceTurns ? 200_000 : 30_000)) continue;
        if (identifiedTurns.some((turn) => turn.contains(element) || element.contains(turn))) continue;
        // Identified turns can legitimately have identical text ("continue", "?").
        // Text deduplication is only a fallback for ambiguous CSS-only elements.
        if (!identified && seen.has(text)) continue;
        if (!isVisible(element) && !(includeServiceTurns && (identified || serviceTurn))) continue;
        if (identified) identifiedTurns.push(element);
        seen.add(text);
        values.push({ element, text });
      }
      if (values.length >= limit) break;
    }
    values.sort((a, b) => a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    return values.slice(-limit).map(({ text }) => text);
  }

  getMessageCount(): number {
    return this.getRecentMessages(500).length;
  }

  getConversationEstimate(limit = 500) {
    const messages = this.getRecentMessages(limit, true);
    return { estimatedTokens: estimateTokens(messages.join("\n\n")), messageCount: messages.length, atLeast: messages.length >= limit };
  }

  isGenerating(): boolean {
    return [...document.querySelectorAll<HTMLElement>("[data-testid='stop-generation'], :is(button,[role='button'])[aria-label*='Stop' i], :is(button,[role='button'])[aria-label*='停止'], :is(button,[role='button'])[aria-label*='Останов' i], :is(button,[role='button'])[title*='Stop' i]")]
      .some((control) => isVisible(control) && !control.matches(":disabled") && control.getAttribute("aria-disabled") !== "true" && !/disabled/i.test(control.className));
  }

  setDraft(value: string): boolean {
    const composer = this.findComposer();
    if (!composer) return false;
    composer.focus();
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      const prototype = composer instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      setter?.call(composer, value);
    } else {
      composer.textContent = value;
    }
    composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    composer.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  submitDraft(): boolean {
    const composer = this.findComposer();
    if (!composer) return false;
    const form = composer.closest("form");
    const sendButton = form?.querySelector<HTMLElement>("button[type='submit']:not([disabled])")
      ?? findSendButton(composer);
    if (sendButton) {
      sendButton.click();
      return true;
    }
    return false;
  }

  getStatus(): AdapterStatus {
    const composer = this.findComposer();
    const authenticationPage = this.isAuthenticationPage();
    return {
      compatible: Boolean(composer) && !authenticationPage,
      chatId: this.getChatId(),
      reason: authenticationPage ? "authentication-page" : composer ? undefined : "composer-not-found",
      checkedAt: Date.now(),
    };
  }

  isAuthenticationPage(): boolean {
    if (/\/(?:auth|login|log[-_]?in|sign[-_]?in|signin|register|sign[-_]?up|signup)(?:\/|$)/i.test(location.pathname)) return true;

    const authWords = /sign[\s-]?in|log[\s-]?in|sign[\s-]?up|register|verification code|one[- ]time code|continue with (?:email|google)|email address|phone number|登录|注册|验证码/i;
    const surfaces = [...document.querySelectorAll<HTMLElement>("form, [role='dialog'], [class*='login' i], [class*='auth' i]")]
      .filter(isVisible);
    return surfaces.some((surface) => {
      const text = (surface.innerText || surface.textContent || "").trim();
      if (!authWords.test(text)) return false;
      const fields = [...surface.querySelectorAll<HTMLInputElement>("input:not([type='hidden'])")].filter(isVisible);
      const controls = [...surface.querySelectorAll<HTMLElement>("button, [role='button']")].filter(isVisible);
      return fields.some((field) => !["submit", "button", "checkbox", "radio"].includes(field.type)) || controls.length > 0;
    });
  }

  getChatTitleAnchor(): { x: number; y: number } | null {
    const composer = this.findComposer();
    const composerRect = composer?.getBoundingClientRect();
    if (!composerRect) return null;

    const minimumLeft = Math.max(56, composerRect.left * 0.15);
    const matchesTitle = (element: HTMLElement) => {
        if (element.closest("deeprole-page-widget") || !isVisible(element)) return false;
        const rect = element.getBoundingClientRect();
        const text = (element.innerText || element.textContent || "").trim();
        if (!text || text.includes("\n") || text.length > 80) return false;
        if (/deepseek|новый чат|new chat|умный поиск|глубокое мышление/i.test(text)) return false;
        return rect.top >= 4 && rect.top < 92 && rect.left >= minimumLeft && rect.left < composerRect.left && rect.height <= 48 && rect.width <= 520;
    };
    let candidates = [...document.body.querySelectorAll<HTMLElement>("h1, h2, h3, header span, header div, [data-testid*='title'], [class*='title']")]
      .filter(matchesTitle);
    if (candidates.length === 0) {
      candidates = [...document.body.querySelectorAll<HTMLElement>("div, span")]
        .filter((element) => element.childElementCount <= 2 && matchesTitle(element));
    }
    candidates.sort((a, b) => titleCandidateScore(a, minimumLeft) - titleCandidateScore(b, minimumLeft));

    const title = candidates[0];
    if (!title) return null;
    const rect = title.getBoundingClientRect();
    return {
      x: Math.max(10, Math.round(rect.left)),
      y: Math.max(48, Math.round(rect.bottom + 8)),
    };
  }

  getComposerAttachmentActionPosition(): { x: number; y: number } | null {
    const composer = this.findComposer();
    if (!composer) return null;

    const controls = new Set<HTMLElement>();
    for (let container = composer.parentElement, depth = 0; container && depth < 8; container = container.parentElement, depth += 1) {
      for (const control of container.querySelectorAll<HTMLElement>("button, [role='button'], label")) {
        if (!control.closest("deeprole-page-widget") && isVisible(control)) controls.add(control);
      }
      if (container instanceof HTMLFormElement) break;
    }

    let attachment = [...controls]
      .map((control) => {
        const metadata = [control.getAttribute("aria-label"), control.title, control.getAttribute("data-testid"), control.className, control.innerText]
          .filter((value): value is string => typeof value === "string")
          .join(" ");
        const hasFileInput = Boolean(control.querySelector("input[type='file']"));
        return { control, score: (hasFileInput ? 100 : 0) + (ATTACHMENT_LABEL.test(metadata) ? 50 : 0) };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.control.getBoundingClientRect().right - a.control.getBoundingClientRect().right)[0]?.control;

    // Some DeepSeek builds render the paperclip as an unlabeled icon button.
    // In that case, use the icon-only control immediately before Send in the composer row.
    if (!attachment) {
      // DeepSeek disables Send whenever the composer is empty (including right
      // after our hidden service prompt is submitted). It is still the stable
      // landmark needed to keep the adjacent DeepRole action in place.
      const sendButton = findSendButton(composer, true);
      const sendRect = sendButton?.getBoundingClientRect();
      if (sendButton && sendRect) {
        attachment = [...controls]
          .filter((control) => control !== sendButton && control.querySelector("svg") && !control.innerText.trim())
          .map((control) => ({ control, rect: control.getBoundingClientRect() }))
          .filter(({ rect }) => rect.width >= 14 && rect.width <= 80 && rect.height >= 14 && rect.height <= 80 && rect.right <= sendRect.left + 2 && sendRect.left - rect.right <= 56 && Math.abs(rect.top + rect.height / 2 - sendRect.top - sendRect.height / 2) <= 14)
          .sort((a, b) => b.rect.right - a.rect.right)[0]?.control;
      }
    }
    if (!attachment) return null;

    const rect = attachment.getBoundingClientRect();
    if (rect.width < 14 || rect.height < 14 || rect.width > 80 || rect.height > 80) return null;
    const size = 32;
    const gap = 4;
    const y = Math.round(rect.top + (rect.height - size) / 2);
    const related = (other: HTMLElement) => other === attachment || other.contains(attachment) || attachment.contains(other);
    for (const x of [Math.round(rect.left - size - gap), Math.round(rect.right + gap)]) {
      if (x < 8 || x + size > window.innerWidth - 8 || y < 8 || y + size > window.innerHeight - 8) continue;
      const overlaps = [...controls].some((other) => {
        if (related(other)) return false;
        const otherRect = other.getBoundingClientRect();
        return x < otherRect.right && x + size > otherRect.left && y < otherRect.bottom && y + size > otherRect.top;
      });
      if (!overlaps) return { x, y };
    }
    return null;
  }

  findComposer(): HTMLElement | null {
    for (const selector of COMPOSER_SELECTORS) {
      const candidates = [...document.querySelectorAll<HTMLElement>(selector)]
        .filter((element) => !element.closest("deeprole-page-widget") && isVisible(element));
      if (candidates.length > 0) return candidates.at(-1) ?? null;
    }
    return null;
  }
}

function titleCandidateScore(element: HTMLElement, minimumLeft: number): number {
  const rect = element.getBoundingClientRect();
  const fontSize = Number.parseFloat(getComputedStyle(element).fontSize) || 0;
  return Math.abs(rect.top - 20) + Math.abs(rect.left - minimumLeft) * 0.04 - Math.min(fontSize, 20);
}

function findSendButton(composer: HTMLElement, includeDisabled = false): HTMLElement | null {
  let container: HTMLElement | null = composer.parentElement;
  for (let depth = 0; container && depth < 7; depth += 1, container = container.parentElement) {
    const controls = [...container.querySelectorAll<HTMLElement>(includeDisabled ? "button, [role='button']" : "button:not([disabled]), [role='button']")]
      .filter((control) => isVisible(control) && (includeDisabled || (control.getAttribute("aria-disabled") !== "true" && !/disabled/i.test(control.className))));
    if (controls.length === 0) continue;

    const labelled = controls.find((control) => {
      const label = `${control.getAttribute("aria-label") ?? ""} ${control.title ?? ""}`.toLowerCase();
      return /send|submit|отправ|发送/.test(label);
    });
    if (labelled) return labelled;

    const primary = controls.findLast((control) => /primary|send/i.test(control.className));
    if (primary) return primary;
  }
  return null;
}

function isVisible(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
