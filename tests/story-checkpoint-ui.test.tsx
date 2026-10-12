import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StoryCheckpoint } from "../src/entrypoints/shared/StoryCheckpoint";
import { storyCheckpointText } from "../src/core/story-checkpoint-i18n";
import { checkpointReview, savedCheckpointReview } from "./fixtures/story-checkpoint";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
for (const locale of ["ru", "en"] as const) it(`requires a manual reply choice and separate state confirmation in ${locale}`, async () => {
  const review = checkpointReview(locale), read = vi.fn().mockResolvedValue(review), save = vi.fn().mockResolvedValue(undefined), t = (key: Parameters<typeof storyCheckpointText>[1]) => storyCheckpointText(locale, key);
  render(<StoryCheckpoint locale={locale} onRead={read} onSave={save} />); expect(read).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: t("read") })); await screen.findByText(t("world").replace("{name}", review.worldName));
  const radios = screen.getAllByRole("radio"), button = screen.getByRole("button", { name: t("save") }), confirm = screen.getByRole("checkbox", { name: t("confirm") });
  expect(radios.every(r => !(r as HTMLInputElement).checked)).toBe(true); expect(button).toBeDisabled(); expect(confirm).toBeDisabled();
  fireEvent.click(radios[0]!); expect(confirm).toBeEnabled(); expect(button).toBeDisabled(); expect(screen.getByText(t("different"))).toBeInTheDocument();
  fireEvent.click(confirm); expect(button).toBeEnabled(); fireEvent.click(radios[1]!); expect(confirm).not.toBeChecked(); expect(button).toBeDisabled(); expect(screen.getByText(t("unknown"))).toBeInTheDocument();
  fireEvent.click(confirm); fireEvent.click(button); fireEvent.click(button); await screen.findByText(t("saved")); expect(save).toHaveBeenCalledTimes(1); expect(save).toHaveBeenCalledWith(review, "request-second"); expect(button).toBeDisabled();
  expect(document.body.textContent).not.toMatch(/request-first|request-second|legacy-scene-a|synthetic-world|person-1/);
});
it("shows existing and empty states without accepting or resending a reply", async () => {
  const read = vi.fn().mockResolvedValue(savedCheckpointReview()), save = vi.fn(); render(<StoryCheckpoint locale="en" onRead={read} onSave={save} />);
  fireEvent.click(screen.getByRole("button", { name: "Review current chat" })); await screen.findByText(storyCheckpointText("en", "existing")); expect(screen.queryByRole("radio")).toBeNull();
  read.mockResolvedValue({ ...checkpointReview(), candidates: [], availableCount: 0 }); fireEvent.click(screen.getByRole("button", { name: "Refresh data" })); await screen.findByText(storyCheckpointText("en", "empty")); expect(save).not.toHaveBeenCalled();
});
it("distinguishes an earlier reply on the server path from a different variant", async () => {
  const review = checkpointReview(); review.candidates[0]!.serverSelection = "ancestor";
  render(<StoryCheckpoint locale="en" onRead={async () => review} onSave={async () => undefined} />); fireEvent.click(screen.getByRole("button", { name: "Review current chat" })); await screen.findByText("World: Workshop");
  fireEvent.click(screen.getAllByRole("radio")[0]!); expect(screen.getByText(storyCheckpointText("en", "ancestor"))).toBeInTheDocument(); expect(screen.queryByText(storyCheckpointText("en", "different"))).toBeNull();
});
it.each(["story-manual-conflict", "story-binding-conflict", "story-checkpoint-source", "vault-locked", "PRIVATE_UNEXPECTED_ERROR"])("clears stale approval on %s without leaking error details", async error => {
  const read = vi.fn().mockResolvedValue(checkpointReview()), save = vi.fn().mockRejectedValue(Error(error)); render(<StoryCheckpoint locale="en" onRead={read} onSave={save} />);
  fireEvent.click(screen.getByRole("button", { name: "Review current chat" })); await screen.findByText("World: Workshop");
  fireEvent.click(screen.getAllByRole("radio")[0]!); fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Save starting point" }));
  await screen.findByText(storyCheckpointText("en", error === "vault-locked" ? "locked" : error === "PRIVATE_UNEXPECTED_ERROR" ? "failed" : "changed"));
  expect(screen.queryByRole("radio")).toBeNull(); expect(document.body.textContent).not.toContain(error); expect(save).toHaveBeenCalledTimes(1);
});
it("does not update an unmounted screen after a delayed read and rejects malformed data", async () => {
  let release!: (value: any) => void; const read = vi.fn().mockImplementation(() => new Promise(resolve => { release = resolve; })), save = vi.fn();
  const view = render(<StoryCheckpoint locale="en" onRead={read} onSave={save} />); fireEvent.click(screen.getByRole("button", { name: "Review current chat" })); view.unmount();
  await act(async () => { release(checkpointReview()); }); expect(save).not.toHaveBeenCalled();
  read.mockResolvedValue({ ...checkpointReview(), snapshot: null }); render(<StoryCheckpoint locale="en" onRead={read} onSave={save} />); fireEvent.click(screen.getByRole("button", { name: "Review current chat" })); await screen.findByText(storyCheckpointText("en", "failed")); expect(screen.queryByRole("radio")).toBeNull();
});
