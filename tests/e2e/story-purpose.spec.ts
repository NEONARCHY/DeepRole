import { expect, test } from "@playwright/test";

for(const locale of ["ru","en"] as const)test(`native purpose preserves mixed service/manual/game ancestry in ${locale}`,async({page})=>{
  await page.goto("/tests/fixtures/deepseek.html");
  const result=await page.evaluate(async locale=>{
    const nativeUrl="/src/core/story-native-history.ts",purposeUrl="/src/core/story-purpose.ts";
    const {readNativeStoryHistory}=await import(nativeUrl),{annotateNativeStoryPurposes}=await import(purposeUrl);
    const k=(id:number)=>JSON.stringify(["message",String(id)]),chatId="purpose-browser";
    const rows=Array.from({length:8},(_,i)=>({id:i+1,parent_id:i?i:null,role:i%2?"ASSISTANT":"USER",status:i===7?"PRIVATE_STATUS":"FINISHED",content:i===2?"[DeepRole Service]\n[Request ID: field]\nPRIVATE_FIELD":i===4?"PRIVATE_MANUALLY_PASTED_DIAGNOSTIC":locale==="ru"?"PRIVATE_RU_STORY":"PRIVATE_EN_STORY"}));
    const graph=readNativeStoryHistory({data:{biz_data:{messages:rows}}},chatId).messages;
    const receipt=(requestId:string,purpose:string,u:number)=>({requestId,chatId,nativeParentKey:u===1?null:k(u-1),turn:"user-turn",purpose,delivery:"accepted"});
    const link=(requestId:string,u:number,a:number)=>({requestId,chatId,nativeParentKey:u===1?null:k(u-1),userMessageKey:k(u),assistantMessageKey:k(a)});
    const receipts=[receipt("game-a","story",1),receipt("field","service",3),receipt("game-b","story",7)],links=[link("game-a",1,2),link("field",3,4),link("game-b",7,8)];
    const before=JSON.stringify({graph,receipts,links}),composer=document.querySelector("textarea")!;
    composer.value=locale==="ru"?"Неотправленный черновик":"Unsent draft";const draft=composer.value;const html=document.body.innerHTML;
    const noProof=annotateNativeStoryPurposes(chatId,graph,[],[]),annotated=annotateNativeStoryPurposes(chatId,graph,receipts,links);
    return {noProof,annotated,inputsUnchanged:JSON.stringify({graph,receipts,links})===before,domUnchanged:document.body.innerHTML===html,draftUnchanged:composer.value===draft};
  },locale);
  expect(result.noProof.messages.map((m:any)=>m.purpose)).toEqual(Array(8).fill("unknown"));
  expect(result.annotated.messages.map((m:any)=>m.purpose)).toEqual(["story","story","service","service","unknown","unknown","story","story"]);
  expect(result.annotated.messages[4].identity.nativeParentKey).toBe('["message","4"]');expect(result.annotated.messages[6].identity.nativeParentKey).toBe('["message","6"]');
  expect(result.inputsUnchanged&&result.domUnchanged&&result.draftUnchanged).toBe(true);expect(JSON.stringify(result)).not.toContain("PRIVATE");
});

test("late request association and conflicting claims never drop nodes or create an automatic game source",async({page})=>{
  await page.goto("/tests/fixtures/deepseek.html");
  const result=await page.evaluate(async()=>{
    const moduleUrl="/src/core/story-purpose.ts",{annotateNativeStoryPurposes}=await import(moduleUrl),chatId="purpose-browser",k=(n:number)=>JSON.stringify(["message",String(n)]);
    const metadata=[{role:"user",nativeMessageKey:k(1),nativeParentKey:null},{role:"assistant",nativeMessageKey:k(2),nativeParentKey:k(1)},{role:"assistant",nativeMessageKey:k(3),nativeParentKey:k(1)}];
    const receipts=[{requestId:"service-a",chatId,nativeParentKey:null,turn:"user-turn",purpose:"service",delivery:"accepted"}];
    const links=[{requestId:"service-a",chatId,nativeParentKey:null,userMessageKey:k(1),assistantMessageKey:k(2)}];
    const waiting=annotateNativeStoryPurposes(chatId,metadata,receipts,[]),linked=annotateNativeStoryPurposes(chatId,metadata,receipts,links);
    const contradictory=annotateNativeStoryPurposes(chatId,metadata,[...receipts,{requestId:"game-b",chatId,nativeParentKey:null,turn:"user-turn",purpose:"story",delivery:"accepted"}],[...links,{requestId:"game-b",chatId,nativeParentKey:null,userMessageKey:k(1),assistantMessageKey:k(3)}]);
    const retry=annotateNativeStoryPurposes(chatId,metadata,[...receipts,{requestId:"retry",chatId,nativeParentKey:k(1),turn:"assistant-retry",purpose:"service",delivery:"accepted"}],[...links,{requestId:"retry",chatId,nativeParentKey:k(1),userMessageKey:k(1),assistantMessageKey:k(3)}]);
    const otherChat=annotateNativeStoryPurposes("other-chat",metadata,receipts,links);
    return {waiting,linked,contradictory,otherChat,retry};
  });
  expect(result.waiting.messages.map((m:any)=>m.purpose)).toEqual(["unknown","unknown","unknown"]);expect(result.linked.messages.map((m:any)=>m.purpose)).toEqual(["service","service","unknown"]);
  for(const paused of [result.contradictory,result.otherChat]){expect(paused.status).toBe("paused");expect(paused.messages.map((m:any)=>m.purpose)).toEqual(["unknown","unknown","unknown"]);expect(paused.messages).toHaveLength(3);}
  expect(result.contradictory.issues.map((i:any)=>i.code)).toContain("purpose-conflict");
  expect(result.retry.messages.map((m:any)=>m.purpose)).toEqual(["service","service","service"]);expect(result.retry.messages).toHaveLength(3);
});
