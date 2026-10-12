import { describe, expect, it } from "vitest";
import { readNativeStoryHistory } from "../src/core/story-native-history";
import { readStoryDiagnosticResult, storyDiagnosticReport } from "../src/core/story-diagnostics";
import { readStoryReplyProbe } from "../src/core/story-reply-probe";

const user = { id: 1, parent_id: null, role: "user", status: "FINISHED" };
const assistant = { id: 2, parent_id: 1, role: "assistant", status: "FINISHED", content: "PRIVATE_REPLY", is_finished: true, is_selected: true };
function read(messages: unknown[] = [user, assistant], anchorId: string | null = "2", extra = {}) {
  const diagnostics=readNativeStoryHistory({ data: { biz_data: { ...extra, messages } } }, "PRIVATE_CHAT", { collectReplyProbe: true, anchorId }).diagnostics;
  if(diagnostics.diagnosticVersion!==3)throw Error("Expected v3");
  return { status: "read" as const, diagnostics };
}
describe("exact visible reply observations, never lifecycle/selection proof", () => {
  it("keeps previous unknown statuses separate from the anchored reply; rebuilds a safe v3 report", () => {
    const result=read([user, { ...assistant, id: 3, status: "PRIVATE_UNKNOWN" }, assistant], "2", { current_message_id: 2, selected_message_id: 3, last_message_id: "PRIVATE_OUTSIDE" });
    expect(result.diagnostics.replyProbe).toMatchObject({ anchor: "matched", role: "assistant", parent: "in-window", siblingReplies: 2, childMessages: 0, selection: "unknown", completion: "unknown",
      fields: [{ field: "status", type: "string", state: "FINISHED" }, { field: "is_finished", state: "true" }, { field: "is_selected", state: "true" }],
      references: [{ relation: "anchor" }, { relation: "other-in-window" }, { relation: "outside-window" }] });
    expect(result.diagnostics.statusCounts).toContainEqual({ field: "status", role: "assistant", state: "unrecognized-string", count: 1 });
    const safe=readStoryDiagnosticResult(result)!;expect(safe).toEqual(result);expect(safe).not.toBe(result);
    const report=storyDiagnosticReport(safe, 10)!;expect(JSON.parse(report)).toMatchObject({ diagnosticVersion: 3, automaticStoryIngestion: "not-checked" });expect(report).not.toMatch(/PRIVATE|nativeMessageKey|anchorId|chatId/);
    result.diagnostics.replyProbe.fields[0]!.state="PRIVATE_MUTATED"; expect(storyDiagnosticReport(safe,10)).not.toContain("PRIVATE");
  });
  it("does not treat a FINISHED unique leaf, booleans or reference matches as proof", () => {
    const p=read().diagnostics.replyProbe;expect(p.siblingReplies).toBe(1);expect(p.selection).toBe("unknown");expect(p.completion).toBe("unknown");
  });
  it("uses exact IDs regardless of response order, similar text or which branch has children", () => {
    const result=read([{ id:4,parent_id:3,role:"user" }, { ...assistant,id:3 }, assistant,user]);
    expect(result.diagnostics.replyProbe).toMatchObject({ anchor:"matched",siblingReplies:2,childMessages:0 });
    expect(read([user,assistant],"99").diagnostics.replyProbe).toMatchObject({anchor:"not-in-history",fields:[],role:"unknown",siblingReplies:null});
  });
  it.each([null,"__proto__","not valid"])("does not guess when the anchor is unavailable: %s", anchor => {
    const result=read(undefined,anchor);expect(result.diagnostics.replyProbe).toMatchObject({anchor:"not-supplied",fields:[],role:"unknown"});expect(readStoryDiagnosticResult(result)).toEqual(result);
  });
  it("represents explicit roots, user anchors and an external parent without guessing", () => {
    expect(read([user,assistant],"1").diagnostics.replyProbe).toMatchObject({role:"user",parent:"root",siblingReplies:null,childMessages:1});
    const boundary=read([{...assistant,parent_id:99}]);expect(boundary.diagnostics.replyProbe).toMatchObject({parent:"outside-window",siblingReplies:1});expect(readStoryDiagnosticResult(boundary)).toEqual(boundary);
    const root=read([{...assistant,parent_id:null}]);expect(root.diagnostics.replyProbe).toMatchObject({parent:"root",siblingReplies:null});expect(readStoryDiagnosticResult(root)).toEqual(root);
  });
  it.each([
    [user,assistant,assistant], [user,{...assistant,message_id:99}], [user,{...assistant,parent_message_id:99}], [user,{...assistant,parent_id:2}],
    [{...user,parent_id:2},assistant], [user,{...assistant,role:"user"}], [user,{id:2,role:"assistant"}],
  ].map(messages => [messages]))("withholds per-reply observations from an invalid graph %#", messages => {
    const result=read(messages);expect(result.diagnostics.replyProbe).toMatchObject({anchor:"invalid-history",fields:[],references:[],siblingReplies:null});expect(readStoryDiagnosticResult(result)).toEqual(result);
  });
  it("does not copy arbitrary status, reason, timestamps, flags, reference values or names", () => {
    const result=read([user,{...assistant,status:"PRIVATE_STATUS",message_status:{secret:"PRIVATE"},finish_reason:"PRIVATE_REASON",finished_at:"PRIVATE_DATE",is_complete:"PRIVATE_FLAG",is_current:false,other_field:"PRIVATE"}],"2",{current_message_id:{secret:"PRIVATE"},selected_message_id:null,other_message_id:"PRIVATE"});
    expect(result.diagnostics.replyProbe.fields).toContainEqual({field:"finish_reason",type:"string",state:null});expect(result.diagnostics.replyProbe.fields).toContainEqual({field:"message_status",type:"object",state:"non-string"});
    expect(storyDiagnosticReport(result,0)).not.toMatch(/PRIVATE|other_field|other_message_id/);expect(readStoryDiagnosticResult(result)).toEqual(result);
  });
  it("collects candidate references only on the decoder's bounded envelope layers", () => {
    const result=readNativeStoryHistory({ current_message_id:2, data:{selected_message_id:1,biz_data:{messages:[user,assistant],last_message_id:99}},unrelated:{selected_message_id:2} },"chat",{collectReplyProbe:true,anchorId:"2"});
    expect(result.diagnostics.diagnosticVersion===3&&result.diagnostics.replyProbe.references).toEqual([{path:"$",field:"current_message_id",relation:"anchor"},{path:"$.data",field:"selected_message_id",relation:"other-in-window"},{path:"$.data.biz_data",field:"last_message_id",relation:"outside-window"}]);
  });
  it.each([
    (p:any)=>{p.selection="selected";}, (p:any)=>{p.completion="complete";}, (p:any)=>{p.nativeId="PRIVATE";}, (p:any)=>{p.fields[0].state="PRIVATE";},
    (p:any)=>{p.fields[0].field="PRIVATE";}, (p:any)=>{p.fields[0].type="PRIVATE";}, (p:any)=>{p.fields[0].raw="PRIVATE";}, (p:any)=>{p.fields.push(p.fields[0]);},
    (p:any)=>{p.fields[0].state="non-string";}, (p:any)=>{p.fields[1].state="FINISHED";}, (p:any)=>{p.siblingReplies=0;}, (p:any)=>{p.childMessages=-1;},
    (p:any)=>{p.parent="unknown";}, (p:any)=>{p.role="unknown";}, (p:any)=>{p.anchor="not-supplied";},
    (p:any)=>{p.references=[{path:"$.PRIVATE",field:"current_message_id",relation:"anchor"}];}, (p:any)=>{p.references=[{path:"$",field:"PRIVATE",relation:"anchor"}];},
    (p:any)=>{p.references=[{path:"$",field:"current_message_id",relation:"PRIVATE"}];}, (p:any)=>{const r={path:"$",field:"current_message_id",relation:"anchor"};p.references=[r,r];},
  ])("rejects malformed or leaking per-reply data before display/copy %#", mutate => {
    const result=read();mutate(result.diagnostics.replyProbe);expect(readStoryReplyProbe(result.diagnostics.replyProbe)).toBeNull();expect(readStoryDiagnosticResult(result)).toBeNull();expect(storyDiagnosticReport(result,0)).toBeNull();
  });
  it.each([
    (r:any)=>{r.diagnostics.replyProbe.siblingReplies=99;}, (r:any)=>{r.diagnostics.replyProbe.childMessages=2;},
    (r:any)=>{r.diagnostics.replyProbe.fields[0].state="ERROR";}, (r:any)=>{r.diagnostics.replyProbe.fields[0].type="object";r.diagnostics.replyProbe.fields[0].state="non-string";},
    (r:any)=>{r.diagnostics.replyProbe.parent="outside-window";}, (r:any)=>{r.diagnostics.replyProbe.anchor="invalid-history";r.diagnostics.replyProbe.role="unknown";r.diagnostics.replyProbe.parent="unknown";r.diagnostics.replyProbe.siblingReplies=null;r.diagnostics.replyProbe.childMessages=null;r.diagnostics.replyProbe.fields=[];},
  ])("rejects inconsistent v3 summaries %#", mutate=>{const result=read();mutate(result);expect(readStoryDiagnosticResult(result)).toBeNull();});
  it("keeps existing normal reads v1 and opt-in aggregate reads v2",()=>{
    expect(readNativeStoryHistory({messages:[user,assistant]},"chat").diagnostics.diagnosticVersion).toBe(1);
    expect(readNativeStoryHistory({messages:[user,assistant]},"chat",{collectStatuses:true}).diagnostics.diagnosticVersion).toBe(2);
  });
});
