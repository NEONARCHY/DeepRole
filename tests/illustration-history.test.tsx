import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { IllustrationReply, type IllustrationReplyProps } from "../src/entrypoints/shared/IllustrationReply";
import type { Illustration } from "../src/core/image-generation";
import { illustration, profile } from "./image-fixtures";

afterEach(cleanup);
const first = { ...illustration, id: "first", image: "data:image/png;base64,AAAA", createdAt: 1, updatedAt: 1, request: { contentLevel: "off" as const, config: profile, input: { worldId: illustration.worldId, chatId: illustration.chatId, messageKey: illustration.messageKey, chatUrl: "https://chat.deepseek.com/a/chat/s/test", providerId: profile.id, prompt: illustration.prompt, referenceKeys: [] }, images: [] } };
const second = { ...illustration, id: "second", image: "data:image/png;base64,BBBB", createdAt: 2, updatedAt: 2 };
const props = (records: Illustration[] = [first, second]): IllustrationReplyProps => ({
  target: { worldId: illustration.worldId, chatId: illustration.chatId, messageKey: illustration.messageKey, chatUrl: "https://chat.deepseek.com/a/chat/s/test" },
  sceneText: "Mira watches the observatory.", records, attempts: [], locale: "en", generating: false,
  onCreate: vi.fn(async () => {}), onRepeat: vi.fn(async () => {}), onRemove: vi.fn(async () => {}), onDownload: vi.fn(async () => {}), onView: vi.fn(),
});
it("shows only the newest result, navigates without network calls and survives unrelated updates", () => {
  const p = props(), view = render(<IllustrationReply {...p} />);
  expect(view.getAllByRole("img")).toHaveLength(1); expect(view.getByRole("img")).toHaveAttribute("src", second.image);
  fireEvent.click(view.getByRole("button", { name: "Previous generation" })); expect(view.getByRole("img")).toHaveAttribute("src", first.image);
  view.rerender(<IllustrationReply {...p} locale="ru" />); expect(view.getByRole("img")).toHaveAttribute("src", first.image);
  fireEvent.click(view.getByRole("button", { name: "Следующая генерация" })); expect(view.getByRole("img")).toHaveAttribute("src", second.image);
  expect(p.onCreate).not.toHaveBeenCalled(); expect(p.onRepeat).not.toHaveBeenCalled();
});
it("replaces the image with one loading frame and selects the completed repeat", async () => {
  let done!: () => void; const p = props([first]); p.onRepeat = vi.fn(() => new Promise<void>(resolve => { done = resolve; }));
  const view = render(<IllustrationReply {...p} />);
  await act(async () => { fireEvent.click(view.getByRole("button", { name: "Try again" })); });
  expect(view.queryByRole("img")).toBeNull(); expect(view.getAllByRole("status")).toHaveLength(1); expect(view.getByRole("status")).toHaveTextContent("Creating illustration");
  fireEvent.click(view.getByRole("button", { name: "Previous generation" })); expect(view.getByRole("img")).toHaveAttribute("src", first.image);
  await act(async () => { done(); }); view.rerender(<IllustrationReply {...p} records={[first, second]} />);
  expect(view.getAllByRole("img")).toHaveLength(1); expect(view.getByRole("img")).toHaveAttribute("src", second.image);
  expect(p.onRepeat).toHaveBeenCalledTimes(1); expect(p.onRepeat).toHaveBeenCalledWith(p.target, first.id);
});
it("retains old results on a failed attempt and does not retry while navigating", () => {
  const p = props([first]); p.attempts = [{ ...p.target, id: "failed", status: "failed", error: "timeout", createdAt: 3, updatedAt: 3 }];
  const view = render(<IllustrationReply {...p} />); expect(view.getByRole("alert")).toHaveTextContent("timed out"); expect(view.queryByRole("img")).toBeNull();
  fireEvent.click(view.getByRole("button", { name: "Previous generation" })); expect(view.getByRole("img")).toHaveAttribute("src", first.image);
  fireEvent.click(view.getByRole("button", { name: "Next generation" })); expect(view.getByRole("alert")).toBeVisible(); expect(p.onRepeat).not.toHaveBeenCalled();
});
it("uses displayed result IDs for viewing/deletion and never loads another message’s record", async () => {
  const p = props([second, { ...second, id: "other-message", messageKey: "different" }, first]), view = render(<IllustrationReply {...p} />);
  fireEvent.click(view.getByRole("button", { name: "Previous generation" }));
  fireEvent.click(view.getByRole("button", { name: "Open image" })); expect(p.onView).toHaveBeenCalledWith(first);
  await act(async () => { fireEvent.click(view.getByRole("button", { name: "Delete illustration" })); });
  expect(p.onRemove).toHaveBeenCalledWith(p.target, first.id); expect(view.getByRole("img")).toBeVisible();
});
it("handles delayed prop refresh after deletion without submitting deletion twice", async () => {
  const p = props(), view = render(<IllustrationReply {...p} />);
  await act(async () => { fireEvent.click(view.getByRole("button", { name: "Delete illustration" })); });
  expect(view.getByRole("img")).toHaveAttribute("src", first.image);
  await act(async () => { fireEvent.click(view.getByRole("button", { name: "Delete illustration" })); });
  expect(view.queryByRole("img")).toBeNull(); expect(p.onRemove).toHaveBeenNthCalledWith(1, p.target, second.id); expect(p.onRemove).toHaveBeenNthCalledWith(2, p.target, first.id);
});
it("does not hide a result when deletion fails, or mistake a legacy image ID for a loading slot", async () => {
  const p = props([{ ...first, id: "attempt" }]); p.onRemove = vi.fn(async () => { throw { code: "changed" }; });
  const view = render(<IllustrationReply {...p} />);
  expect(view.getByRole("img")).toHaveAttribute("src", first.image);
  await act(async () => { fireEvent.click(view.getByRole("button", { name: "Delete illustration" })); });
  expect(view.getByRole("img")).toBeVisible(); expect(view.getByRole("alert")).toBeVisible(); expect(p.onRepeat).not.toHaveBeenCalled();
});
