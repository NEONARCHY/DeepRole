import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SceneControls } from "../src/entrypoints/shared/SceneControls";
import type { SceneState, WorldProfile } from "../src/core/types";

afterEach(cleanup);
const worlds = ["a", "b", "c"].map((id) => ({ id, name: id })) as WorldProfile[];
const initial: SceneState = { worldId: "a", bookId: null, focusIds: [] };

it("serializes scene edits and restores the latest confirmed scene after failure", async () => {
  let finish!: (ok: boolean) => void;
  const change = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
  const props = { locale: "en" as const, worlds, entities: [], books: [], scene: initial, onChange: change };
  const view = render(<SceneControls {...props} />);
  const select = screen.getByRole("combobox", { name: "World" });
  fireEvent.change(select, { target: { value: "b" } });
  expect(select).toBeDisabled();
  fireEvent.change(select, { target: { value: "c" } });
  await act(async () => {});
  expect(change).toHaveBeenCalledTimes(1);
  expect(change).toHaveBeenCalledWith({ ...initial, worldId: "b" });
  view.rerender(<SceneControls {...props} scene={{ ...initial, worldId: "c" }} />);
  await act(async () => finish(false));
  expect(select).toBeEnabled();
  expect(select).toHaveValue("c");
  expect(screen.getByRole("alert")).toHaveTextContent("Could not change the scene");
});

it("handles a synchronous scene failure without leaving controls stuck", async () => {
  render(<SceneControls locale="en" worlds={worlds} entities={[]} books={[]} scene={initial} onChange={() => { throw new Error("offline"); }} />);
  const select = screen.getByRole("combobox", { name: "World" });
  await act(async () => { fireEvent.change(select, { target: { value: "b" } }); });
  expect(select).toHaveValue("a");
  expect(select).toBeEnabled();
  expect(screen.getByRole("alert")).toBeVisible();
});
