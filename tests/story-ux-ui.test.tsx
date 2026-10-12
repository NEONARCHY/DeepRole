import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StoryReview } from "../src/entrypoints/shared/StoryReview";
import { StoryFacts } from "../src/entrypoints/shared/StoryFacts";
import { storyReviewPage, storyReviewPreview } from "./fixtures/story-review";
import { storyUxText as ux } from "../src/core/story-ux-i18n";
import { storyReviewText as review } from "../src/core/story-review-i18n";
import { storyUpdateText as fact } from "../src/core/story-update-i18n";
afterEach(cleanup);
const snapshot = () => ({ ...storyReviewPage(), managed: true, facts: [{ eventId: "fact-1", text: "The gate is locked.", kind: "event" as const, quote: "The gate is locked.", accepted: false, edited: false }] });

it.each(["ru", "en"] as const)("%s guided view reads once in StrictMode, without starting a story", async locale => {
  const onRead = vi.fn(async () => snapshot()), onGame = vi.fn();
  render(<StrictMode><StoryReview locale={locale} guided onRead={onRead} onGame={onGame} onPreview={async () => storyReviewPreview()} /></StrictMode>);
  await screen.findByText(ux(locale, "active"));
  expect(onRead).toHaveBeenCalledOnce(); expect(onGame).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: ux(locale, "memory") })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByText(review(locale, "read"))).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: ux(locale, "timeline") }));
  expect(screen.getByText(ux(locale, "timelineHint"))).toBeVisible();
  expect(screen.getByLabelText(fact(locale, "text"))).not.toBeVisible();
});

it("keeps an edited fact across sections and a normal refresh, then blocks a changed base", async () => {
  let page = snapshot(); const onSave = vi.fn();
  render(<StoryReview locale="en" guided onRead={async () => structuredClone(page)} onFact={onSave} onPreview={async () => storyReviewPreview()} />);
  const field = await screen.findByLabelText(fact("en", "text"));
  fireEvent.change(field, { target: { value: "My checked gate fact." } });
  fireEvent.click(screen.getByRole("button", { name: ux("en", "timeline") }));
  fireEvent.click(screen.getByRole("button", { name: ux("en", "memory") }));
  fireEvent.click(screen.getByText(ux("en", "refresh")));
  await waitFor(() => expect(field).not.toBeDisabled()); expect(field).toHaveValue("My checked gate fact.");
  page = { ...page, guard: { ...page.guard!, selectionVersion: 1 }, next: { ...page.next!, selectionVersion: 1 }, facts: [{ ...page.facts[0]!, text: "The gate was opened." }] };
  fireEvent.click(screen.getByText(ux("en", "refresh")));
  await screen.findByText(ux("en", "changedFact"));
  expect(screen.getByText(fact("en", "save"))).toBeDisabled(); expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText(ux("en", "useDraft")));
  expect(screen.getByText(fact("en", "save"))).not.toBeDisabled();
});

it("a typed but unchanged saved fact still offers removal, not another approval", () => {
  const page = snapshot(); page.facts[0]!.accepted = true; const onSave = vi.fn();
  render(<StoryFacts locale="en" page={page} busy={false} onSave={onSave}/>);
  fireEvent.change(screen.getByLabelText(fact("en", "text")), { target: { value: "Temporary edit" } });
  fireEvent.change(screen.getByLabelText(fact("en", "text")), { target: { value: page.facts[0]!.text } });
  fireEvent.click(screen.getByText(fact("en", "remove")));
  expect(onSave).toHaveBeenCalledWith("fact-1", page.facts[0]!.text, false);
});

it.each(["ru", "en"] as const)("%s a new starting point needs a concrete confirmation", async locale => {
  const onGame = vi.fn(async () => undefined);
  render(<StoryReview locale={locale} guided onRead={async () => snapshot()} onGame={onGame} onPreview={async () => storyReviewPreview()} />);
  await screen.findByText(ux(locale, "active"));
  const restart = screen.getByText(review(locale, "restart")); expect(restart).toBeDisabled();
  fireEvent.click(screen.getByLabelText(ux(locale, "restartConfirm"))); expect(restart).not.toBeDisabled();
  fireEvent.click(restart); await waitFor(() => expect(onGame).toHaveBeenCalledWith("restart", "stop"));
  await waitFor(() => expect(restart).toBeDisabled());
});

it("does not read or mutate while a reply is being generated; resumes read-only afterwards", async () => {
  const onRead = vi.fn(async () => snapshot()), onGame = vi.fn();
  const props = { locale: "en" as const, guided: true, onRead, onGame, onPreview: async () => storyReviewPreview() };
  const view = render(<StoryReview {...props} operationBlocked/>);
  expect(onRead).not.toHaveBeenCalled(); expect(screen.getByText(ux("en", "pending"))).toBeVisible();
  view.rerender(<StoryReview {...props} operationBlocked={false}/>); await screen.findByText(ux("en", "active"));
  view.rerender(<StoryReview {...props} operationBlocked/>);
  expect(screen.getByText(ux("en", "sync"))).toBeDisabled(); expect(onGame).not.toHaveBeenCalled();
});
