import {afterEach,expect,it} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {memoryDeliveryView} from "../src/core/memory-delivery-view";
import {memoryDeliveryText} from "../src/core/memory-delivery-i18n";
import {MemoryDeliverySummary} from "../src/entrypoints/shared/MemoryDeliverySummary";
import {validStoryDispatchCapture,type StoryDispatchCapture} from "../src/core/story-dispatch-capture";
afterEach(cleanup);
const scope={worldId:"world",bindingId:"binding",chatId:"chat"};
function capture(patch:Partial<StoryDispatchCapture>={}):StoryDispatchCapture {
 const c:StoryDispatchCapture={format:"deeprole-story-dispatch",contractVersion:1,id:"request-a",...scope,
  identity:{chatId:scope.chatId,nativeParentKey:null},ownerTabId:2,origin:"local",purpose:"user-turn",transport:"fetch",
  sceneRevision:null,originalDraft:"PRIVATE_DRAFT",proposedContext:"PRIVATE_PREFIX",injection:"unconfirmed",started:false,
  delivery:null,wire:{phase:"waiting",link:null,sawFinish:false,issue:null},createdAt:100,updatedAt:100,...patch};
 // chatId is not a capture field.
 delete (c as any).chatId;
 expect(validStoryDispatchCapture(c)).toBe(true);return c;
}
it("separates prepared, confirmed, started and HTTP acceptance without exposing a draft",()=>{
 const c=capture(),before=structuredClone(c);
 expect(memoryDeliveryView([c],scope)).toEqual({at:100,stage:"prepared",injection:"unconfirmed",responseInterrupted:false});
 const confirmed=capture({injection:"context"});expect(memoryDeliveryView([confirmed],scope)).toMatchObject({stage:"confirmed",context:"PRIVATE_PREFIX"});
 expect(memoryDeliveryView([capture({injection:"context",started:true})],scope)?.stage).toBe("started");
 const v=memoryDeliveryView([capture({injection:"context",started:true,delivery:{status:"accepted",httpStatus:200}})],scope);
 expect(v).toMatchObject({stage:"accepted",context:"PRIVATE_PREFIX"});expect(JSON.stringify(v)).not.toMatch(/PRIVATE_DRAFT|request-a|binding|chatId|ownerTabId|httpStatus/);expect(c).toEqual(before);
});
it("does not expose proposed memory for non-injected or unconfirmed requests, including failed sends",()=>{
 expect(memoryDeliveryView([capture({injection:"none",started:true,delivery:{status:"failed",code:"http",httpStatus:500}})],scope)).toEqual({at:100,stage:"failed",injection:"none",responseInterrupted:false});
 expect(memoryDeliveryView([capture({proposedContext:"UNSENT_SECRET"})],scope)).not.toHaveProperty("context");
});
it("requires exact world, binding, chat and local game-purpose scope; ignores invalid or service captures",()=>{
 const c=capture();
 for(const [key,value] of Object.entries(scope))expect(memoryDeliveryView([c],{...scope,[key]:value+"-foreign"})).toBeUndefined();
 expect(memoryDeliveryView([c],null)).toBeUndefined();
 expect(memoryDeliveryView([capture({origin:"restored"}),capture({purpose:"out-of-character"}),capture({originalDraft:"[DeepRole Service]\nsecret"}),capture({originalDraft:"<deeprole_character_mode>"}),{...c,started:true}],scope)).toBeUndefined();
});
it("chooses the newest attempt, not the last updated old response; ties are unavailable",()=>{
 const old=capture({injection:"context",started:true,delivery:{status:"accepted",httpStatus:200},updatedAt:900});
 const newer=capture({id:"request-b",createdAt:200,updatedAt:200});
 expect(memoryDeliveryView([newer,old],scope)).toMatchObject({at:200,stage:"prepared"});
 expect(memoryDeliveryView([old,capture({id:"request-c"})],scope)).toBeUndefined();
});
it("does not turn an interrupted response into unaccepted HTTP delivery or finished reply",()=>{
 const c=capture({transport:"xhr",injection:"context",started:true,delivery:{status:"accepted",httpStatus:200},wire:{phase:"failed",link:null,sawFinish:false,issue:"aborted"}});
 expect(memoryDeliveryView([c],scope)).toMatchObject({stage:"accepted",responseInterrupted:true});
});
it.each(["ru","en"] as const)("shows a read-only historical receipt in %s, never a safe report or model-use guarantee",locale=>{
 const t=memoryDeliveryText(locale),v=memoryDeliveryView([capture({injection:"context",started:true,delivery:{status:"accepted",httpStatus:200}})],scope);
 const {container}=render(<MemoryDeliverySummary locale={locale} receipt={v}/>);
 expect(screen.getByText(t.accepted)).toBeInTheDocument();expect(screen.getByText(t.historical)).toBeInTheDocument();expect(screen.getByText(t.use)).toBeInTheDocument();
 expect(screen.queryByRole("textbox",{hidden:true})).toBeNull();
 const nested=screen.getByText(t.payload).parentElement as HTMLDetailsElement;nested.open=true;fireEvent(nested,new Event("toggle"));
 const area=screen.getByRole("textbox",{hidden:true}) as HTMLTextAreaElement;expect(area.readOnly).toBe(true);expect(area.value).toBe("PRIVATE_PREFIX");expect(screen.getByText(t.payloadHint)).toBeInTheDocument();
 expect(container.innerHTML).not.toContain("PRIVATE_DRAFT");expect(container.querySelector("button")).toBeNull();
});
it("removes the local prefix when receipt scope is cleared",()=>{
 const {rerender,container}=render(<MemoryDeliverySummary locale="en" receipt={memoryDeliveryView([capture({injection:"context"})],scope)}/>);
 rerender(<MemoryDeliverySummary locale="en"/>);expect(container).toBeEmptyDOMElement();
});
