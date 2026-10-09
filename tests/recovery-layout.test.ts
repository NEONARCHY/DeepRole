import { afterEach, expect, test, vi } from "vitest";
import { fitAdaptiveChoices } from "../src/adapters/adaptive-layout";

const rect = (left: number, width: number) => ({ x: left, y: 100, left, right: left + width, top: 100, bottom: 300, height: 200, width, toJSON() {} });
afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

for (const adaptive of ["true", "false"]) test(`suggestion card aligns to the illustration instead of centering, adaptive=${adaptive}`, () => {
  document.body.innerHTML = '<main style="padding-left:16px;border-left:1px solid"><article><div data-deeprole-illustrations></div></article><div data-deeprole-choices-recovery></div></main>';
  const parent = document.querySelector("main")!, image = document.querySelector<HTMLElement>("[data-deeprole-illustrations]")!, host = document.querySelector<HTMLElement>("[data-deeprole-choices-recovery]")!;
  host.dataset.deeproleAdaptive = adaptive;
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1000);
  vi.spyOn(parent, "getBoundingClientRect").mockReturnValue(rect(100, 750));
  const geometry = vi.spyOn(image, "getBoundingClientRect").mockReturnValue(rect(144, 600));
  fitAdaptiveChoices(host);
  expect(host.style.width).toBe("600px"); expect(host.style.marginLeft).toBe("27px"); expect(host.style.left).toBe("");
  geometry.mockReturnValue(rect(156, 480)); fitAdaptiveChoices(host);
  expect(host.style.width).toBe("480px"); expect(host.style.marginLeft).toBe("39px");
  if (adaptive === "false") {
    image.remove(); fitAdaptiveChoices(host);
    expect(host.style.width).toBe(""); expect(host.style.marginLeft).toBe("");
  }
});

test("suggestion card reads the actual illustration surface inside its shadow root", () => {
  document.body.innerHTML = '<main><article><div data-deeprole-illustrations></div></article><div data-deeprole-choices-recovery></div></main>';
  const parent = document.querySelector("main")!, image = document.querySelector<HTMLElement>("[data-deeprole-illustrations]")!, host = document.querySelector<HTMLElement>("[data-deeprole-choices-recovery]")!;
  const section = document.createElement("section"); section.className = "dr-illustration-reply"; image.attachShadow({ mode: "open" }).append(section);
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(360);
  vi.spyOn(parent, "getBoundingClientRect").mockReturnValue(rect(8, 344));
  vi.spyOn(image, "getBoundingClientRect").mockReturnValue(rect(8, 344));
  vi.spyOn(section, "getBoundingClientRect").mockReturnValue(rect(16, 336));
  fitAdaptiveChoices(host);
  expect(host.style.width).toBe("336px"); expect(host.style.marginLeft).toBe("8px");
});

test("suggestion card does not cap a wide illustration at the former 690 px", () => {
  document.body.innerHTML = '<main><article><div data-deeprole-illustrations></div></article><div data-deeprole-choices-recovery></div></main>';
  const image = document.querySelector<HTMLElement>("[data-deeprole-illustrations]")!, host = document.querySelector<HTMLElement>("[data-deeprole-choices-recovery]")!;
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1800);
  vi.spyOn(document.querySelector("main")!, "getBoundingClientRect").mockReturnValue(rect(550, 690));
  vi.spyOn(image, "getBoundingClientRect").mockReturnValue(rect(300, 1200));
  fitAdaptiveChoices(host); expect(host.style.width).toBe("1200px"); expect(host.style.marginLeft).toBe("-250px");
});
