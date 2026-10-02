import { afterEach, describe, expect, it } from "vitest";
import { findDeepestServiceElements, findSafeServiceContainer, findServiceReplyRows, findServiceResponseElements, replaceServicePayloadWithSummary, restoreServiceTurns } from "../src/adapters/deepseek-service-dom";
import { SERVICE_PREFIX } from "../src/core/service-protocol";

describe("DeepSeek service message isolation", () => {
  afterEach(() => { document.body.innerHTML = ""; });

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
