import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryReview, QuickMemory } from "../src/entrypoints/shared/MemoryAssistant";
import type { MemoryProposalBatch } from "../src/core/types";

afterEach(cleanup);
const batch: MemoryProposalBatch = {
  id: "review", worldId: null, bookId: null, chatId: "qa", focusIds: [],
  requestType: "memory-analysis", createdAt: 1, updatedAt: 1,
  items: [{ id: "new", title: "Observatory", content: "The gate is closed.", activation: "smart", priority: "normal", keywords: [], bookId: null, selected: true }],
};

it.each(["ru", "en"] as const)("lets users choose new proposal mode before saving (%s)", async (locale) => {
  const save = vi.fn(async () => {});
  render(<MemoryReview locale={locale} batch={batch} onSave={save} onDiscard={async () => {}} onClose={() => {}} />);
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: /Observatory/ }));
  fireEvent.click(screen.getByRole("button", { name: locale === "ru" ? "Вручную" : "Manual" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /(?:Сохранить выбранное|Save selected changes) · 1/ })));
  expect(save).toHaveBeenCalledWith([expect.objectContaining({ activation: "manual" })]);
});

it("explains missing names before save instead of reporting a false storage conflict", () => {
  render(<MemoryReview locale="en" batch={batch} onSave={async () => {}} onDiscard={async () => {}} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: /Observatory/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Record name" }), { target: { value: " " } });
  for (const alert of screen.getAllByRole("alert")) expect(alert).toHaveTextContent("need both a name and text");
  expect(screen.getByRole("button", { name: /Save selected changes/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
  expect(screen.queryByRole("alert")).toBeNull();
});

it("bulk selection leaves proposals with stale sources out of the save", async () => {
  const save = vi.fn(async () => {});
  const conflicted = { ...batch.items[0]!, id: "stale", title: "The old gate", issue: "stale" as const };
  render(<MemoryReview locale="en" batch={{ ...batch, items: [...batch.items, conflicted] }} onSave={save} onDiscard={async () => {}} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Select available changes" }));
  const blocked = screen.getByRole("checkbox", { name: /The old gate/ });
  expect(blocked).toBeDisabled();
  expect(blocked).not.toBeChecked();
  expect(screen.getByRole("status")).toHaveTextContent("1 of 2 selected");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save selected changes · 1" })));
  expect(save).toHaveBeenCalledWith([
    expect.objectContaining({ id: "new", selected: true }),
    expect.objectContaining({ id: "stale", selected: false }),
  ]);
});

it("does not allow changes to a draft while its save is in flight", async () => {
  let resolve!: () => void;
  const save = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
  const close = vi.fn();
  render(<QuickMemory locale="en" onSave={save} onDraft={async () => {}} onClose={close} />);
  fireEvent.change(screen.getByRole("textbox", { name: "What should stay in memory?" }), { target: { value: "The gate is closed." } });
  fireEvent.click(screen.getByRole("button", { name: "Save to lore" }));
  expect(screen.getByRole("textbox", { name: "What should stay in memory?" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  await act(async () => resolve());
  expect(close).toHaveBeenCalledTimes(1);
});
