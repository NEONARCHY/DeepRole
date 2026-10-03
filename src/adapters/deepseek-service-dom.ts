import { parseServiceData, SERVICE_END, SERVICE_START } from "../core/service-protocol";
import { nativeMessageRow, nativeMessageRows, nativeMessageIdentity, isUserMessage, REASONING } from "./deepseek-message-dom";

export function findDeepestServiceElements(marker: string, root: ParentNode = document): HTMLElement[] {
  const selector = "article, [data-message-id], [data-testid*='message'], div, p, pre, code, span";
  const elements = [...root.querySelectorAll<HTMLElement>(selector)];
  if (root instanceof HTMLElement && root.matches(selector)) elements.unshift(root);
  const matches = elements
    .filter((element) => (element.textContent || "").includes(marker));
  return matches.filter((element) => !matches.some((other) => other !== element && element.contains(other)));
}

/** Read only the reply belonging to this request, even after DOM replacement. */
export function findServiceResponseElements(requestId: string, root: ParentNode = document, replyIdentity?: string): HTMLElement[] {
  return findServiceReplyRows(requestId, root, SERVICE_START, replyIdentity)
    .flatMap((row) => {
      // DeepSeek renders the opening marker, JSON and closing marker in separate
      // spans. The deepest match can be just the opening tag, not the payload.
      const final = [...row.querySelectorAll<HTMLElement>(".ds-assistant-message-main-content")];
      return (final.length ? final : [row]).flatMap(scope => findDeepestServiceElements(SERVICE_START, scope)
        .filter(element => !element.closest(REASONING))
        .map(element => {
          for (let current: HTMLElement | null = element; current && row.contains(current); current = current.parentElement) {
            const text = current.textContent ?? "";
            if (text.indexOf(SERVICE_END, text.indexOf(SERVICE_START) + SERVICE_START.length) >= 0) return current;
            if (current === scope || current === row) break;
          }
          // While streaming, read the whole final-answer scope. The opener
          // alone cannot include JSON added in a later paragraph.
          return scope;
        }));
    })
    .filter((element, index, all) => all.indexOf(element) === index && !all.some(other => other !== element && other.contains(element)));
}

/** Find the assistant turn paired with a request, even when it returned an error instead of data. */
export function findServiceReplyRows(requestId: string, root: ParentNode = document, marker = SERVICE_START, replyIdentity?: string): HTMLElement[] {
  const paired = serviceTurns(root, marker).filter(turn => turn.requestId === requestId && turn.response).map(turn => turn.response!);
  if (paired.length || !replyIdentity) return paired;
  // DeepSeek unmounts the preceding user request when a long answer scrolls it
  // out of the virtual list. Only a previously observed paired key is safe.
  return nativeMessageRows(root).filter(row => nativeMessageIdentity(row) === replyIdentity && !isUserMessage(row));
}

/** A reload restores DeepSeek's saved reply; suppress completed technical blocks again. */
export function replaceArchivedMemoryPayloads(summary: string, pendingId?: string): void {
  for (const turn of serviceTurns(document)) {
    if (!turn.requestId || turn.requestId === pendingId || !turn.response) continue;
    if (turn.response.querySelector('[data-deeprole-memory-card][data-deeprole-result]')) continue;
    for (const payload of findServiceResponseElements(turn.requestId)) {
      if (parseServiceData(payload.textContent || "")?.type === "memory-suggestions") presentMemoryAnalysis(turn.requestId, summary, summary);
    }
  }
}

/** Replace only the machine-readable payload, preserving any visible explanation around it. */
export function replaceServicePayloadWithSummary(element: HTMLElement, summary: string): boolean {
  const text = element.textContent || "";
  const start = text.indexOf(SERVICE_START);
  const end = text.indexOf("</deeprole_data>", start + SERVICE_START.length);
  if (start < 0 || end < start) return false;
  // DeepSeek may render the explanation and JSON in one Markdown container.
  // Replacing the container's text destroys its paragraphs, links and formatting.
  // Change only the payload's text range, including markers split across nodes.
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const stop = end + "</deeprole_data>".length;
  const range = element.ownerDocument.createRange();
  let offset = 0;
  let foundStart = false;
  let foundEnd = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (!foundStart && start < offset + length) {
      range.setStart(node, start - offset);
      foundStart = true;
    }
    if (foundStart && stop <= offset + length) {
      range.setEnd(node, stop - offset);
      foundEnd = true;
      break;
    }
    offset += length;
  }
  if (!foundStart || !foundEnd) return false;
  const status = element.ownerDocument.createElement("span");
  status.dataset.deeproleResult = "true";
  status.style.display = "block";
  status.style.marginBlock = "0.75em";
  status.textContent = summary;
  range.deleteContents();
  range.insertNode(status);
  markServiceReplyRow(element);
  return true;
}

export function showServicePreloader(requestId: string, row: HTMLElement, payload: HTMLElement, label: string): void {
  if (payload !== row && !row.contains(payload)) return;
  memoryPresentationStyle(row.ownerDocument);
  row.dataset.deeproleMemoryPresentation = requestId;
  // Preserve native text nodes: React can continue streaming/replacing them,
  // and parsing always reads the original reply rather than our status text.
  for (const node of [...row.childNodes]) {
    if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
    const wrapper = row.ownerDocument.createElement("span");
    node.before(wrapper); wrapper.append(node);
  }
  const cards = [...row.ownerDocument.querySelectorAll<HTMLElement>("[data-deeprole-memory-card], [data-deeprole-service-preloader]")]
    .filter(element => element.dataset.deeproleMemoryCard === requestId || element.dataset.deeproleServicePreloader === requestId);
  const existing = cards.find(element => element.parentElement === row);
  cards.filter(element => element !== existing).forEach(element => element.remove());
  if (existing) { existing.dataset.deeproleMemoryCard = requestId; return; }

  const card = row.ownerDocument.createElement("div");
  card.dataset.deeproleServicePreloader = requestId;
  card.dataset.deeproleMemoryCard = requestId;
  card.setAttribute("role", "status");
  card.setAttribute("aria-live", "polite");
  card.setAttribute("aria-busy", "true");
  card.style.cssText = "display:flex;align-items:center;gap:10px;width:max-content;max-width:100%;box-sizing:border-box;margin:14px 0 8px;padding:11px 14px;border:1px solid #414146;border-radius:12px;background:#212122;color:#f0f0f2;font:500 13px/1.4 system-ui,sans-serif;";
  const spinner = row.ownerDocument.createElement("span");
  spinner.setAttribute("aria-hidden", "true");
  spinner.style.cssText = "display:inline-block;width:16px;height:16px;flex:0 0 16px;box-sizing:border-box;border:2px solid #414146;border-top-color:#9aaeff;border-radius:50%;";
  try {
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) spinner.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { duration: 850, iterations: Infinity });
  } catch { /* The status remains readable if Web Animations are unavailable. */ }
  const text = row.ownerDocument.createElement("span");
  text.textContent = label;
  card.append(spinner, text);
  row.append(card);
}

function memoryPresentationStyle(doc: Document): void {
  if (doc.querySelector("style[data-deeprole-memory-style]")) return;
  const style = doc.createElement("style"); style.dataset.deeproleMemoryStyle = "true";
  style.textContent = "[data-deeprole-memory-presentation]>:not([data-deeprole-memory-card]){display:none!important}[data-deeprole-memory-request]{display:none!important}";
  doc.head.append(style);
}

/** One plaque for an explicit analysis, including before the first response byte. */
export function presentMemoryAnalysis(requestId: string, label: string, summary?: string, root: ParentNode = document, replyIdentity?: string): void {
  const turn = serviceTurns(root).find(turn => turn.requestId === requestId);
  const row = turn?.response ?? findServiceReplyRows(requestId, root, SERVICE_START, replyIdentity)[0] ?? turn?.request;
  if (!row) return;
  if (turn?.response) turn.request.dataset.deeproleMemoryRequest = requestId;
  showServicePreloader(requestId, row, row, label);
  if (summary !== undefined) finishServicePreloader(requestId, [row], summary);
}

/** Ignore all extension feedback when assessing whether the native reply stopped changing. */
export function serviceReplyText(row: HTMLElement): string {
  const walker = row.ownerDocument.createTreeWalker(row, NodeFilter.SHOW_TEXT, {
    acceptNode: node => node.parentElement?.closest(`${REASONING}, [data-deeprole-memory-card], [data-deeprole-service-preloader], [data-deeprole-result]`) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  let text = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode()) text += node.textContent ?? "";
  return text.trim();
}

export function removeServicePreloader(requestId: string, rows: HTMLElement[]): void {
  for (const row of rows) {
    const nodes = [row, ...row.querySelectorAll<HTMLElement>("*")];
    for (const node of nodes) {
      if (node.dataset.deeproleServicePreloader === requestId) {
        node.querySelectorAll<HTMLElement>("span").forEach((child) => child.getAnimations?.().forEach((animation) => animation.cancel()));
        node.remove();
      }
      if (node.dataset.deeproleMemoryPresentation === requestId) delete node.dataset.deeproleMemoryPresentation;
      if (node.dataset.deeproleMemoryRequest === requestId) delete node.dataset.deeproleMemoryRequest;
      if (node.dataset.deeprolePayloadHiddenFor !== requestId) continue;
      const display = node.dataset.deeprolePayloadDisplay ?? "";
      const priority = node.dataset.deeprolePayloadPriority ?? "";
      if (display) node.style.setProperty("display", display, priority);
      else node.style.removeProperty("display");
      delete node.dataset.deeprolePayloadHiddenFor;
      delete node.dataset.deeprolePayloadDisplay;
      delete node.dataset.deeprolePayloadPriority;
    }
  }
}

/** Keep the machine block hidden if DeepSeek replaced its DOM during saving. */
export function finishServicePreloader(requestId: string, rows: HTMLElement[], summary: string): void {
  for (const row of rows) {
    const card = [...row.querySelectorAll<HTMLElement>("[data-deeprole-memory-card]")]
      .find((node) => node.dataset.deeproleMemoryCard === requestId);
    if (!card) continue;
    if (card.dataset.deeproleResult && card.textContent === summary) continue;
    card.querySelectorAll<HTMLElement>("span").forEach((child) => child.getAnimations?.().forEach((animation) => animation.cancel()));
    card.replaceChildren(summary);
    card.dataset.deeproleResult = "true";
    delete card.dataset.deeproleServicePreloader;
    card.setAttribute("aria-busy", "false");
  }
}

export function markServiceReplyRow(element: HTMLElement, requestId?: string): void {
  const row = findServiceRow(element);
  row.dataset.deeproleServiceReply = "true";
  if (requestId) row.dataset.deeproleServiceReplyId = requestId;
}

/** Restore turns hidden by older DeepRole versions so an extension update does not leave chats blank. */
export function restoreServiceTurns(root: ParentNode = document): void {
  for (const element of root.querySelectorAll<HTMLElement>("[data-deeprole-hidden-service='true']")) {
    element.style.removeProperty("display");
    delete element.dataset.deeproleHiddenService;
  }
}

function serviceTurns(root: ParentNode, marker = SERVICE_START): { request: HTMLElement; response?: HTMLElement; requestId?: string }[] {
  const requests = findDeepestServiceElements("[DeepRole Service]", root).flatMap((element) => {
    const text = (element.textContent || "").trim();
    if (!text.startsWith("[DeepRole Service]")) return [];
    const request = findServiceRow(element);
    const requestId = text.match(/^\[DeepRole Service\]\s*\[Request ID: ([\w-]{1,120})\](?:\s|$)/)?.[1];
    return [{ request, requestId }];
  });
  const uniqueRequests = requests.filter((turn, index) => requests.findIndex((other) => other.request === turn.request) === index);
  uniqueRequests.sort((a, b) => follows(a.request, b.request) ? -1 : follows(b.request, a.request) ? 1 : 0);
  const payloadRows = findDeepestServiceElements(marker, root).filter(element => !element.closest(REASONING) && !isUserMessage(element)).map((element) => {
    const row = findServiceRow(element);
    return { row };
  }).filter((item, index, all) => all.findIndex((other) => other.row === item.row) === index);

  return uniqueRequests.map((turn, index) => {
    const nextRequest = uniqueRequests[index + 1]?.request;
    const nativeNext = nativeMessageRows(root).find(row => follows(turn.request, row) && !row.contains(turn.request));
    // DeepSeek can wrap the model reply in extra layout nodes, so it is not
    // always the service message's immediate DOM sibling. Correlate even a
    // partial payload so the JSON is hidden while it is still streaming.
    const payload = payloadRows.find(({ row }) => row !== turn.request
      && !row.contains(turn.request) && !turn.request.contains(row)
      && follows(turn.request, row)
      && (!nativeNext || row === nativeNext || nativeNext.contains(row))
      && (!nextRequest || follows(row, nextRequest)));
    const next = turn.request.nextElementSibling;
    const adjacent = next instanceof HTMLElement && isTurnBoundary(next)
      && !isUserMessage(next)
      && !(next.innerText || next.textContent || "").trim().startsWith("[DeepRole Service]") ? next : undefined;
    return { ...turn, response: payload?.row ?? (nativeNext && !isUserMessage(nativeNext)
      && !(nativeNext.textContent ?? "").trim().startsWith("[DeepRole Service]") ? nativeNext : adjacent) };
  });
}

function follows(first: HTMLElement, second: HTMLElement): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

export function findSafeServiceContainer(element: HTMLElement): HTMLElement {
  const native = nativeMessageRow(element);
  if (native) return native;
  let current: HTMLElement | null = element;
  for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
    if (isMessageLike(current) && isSafeContainer(current)) return current;
  }

  const parent = element.parentElement;
  if (parent && isSafeContainer(parent) && isComparableWrapper(element, parent)) return parent;
  return element;
}

function findServiceRow(element: HTMLElement): HTMLElement {
  const native = nativeMessageRow(element);
  if (native) return native;
  const explicitRow = element.closest<HTMLElement>("article, [data-message-id], [data-testid*='message']");
  if (explicitRow && isTurnBoundary(explicitRow)
    && explicitRow.querySelectorAll("article, [data-message-id], [data-testid*='message']").length === 0) return explicitRow;
  let row = findSafeServiceContainer(element);
  for (let depth = 0; depth < 6; depth += 1) {
    const parent = row.parentElement;
    if (!parent || !isTurnBoundary(parent)) break;
    if (isMessageLike(row)) break;
    // Stop before a conversation list containing other messages, including an
    // empty assistant placeholder. Only transparent single-child wrappers ascend.
    if (parent.children.length !== 1) break;
    row = parent;
  }
  return row;
}

function isTurnBoundary(element: HTMLElement): boolean {
  return !element.matches("html, body, main, form, header, nav, aside, textarea, input, button")
    && !element.querySelector("textarea, input, [contenteditable='true'], form, header, nav, aside")
    && (isMessageLike(element) || element.tagName === "DIV" || element.tagName === "SECTION");
}

function isMessageLike(element: HTMLElement): boolean {
  return element.tagName === "ARTICLE"
    || element.hasAttribute("data-message-id")
    || /message/i.test(element.getAttribute("data-testid") ?? "")
    || /message|bubble/i.test(element.className);
}

function isSafeContainer(element: HTMLElement): boolean {
  if (element.matches("body, main") || element.querySelector("textarea, [contenteditable='true']")) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return true;
  return rect.width < window.innerWidth * 0.9 && rect.height < window.innerHeight * 0.7;
}

function isComparableWrapper(element: HTMLElement, parent: HTMLElement): boolean {
  const elementRect = element.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  if (elementRect.width === 0 && parentRect.width === 0) return true;
  return parentRect.width <= elementRect.width + 180 && parentRect.height <= elementRect.height + 120;
}
