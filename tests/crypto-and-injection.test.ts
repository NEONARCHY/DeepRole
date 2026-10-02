import { describe, expect, it, vi } from "vitest";
import { deepRoleServiceRequestId, injectIntoJsonBody, isDeepRoleServiceBody, looksLikeChatUrl, outgoingUserText, replaceOutgoingUserText } from "../src/core/request-injection";
import { decryptJson, encryptJson } from "../src/storage/crypto";

describe("encrypted backups", () => {
  it("round-trips data with AES-256-GCM", async () => {
    const encrypted = await encryptJson({ hero: "Mira", chapter: 7 }, "correct horse battery staple", 10_000);
    expect(encrypted.algorithm).toBe("AES-256-GCM");
    await expect(decryptJson(encrypted, "correct horse battery staple")).resolves.toEqual({ hero: "Mira", chapter: 7 });
  });

  it("rejects a wrong password", async () => {
    const encrypted = await encryptJson({ secret: true }, "right", 10_000);
    await expect(decryptJson(encrypted, "wrong")).rejects.toThrow();
  });

  it.each([
    ["unbounded work", { iterations: 4_000_000_000 }],
    ["missing work factor", { iterations: undefined }],
    ["fractional work factor", { iterations: 2.5 }],
    ["string work factor", { iterations: "250000" }],
    ["zero work factor", { iterations: 0 }],
    ["negative work factor", { iterations: -1 }],
    ["short salt", { salt: btoa("short") }],
    ["malformed salt", { salt: "not base64!" }],
    ["non-string salt", { salt: 42 }],
    ["short IV", { iv: btoa("short") }],
    ["malformed IV", { iv: "!" }],
    ["non-string IV", { iv: {} }],
    ["missing authentication tag", { ciphertext: btoa("tiny") }],
    ["malformed ciphertext", { ciphertext: "?" }],
    ["non-string ciphertext", { ciphertext: [1, 2] }],
  ])("rejects %s before starting a password derivation", async (_name, patch) => {
    const encrypted = await encryptJson({ secret: true }, "right", 10_000);
    const derive = vi.spyOn(crypto.subtle, "deriveKey").mockRejectedValue(new Error("KDF must not start"));
    try {
      await expect(decryptJson({ ...encrypted, ...patch } as typeof encrypted, "right")).rejects.toThrow("Invalid encrypted DeepRole payload");
      expect(derive).not.toHaveBeenCalled();
    } finally { derive.mockRestore(); }
  });
});

describe("fail-open DeepSeek request injection", () => {
  const context = "<deeprole_context>memory</deeprole_context>";

  it("injects into prompt and keeps the visible user text identifiable", () => {
    const result = injectIntoJsonBody(JSON.stringify({ prompt: "Hello" }), context);
    expect(result.changed).toBe(true);
    expect(JSON.parse(result.body).prompt).toContain("[User message]\nHello");
  });

  it("injects only into the latest user message", () => {
    const body = JSON.stringify({ data: { messages: [{ role: "user", content: "old" }, { role: "assistant", content: "reply" }, { role: "user", content: "new" }] } });
    const parsed = JSON.parse(injectIntoJsonBody(body, context).body);
    expect(parsed.data.messages[0].content).toBe("old");
    expect(parsed.data.messages[2].content).toContain("new");
  });

  it("replaces only the latest user text with a prepared service request", () => {
    const body = JSON.stringify({ data: { messages: [{ role: "user", content: "old" }, { role: "assistant", content: "reply" }, { role: "user", content: "DeepRole, update lore" }] } });
    const result = replaceOutgoingUserText(body, "[DeepRole Service]\n[Request ID: service_1]\nAnalyze");
    const parsed = JSON.parse(result.body);
    expect(result.changed).toBe(true);
    expect(parsed.data.messages[0].content).toBe("old");
    expect(parsed.data.messages[2].content).toBe("[DeepRole Service]\n[Request ID: service_1]\nAnalyze");
  });

  it("returns the original body when DeepSeek changes to an unknown shape", () => {
    const body = JSON.stringify({ future_payload: { text: "ordinary message" } });
    expect(injectIntoJsonBody(body, context)).toEqual({ changed: false, body });
  });

  it("recognizes service requests so memory injection can skip them", () => {
    expect(isDeepRoleServiceBody(JSON.stringify({ prompt: "[DeepRole Service]\nAnalyze" }))).toBe(true);
    expect(isDeepRoleServiceBody(JSON.stringify({ prompt: "ordinary roleplay" }))).toBe(false);
  });

  it("does not treat a past service turn or quoted marker as the current service request", () => {
    const body = JSON.stringify({ messages: [{ role: "user", content: "[DeepRole Service]\nAnalyze" }, { role: "assistant", content: "done" }, { role: "user", content: "Continue the story" }] });
    expect(isDeepRoleServiceBody(body)).toBe(false);
    expect(isDeepRoleServiceBody(JSON.stringify({ prompt: "What does [DeepRole Service] mean?" }))).toBe(false);
  });

  it("never injects backwards into history if the newest user turn already contains context", () => {
    const body = JSON.stringify({ messages: [{ role: "user", content: "old" }, { role: "user", content: `${context}\nnew` }] });
    expect(injectIntoJsonBody(body, context)).toEqual({ changed: false, body });
  });

  it("correlates service failures by the current request header, not history or lore text", () => {
    expect(deepRoleServiceRequestId(JSON.stringify({ prompt: "[DeepRole Service]\n[Request ID: service_123]\nAnalyze" }))).toBe("service_123");
    expect(deepRoleServiceRequestId(JSON.stringify({ prompt: "Lore mentions [Request ID: service_123]" }))).toBeNull();
    expect(deepRoleServiceRequestId(JSON.stringify({ messages: [{ role: "user", content: "[DeepRole Service]\n[Request ID: old]\nAnalyze" }, { role: "user", content: "Continue" }] }))).toBeNull();
  });

  it("does not target history, deletion or uploads", () => {
    expect(looksLikeChatUrl("https://chat.deepseek.com/api/v0/chat/completion")).toBe(true);
    expect(looksLikeChatUrl("https://chat.deepseek.com/api/v0/chat/history")).toBe(false);
    expect(looksLikeChatUrl("https://chat.deepseek.com/api/upload")).toBe(false);
    expect(looksLikeChatUrl("https://chat.deepseek.com/api/v0/chat_session/create")).toBe(false);
    expect(looksLikeChatUrl("https://chat.deepseek.com/api/v0/chat_session/fetch_page")).toBe(false);
  });
  it("reads the actual outgoing user draft, not an old message or assistant reply", () => {
    expect(outgoingUserText(JSON.stringify({ prompt: "Exact text" }))).toBe("Exact text");
    expect(outgoingUserText(JSON.stringify({ data: { message_list: [{ role: "user", content: "First" }, { role: "user", content: "Second" }, { role: "assistant", content: "Reply" }] } }))).toBe("Second");
    expect(outgoingUserText(JSON.stringify({ changed_format: { text: "Unknown" } }))).toBeNull();
    expect(outgoingUserText("not JSON")).toBeNull();
  });
});
