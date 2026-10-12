import { afterEach, describe, expect, it, vi } from "vitest";
import { checkActiveStoryDiagnostics, isDiagnosticChatUrl, StoryDiagnosticsClient, type DiagnosticPageScope } from "../src/adapters/story-diagnostics-client";
import { readNativeStoryHistory } from "../src/core/story-native-history";

const result = { status: "read", diagnostics: readNativeStoryHistory({ messages: [] }, "chat-a").diagnostics };
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
function page() {
  const scope: DiagnosticPageScope = { chatId: "chat-a", url: "original-url", generating: false, locked: false };
  let packet: any;
  const post = vi.spyOn(window, "postMessage").mockImplementation(value => { packet = value; });
  const client = new StoryDiagnosticsClient(window, () => scope);
  const reply = (probe: unknown = result, override = {}, origin = location.origin, source: Window | null = window) => window.dispatchEvent(new MessageEvent("message", { source, origin, data: { source: "deeprole-page-bridge", type: "NATIVE_STORY_METADATA_RESULT", requestId: packet?.requestId, chatId: "chat-a", probe, ...override } }));
  return { scope, client, post, reply };
}
describe("explicit content probe", () => {
  it("does nothing until asked, allows one probe, cleans up, and can run again", async () => {
    const p = page(); expect(p.post).not.toHaveBeenCalled(); const task = p.client.check();
    expect(p.post).toHaveBeenCalledWith(expect.objectContaining({ type: "NATIVE_STORY_METADATA_REQUEST", chatId: "chat-a" }), location.origin);
    expect(await p.client.check()).toEqual({ status: "unavailable", code: "busy" }); p.reply(); expect(await task).toEqual(result);
    const again = p.client.check(); p.reply(); expect(await again).toEqual(result); expect(p.post).toHaveBeenCalledTimes(2);
  });
  it.each(["no-chat", "vault-locked", "busy"] as const)("blocks %s before posting", async code => {
    const p = page(); if (code === "no-chat") p.scope.chatId = null; else if (code === "vault-locked") p.scope.locked = true; else p.scope.generating = true;
    expect(await p.client.check()).toEqual({ status: "unavailable", code }); expect(p.post).not.toHaveBeenCalled();
  });
  it("ignores another window/origin/request/chat/source/type", async () => {
    const p = page(), task = p.client.check(); let settled = false; void task.then(() => { settled = true; });
    p.reply(result, {}, "https://evil.example"); p.reply(result, {}, location.origin, null);
    for (const override of [{ requestId: "other" }, { chatId: "other" }, { source: "other" }, { type: "other" }]) p.reply(result, override);
    await Promise.resolve(); expect(settled).toBe(false); p.reply(); expect(await task).toEqual(result);
  });
  it.each(["url", "chatId", "locked", "generating"] as const)("discards a reply after %s changes even with a reused scope object", async field => {
    const p = page(), task = p.client.check(); if (field === "locked" || field === "generating") p.scope[field] = true; else p.scope[field] = "changed";
    p.reply(); expect(await task).toEqual({ status: "unavailable", code: "changed" });
  });
  it("rejects raw/private page fields and never returns an exception", async () => {
    const p = page(), task = p.client.check(); p.reply({ ...result, PRIVATE: "secret" }); expect(await task).toEqual({ status: "unavailable", code: "invalid-bridge" });
    p.post.mockImplementation(() => { throw new Error("PRIVATE_TOKEN"); }); expect(await p.client.check()).toEqual({ status: "unavailable", code: "not-connected" });
  });
  it("times out, removes the listener and releases the single-flight guard", async () => {
    vi.useFakeTimers(); const p = page(), removed = vi.spyOn(window, "removeEventListener"), task = p.client.check();
    await vi.advanceTimersByTimeAsync(5500); expect(await task).toEqual({ status: "unavailable", code: "timeout" }); expect(removed).toHaveBeenCalledWith("message", expect.any(Function));
    const again = p.client.check(); p.reply(); expect(await again).toEqual(result); expect(vi.getTimerCount()).toBe(0);
  });
  it("captures an exact anchor, ignores a different echoed anchor and requires v3 for anchored reports", async () => {
    const p=page(), client=new StoryDiagnosticsClient(window,()=>p.scope,()=>"2");
    const task=client.check();let settled=false;void task.then(()=>{settled=true;});
    expect(p.post).toHaveBeenLastCalledWith(expect.objectContaining({anchorId:"2"}),location.origin);
    p.reply(result,{anchorId:"3"});await Promise.resolve();expect(settled).toBe(false);
    p.reply(result,{anchorId:"2"});expect(await task).toEqual({status:"unavailable",code:"invalid-bridge"});
    const diagnostics=readNativeStoryHistory({messages:[{id:1,parent_id:null,role:"user"},{id:2,parent_id:1,role:"assistant",status:"FINISHED"}]},"chat-a",{collectReplyProbe:true,anchorId:"2"}).diagnostics;
    const again=client.check();p.reply({status:"read",diagnostics},{anchorId:"2"});expect(await again).toEqual({status:"read",diagnostics});
  });
  it.each([null,"3"])("discards the old report when the visible anchor becomes %s", async next=>{
    const p=page();let anchor:string|null="2";const client=new StoryDiagnosticsClient(window,()=>p.scope,()=>anchor);
    const task=client.check();anchor=next;p.reply(result,{anchorId:"2"});expect(await task).toEqual({status:"unavailable",code:"changed"});
  });
  it("rejects a non-native anchor before requesting history", async()=>{
    const p=page(),client=new StoryDiagnosticsClient(window,()=>p.scope,()=>"invalid key");
    expect(await client.check()).toEqual({status:"unavailable",code:"invalid-bridge"});expect(p.post).not.toHaveBeenCalled();
  });
  it.each([null,"2"])("rejects a v3 anchor-presence claim that disagrees with the captured DOM anchor %s",async anchor=>{
    const p=page(),client=new StoryDiagnosticsClient(window,()=>p.scope,()=>anchor);
    const diagnostics=readNativeStoryHistory({messages:[{id:1,parent_id:null,role:"user"},{id:2,parent_id:1,role:"assistant"}]},"chat-a",{collectReplyProbe:true,anchorId:anchor===null?"2":null}).diagnostics;
    const task=client.check();p.reply({status:"read",diagnostics},anchor===null?{}:{anchorId:anchor});expect(await task).toEqual({status:"unavailable",code:"invalid-bridge"});
  });
});
describe("active-tab routing", () => {
  const tab = { id: 12, url: "https://chat.deepseek.com/a/chat/s/chat-a" };
  it.each([tab.url, "https://chat.deepseek.com/a/chat/chat-a", "https://chat.deepseek.com/chat/s/chat-a"])("recognizes a supported chat URL %s", url => { expect(isDiagnosticChatUrl(url)).toBe(true); });
  it.each([undefined, "PRIVATE", "http://chat.deepseek.com/chat/a", "https://evil.example/chat/a", "https://chat.deepseek.com.evil.example/chat/a", "https://u:p@chat.deepseek.com/chat/a", "https://chat.deepseek.com/sign-in", "https://chat.deepseek.com/", "https://chat.deepseek.com/chat/a/extra"])("does not route to an unrelated tab %#", url => { expect(isDiagnosticChatUrl(url)).toBe(false); });
  it("sends only a command, rechecks the active tab and returns a sanitized summary", async () => {
    const tabs = { query: vi.fn().mockResolvedValue([tab]), sendMessage: vi.fn().mockResolvedValue(result) };
    expect(await checkActiveStoryDiagnostics(tabs)).toEqual(result); expect(tabs.sendMessage).toHaveBeenCalledWith(12, { type: "DR_STORY_DIAGNOSTICS" }); expect(tabs.query).toHaveBeenCalledTimes(2);
  });
  it("does not send when there is no active DeepSeek chat", async () => {
    const tabs = { query: vi.fn().mockResolvedValue([]), sendMessage: vi.fn() }; expect(await checkActiveStoryDiagnostics(tabs)).toEqual({ status: "unavailable", code: "no-chat" }); expect(tabs.sendMessage).not.toHaveBeenCalled();
  });
  it.each([{ ...tab, id: 13 }, { ...tab, url: tab.url + "?changed" }])("discards a result after switching tab or URL %#", async next => {
    const tabs = { query: vi.fn().mockResolvedValueOnce([tab]).mockResolvedValueOnce([next]), sendMessage: vi.fn().mockResolvedValue(result) };
    expect(await checkActiveStoryDiagnostics(tabs)).toEqual({ status: "unavailable", code: "changed" });
  });
  it("never returns raw runtime errors or unknown responses", async () => {
    const tabs = { query: vi.fn().mockResolvedValue([tab]), sendMessage: vi.fn().mockRejectedValue(new Error("PRIVATE")) };
    expect(await checkActiveStoryDiagnostics(tabs)).toEqual({ status: "unavailable", code: "not-connected" }); tabs.sendMessage.mockResolvedValue({ PRIVATE: "secret" }); expect(await checkActiveStoryDiagnostics(tabs)).toEqual({ status: "unavailable", code: "invalid-bridge" });
  });
  it("does not start a late probe after a timed-out tab lookup", async () => {
    vi.useFakeTimers(); let resolve!: (v: typeof tab[]) => void;
    const tabs = { query: vi.fn().mockReturnValue(new Promise(r => { resolve = r; })), sendMessage: vi.fn() }, task = checkActiveStoryDiagnostics(tabs);
    await vi.advanceTimersByTimeAsync(6500); expect(await task).toEqual({ status: "unavailable", code: "timeout" }); resolve([tab]); await Promise.resolve(); expect(tabs.sendMessage).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
});
