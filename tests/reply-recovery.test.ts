import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepSeekReplyRecovery } from "../src/adapters/deepseek-reply-recovery";
import { foldCharacterPayload } from "../src/adapters/deepseek-characters-dom";
import { isReplacedReply, MAX_RECOVERED_REPLY_HTML, validRecoveredReplies } from "../src/core/reply-recovery";
import { validDataRecord, parseBackupSettings } from "../src/core/record-validation";
import type { Locale, RecoveredReply } from "../src/core/types";
import type { RecoveredReplyEdit } from "../src/storage/recovered-replies";

const refusal = "Sorry, that's beyond my current scope. Let's talk about something else.";
const key = JSON.stringify(["message", "answer"]);
const archived: RecoveredReply = { messageKey: key, html: "<p>Mira found the compass.</p>", capturedAt: 1, recoveredAt: 2 };
const active: { recovery: DeepSeekReplyRecovery; observer: MutationObserver }[] = [];
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function mount(text = "Mira waits by the gate.", id = "answer") {
  document.body.innerHTML = '<main><article data-message-id="user" data-role="user"><div class="ds-markdown">My own message</div></article><article data-role="assistant"><div class="ds-think-content"><p>Private reasoning is never an answer.</p></div><div class="ds-assistant-message-main-content"><div class="ds-markdown" id="reply"></div></div><button>Copy</button></article><textarea aria-label="Message"></textarea></main>';
  document.querySelector<HTMLElement>("article[data-role='assistant']")!.dataset.messageId = id;
  const body = document.getElementById("reply")!; body.textContent = text; return body;
}
function setup(replies: RecoveredReply[] = [], locale: Locale = "ru", save = vi.fn(async (_edit: RecoveredReplyEdit) => {})) {
  const failed = vi.fn(), recovery = new DeepSeekReplyRecovery(save, failed);
  recovery.configure("a", "https://chat.deepseek.com/chat/s/a", true, locale, replies);
  const observer = new MutationObserver(changes => recovery.process(changes));
  observer.observe(document.body, { childList: true, characterData: true, characterDataOldValue: true, subtree: true });
  active.push({ recovery, observer }); return { recovery, save, failed };
}

afterEach(() => { for (const { recovery, observer } of active) { observer.disconnect(); recovery.reset(); } active.length = 0; document.body.innerHTML = ""; vi.restoreAllMocks(); });

describe("automatic local reply recovery", () => {
  it("restores the last streamed fragment automatically with a single quiet label", async () => {
    const body = mount(), { recovery, save } = setup();
    body.innerHTML = '<p>Mira found <strong>the compass</strong>.</p><pre><code>The gate opens.\nNext scene</code></pre>'; await flush();
    body.textContent = refusal; await flush(); await flush();
    const host = document.querySelector<HTMLElement>("[data-deeprole-recovered-reply]")!;
    expect(host.textContent).toContain("Mira found the compass."); expect(host.querySelector("pre code")?.textContent).toContain("\nNext scene");
    expect(host.querySelector("[data-deeprole-recovery-label]")).toHaveTextContent("Восстановлено");
    expect(host.textContent).not.toContain("Private reasoning"); expect(body).toHaveTextContent(refusal);
    expect(body).toHaveStyle({ display: "none" }); expect(save).toHaveBeenCalledTimes(1);
    recovery.scan(); recovery.scan(); expect(document.querySelectorAll("[data-deeprole-recovered-reply]")).toHaveLength(1);
    expect(save.mock.calls[0]![0]).toMatchObject({ chatId: "a", reply: { messageKey: key } });
  });

  it.each(["ru", "en"] as const)("restores an archive on reload and virtual remount in %s", async locale => {
    let body = mount(refusal); const { recovery, save } = setup([archived], locale);
    expect(document.querySelector("[data-deeprole-recovery-label]")).toHaveTextContent(locale === "ru" ? "Восстановлено" : "Restored");
    expect(document.querySelector("[data-deeprole-recovered-reply]")).toHaveTextContent("Mira found the compass.");
    body = mount(refusal); await flush(); recovery.scan();
    expect(document.querySelectorAll("[data-deeprole-recovered-reply]")).toHaveLength(1); expect(body.style.display).toBe("none"); expect(save).not.toHaveBeenCalled();
  });

  it("captures a body inserted and replaced within one mutation batch", async () => {
    const body = mount(""), { save } = setup();
    body.innerHTML = "<p>The door opened.</p><p>Mira stepped into the garden.</p>";
    body.textContent = refusal; await flush(); await flush();
    expect(document.querySelector("[data-deeprole-recovered-reply]")).toHaveTextContent("The door opened.Mira stepped into the garden."); expect(save).toHaveBeenCalledOnce();
  });

  it("captures old character data when replacement happens before the observer callback", async () => {
    const body = mount(""), { save } = setup();
    const text = document.createTextNode("The map points to the northern harbor."); body.append(text); text.data = refusal;
    await flush(); await flush(); expect(document.querySelector("[data-deeprole-recovered-reply]")).toHaveTextContent("The map points to the northern harbor."); expect(save).toHaveBeenCalledOnce();
  });

  it("captures a detached full reply when DeepSeek replaces its entire native row in one batch", async () => {
    mount(""); const { save } = setup();
    const row = document.querySelector("article[data-role='assistant']")!;
    const replacement = row.cloneNode(true) as HTMLElement;
    row.querySelector(".ds-markdown")!.innerHTML = "<p>The entire previous row has the map.</p>";
    replacement.querySelector(".ds-markdown")!.textContent = refusal; row.replaceWith(replacement);
    await flush(); await flush(); expect(document.querySelector("[data-deeprole-recovered-reply]")).toHaveTextContent("The entire previous row has the map."); expect(save).toHaveBeenCalledOnce();
  });

  it("does not restore quoted refusals or substantive new replies", async () => {
    const body = mount(refusal), { recovery } = setup([archived]);
    body.textContent = `A character says: ${refusal} I ask about the gate.`; await flush();
    expect(document.querySelector("[data-deeprole-recovered-reply]")).toBeNull(); expect(body.style.display).toBe("");
    recovery.configure("a", "https://chat.deepseek.com/chat/s/a", true, "ru", [archived]);
    expect(document.querySelector("[data-deeprole-recovered-reply]")).toBeNull();
  });

  it("ignores the refusal while it is streaming, preserving the real candidate", async () => {
    const body = mount("The gate is now open."), { save } = setup();
    body.textContent = "Sorry, that's beyond my"; await flush(); expect(save).not.toHaveBeenCalled();
    body.textContent = refusal; await flush(); await flush(); expect(document.querySelector("[data-deeprole-recovered-reply]")).toHaveTextContent("The gate is now open.");
  });

  it("never substitutes another chat's cached reply with the same native key", async () => {
    const body = mount(), { recovery, save } = setup();
    recovery.configure("b", "https://chat.deepseek.com/chat/s/b", true, "ru"); body.textContent = refusal;
    await flush(); expect(document.querySelector("[data-deeprole-recovered-reply]")).toBeNull(); expect(save).not.toHaveBeenCalled();
    mount(refusal); await flush(); expect(document.querySelector("[data-deeprole-recovered-reply]")).toBeNull();
  });

  it("never uses reasoning, user input, controls or an unidentified row as a reply", async () => {
    mount(refusal); document.querySelector("article[data-role='assistant']")!.removeAttribute("data-message-id");
    const { save } = setup();
    document.querySelector(".ds-think-content p")!.firstChild!.textContent = "Changed private reasoning.";
    document.querySelector("article[data-role='user'] .ds-markdown")!.textContent = refusal;
    await flush(); expect(save).not.toHaveBeenCalled(); expect(document.querySelector("[data-deeprole-recovered-reply]")).toBeNull();
  });

  it("clears restored private content on a vault lock or disabled setting", async () => {
    const body = mount(refusal), { recovery, save } = setup([archived]);
    recovery.configure("a", "https://chat.deepseek.com/chat/s/a", false, "ru");
    expect(document.querySelector("[data-deeprole-recovered-reply]")).toBeNull(); expect(body.style.display).toBe(""); expect(body.getAttribute("aria-hidden")).toBeNull();
    body.textContent = "New text while locked."; body.textContent = refusal; await flush(); expect(save).not.toHaveBeenCalled();
  });

  it("does not let a late save revive content after reset", async () => {
    const body = mount(); let complete!: () => void;
    const pending = new Promise<void>(resolve => { complete = resolve; });
    const { recovery } = setup([], "ru", vi.fn(() => pending));
    body.textContent = refusal; await flush(); recovery.reset();
    complete(); await flush(); await flush(); expect(document.querySelector("[data-deeprole-recovered-reply]")).toBeNull();
  });

  it("marks storage failures without deleting native text or endlessly retrying", async () => {
    const body = mount(), { recovery, save, failed } = setup([], "ru", vi.fn(async () => { throw new Error("quota"); }));
    body.textContent = refusal; await flush(); await flush();
    expect(document.querySelector("[data-deeprole-recovery-label]")).toHaveTextContent("Восстановлено · не сохранено");
    recovery.scan(); recovery.scan(); expect(save).toHaveBeenCalledOnce(); expect(failed).toHaveBeenCalledOnce(); expect(body).toHaveTextContent(refusal);
  });

  it("preserves the new attempt, instead of an old archive, when a reply is regenerated", async () => {
    const body = mount("A different turn: Mira returned the map."), { save } = setup([archived]);
    body.textContent = refusal; await flush(); await flush();
    expect(document.querySelector("[data-deeprole-recovered-reply]")).toHaveTextContent("Mira returned the map."); expect(save).toHaveBeenCalledOnce();
  });

  it("does not execute unsafe imported HTML or load media during restoration", () => {
    mount(refusal); setup([{ ...archived, html: '<p onclick="alert(1)" style="position:fixed">Safe <strong>text</strong></p><script>window.compromised=true</script><img src="https://tracker.invalid/pixel"><iframe src="https://tracker.invalid/"></iframe><a href="javascript:alert(1)">Bad link</a><a href="https://example.com/">Reference</a>' }]);
    const host = document.querySelector("[data-deeprole-recovered-reply]")!;
    expect(host.querySelector("script,img,iframe,[onclick],p[style]" )).toBeNull(); expect(host.querySelector("a")!.getAttribute("href")).toBeNull();
    expect(host.querySelector('a[href="https://example.com/"]')).toHaveAttribute("rel", "noopener noreferrer"); expect(host).toHaveTextContent("Safe text");
  });

  it("preserves hidden DeepRole transport without exposing technical text after reload", () => {
    mount(refusal); setup([{ ...archived, html: '<p>Mira asks for your next move.</p><span data-deeprole-choices-payload="true" style="display:none">&lt;deeprole_choices&gt;{"version":1,"options":[]}&lt;/deeprole_choices&gt;</span>' }]);
    const payload = document.querySelector<HTMLElement>("[data-deeprole-recovered-reply] [data-deeprole-choices-payload]")!;
    expect(payload.textContent).toContain("<deeprole_choices>"); expect(payload).toHaveStyle({ display: "none" }); expect(payload).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps the actual folded character result closed when restoring a story reply", async () => {
    const body = mount(), { save } = setup();
    body.textContent = 'Mira arrives. <deeprole_characters>{"present":[],"partners":[],"updates":[]}</deeprole_characters>';
    foldCharacterPayload(body, "ru", "updated"); await flush();
    body.textContent = refusal; await flush(); await flush();
    const details = document.querySelector("[data-deeprole-recovered-reply] details[data-deeprole-characters-result]")!;
    expect(details.hasAttribute("open")).toBe(false); expect(details.querySelector("summary[data-deeprole-characters-summary]")).not.toBeNull();
    expect(details.querySelector("pre")!.textContent).toContain("<deeprole_characters>"); expect(save).toHaveBeenCalledOnce();
  });

  it("requires a real captured reply and validates full backup archives without changing text", () => {
    mount(refusal); const { save } = setup(); expect(document.querySelector("[data-deeprole-recovered-reply]")).toBeNull(); expect(save).not.toHaveBeenCalled();
    expect(isReplacedReply(refusal.replaceAll("'", "’"))).toBe(true); expect(isReplacedReply("Sorry about that." )).toBe(false);
    expect(validRecoveredReplies([archived, archived])).toBe(false);
    expect(validRecoveredReplies([{ ...archived, html: "a".repeat(MAX_RECOVERED_REPLY_HTML + 1) }])).toBe(false);
    const record = { kind: "binding", id: "binding:a", data: { id: "binding:a", chatId: "a", chatUrl: "https://chat.deepseek.com/chat/s/a", bookId: null, messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 2, recoveredReplies: [archived] } };
    expect(validDataRecord(record)).toBe(true); expect(record.data.recoveredReplies[0]!.html).toBe(archived.html);
    expect(parseBackupSettings({ replyRecoveryEnabled: false }).replyRecoveryEnabled).toBe(false);
  });
});
