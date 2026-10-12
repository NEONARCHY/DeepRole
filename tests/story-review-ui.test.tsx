import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StoryReview } from "../src/entrypoints/shared/StoryReview";
import { storyReviewText as text } from "../src/core/story-review-i18n";
import { storyReviewPage, storyReviewLastPage, storyReviewPreview } from "./fixtures/story-review";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
for (const locale of ["ru", "en"] as const) it(`manually reads and previews without saving in ${locale}`, async () => {
  const page = storyReviewPage(locale), read = vi.fn().mockResolvedValue(page), preview = vi.fn().mockResolvedValue(storyReviewPreview(locale)), t = (key: Parameters<typeof text>[1]) => text(locale, key);
  render(<StoryReview locale={locale} onRead={read} onPreview={preview} />); expect(read).not.toHaveBeenCalled(); expect(preview).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: t("read") })); await screen.findByText(t("world").replace("{name}", page.worldName)); expect(screen.getAllByText(t("observed"), { exact: false })).toHaveLength(2);
  const button = screen.getByRole("button", { name: t("preview") }); fireEvent.click(button); fireEvent.click(button); await screen.findByRole("heading", { name: t("previewTitle") }); expect(preview).toHaveBeenCalledTimes(1); expect(preview).toHaveBeenCalledWith(page, "review-assistant");
  // React focuses the heading in its post-commit effect. Finding its DOM node
  // can finish before that effect; still require actual keyboard focus.
  await waitFor(() => expect(screen.getByRole("heading", { name: t("previewTitle") })).toHaveFocus());
  fireEvent.click(screen.getByText(t("snapshot"))); expect(screen.getByText(t("world").replace("{name}", page.worldName))).toBeInTheDocument(); expect(screen.getAllByText(locale === "ru" ? "Состояние: В мастерской." : "State: In the workshop.")).toHaveLength(2);
  expect(document.body.textContent).not.toMatch(/review-branch|review-assistant|person-1|binding:synthetic/); expect(screen.queryByRole("checkbox")).toBeNull();
  read.mockResolvedValue(storyReviewLastPage(locale)); fireEvent.click(screen.getByRole("button", { name: t("next") })); await screen.findByText(t("order").replace("{from}", "3").replace("{to}", "4").replace("{total}", "4")); expect(read).toHaveBeenLastCalledWith(page); expect(screen.getByRole("button", { name: t("preview") })).toBeDisabled(); expect(screen.queryByRole("heading", { name: t("previewTitle") })).toBeNull();
});
it("shows missing starting point and empty anchored history without inventing messages", async () => {
  const f = storyReviewPage(), read = vi.fn().mockResolvedValue({ ...f, guard: null, baselineAt: null, entries: [], next: null }), preview = vi.fn(); render(<StoryReview locale="en" onRead={read} onPreview={preview} />);
  fireEvent.click(screen.getByRole("button", { name: text("en", "read") })); await screen.findByText(text("en", "missing")); expect(screen.queryByRole("button", { name: text("en", "baseline") })).toBeNull();
  read.mockResolvedValue({ ...f, guard: { ...f.guard, revisionCount: 0 }, entries: [], next: null }); fireEvent.click(screen.getByRole("button", { name: text("en", "refresh") })); await screen.findByText(text("en", "empty")); expect(preview).not.toHaveBeenCalled();
});
it("warns about manual conflicts and previews baseline explicitly", async () => {
  const preview = vi.fn().mockResolvedValue({ ...storyReviewPreview("en", null), manualConflict: true }); render(<StoryReview locale="en" onRead={async () => storyReviewPage()} onPreview={preview} />);
  fireEvent.click(screen.getByRole("button", { name: text("en", "read") })); await screen.findByText("World: Workshop"); fireEvent.click(screen.getByRole("button", { name: text("en", "baseline") })); await screen.findByText(text("en", "conflict")); expect(preview.mock.calls[0]![1]).toBeNull();
});
it.each(["story-review-stale", "story-binding-conflict", "vault-locked", "PRIVATE_ERROR"])("clears stale sources on %s without exposing raw errors", async code => {
  render(<StoryReview locale="en" onRead={async () => storyReviewPage()} onPreview={async () => { throw Error(code); }} />); fireEvent.click(screen.getByRole("button", { name: text("en", "read") })); await screen.findByText("World: Workshop"); fireEvent.click(screen.getByRole("button", { name: text("en", "preview") }));
  await screen.findByText(text("en", code === "vault-locked" ? "locked" : code === "PRIVATE_ERROR" ? "failed" : "stale")); expect(screen.queryByText("World: Workshop")).toBeNull(); expect(document.body.textContent).not.toContain(code);
});
it("ignores delayed reads after unmount and rejects a mismatched preview", async () => {
  let release!: (v: any) => void; const view = render(<StoryReview locale="en" onRead={() => new Promise(resolve => { release = resolve; })} onPreview={vi.fn()} />); fireEvent.click(screen.getByRole("button", { name: text("en", "read") })); view.unmount(); await act(async () => release(storyReviewPage()));
  render(<StoryReview locale="en" onRead={async () => storyReviewPage()} onPreview={async () => ({ ...storyReviewPreview(), worldId: "foreign" })} />); fireEvent.click(screen.getByRole("button", { name: text("en", "read") })); await screen.findByText("World: Workshop"); fireEvent.click(screen.getByRole("button", { name: text("en", "preview") })); await screen.findByText(text("en", "failed")); expect(screen.queryByRole("heading", { name: text("en", "previewTitle") })).toBeNull();
});
it("renders original story text literally, never as executable markup", async () => {
  const p = storyReviewPage(); p.entries[1]!.content = '<img src=x onerror="PRIVATE_SCRIPT()">';
  render(<StoryReview locale="en" onRead={async () => p} onPreview={vi.fn()} />); fireEvent.click(screen.getByRole("button", { name: text("en", "read") })); await screen.findByText("World: Workshop"); expect(document.querySelector("img")).toBeNull(); expect(document.body.textContent).toContain(p.entries[1]!.content);
});
