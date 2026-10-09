import { expect, it } from "vitest";
import { castChatReference, castChatLink } from "../src/core/cast-chat";

it.each(["/a/chat/s/owned", "/chat/s/owned", "/a/chat/owned", "/chat/owned"])("preserves the observed native route %s, without restarting the service job", path => {
 expect(castChatReference("https://chat.deepseek.com" + path + "?deeprole_cast_job=cast-private#temporary")).toEqual({ id:"owned", url:"https://chat.deepseek.com" + path });
 expect(castChatLink("owned", "https://chat.deepseek.com" + path)).toBe("https://chat.deepseek.com" + path);
});
it.each(["https://chat.deepseek.com/", "https://chat.deepseek.com/a/chat", "https://chat.deepseek.com/chat/s", "https://chat.deepseek.com/a/chat/s/", "https://chat.deepseek.com/chat/s/owned/extra", "https://other.example/a/chat/s/owned", "https://chat.deepseek.com.other.example/a/chat/s/owned", "http://chat.deepseek.com/a/chat/s/owned", "https://secret@chat.deepseek.com/a/chat/s/owned", "javascript:alert(1)"])("rejects a missing or unsafe actual chat address: %s", url => {
 expect(castChatReference(url)).toBeUndefined(); expect(castChatLink("owned", url)).toBeUndefined();
});
it("uses the native /a route only for legacy jobs that have a valid saved ID but no URL", () => {
 expect(castChatLink("owned")).toBe("https://chat.deepseek.com/a/chat/s/owned");
 for(const id of [undefined, "", "s", "../personal", "owned?new=1", "x".repeat(121)]) expect(castChatLink(id)).toBeUndefined();
 expect(castChatLink("owned", "https://chat.deepseek.com/a/chat/s/personal")).toBeUndefined();
});
