import { parseServiceData, SERVICE_START } from "../core/service-protocol";

export function findDeepestServiceElements(marker: string, root: ParentNode = document): HTMLElement[] {
  const selector = "article, [data-message-id], [data-testid*='message'], div";
  const elements = [...root.querySelectorAll<HTMLElement>(selector)];
  if (root instanceof HTMLElement && root.matches(selector)) elements.unshift(root);
  const matches = elements
    .filter((element) => (element.innerText || element.textContent || "").includes(marker));
  return matches.filter((element) => !matches.some((other) => other !== element && element.contains(other)));
}

/** Read only the reply belonging to this request, even after DOM replacement. */
export function findServiceResponseElements(requestId: string, root: ParentNode = document): HTMLElement[] {
  return findServiceReplyRows(requestId, root)
    .flatMap((row) => findDeepestServiceElements("<deeprole_data>", row));
}

/** Find the assistant turn paired with a request, even when it returned an error instead of data. */
export function findServiceReplyRows(requestId: string, root: ParentNode = document): HTMLElement[] {
  return serviceTurns(root).filter((turn) => turn.requestId === requestId && turn.response).map((turn) => turn.response!);
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

export function markServiceReplyRow(element: HTMLElement, requestId?: string): void {
  const row = element.closest<HTMLElement>("[data-message-id], article, [data-testid*='message']") ?? element;
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

function serviceTurns(root: ParentNode): { request: HTMLElement; response?: HTMLElement; requestId?: string }[] {
  const requests = findDeepestServiceElements("[DeepRole Service]", root).flatMap((element) => {
    const text = (element.innerText || element.textContent || "").trim();
    if (!text.startsWith("[DeepRole Service]")) return [];
    const request = findServiceRow(element);
    const requestId = text.match(/^\[DeepRole Service\]\s*\[Request ID: ([\w-]{1,120})\](?:\s|$)/)?.[1];
    return [{ request, requestId }];
  });
  const uniqueRequests = requests.filter((turn, index) => requests.findIndex((other) => other.request === turn.request) === index);
  uniqueRequests.sort((a, b) => follows(a.request, b.request) ? -1 : follows(b.request, a.request) ? 1 : 0);
  const payloadRows = findDeepestServiceElements(SERVICE_START, root).map((element) => {
    const row = findServiceRow(element);
    return { row, valid: Boolean(parseServiceData(row.innerText || row.textContent || "")) };
  }).filter((item, index, all) => item.valid && all.findIndex((other) => other.row === item.row) === index);

  return uniqueRequests.map((turn, index) => {
    const nextRequest = uniqueRequests[index + 1]?.request;
    // DeepSeek can wrap the model reply in extra layout nodes, so it is not
    // always the service message's immediate DOM sibling. Correlate the
    // finished payload by document order and keep it inside this request's turn.
    const payload = payloadRows.find(({ row }) => row !== turn.request
      && !row.contains(turn.request) && !turn.request.contains(row)
      && follows(turn.request, row)
      && (!nextRequest || follows(row, nextRequest)));
    const next = turn.request.nextElementSibling;
    const adjacent = next instanceof HTMLElement && isTurnBoundary(next)
      && !(next.innerText || next.textContent || "").trim().startsWith("[DeepRole Service]") ? next : undefined;
    return { ...turn, response: payload?.row ?? adjacent };
  });
}

function follows(first: HTMLElement, second: HTMLElement): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

export function findSafeServiceContainer(element: HTMLElement): HTMLElement {
  let current: HTMLElement | null = element;
  for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
    if (isMessageLike(current) && isSafeContainer(current)) return current;
  }

  const parent = element.parentElement;
  if (parent && isSafeContainer(parent) && isComparableWrapper(element, parent)) return parent;
  return element;
}

function findServiceRow(element: HTMLElement): HTMLElement {
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
