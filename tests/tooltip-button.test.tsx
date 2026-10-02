import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipButton } from "../src/entrypoints/shared/TooltipButton";

describe("delayed action tooltips", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
  const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
  function setup() {
    const click = vi.fn(); const pointer = vi.fn();
    const view = render(<TooltipButton aria-label="Zoom in" tooltip="Change the map scale." aria-describedby="original-description" onClick={click} onPointerDown={pointer}>+</TooltipButton>);
    return { ...view, click, pointer, button: screen.getByRole("button", { name: "Zoom in" }) };
  }
  it("waits exactly one second, with no extra question button or native title", () => {
    const { button } = setup();
    expect(screen.getAllByRole("button")).toHaveLength(1); expect(button).not.toHaveAttribute("title");
    fireEvent.mouseEnter(button); advance(999); expect(screen.queryByRole("tooltip")).toBeNull();
    advance(1); const tip = screen.getByRole("tooltip"); expect(tip).toHaveTextContent("Zoom inChange the map scale.");
    expect(button.getAttribute("aria-describedby")).toBe("original-description " + tip.id);
  });
  it("cancels short hovers and starts a fresh delay on return", () => {
    const { button } = setup(); fireEvent.mouseEnter(button); advance(800); fireEvent.mouseLeave(button); advance(1200);
    expect(screen.queryByRole("tooltip")).toBeNull(); fireEvent.mouseEnter(button); advance(999);
    expect(screen.queryByRole("tooltip")).toBeNull(); advance(1); expect(screen.getByRole("tooltip")).toBeVisible();
  });
  it("allows hovering the explanation, then hides it on leave", () => {
    const { button } = setup(); fireEvent.mouseEnter(button); advance(1000); const tip = screen.getByRole("tooltip");
    fireEvent.mouseLeave(button); advance(60); fireEvent.mouseEnter(tip); advance(2000);
    expect(tip).toBeVisible(); fireEvent.mouseLeave(tip); advance(160); expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("supports keyboard focus and dismisses Escape before a parent can close the map", () => {
    const { button } = setup(); vi.spyOn(button, "matches").mockReturnValue(true);
    const parent = vi.fn(); window.addEventListener("keydown", parent);
    try {
      fireEvent.focus(button); expect(screen.getByRole("tooltip")).toBeVisible();
      fireEvent.keyDown(button, { key: "Escape" }); expect(screen.queryByRole("tooltip")).toBeNull(); expect(parent).not.toHaveBeenCalled();
      fireEvent.keyDown(button, { key: "Escape" }); expect(parent).toHaveBeenCalledOnce();
    } finally { window.removeEventListener("keydown", parent); }
  });
  it("never eats clicks or drag handlers, and cancels pending help on pointer down", () => {
    const { button, click, pointer } = setup(); fireEvent.mouseEnter(button); advance(500); fireEvent.pointerDown(button); fireEvent.click(button); advance(1000);
    expect(click).toHaveBeenCalledOnce(); expect(pointer).toHaveBeenCalledOnce(); expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it.each(["wheel", "scroll", "resize", "blur"])("hides on %s, including movement over the anchor", (event) => {
    const { button } = setup(); fireEvent.mouseEnter(button); advance(1000);
    fireEvent(button, new Event(event, { bubbles: true })); expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("keeps only one action tooltip active", () => {
    render(<><TooltipButton aria-label="One">1</TooltipButton><TooltipButton aria-label="Two">2</TooltipButton></>);
    fireEvent.mouseEnter(screen.getByRole("button", { name: "One" })); advance(1000);
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Two" })); expect(screen.queryByRole("tooltip")).toBeNull();
    advance(1000); expect(screen.getByRole("tooltip")).toHaveTextContent("Two");
  });
  it("does not open on a disabled button and clears timers when unmounted", () => {
    const { button, rerender, unmount } = setup(); fireEvent.mouseEnter(button); advance(500);
    rerender(<TooltipButton aria-label="Zoom in" disabled>+</TooltipButton>); advance(1000); expect(screen.queryByRole("tooltip")).toBeNull();
    rerender(<TooltipButton aria-label="Zoom in">+</TooltipButton>); fireEvent.mouseEnter(button); unmount(); advance(2000); expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("clamps measured bounds at the right and bottom viewport edges", () => {
    const { button } = setup();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this === button ? new DOMRect(window.innerWidth - 20, window.innerHeight - 20, 20, 20) : new DOMRect(8, 8, 280, 120);
    });
    fireEvent.mouseEnter(button); advance(1000); const tip = screen.getByRole("tooltip");
    expect(Number.parseFloat(tip.style.left) + 280).toBeLessThanOrEqual(window.innerWidth - 8);
    expect(Number.parseFloat(tip.style.top) + 120).toBeLessThanOrEqual(window.innerHeight - 8);
  });
  it("portals into the owning Shadow DOM instead of the page body", () => {
    const host = document.createElement("div"); document.body.append(host); const root = host.attachShadow({ mode: "open" });
    const mount = document.createElement("div"); root.append(mount); render(<TooltipButton aria-label="Help">+</TooltipButton>, { container: mount });
    fireEvent.mouseEnter(root.querySelector("button")!); advance(1000);
    expect(root.querySelector('[role="tooltip"]')).not.toBeNull(); expect(document.body.querySelector('[role="tooltip"]')).toBeNull(); host.remove();
  });
});
