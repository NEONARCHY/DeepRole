import type { storyFactHint } from "./story-fact-context";

export type StoryMemoryHint = ReturnType<typeof storyFactHint>;
export interface MemoryPayload { json: string; guide: string }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const owns = (v: object, key: string) => Object.prototype.hasOwnProperty.call(v,key);
const keys = (v: Record<string,unknown>, allowed: readonly string[]) => Object.keys(v).every(k=>allowed.includes(k));
const oneOf = (v:unknown, allowed:readonly string[]) => typeof v==="string"&&allowed.includes(v);
export const safeMemoryJson = (value: unknown) => JSON.stringify(value).replaceAll("<","\\u003c").replaceAll(">","\\u003e");
const roleKeys = ["speaker","recipient","promisor","planner","believer"] as const;
const factFields = ["kind","text","sourceQuote","sourceQuoteRef","claim","task","sourceRoles","sourceRolesRef","sourceIdentity","episodeSource","episodeSourceRef","timeStatus"] as const;
const COLUMN_FORMAT = "deeprole-memory-columns-v1";
const COLUMN_GUIDE = 'Self-contained table: rows follow columns; null and omitted tail cells mean absent. Expand to objects, then resolve refs ONLY in THIS request. Keep all data exact; never output this transport in updates.';
const personKeys = ["id","name","sourceId","sourceName","unavailable"];
const fail = (): never => { throw new Error("Invalid request-local memory reference"); };
const copy = <T>(v:T):T => structuredClone(v);
function person(v:unknown) {
  return object(v) && keys(v,personKeys) && typeof v.id==="string" && typeof v.name==="string" &&
    Object.entries(v).every(([k,x])=>k==="unavailable"?x===true:typeof x==="string");
}
function equal(a:unknown,b:unknown):boolean {
  if(a===b)return true;
  if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>equal(v,b[i]));
  return object(a)&&object(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>owns(b,k)&&equal(a[k],b[k]));
}

/** Strict transport reader, NOT a fact proposal validator or storage importer.
 * Only direct backward references in this exact array are accepted. It never
 * consults a previous request, the current roster or canonical storage. */
export function decodeStoryMemory(value: unknown): StoryMemoryHint[] {
  if(object(value)) {
    if(!keys(value,["format","columns","rows"])||Object.keys(value).length!==3||value.format!==COLUMN_FORMAT||!Array.isArray(value.columns)||!Array.isArray(value.rows)||value.rows.length>128||
      value.columns.length<2||value.columns.length>factFields.length||new Set(value.columns).size!==value.columns.length||
      !Array.from(value.columns).every(field=>typeof field==="string"&&factFields.includes(field as typeof factFields[number]))||value.columns[0]!=="kind"||value.columns[1]!=="text")return fail();
    const columns=value.columns as string[];
    value=value.rows.map(row=>{
      if(!Array.isArray(row)||row.length<2||row.length>columns.length)return fail();
      return Object.fromEntries(columns.flatMap((field,i)=>i>=row.length||row[i]===null?[]:[[field,row[i]]]));
    });
  }
  if(!Array.isArray(value)||value.length>128)return fail();
  const decoded:Record<string,unknown>[]=[];
  for(const [index,row] of value.entries()) {
    if(!object(row)||!owns(row,"kind")||!owns(row,"text")||!keys(row,factFields)||
      !oneOf(row.kind,["event","promise","plan","belief","secret","task"])||typeof row.text!=="string")return fail();
    const hint=copy(row);
    for(const field of ["sourceQuote","sourceRoles","episodeSource"] as const) {
      const ref=field+"Ref";
      if(!owns(row,ref))continue;
      const at=row[ref];
      if(owns(row,field)||typeof at!=="number"||!Number.isInteger(at)||at<0||at>=index||!object(value[at])||!owns(value[at],field))return fail();
      hint[field]=copy(decoded[at]![field]);delete hint[ref];
    }
    if(owns(hint,"sourceQuote")&&typeof hint.sourceQuote!=="string")return fail();
    const stringReference = (part:Record<string,unknown>, field:string) => {
      const ref=field+"Ref";
      if(owns(part,ref)) {
        if(owns(part,field)||!(["text","sourceQuote"] as unknown[]).includes(part[ref]))return fail();
        part[field]=part[ref]==="text"?hint.text:hint.sourceQuote??hint.text;delete part[ref];
      }
      if(typeof part[field]!=="string")return fail();
    };
    if(owns(hint,"claim")) {
      if(!object(hint.claim)||!keys(hint.claim,["key","value","valueRef","scope","transition","lifetime","status"]))return fail();
      stringReference(hint.claim,"value");
      if(typeof hint.claim.key!=="string"||!oneOf(hint.claim.scope,["event","state"])||
        owns(hint.claim,"transition")&&!oneOf(hint.claim.transition,["progress","correction"])||
        owns(hint.claim,"lifetime")&&!oneOf(hint.claim.lifetime,["scene","persistent"])||
        owns(hint.claim,"status")&&!oneOf(hint.claim.status,["active","ended"]))return fail();
    }
    if(owns(hint,"task")) {
      if(!object(hint.task)||!keys(hint.task,["key","title","titleRef","status"]))return fail();
      stringReference(hint.task,"title");
      if(typeof hint.task.key!=="string"||!oneOf(hint.task.status,["open","completed","cancelled"]))return fail();
    }
    if(owns(hint,"sourceRoles")) {
      if(!object(hint.sourceRoles)||!keys(hint.sourceRoles,roleKeys.flatMap(k=>[k,k+"Ref"])))return fail();
      const roles:Record<string,unknown>={};
      for(const [key,item] of Object.entries(hint.sourceRoles)) {
        if(key.endsWith("Ref")) {
          const role=key.slice(0,-3);
          if(owns(hint.sourceRoles,role)||typeof item!=="string"||!roleKeys.includes(item as typeof roleKeys[number])||!owns(roles,item)||!owns(hint.sourceRoles,item))return fail();
          roles[role]=copy(roles[item]);
        } else {if(!person(item))return fail();roles[key]=item;}
      }
      hint.sourceRoles=roles;
    }
    if(owns(hint,"episodeSource")&&(!object(hint.episodeSource)||!keys(hint.episodeSource,["revisionId","episode","period"])||
      typeof hint.episodeSource.revisionId!=="string"||typeof hint.episodeSource.episode!=="number"||!Number.isInteger(hint.episodeSource.episode)||hint.episodeSource.episode<1||
      !oneOf(hint.episodeSource.period,["latest-turn","earlier-turn"])))return fail();
    if(owns(hint,"sourceIdentity")&&hint.sourceIdentity!=="unknown")return fail();
    if(owns(hint,"timeStatus")&&!oneOf(hint.timeStatus,["earlier-scene","last-known","persistent","unknown","ended"]))return fail();
    decoded.push(hint);
  }
  return decoded as StoryMemoryHint[];
}

/** Reversible candidates only. The caller pays for each complete guide and
 * chooses against the complete request cost, not merely the JSON byte count.
 * Existing exact quote sharing remains the baseline, including its guide. */
export function memoryTransportCandidates(inline:StoryMemoryHint[],baseline:MemoryPayload,columns=false):MemoryPayload[] {
  const result=[baseline], seen=new Set([baseline.json]);
  for(let mask=1;mask<8;mask++) {
    const rows=JSON.parse(baseline.json) as Record<string,unknown>[], used=new Set<string>();
    const shared={sourceRoles:new Map<string,number>(),episodeSource:new Map<string,number>()};
    for(const [index,row] of rows.entries()) {
      if(mask&1)for(const [partName,field] of [["claim","value"],["task","title"]] as const) {
        const part=row[partName];if(!object(part))continue;
        const original=part[field], target=original===inline[index]?.text?"text":original===(inline[index]?.sourceQuote??inline[index]?.text)?"sourceQuote":undefined;
        if(target&&safeMemoryJson({[field+"Ref"]:target}).length<safeMemoryJson({[field]:original}).length) {
          delete part[field];part[field+"Ref"]=target;used.add("value");
        }
      }
      if(mask&2)for(const field of ["sourceRoles","episodeSource"] as const) {
        if(!object(row[field]))continue;
        const key=JSON.stringify(row[field]), earlier=shared[field].get(key);
        if(earlier===undefined){shared[field].set(key,index);continue;}
        if(safeMemoryJson({[field+"Ref"]:earlier}).length<safeMemoryJson({[field]:row[field]}).length) {
          delete row[field];row[field+"Ref"]=earlier;used.add(field);
        }
      }
      if(mask&4&&object(row.sourceRoles)) {
        const people=new Map<string,string>(), roles:Record<string,unknown>={};
        for(const [role,p] of Object.entries(row.sourceRoles)) {
          const key=JSON.stringify(p), earlier=people.get(key);
          if(earlier&&safeMemoryJson({[role+"Ref"]:earlier}).length<safeMemoryJson({[role]:p}).length) {
            roles[role+"Ref"]=earlier;used.add("person");
          } else {roles[role]=p;people.set(key,role);}
        }
        row.sourceRoles=roles;
      }
    }
    const json=safeMemoryJson(rows);if(!used.size||seen.has(json))continue;
    const refs=[...used].filter(k=>k==="sourceRoles"||k==="episodeSource").map(k=>k+"Ref");
    const guide=[baseline.guide,
      used.has("value")?'claim.valueRef/task.titleRef "text"=THIS fact\'s exact text; "sourceQuote"=its resolved exact quote (text if absent). Restore value/title before use.':"",
      refs.length?refs.join("/")+" = zero-based index of an earlier fact containing that full field; copy the exact field, never infer source or identity.":"",
      used.has("person")?"sourceRoles.<role>Ref names an earlier full role in THIS sourceRoles object with the exact same person fields.":"",
      "Transport refs resolve ONLY in THIS array, never previous requests. Restore data before reasoning; NEVER output refs in fact proposals."
    ].filter(Boolean).join(" ");
    try {if(!equal(decodeStoryMemory(rows),inline))continue;}catch{continue;}
    seen.add(json);result.push({json,guide});
  }
  if(columns)for(const candidate of [...result]) {
    const rows=JSON.parse(candidate.json) as Record<string,unknown>[];
    const frequency=new Map(factFields.map(field=>[field,rows.filter(row=>owns(row,field)).length]));
    const fields=["kind","text",...factFields.filter(field=>field!=="kind"&&field!=="text"&&frequency.get(field)!).sort((a,b)=>frequency.get(b)!-frequency.get(a)!||factFields.indexOf(a)-factFields.indexOf(b))];
    const table={format:COLUMN_FORMAT,columns:fields,rows:rows.map(row=>{const cells=fields.map(field=>owns(row,field)?row[field]:null);while(cells.length>2&&cells.at(-1)===null)cells.pop();return cells;})};
    const json=safeMemoryJson(table);if(seen.has(json))continue;
    try{if(!equal(decodeStoryMemory(table),inline))continue;}catch{continue;}
    seen.add(json);result.push({json,guide:[COLUMN_GUIDE,candidate.guide].filter(Boolean).join(" ")});
  }
  return result;
}
