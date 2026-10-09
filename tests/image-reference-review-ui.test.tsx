import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ImageReferenceReview } from "../src/entrypoints/shared/ImageReferenceReview";
import { IllustrationReply, type IllustrationReplyProps } from "../src/entrypoints/shared/IllustrationReply";
import { DEFAULT_IMAGE_SETTINGS } from "../src/core/image-generation";
import { EMPTY_CHARACTER } from "../src/core/characters";
import { imageReviewContextKey } from "../src/core/image-references";
import { selfieImageKey } from "../src/core/selfies";
import type { SceneEntity } from "../src/core/types";
import { imageText } from "../src/core/image-i18n";
import { illustration, profile, realPng, world } from "./image-fixtures";

afterEach(cleanup);
const ordinary = "data:image/png;base64," + realPng, alternate = "data:image/jpeg;base64,/9j/AAAA";
const entities: SceneEntity[] = ["Mira", "Noah"].map(name => ({ id: name.toLowerCase(), worldId: world.id, kind: "character", name, description: "A fictional astronomer", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1, characterSheet: { ...EMPTY_CHARACTER, appearance: "A coat.", portraitLibrary: [ordinary, alternate], imageGeneration: { canonical: "A coat.", sceneDelta: "", prefix: "", suffix: "", format: "prose", referenceKey: selfieImageKey(ordinary), suggestiveReferenceKey: selfieImageKey(alternate) } } }));
const settings = { ...DEFAULT_IMAGE_SETTINGS, enabled: true, contentLevel: "suggestive" as const, reviewBeforeGeneration: true, profiles: [{ ...profile, maxReferences: 6 }], profileByLevel: { off: profile.id, suggestive: profile.id } };
const plan = { scene: "Mira and Noah are studying an observatory chart.", characters: entities.map(e => ({ id: e.id, reference: "neutral" as const, look: "ordinary" as const, appearance: "A coat." })) };
const sceneText = "Mira and Noah study an observatory chart.";
const review = { plan, sceneText, contextKey: imageReviewContextKey(plan, world.id, entities, settings) };
const target = { worldId: world.id, chatId: illustration.chatId, messageKey: illustration.messageKey, chatUrl: "https://chat.deepseek.com/chat/s/test" };
function props(locale: "ru" | "en" = "en") { return { review, worldId: world.id, sceneText, entities, settings, locale, disabled: false, onConfirm: vi.fn(), onCancel: vi.fn() }; }

it.each(["ru", "en"] as const)("selects references per character without submitting until confirmation, %s", locale => {
  const p = props(locale), snapshot = structuredClone(entities), view = render(<ImageReferenceReview {...p} />);
  const mira = within(view.getByRole("group", { name: "Mira · " + imageText(locale, "referencePolicy") })), noah = within(view.getByRole("group", { name: "Noah · " + imageText(locale, "referencePolicy") }));
  expect(mira.getAllByRole("button")).toHaveLength(3);
  expect(mira.getByRole("button", { name: imageText(locale, "referenceAuto") })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(mira.getByRole("button", { name: imageText(locale, "referenceSuggestive") }));
  fireEvent.click(noah.getByRole("button", { name: imageText(locale, "referenceNeutral") }));
  expect(view.getAllByRole("img")[0]).toHaveAttribute("src", alternate);
  expect(p.onConfirm).not.toHaveBeenCalled(); expect(entities).toEqual(snapshot);
  fireEvent.click(view.getByRole("button", { name: imageText(locale, "reviewGenerate") }));
  expect(p.onConfirm).toHaveBeenCalledOnce(); expect(p.onConfirm).toHaveBeenCalledWith({ mira: "suggestive", noah: "neutral" });
});
it("keeps missing-reference and ordinary-preset choices unavailable with a usable fallback", () => {
  const p = props(), absent = { ...entities[0]!, characterSheet: { ...entities[0]!.characterSheet!, portraitLibrary: [ordinary] } };
  const next = { ...p, entities: [absent, entities[1]!], settings: { ...settings, contentLevel: "off" as const } };
  next.review = { ...review, contextKey: imageReviewContextKey(plan, world.id, next.entities, next.settings) };
  const view = render(<ImageReferenceReview {...next} />);
  for (const button of view.getAllByRole("button", { name: "Alternate" })) expect(button).toBeDisabled();
  expect(view.getAllByRole("img")).toHaveLength(2); expect(view.getByRole("button", { name: "Create image" })).toBeEnabled();
});
it("blocks a stale scene, setting or identity while keeping cancellation available", () => {
  const p = props(), view = render(<ImageReferenceReview {...p} sceneText="A different scene." />);
  expect(view.getByRole("alert")).toHaveTextContent("changed");
  expect(view.getByRole("button", { name: "Create image" })).toBeDisabled();
  fireEvent.click(view.getByRole("button", { name: "Cancel preparation" })); expect(p.onCancel).toHaveBeenCalledOnce();
  view.rerender(<ImageReferenceReview {...p} settings={{ ...settings, stylePrefix: "Changed" }} />);
  expect(view.getByRole("button", { name: "Create image" })).toBeDisabled(); expect(p.onConfirm).not.toHaveBeenCalled();
});
it("restores saved choices and disables all actions while confirmation is running", () => {
  const p = props(), view = render(<ImageReferenceReview {...p} review={{ ...review, overrides: { mira: "suggestive", noah: "neutral" } }} disabled />);
  expect(view.getAllByRole("img")[0]).toHaveAttribute("src", alternate);
  expect(view.getByRole("button", { name: "Create image" })).toBeDisabled();
  expect(view.getByRole("button", { name: "Cancel preparation" })).toBeDisabled();
});
function replyProps(): IllustrationReplyProps {
  return { target, sceneText, entities, settings, entityNames: { mira: "Mira", noah: "Noah" }, locale: "en", generating: false, records: [],
    attempts: [{ ...target, id: "review-id", status: "review", review, createdAt: 1, updatedAt: 1 }],
    onCreate: vi.fn(async () => {}), onConfirmReferences: vi.fn(async () => {}), onCancelReferences: vi.fn(async () => {}),
    onRepeat: vi.fn(async () => {}), onRemove: vi.fn(async () => {}), onDownload: vi.fn(async () => {}), onView: vi.fn() };
}
it("keeps an old pending review alive after reload and wires only explicit confirmation", async () => {
  const p = replyProps(), view = render(<IllustrationReply {...p} />);
  expect(view.queryByRole("alert")).toBeNull(); expect(view.queryByRole("status")).toBeNull();
  expect(view.getByRole("button", { name: "Create illustration" })).toBeDisabled();
  await act(async () => { fireEvent.click(view.getByRole("button", { name: "Create image" })); });
  expect(p.onConfirmReferences).toHaveBeenCalledWith(target, "review-id", { mira: "auto", noah: "auto" });
  expect(p.onCreate).not.toHaveBeenCalled(); expect(p.onRepeat).not.toHaveBeenCalled();
});
it("separates an exact retry from changing references on a completed image", async () => {
  const p = replyProps(); p.attempts = []; p.records = [{ ...illustration, ...target, request: { contentLevel: "suggestive", config: profile, input: { ...target, providerId: profile.id, prompt: illustration.prompt, referenceKeys: [], aspectRatio: "16:9", referenceChoices: [{ entityId: "mira", reference: "suggestive" }, { entityId: "noah", reference: "none" }] }, images: [] } }];
  const view = render(<IllustrationReply {...p} />);
  expect(view.getByRole("list", { name: "References for this image" })).toHaveTextContent("MiraAlternateNoahFrom text");
  await act(async () => { fireEvent.click(view.getByRole("button", { name: "Try again" })); });
  expect(p.onRepeat).toHaveBeenCalledWith(target, illustration.id); expect(p.onCreate).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(view.getByRole("button", { name: "Previous generation" })); fireEvent.click(view.getByRole("button", { name: "Change references" })); });
  expect(p.onCreate).toHaveBeenCalledWith(target, sceneText, true);
});
