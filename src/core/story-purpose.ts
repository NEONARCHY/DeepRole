import { validNativeStoryRequestLink, type NativeStoryRequestLink } from "./story-exchange";
import { readNativeStoryHistory } from "./story-native-history";
import { sameStoryValue } from "./story-value";
import { validNativeStoryId, validNativeStoryIdentity, validNativeStoryKey, type NativeStoryIdentity } from "./story-transport";

export type NativeStoryPurpose = "story" | "service" | "unknown";
/** Extension-owned policy and delivery snapshot. NOT data read from a model or a page.
 * "story" requires an explicit game route decision; being in a bound chat alone is insufficient.
 * Unknown manual/OOC intent is not classified by keywords. This is not yet a stored receipt type.
 */
export interface NativeStoryPurposeReceipt {
  requestId: string;
  chatId: string;
  /** Immutable outgoing parent and explicit route; retries point to the existing USER. */
  nativeParentKey: string | null;
  turn: "user-turn" | "assistant-retry";
  purpose: NativeStoryPurpose;
  delivery: "prepared" | "accepted" | "failed" | "unknown";
}
export interface NativeStoryPurposeMessage { identity: NativeStoryIdentity; purpose: NativeStoryPurpose; requestIds: string[] }
export type NativeStoryPurposeIssue = "invalid-input" | "metadata-invalid" | "receipts-invalid" | "links-invalid" | "receipt-invalid" | "receipt-conflict" | "link-invalid" | "link-conflict" | "chat-mismatch" | "request-missing" | "request-unaccepted" | "message-missing" | "pair-mismatch" | "parent-mismatch" | "assistant-conflict" | "purpose-conflict";
export interface NativeStoryPurposeResult {
  status: "annotated" | "paused";
  /** All native nodes/parents remain, even service and unknown messages. No content/selection. */
  messages: NativeStoryPurposeMessage[] | null;
  issueCount: number;
  issues: { code: NativeStoryPurposeIssue; path: string }[];
}
const MAX_BATCH = 100_000; // One native window/receipt batch, not a world or character count.
const MAX_ISSUES = 40;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const shape = (v: unknown, keys: string[]): v is Record<string, unknown> => object(v) && Object.keys(v).length === keys.length && keys.every(k=>Object.prototype.hasOwnProperty.call(v,k));
function validReceipt(value: unknown): value is NativeStoryPurposeReceipt {
  return shape(value,["requestId","chatId","nativeParentKey","turn","purpose","delivery"]) && validNativeStoryId(value.requestId) && validNativeStoryId(value.chatId)
    && (value.nativeParentKey===null || validNativeStoryKey(value.nativeParentKey)) && ["user-turn","assistant-retry"].includes(value.turn as string)
    && ["story","service","unknown"].includes(value.purpose as string) && ["prepared","accepted","failed","unknown"].includes(value.delivery as string);
}

/** Internal, pure provenance annotator, NOT connected to automatic ingestion.
 * Only the future trusted driver may supply receipts and exact request-local native links.
 * A copied [DeepRole Service] header, FINISHED, matching text, DOM position and HTTP success
 * alone prove no purpose. Never pass model/page-supplied "purpose" or "requestId" as receipts.
 * An ambiguous proof batch pauses all labels, retaining the validated graph as unknown.
 * No stream read, scene effect, transcript deletion, stored write, or selected-branch guess.
 * Purpose is chat-scoped only, not proof of world/branch membership, completion or revision.
 * The existing exchange/receipt/lifecycle gate is still required before any stored observation.
 */
export function annotateNativeStoryPurposes(chatId: string, metadata: unknown, receipts: unknown, links: unknown): NativeStoryPurposeResult {
  const result: NativeStoryPurposeResult={status:"paused",messages:null,issueCount:0,issues:[]};
  const issue=(code:NativeStoryPurposeIssue,path:string)=>{result.issueCount++;if(result.issues.length<MAX_ISSUES)result.issues.push({code,path});};
  if(!validNativeStoryId(chatId)){issue("invalid-input","chatId");return result;}
  if(!Array.isArray(metadata)||metadata.length>MAX_BATCH||!metadata.every(validNativeStoryIdentity)){issue("metadata-invalid","metadata");return result;}
  const id=(key:string)=>(JSON.parse(key) as [string,string])[1];
  const graph=readNativeStoryHistory({messages:metadata.map(m=>({id:id(m.nativeMessageKey),parent_id:m.nativeParentKey===null?null:id(m.nativeParentKey),role:m.role}))},chatId).messages;
  if(!graph){issue("metadata-invalid","metadata");return result;}
  result.messages=graph.map(identity=>({identity:{...identity},purpose:"unknown",requestIds:[]}));
  if(!Array.isArray(receipts)||receipts.length>MAX_BATCH)issue("receipts-invalid","receipts");
  if(!Array.isArray(links)||links.length>MAX_BATCH)issue("links-invalid","links");
  if(result.issueCount)return result;
  const byRequest=new Map<string,NativeStoryPurposeReceipt>();
  for(let index=0;index<(receipts as unknown[]).length;index++){
    const receipt=(receipts as unknown[])[index],path=`receipts[${index}]`;
    if(!validReceipt(receipt)){issue("receipt-invalid",path);continue;}
    if(receipt.chatId!==chatId){issue("chat-mismatch",`${path}.chatId`);continue;}
    const previous=byRequest.get(receipt.requestId);
    if(previous&&!sameStoryValue(previous,receipt)){issue("receipt-conflict",path);continue;}
    byRequest.set(receipt.requestId,{...receipt});
  }
  const byKey=new Map(graph.map(m=>[m.nativeMessageKey,m]));
  const byLink=new Map<string,NativeStoryRequestLink>();
  const assistantOwner=new Map<string,string>();
  const claims=new Map<string,{purpose:Exclude<NativeStoryPurpose,"unknown">;requestIds:Set<string>}>();
  const claim=(messageKey:string,receipt:NativeStoryPurposeReceipt,path:string)=>{
    if(receipt.purpose==="unknown")return;
    const previous=claims.get(messageKey);
    if(previous&&previous.purpose!==receipt.purpose){issue("purpose-conflict",path);return;}
    const next=previous??{purpose:receipt.purpose,requestIds:new Set<string>()};next.requestIds.add(receipt.requestId);claims.set(messageKey,next);
  };
  for(let index=0;index<(links as unknown[]).length;index++){
    const link=(links as unknown[])[index],path=`links[${index}]`;
    if(!validNativeStoryRequestLink(link)){issue("link-invalid",path);continue;}
    if(link.chatId!==chatId){issue("chat-mismatch",`${path}.chatId`);continue;}
    const previous=byLink.get(link.requestId);
    if(previous&&!sameStoryValue(previous,link)){issue("link-conflict",path);continue;}
    if(previous)continue;
    byLink.set(link.requestId,{...link});
    const receipt=byRequest.get(link.requestId);
    if(!receipt){issue("request-missing",`${path}.requestId`);continue;}
    if(receipt.delivery!=="accepted"){issue("request-unaccepted",`${path}.requestId`);continue;}
    const user=byKey.get(link.userMessageKey),assistant=byKey.get(link.assistantMessageKey);
    if(!user||!assistant){issue("message-missing",path);continue;}
    if(user.role!=="user"||assistant.role!=="assistant"||assistant.nativeParentKey!==user.nativeMessageKey){issue("pair-mismatch",path);continue;}
    if(link.nativeParentKey!==receipt.nativeParentKey || (receipt.turn==="user-turn" ? user.nativeParentKey : user.nativeMessageKey)!==receipt.nativeParentKey){issue("parent-mismatch",`${path}.nativeParentKey`);continue;}
    const owner=assistantOwner.get(assistant.nativeMessageKey);
    if(owner&&owner!==receipt.requestId)issue("assistant-conflict",`${path}.assistantMessageKey`);
    assistantOwner.set(assistant.nativeMessageKey,receipt.requestId);
    claim(user.nativeMessageKey,receipt,`${path}.userMessageKey`);claim(assistant.nativeMessageKey,receipt,`${path}.assistantMessageKey`);
  }
  if(result.issueCount)return result;
  for(const message of result.messages){const known=claims.get(message.identity.nativeMessageKey);if(known){message.purpose=known.purpose;message.requestIds=[...known.requestIds].sort();}}
  result.status="annotated";
  return result;
}
