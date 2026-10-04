import { afterEach, describe, expect, it } from "vitest";
import { DeepSeekDomAdapter } from "../src/adapters/deepseek-dom";

function setRect(element: HTMLElement, x: number, y: number, width: number, height: number) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => new DOMRect(x, y, width, height),
  });
}

describe("DeepSeek composer controls", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("keeps the composer action position when Send is disabled because the draft is empty", () => {
    document.body.innerHTML = `<form>
      <textarea></textarea>
      <div id="attachment" role="button" class="ds-button ds-button--icon"><svg></svg></div>
      <div id="send" role="button" class="ds-button ds-button--primary ds-button--disabled"><svg></svg></div>
    </form>`;
    const composer = document.querySelector("textarea")!;
    const attachment = document.querySelector<HTMLElement>("#attachment")!;
    const send = document.querySelector<HTMLElement>("#send")!;
    for (const control of [attachment, send]) Object.defineProperty(control, "innerText", { configurable: true, value: "" });
    setRect(composer, 100, 100, 500, 54);
    setRect(attachment, 550, 110, 34, 34);
    setRect(send, 594, 110, 34, 34);

    expect(new DeepSeekDomAdapter().getComposerAttachmentActionPosition()).toEqual({ x: 514, y: 111 });
  });

  it("does not mistake a hidden or disabled stop control for active generation", () => {
    document.body.innerHTML = `<button aria-label="Stop generating" style="display:none"></button>`;
    const adapter = new DeepSeekDomAdapter();
    expect(adapter.isGenerating()).toBe(false);

    const stop = document.createElement("button");
    stop.setAttribute("aria-label", "Stop generating");
    document.body.append(stop);
    setRect(stop, 20, 20, 32, 32);
    expect(adapter.isGenerating()).toBe(true);

    stop.className = "ds-button--disabled";
    expect(adapter.isGenerating()).toBe(false);
  });

  it("recognizes DeepSeek's unlabelled square stop button during thinking", () => {
    document.body.innerHTML = `<form><textarea></textarea><button id="stop"><svg><rect x="3" y="3" width="10" height="10" /></svg></button></form>`;
    const composer = document.querySelector("textarea")!;
    const stop = document.querySelector<HTMLElement>("#stop")!;
    setRect(composer, 100, 100, 500, 54); setRect(stop, 570, 110, 34, 34);
    const adapter = new DeepSeekDomAdapter();
    expect(adapter.isGenerating()).toBe(true);
    stop.innerHTML = `<svg><path d="M2 8L14 8" /></svg>`;
    expect(adapter.isGenerating()).toBe(false);
    stop.innerHTML = `<svg><path d="M2 4.88C2 3.68009 2 3.08013 2.30557 2.65954Z" fill="currentColor" /></svg>`;
    expect(adapter.isGenerating()).toBe(true);
  });
});
