import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { concealChoicePayloads } from "../src/adapters/deepseek-choices-dom";
import { foldCharacterPayload } from "../src/adapters/deepseek-characters-dom";

it.each(["choices", "characters"] as const)("keeps React's native elements while it replaces %s transport", kind => {
  const host = document.createElement("main");
  document.body.append(host);
  const errors: unknown[] = [];
  const root = createRoot(host, { onUncaughtError: error => errors.push(error) });
  const scene = (streaming: boolean) => createElement("article", { "data-role": "assistant" },
    createElement("div", { className: "ds-markdown" },
      createElement("p", { key: "story" }, "Лада положила компас в ящик."),
      streaming && createElement("span", { key: "open" }, `<deeprole_${kind}>`),
      streaming && createElement("code", { key: "stream" }, '{"version":1}'),
      streaming && createElement("span", { key: "close" }, `</deeprole_${kind}>`),
    ),
  );
  try {
    flushSync(() => root.render(scene(true)));
    const markdown = host.querySelector<HTMLElement>(".ds-markdown")!;
    const originalNodes = [...markdown.childNodes];
    const chunk = markdown.querySelector<HTMLElement>("code")!;
    const originalText = chunk.firstChild;
    if (kind === "characters") foldCharacterPayload(host.querySelector("article")!, "ru", "updated");
    else concealChoicePayloads(host);
    expect(originalNodes.every(node => node.parentNode === markdown)).toBe(true);
    expect(chunk.firstChild).toBe(originalText);
    expect(chunk.textContent).toBe('{"version":1}');
    expect(getComputedStyle(chunk).display).toBe("none");
    flushSync(() => root.render(scene(false)));
    concealChoicePayloads(host);
    expect(errors).toEqual([]);
    expect(markdown.textContent).toBe("Лада положила компас в ящик.");
    expect(markdown.querySelector("code,details")).toBeNull();
  } finally {
    flushSync(() => root.unmount());
    host.remove();
  }
});

it("keeps mixed React text intact and restores it when a new response reuses the paragraph", () => {
  const host = document.createElement("main");
  document.body.append(host);
  const root = createRoot(host);
  const scene = (text: string) => createElement("article", { "data-role": "assistant" },
    createElement("div", { className: "ds-markdown" },
      createElement("p", null, text, createElement("em", null, " Здесь безопасно.")),
    ),
  );
  const wire = 'Лада открыла ящик. <deeprole_choices>{"version":1}</deeprole_choices> Компас внутри.';
  try {
    flushSync(() => root.render(scene(wire)));
    const paragraph = host.querySelector("p")!;
    const originalText = paragraph.firstChild;
    const emphasis = paragraph.querySelector("em")!;
    concealChoicePayloads(host);
    const view = host.querySelector("[data-deeprole-payload-view]")!;
    expect(getComputedStyle(paragraph).display).toBe("none");
    expect(view.shadowRoot?.querySelector("p")?.textContent).toBe("Лада открыла ящик.  Компас внутри. Здесь безопасно.");
    expect(view.shadowRoot?.querySelector("em")?.textContent).toBe(" Здесь безопасно.");
    expect(paragraph.firstChild).toBe(originalText);
    expect(originalText?.nodeValue).toBe(wire);
    expect(emphasis.parentElement).toBe(paragraph);
    concealChoicePayloads(host);
    expect(host.querySelector("[data-deeprole-payload-view]")).toBe(view);
    flushSync(() => root.render(scene("Другой ход.")));
    concealChoicePayloads(host);
    expect(host.querySelector("[data-deeprole-payload-view]")).toBeNull();
    expect(getComputedStyle(paragraph).display).not.toBe("none");
    expect(paragraph.textContent).toBe("Другой ход. Здесь безопасно.");
  } finally {
    flushSync(() => root.unmount());
    host.remove();
  }
});

it("clears an earlier full-row presentation when Markdown appears inside the same native row", () => {
  const host = document.createElement("main");
  host.innerHTML = '<article data-role="assistant"></article>';
  document.body.append(host);
  try {
    const row = host.querySelector("article")!;
    row.textContent = "Scene. <deeprole_choices>{}";
    concealChoicePayloads(host);
    expect(getComputedStyle(row).display).toBe("none");
    row.innerHTML = '<div class="ds-markdown"><p>The story continues.</p><pre>&lt;deeprole_choices&gt;{}</pre></div>';
    concealChoicePayloads(host);
    expect(getComputedStyle(row).display).not.toBe("none");
    expect(host.querySelector("[data-deeprole-payload-view]")).toBeNull();
    expect(getComputedStyle(row.querySelector("pre")!).display).toBe("none");
  } finally {
    host.remove();
  }
});
