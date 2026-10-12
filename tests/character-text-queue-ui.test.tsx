import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CharacterEditor } from "../src/entrypoints/shared/CharacterSheets";
import { characterModeCopy, characterQueueCopy, type CharacterTextRequestGenerator } from "../src/core/character-text";
import { EMPTY_CHARACTER } from "../src/core/characters";
import type { Locale, SceneEntity } from "../src/core/types";
afterEach(cleanup);
const entity: SceneEntity = { id: "mira", name: "Mira", kind: "character", worldId: "w", description: "", aliases: [], memberIds: [], characterSheet: EMPTY_CHARACTER, createdAt: 1, updatedAt: 1 };
const editor = (generate: CharacterTextRequestGenerator, locale: Locale = "en") => <CharacterEditor locale={locale} entity={entity} actions={["neutral"]} onClose={() => {}} onSave={async () => { throw Error("do-not-save"); }} onGenerateText={generate} />;
const field = (key: string) => document.querySelector<HTMLElement>(`[data-character-text-field="${key}"]`)!;
const choose = (key: string, locale: Locale = "en") => { const box = within(field(key)); fireEvent.click(box.getByRole("button")); fireEvent.click(box.getByRole("button", { name: characterModeCopy(locale).suggest })); };

it.each(["ru", "en"] as const)("real editor queues fields, refreshes unsaved draft, and never saves automatically in %s", async locale => {
 const releases: ((text: string) => void)[] = [], generate = vi.fn<CharacterTextRequestGenerator>(async () => new Promise(resolve => releases.push(resolve)));
 const view = render(editor(generate, locale)); choose("appearance", locale); choose("personality", locale); choose("goals", locale);
 expect(generate).toHaveBeenCalledTimes(1); expect(within(field("personality")).getByRole("status")).toHaveTextContent(characterQueueCopy(locale).queued + "1"); expect(within(field("goals")).getByRole("status")).toHaveTextContent(characterQueueCopy(locale).queued + "2");
 await act(async () => releases[0]!("Blue coat")); await waitFor(() => expect(generate).toHaveBeenCalledTimes(2)); expect(generate.mock.calls[1]![0].reference.appearance).toBe("Blue coat");
 await act(async () => releases[1]!("Patient")); await waitFor(() => expect(generate).toHaveBeenCalledTimes(3)); expect(generate.mock.calls[2]![0].reference).toMatchObject({ appearance: "Blue coat", personality: "Patient" });
 await act(async () => releases[2]!("Reach the lighthouse")); expect(within(field("appearance")).getByRole("textbox")).toHaveValue("Blue coat"); expect(within(field("goals")).getByRole("textbox")).toHaveValue("Reach the lighthouse"); view.unmount();
});
it("manual edits cancel waiting fields without sending; active edits keep a separate suggestion", async () => {
 const releases: ((text: string) => void)[] = [], generate = vi.fn<CharacterTextRequestGenerator>(async () => new Promise(resolve => releases.push(resolve))); render(editor(generate));
 choose("appearance"); choose("personality"); choose("goals"); fireEvent.change(within(field("personality")).getByRole("textbox"), { target: { value: "My manual personality" } });
 await waitFor(() => expect(within(field("personality")).getByRole("status")).toHaveTextContent(characterQueueCopy("en").changed));
 fireEvent.change(within(field("appearance")).getByRole("textbox"), { target: { value: "My manual coat" } });
 await act(async () => releases[0]!("New generated coat")); await waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
 expect(generate.mock.calls[1]![0].field.key).toBe("goals"); expect(generate.mock.calls[1]![0].reference).toMatchObject({ appearance: "My manual coat", personality: "My manual personality" });
 expect(within(field("appearance")).getByRole("textbox", { name: /Suggested text/ })).toHaveValue("New generated coat"); await act(async () => releases[1]!("A goal"));
});
it("cancel button removes a queued request without affecting the active field", async () => {
 let release!: (text: string) => void; const generate = vi.fn<CharacterTextRequestGenerator>(async () => new Promise(resolve => { release = resolve; })); render(editor(generate)); choose("appearance"); choose("personality");
 fireEvent.click(within(field("personality")).getByRole("button", { name: /Cancel request:/ })); await waitFor(() => expect(within(field("personality")).getByRole("status")).toHaveTextContent(characterQueueCopy("en").cancelled));
 await act(async () => release("Coat")); await act(async () => new Promise(resolve => setTimeout(resolve, 5))); expect(generate).toHaveBeenCalledTimes(1);
});
it("unmount cancels active and queued jobs; new editor receives no inherited queue", async () => {
 let release!: (text: string) => void, signal!: AbortSignal; const generate = vi.fn<CharacterTextRequestGenerator>(async (_draft, options) => { signal = options!.signal!; return new Promise(resolve => { release = resolve; }); });
 const view = render(editor(generate)); choose("appearance"); choose("personality"); view.unmount(); expect(signal.aborted).toBe(true);
 render(editor(generate)); await act(async () => release("Late coat")); await act(async () => new Promise(resolve => setTimeout(resolve, 5))); expect(generate).toHaveBeenCalledTimes(1); expect(within(field("appearance")).getByRole("textbox")).toHaveValue(""); expect(screen.queryByText(characterQueueCopy("en").queued + "1")).not.toBeInTheDocument();
});
