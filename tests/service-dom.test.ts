import { afterEach, describe, expect, it, vi } from "vitest";
import { findDeepestServiceElements, findSafeServiceContainer, findServiceReplyRows, findServiceResponseElements, findVirtualizedServiceReply, findVirtualizedServiceResponseElements, presentMemoryAnalysis, serviceReplyText, replaceServicePayloadWithSummary, restoreServiceTurns } from "../src/adapters/deepseek-service-dom";
import { SERVICE_PREFIX } from "../src/core/service-protocol";
import { nativeMessageIdentity } from "../src/adapters/deepseek-message-dom";

describe("DeepSeek service message isolation", () => {
  afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

  it("uses a single real turn for tall virtualized DeepSeek replies with paragraph-split JSON", () => {
    document.body.innerHTML = '<section><div data-virtual-list-item-key="1"><div class="ds-message" id="request"><div class="ds-collapsible-text"></div></div></div><div data-virtual-list-item-key="2"><div class="ds-message" id="answer"><div class="ds-think-content">Thinking</div><div class="ds-markdown ds-assistant-message-main-content" id="final"><p>Summary</p><p>&lt;deeprole_data&gt;</p><p>{"type":"memory-suggestions","items":[]}</p><p>&lt;/deeprole_data&gt;</p></div></div></div></section>';
    document.querySelector('.ds-collapsible-text')!.textContent = '[DeepRole Service]\n[Request ID: tall]\nAnalyze';
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 100, y: 0, width: 680, height: 1600, top: 0, left: 100, right: 780, bottom: 1600, toJSON() {} });
    const answer = document.getElementById('answer')!;
    expect(findServiceReplyRows('tall')).toEqual([answer]);
    expect(findSafeServiceContainer(document.querySelector('#final p')!)).toBe(answer);
    expect(findServiceResponseElements('tall')).toEqual([document.getElementById('final')]);
    presentMemoryAnalysis('tall', 'Preparing'); presentMemoryAnalysis('tall', 'Preparing');
    expect(document.querySelectorAll('[data-deeprole-service-preloader]')).toHaveLength(1);
    expect(serviceReplyText(answer)).toContain('"items":[]');
    expect(serviceReplyText(answer)).not.toContain('Preparing');
    expect(document.getElementById('request')!.dataset.deeproleMemoryRequest).toBe('tall');
    const identity = nativeMessageIdentity(answer);
    document.querySelector('[data-virtual-list-item-key="1"]')!.remove();
    expect(findServiceResponseElements('tall')).toEqual([]);
    expect(findServiceResponseElements('tall', document, identity)).toEqual([document.getElementById('final')]);
    presentMemoryAnalysis('tall', 'Preparing', 'Ready', document, identity);
    presentMemoryAnalysis('tall', 'Preparing', 'Ready', document, identity);
    expect(document.querySelectorAll('[data-deeprole-service-preloader]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-deeprole-memory-card]')).toHaveLength(1);
    expect(document.querySelector('[data-deeprole-memory-card]')!.getAttribute('aria-busy')).toBe('false');
  });

  it("recovers only a newer identified final reply after DeepSeek virtualizes the request", () => {
    document.body.innerHTML = '<section><article data-message-id="old">Previous scene</article><article data-message-id="reply"><div class="ds-assistant-message-main-content"><p>&lt;deeprole_data&gt;</p><p>{"type":"handoff","title":"Gate","summary":"Mira has the map."}</p><p>&lt;/deeprole_data&gt;</p></div></article></section>';
    const reply = findVirtualizedServiceReply("pending", JSON.stringify(["message", "old"]));
    expect(reply?.dataset.messageId).toBe("reply");
    expect(findVirtualizedServiceResponseElements(reply!)[0]?.textContent).toContain('"type":"handoff"');
    expect(findVirtualizedServiceReply("pending", JSON.stringify(["message", "reply"]))).toBeNull();
    const command = document.createElement("article"); command.textContent = "[DeepRole Service]\n[Request ID: pending]\nCreate state";
    document.querySelector("section")!.insertBefore(command, reply!);
    expect(findVirtualizedServiceReply("pending", JSON.stringify(["message", "old"]))).toBeNull();
  });

  it("moves the lone waiting card from the request to the empty response without modifying native content", () => {
    document.body.innerHTML = '<section><article id="request">[DeepRole Service]\n[Request ID: empty]\nAnalyze</article></section>';
    presentMemoryAnalysis('empty', 'Preparing');
    const requestText = serviceReplyText(document.getElementById('request')!);
    const reply = document.createElement('article'); document.querySelector('section')!.append(reply);
    presentMemoryAnalysis('empty', 'Preparing');
    expect(findServiceReplyRows('empty')).toEqual([reply]);
    expect(document.querySelectorAll('[data-deeprole-memory-card]')).toHaveLength(1);
    expect(reply.querySelector('[data-deeprole-memory-card]')).not.toBeNull();
    expect(serviceReplyText(reply)).toBe('');
    expect(serviceReplyText(document.getElementById('request')!)).toBe(requestText);
  });

  it("never pairs an unanswered service with an ordinary later user's quoted JSON", () => {
    document.body.innerHTML = '<section><div class="ds-message" id="request"><div class="ds-collapsible-text">[DeepRole Service]\n[Request ID: absent]\nAnalyze</div></div><div class="ds-message"><div class="ds-collapsible-text">Explain &lt;deeprole_data&gt;{"type":"memory-suggestions","items":[]}&lt;/deeprole_data&gt;</div></div></section>';
    expect(findServiceResponseElements('absent')).toEqual([]);
    expect(findServiceReplyRows('absent')).toEqual([]);
  });

  it("selects only the deepest technical text instead of the whole chat page", () => {
    document.body.innerHTML = `<main id="page"><section id="conversation"><article data-message-id="service"><div id="technical">${SERVICE_PREFIX} analyze</div></article><textarea /></section></main>`;
    const matches = findDeepestServiceElements(SERVICE_PREFIX);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.id).toBe("technical");
    expect(findSafeServiceContainer(matches[0]!)).toBe(document.querySelector("article"));
  });

  it("never chooses a page container that also owns the composer", () => {
    document.body.innerHTML = `<main id="page"><div id="technical">${SERVICE_PREFIX} analyze</div><textarea /></main>`;
    const match = findDeepestServiceElements(SERVICE_PREFIX)[0]!;
    expect(findSafeServiceContainer(match).id).toBe("technical");
  });

  it("leaves ordinary chat that quotes the response format untouched", () => {
    document.body.innerHTML = '<main><article data-message-id="ordinary"></article><textarea /></main>';
    const message = document.querySelector<HTMLElement>("article")!;
    message.textContent = 'What does <deeprole_data>{"type":"handoff"}</deeprole_data> mean?';
    expect(message.style.display).toBe("");
    expect(message.dataset.deeproleHiddenService).toBeUndefined();
  });

  it("keeps a visible service request and its response while replacing only the data payload", () => {
    document.body.innerHTML = '<main><section><article data-message-id="command">[DeepRole Service]\n[Request ID: service-visible]\nAnalyze the recent chat.</article><article data-message-id="answer"><div id="payload">Thinking…</div></article></section><textarea /></main>';
    const payload = document.getElementById("payload")!;
    payload.textContent = '<deeprole_data>{"type":"memory-suggestions","items":[]}</deeprole_data>';
    expect(findServiceResponseElements("service-visible")).toEqual([payload]);
    expect(findServiceReplyRows("service-visible")).toEqual([document.querySelector("[data-message-id='answer']")]);
    expect(replaceServicePayloadWithSummary(payload, "Suggestions are ready to review.")).toBe(true);
    expect(payload.textContent).toBe("Suggestions are ready to review.");
    expect(document.querySelector<HTMLElement>("[data-message-id='answer']")?.dataset.deeproleServiceReply).toBe("true");
    expect(document.querySelector<HTMLElement>("[data-message-id='command']")?.style.display).toBe("");
    expect(document.querySelector<HTMLElement>("[data-message-id='answer']")?.style.display).toBe("");
  });

  it("reads a complete DeepSeek Markdown payload whose markers are separate spans", () => {
    document.body.innerHTML = '<section><div class="ds-message" id="request"></div><div class="ds-message" id="answer"><div class="ds-markdown ds-assistant-message-main-content"><p id="explanation">Review before saving.</p><p id="payload"><span>&lt;deeprole_data&gt;</span>{"type":"memory-suggestions","items":[]}<span>&lt;/deeprole_data&gt;</span></p></div></div></section>';
    document.getElementById("request")!.textContent = '[DeepRole Service]\n[Request ID: markdown]\nAnalyze';
    expect(findServiceResponseElements("markdown")).toEqual([document.getElementById("payload")]);
    expect(replaceServicePayloadWithSummary(findServiceResponseElements("markdown")[0]!, "Ready to review.")).toBe(true);
    expect(document.getElementById("explanation")?.textContent).toBe("Review before saving.");
    expect(document.getElementById("answer")?.textContent).not.toContain("deeprole_data");
  });

  it("does not mistake the model's reasoning example for its final answer", () => {
    document.body.innerHTML = '<section><article id="request"></article><article id="answer"><div class="ds-think-content" id="reasoning"></div><div class="ds-assistant-message-main-content"><p id="payload"></p></div></article></section>';
    document.getElementById("request")!.textContent = '[DeepRole Service]\n[Request ID: final-only]\nAnalyze';
    document.getElementById("reasoning")!.textContent = 'Example: <deeprole_data>{"type":"memory-suggestions","items":[]}</deeprole_data>';
    document.getElementById("payload")!.textContent = '<deeprole_data>{"type":"memory-suggestions","items":[{"title":"Key","content":"The brass key belongs to Leon."}]}</deeprole_data>';
    expect(findServiceResponseElements("final-only")).toEqual([document.getElementById("payload")]);
    expect(document.getElementById("reasoning")?.style.display).toBe("");
  });

  it("restores service turns hidden by an older extension version", () => {
    document.body.innerHTML = '<article data-message-id="old" data-deeprole-hidden-service="true" style="display:none!important">Old reply</article>';
    restoreServiceTurns();
    expect(document.querySelector<HTMLElement>("article")?.style.display).toBe("");
    expect(document.querySelector<HTMLElement>("article")?.dataset.deeproleHiddenService).toBeUndefined();
  });

  it("preserves the model's paragraphs and controls around a split payload", () => {
    const answer = document.createElement("article");
    answer.innerHTML = '<p><strong>Two suggestions.</strong> Review before saving.</p><p><span>&lt;deeprole_</span><code>data&gt;{"items":[]}&lt;/deeprole_data&gt;</code></p><a href="#review">Review</a>';
    document.body.append(answer);
    const explanation = answer.querySelector("p");
    const link = answer.querySelector("a");
    expect(replaceServicePayloadWithSummary(answer, "Review in DeepRole.")).toBe(true);
    expect(answer.querySelector("p")).toBe(explanation);
    expect(answer.querySelector("strong")?.textContent).toBe("Two suggestions.");
    expect(answer.querySelector("a")).toBe(link);
    expect(answer.querySelector<HTMLElement>("[data-deeprole-result]")?.style.display).toBe("block");
    expect(answer.textContent).not.toContain("deeprole_data");
    expect(replaceServicePayloadWithSummary(answer, "Duplicate")).toBe(false);
  });

  it("selects only the adjacent reply of the matching request, including a direct row text", () => {
    document.body.innerHTML = '<main><section><article id="old-request"></article><article id="old-reply"></article><article id="current-request"><div id="current-text"></div></article><article id="current-reply"><div id="result"></div></article><article id="ordinary"></article></section><textarea /></main>';
    document.querySelector("#old-request")!.textContent = '[DeepRole Service]\n[Request ID: old]\nAnalyze';
    document.querySelector("#current-text")!.textContent = '[DeepRole Service]\n[Request ID: current]\nAnalyze';
    for (const id of ["old-reply", "result", "ordinary"]) document.getElementById(id)!.textContent = '<deeprole_data>{"type":"memory-suggestions","items":[]}</deeprole_data>';
    expect(findServiceResponseElements("old").map((element) => element.id)).toEqual(["old-reply"]);
    expect(findServiceResponseElements("current").map((element) => element.id)).toEqual(["result"]);
    expect(findServiceResponseElements("absent")).toEqual([]);
    expect((document.getElementById("ordinary") as HTMLElement).style.display).toBe("");
  });

  it("does not treat the next service request as the previous reply", () => {
    document.body.innerHTML = '<section><article id="first"></article><article id="second"></article><article id="reply"></article></section>';
    document.getElementById("first")!.textContent = '[DeepRole Service]\n[Request ID: first]\nAnalyze';
    document.getElementById("second")!.textContent = '[DeepRole Service]\n[Request ID: second]\nReturn <deeprole_data>';
    document.getElementById("reply")!.textContent = '<deeprole_data>{"type":"handoff"}</deeprole_data>';
    expect(findServiceResponseElements("first")).toEqual([]);
    expect(findServiceResponseElements("second").map((element) => element.id)).toEqual(["reply"]);
  });

  it("preserves an ordinary explanation quoting a service header", () => {
    document.body.innerHTML = '<article id="explanation"></article><article id="answer">This is an example.</article>';
    document.getElementById("explanation")!.textContent = 'This is a sample: [DeepRole Service]\n[Request ID: example]\nAnalyze';
    expect(findServiceResponseElements("example")).toEqual([]);
    expect((document.getElementById("explanation") as HTMLElement).style.display).toBe("");
    expect((document.getElementById("answer") as HTMLElement).style.display).toBe("");
  });
});
