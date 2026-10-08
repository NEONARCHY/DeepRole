import { describe, expect, it } from "vitest";
import { characterFieldPrompt, characterFieldResult, characterTextRequest, validCharacterTextRequest } from "../src/core/character-text";
import { EMPTY_CHARACTER, EMPTY_STATUS } from "../src/core/characters";
import { nativeMessageIdentity } from "../src/adapters/deepseek-message-dom";
import { hideCharacterTextServices, plainCharacterReplyText } from "../src/adapters/deepseek-service-dom";
const field = { key: "personality", label: "Характер", maxLength: 1200, scope: "profile" as const };
const draft = () => characterTextRequest(field, "Kind", "Mira", null, { ...EMPTY_CHARACTER, sprites: { neutral: "PRIVATE_IMAGE" }, portraitLibrary: ["PRIVATE_IMAGE"] }, EMPTY_STATUS);
describe("single character field generation", () => {
  it("includes unsaved text reference without portrait bytes or image collections", () => {
    const value = draft(); expect(validCharacterTextRequest(value)).toBe(true);
    expect(JSON.stringify(value)).not.toContain("PRIVATE_IMAGE"); expect(value.reference.personality).toBe("");
  });
  it("bounds the field and rejects missing names or transported image data", () => {
    expect(validCharacterTextRequest({ ...draft(), field: { ...field, maxLength: 1201 } })).toBe(false);
    expect(validCharacterTextRequest({ ...draft(), reference: { name: "" } })).toBe(false);
    expect(validCharacterTextRequest({ ...draft(), reference: { name: "Mira", sprites: {} } })).toBe(false);
    expect(validCharacterTextRequest({ ...draft(), currentText: "a".repeat(1201) })).toBe(false);
  });
  it.each(["ru", "en"] as const)("requests only ready-to-paste text in %s and preserves established facts", locale => {
    const prompt = characterFieldPrompt(draft(), [], locale);
    expect(prompt).toContain("ONE character field"); expect(prompt).toContain("Maximum 1200 characters");
    expect(prompt).toContain(locale === "ru" ? "Russian" : "English"); expect(prompt).toContain("Preserve established ages");
    expect(prompt).not.toContain("PRIVATE_IMAGE"); expect(prompt).not.toContain("<deeprole_data>");
  });
  it("accepts plain text and removes only a complete text fence", () => {
    expect(characterFieldResult("  Calm and observant.  ", 40)).toBe("Calm and observant.");
    const fence = String.fromCharCode(96).repeat(3);
    expect(characterFieldResult(fence + "text\nCalm.\n" + fence, 40)).toBe("Calm.");
    expect(() => characterFieldResult("X".repeat(41), 40)).toThrow("text-too-long");
  });
  it("rejects technical payloads, empty answers and server refusal", () => {
    for (const raw of ["", '{"personality":"Calm"}', "<deeprole_characters>{}</deeprole_characters>", "Sorry, that's beyond my current scope. Let's talk about something else.", "The message is generating. Please try again later."]) expect(() => characterFieldResult(raw, 1200)).toThrow("invalid-result");
  });
});
describe("hidden character field service DOM", () => {
  const prompt = "[DeepRole Service]\n[Request ID: service-test]\n[DeepRole Character Text]\nWrite only personality.";
  it.each(["Character Text", "Image Plan"])("hides only the correlated %s command and answer, preserving their source", service => {
    document.body.innerHTML = '<article data-message-id="ordinary" data-role="assistant">The gate opened.</article><article data-message-id="request" data-role="user"></article><article data-message-id="reply" data-role="assistant"><div class="ds-markdown">Calm and observant.</div></article>';
    const command = prompt.replace("Character Text", service);
    document.querySelector('[data-message-id=request]')!.textContent = command;
    const found = hideCharacterTextServices(); expect(found).toEqual([{ requestId: "service-test", replyIdentity: nativeMessageIdentity(document.querySelector('[data-message-id=reply]')!) }]);
    expect((document.querySelector('[data-message-id=request]') as HTMLElement).style.display).toBe("none");
    expect(document.querySelector('[data-message-id=request]')!.textContent).toBe(command);
    expect((document.querySelector('[data-message-id=ordinary]') as HTMLElement).style.display).toBe("");
  });
  it("restores hidden metadata after reload without matching by generated text and restores recycled rows", () => {
    document.body.innerHTML = '<article data-message-id="reply" data-role="assistant">Calm.</article>';
    const row = document.querySelector("article")!, records = [{ requestId: "service-test", replyIdentity: nativeMessageIdentity(row)! }];
    hideCharacterTextServices(document, records);
    expect(row.style.display).toBe("none"); row.dataset.messageId = "new";
    hideCharacterTextServices(document, records); expect(row.style.display).toBe(""); expect(row.hasAttribute("data-deeprole-service-reply")).toBe(false);
  });
  it("does not treat a marker quoted in another service as a field request", () => {
    document.body.innerHTML = '<article data-role="user"></article><article data-role="assistant">Review</article>';
    document.querySelector("article")!.textContent = "[DeepRole Service]\n[Request ID: service-other]\nAnalyze lore including a quote [DeepRole Character Text].";
    expect(hideCharacterTextServices()).toEqual([]); expect(document.querySelector("[data-deeprole-character-text-hidden]")).toBeNull();
  });
  it("extracts final plain paragraphs without reasoning and Copy buttons", () => {
    const row = document.createElement("article"); row.innerHTML = '<div class="ds-think-content">Private reasoning.</div><div class="ds-assistant-message-main-content"><p>Calm.</p><p>Observant.</p><button>Copy</button></div>';
    expect(plainCharacterReplyText(row)).toBe("Calm.\nObservant.");
  });
});
