import { describe, expect, it } from "vitest";
import { annotateNativeStoryPurposes } from "../src/core/story-purpose";
import { nativeStoryMessageKey as key, type NativeStoryIdentity } from "../src/core/story-transport";

const chat="purpose-chat";
const row=(id:number,parent:number|null,role:NativeStoryIdentity["role"]):NativeStoryIdentity=>({role,nativeMessageKey:key(String(id)),nativeParentKey:parent===null?null:key(String(parent))});
const graph=[row(1,null,"user"),row(2,1,"assistant"),row(3,2,"user"),row(4,3,"assistant"),row(5,4,"user"),row(6,5,"assistant")];
const receipt=(id:string,purpose="story",delivery="accepted",parent:number|null=null,turn="user-turn")=>({requestId:id,chatId:chat,nativeParentKey:parent===null?null:key(String(parent)),turn,purpose,delivery});
const link=(id:string,user=1,assistant=2,parent:number|null=null)=>({requestId:id,chatId:chat,nativeParentKey:parent===null?null:key(String(parent)),userMessageKey:key(String(user)),assistantMessageKey:key(String(assistant))});
const purposes=(result:ReturnType<typeof annotateNativeStoryPurposes>)=>result.messages?.map(m=>m.purpose);

describe("trusted local purpose, independent of story text and completion codes",()=>{
  it("annotates confirmed pairs while retaining service parents and all unknown nodes",()=>{
    const result=annotateNativeStoryPurposes(chat,graph,[receipt("game-a"),receipt("field-a","service","accepted",2),receipt("game-b","story","accepted",4)],[link("game-a"),link("field-a",3,4,2),link("game-b",5,6,4)]);
    expect(result.status).toBe("annotated");expect(purposes(result)).toEqual(["story","story","service","service","story","story"]);
    expect(result.messages?.map(m=>m.identity)).toEqual(graph);expect(result.messages?.[4]?.identity.nativeParentKey).toBe(key("4"));
    expect(result.messages?.[2]?.requestIds).toEqual(["field-a"]);expect(result.issueCount).toBe(0);
  });
  it("does not classify unlinked old messages, FINISHED, names, model claims, or manually pasted diagnostics",()=>{
    const result=annotateNativeStoryPurposes(chat,graph,[],[]);expect(purposes(result)).toEqual(Array(6).fill("unknown"));expect(result.status).toBe("annotated");
    expect(annotateNativeStoryPurposes(chat,graph,[receipt("unlinked","service")],[])).toEqual(result);
  });
  it("requires both the accepted local receipt and explicit response association",()=>{
    for(const delivery of ["prepared","failed","unknown"]){const result=annotateNativeStoryPurposes(chat,graph,[receipt("a","service",delivery)],[link("a")]);expect(result.status).toBe("paused");expect(result.issues[0]?.code).toBe("request-unaccepted");expect(purposes(result)).toEqual(Array(6).fill("unknown"));}
    const missing=annotateNativeStoryPurposes(chat,graph,[],[link("a")]);expect(missing.issues[0]?.code).toBe("request-missing");
  });
  it("does not infer purpose for a following reply even if it has a known service parent",()=>{
    const result=annotateNativeStoryPurposes(chat,graph,[receipt("field","service","accepted",2)],[link("field",3,4,2)]);
    expect(purposes(result)).toEqual(["unknown","unknown","service","service","unknown","unknown"]);
  });
  it("supports a retry with the same user and multiple distinct response IDs without selecting one",()=>{
    const messages=[row(1,null,"user"),row(2,1,"assistant"),row(7,1,"assistant")];
    const result=annotateNativeStoryPurposes(chat,messages,[receipt("a"),receipt("retry","story","accepted",1,"assistant-retry")],[link("a"),link("retry",1,7,1)]);
    expect(result.status).toBe("annotated");expect(purposes(result)).toEqual(["story","story","story"]);expect(result.messages?.[0]?.requestIds).toEqual(["a","retry"]);
  });
  it("is idempotent for identical receipts/links and deterministic for their order",()=>{
    const a=receipt("a"),b=receipt("b");const first=annotateNativeStoryPurposes(chat,[row(1,null,"user"),row(2,1,"assistant"),row(7,1,"assistant")],[a,b,a],[link("b",1,7),link("a"),link("a")]);
    const second=annotateNativeStoryPurposes(chat,[row(1,null,"user"),row(2,1,"assistant"),row(7,1,"assistant")],[b,a],[link("a"),link("b",1,7)]);expect(first).toEqual(second);
  });
  it("accepts explicit out-of-window parents, never inventing an earlier game/service chain",()=>{
    const result=annotateNativeStoryPurposes(chat,[row(3,99,"user"),row(4,3,"assistant")],[receipt("a","service","accepted",99)],[link("a",3,4,99)]);
    expect(purposes(result)).toEqual(["service","service"]);expect(result.messages?.[0]?.identity.nativeParentKey).toBe(key("99"));
  });
  it("keeps a local unknown policy decision unknown even after an accepted, linked reply",()=>{
    const result=annotateNativeStoryPurposes(chat,graph,[receipt("a","unknown")],[link("a")]);expect(result.status).toBe("annotated");expect(purposes(result)).toEqual(Array(6).fill("unknown"));expect(result.messages?.[0]?.requestIds).toEqual([]);
  });
  it.each([
    {receipts:[receipt("a"),{...receipt("a"),purpose:"service"}],links:[link("a")],code:"receipt-conflict"},
    {receipts:[receipt("a"),{...receipt("a"),delivery:"failed"}],links:[link("a")],code:"receipt-conflict"},
    {receipts:[{...receipt("a"),chatId:"foreign"}],links:[link("a")],code:"chat-mismatch"},
    {receipts:[receipt("a")],links:[{...link("a"),chatId:"foreign"}],code:"chat-mismatch"},
    {receipts:[receipt("a")],links:[link("a"),link("a",3,4,2)],code:"link-conflict"},
    {receipts:[receipt("a"),receipt("b","service")],links:[link("a"),link("b")],code:"purpose-conflict"},
    {receipts:[receipt("a"),receipt("b","service")],links:[link("a"),link("b",1,7)],code:"purpose-conflict"},
    {receipts:[receipt("a"),receipt("b")],links:[link("a"),link("b")],code:"assistant-conflict"},
    {receipts:[receipt("a")],links:[link("a",3,4,99)],code:"parent-mismatch"},
    {receipts:[receipt("a")],links:[link("a",1,4)],code:"pair-mismatch"},
    {receipts:[receipt("a","story","accepted",1)],links:[link("a",1,7,1)],code:"parent-mismatch"},
    {receipts:[receipt("a","story","accepted",1,"assistant-retry")],links:[link("a",1,7)],code:"parent-mismatch"},
    {receipts:[receipt("a","story","accepted",null,"assistant-retry")],links:[link("a",1,7)],code:"parent-mismatch"},
    {receipts:[receipt("a")],links:[link("a",99,2)],code:"message-missing"},
  ])("withholds every purpose when provenance is contradictory: $code",({receipts,links,code})=>{
    const messages=[...graph,row(7,1,"assistant")];const result=annotateNativeStoryPurposes(chat,messages,receipts,links);
    expect(result.status).toBe("paused");expect(result.issues.map(i=>i.code)).toContain(code);expect(purposes(result)).toEqual(Array(7).fill("unknown"));expect(result.messages?.every(m=>m.requestIds.length===0)).toBe(true);
  });
  it.each([
    [receipt("__proto__")], [{...receipt("a"),purpose:"PRIVATE"}], [{...receipt("a"),content:"PRIVATE"}], [{...receipt("a"),delivery:"FINISHED"}], [{...receipt("a"),turn:"PRIVATE"}], [{...receipt("a"),nativeParentKey:"PRIVATE"}], [null], "PRIVATE",
  ].map(receipts=>[receipts]))("rejects malformed receipts without returning raw data %#",receipts=>{
    const result=annotateNativeStoryPurposes(chat,graph,receipts,[]);expect(result.status).toBe("paused");expect(JSON.stringify(result.issues)).not.toContain("PRIVATE");
  });
  it.each([
    {...link("a"),content:"PRIVATE"},{...link("a"),userMessageKey:key("2")},{...link("a"),assistantMessageKey:key("1")},{...link("a"),assistantMessageKey:key("1"),userMessageKey:key("1")},{...link("a"),nativeParentKey:"PRIVATE"},null,
  ])("rejects malformed or role-swapped links %#",value=>{
    const result=annotateNativeStoryPurposes(chat,graph,[receipt("a")],[value]);expect(result.status).toBe("paused");expect(purposes(result)).toEqual(Array(6).fill("unknown"));expect(JSON.stringify(result.issues)).not.toContain("PRIVATE");
  });
  it.each([
    null,[graph[0],graph[0]],[row(1,2,"user"),row(2,1,"assistant")],[row(1,null,"user"),row(2,1,"user")],[{...graph[0],private:"PRIVATE"}],[{...graph[0],nativeParentKey:undefined}],
  ].map(metadata=>[metadata]))("rejects an ambiguous graph without dropping parents or inventing labels %#",metadata=>{
    const result=annotateNativeStoryPurposes(chat,metadata,[],[]);expect(result.status).toBe("paused");expect(result.messages).toBeNull();expect(result.issues[0]?.code).toBe("metadata-invalid");
  });
  it("does not mutate or retain caller-owned objects",()=>{
    const messages=structuredClone(graph),receipts=[receipt("a")],links=[link("a")],before=JSON.stringify({messages,receipts,links});
    const result=annotateNativeStoryPurposes(chat,messages,receipts,links);expect(JSON.stringify({messages,receipts,links})).toBe(before);
    messages[0]!.nativeParentKey=key("88");links[0]!.nativeParentKey=key("99");receipts[0]!.purpose="service";
    expect(result.messages?.[0]).toMatchObject({purpose:"story",identity:{nativeParentKey:null},requestIds:["a"]});
    result.messages![0]!.identity.nativeMessageKey=key("111");expect(messages[0]!.nativeMessageKey).toBe(key("1"));
  });
  it.each([null,{},"PRIVATE",Array(100001).fill(link("a"))])("rejects an invalid/oversized link batch %#",links=>{
    const result=annotateNativeStoryPurposes(chat,graph,[],links);expect(result.status).toBe("paused");expect(result.issues[0]?.code).toBe("links-invalid");expect(purposes(result)).toEqual(Array(6).fill("unknown"));
  });
  it("does not label a received pair based on HTTP acceptance without its response link",()=>{
    expect(purposes(annotateNativeStoryPurposes(chat,graph,[receipt("a")],[]))).toEqual(Array(6).fill("unknown"));
    expect(annotateNativeStoryPurposes(chat,graph,Array(100001).fill(receipt("a")),[]).issues[0]?.code).toBe("receipts-invalid");
  });
  it("supports a service retry without creating another user or choosing a variant",()=>{
    const metadata=[row(3,2,"user"),row(4,3,"assistant"),row(8,3,"assistant")];
    const result=annotateNativeStoryPurposes(chat,metadata,[receipt("field","service","accepted",2),receipt("retry","service","accepted",3,"assistant-retry")],[link("field",3,4,2),link("retry",3,8,3)]);
    expect(result.status).toBe("annotated");expect(result.messages).toHaveLength(3);expect(purposes(result)).toEqual(["service","service","service"]);
  });
  it("bounds one response/proof batch and diagnostics without imposing a world-character cap",()=>{
    const large=Array.from({length:5000},(_,i)=>row(i+1,i?i:null,i%2?"assistant":"user"));const result=annotateNativeStoryPurposes(chat,large,[],[]);expect(result.messages).toHaveLength(5000);
    const invalid=annotateNativeStoryPurposes(chat,graph,Array.from({length:80},()=>({private:"PRIVATE"})),[]);expect(invalid.issues).toHaveLength(40);expect(invalid.issueCount).toBe(80);
    expect(annotateNativeStoryPurposes(chat,Array(100001).fill(graph[0]),[],[]).messages).toBeNull();
    expect(annotateNativeStoryPurposes("invalid chat",graph,[],[]).status).toBe("paused");
  });
});
