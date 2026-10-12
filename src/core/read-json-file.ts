/** Read records/photos individually. A large portable file need not fit in one JS string. */
export async function readJsonFile(file: Blob, current: () => boolean = () => true): Promise<any> {
  if (file.size < 16 * 1024 * 1024) return JSON.parse((await file.text()).replace(/^\uFEFF/,""));
  const reader=file.stream().getReader(),decoder=new TextDecoder(),root:Record<string,unknown>={};
  let mode:"root"|"key"|"colon"|"value"|"item"|"arrayEnd"|"separator"|"end"="root";
  let key="",array:unknown[]|undefined,allowEnd=true,collecting=false,inString=false,escape=false,depth=0,fragments:string[]=[],tokenStart=0;
  const finish = () => {
    const value=JSON.parse(fragments.join(""));fragments=[];
    if(mode==="key"){if(typeof value!=="string" || Object.hasOwn(root,value))throw Error("fileInvalid");key=value;mode="colon";}
    else if(mode==="item"){array!.push(value);mode="arrayEnd";}
    else{Object.defineProperty(root,key,{value,enumerable:true,writable:true});mode="separator";}
    collecting=false;inString=false;escape=false;depth=0;
  };
  const start=()=>{collecting=true;inString=false;escape=false;depth=0;};
  const whitespace=(c:string)=>c===" "||c==="\n"||c==="\r"||c==="\t";
  const feed=(chunk:string)=>{
    let i=0;
    while(i<chunk.length){
      if(collecting){
        tokenStart=i;
        // Skip ordinary string spans in native code, without iterating image bytes.
        while(i<chunk.length){
          const c=chunk[i]!;
          if(inString){
            if(escape){escape=false;i++;continue;}
            if(c==="\\"){escape=true;i++;continue;}
            if(c==='"'){inString=false;i++;if(mode==="key"){fragments.push(chunk.slice(tokenStart,i));finish();break;}continue;}
            const quote=chunk.indexOf('"',i),slash=chunk.indexOf("\\",i);i=quote<0?(slash<0?chunk.length:slash):slash<0?quote:Math.min(quote,slash);continue;
          }
          if(c==='"'){inString=true;i++;continue;}
          if(c==="{"||c==="["){depth++;i++;continue;}
          if(c==="}"||c==="]"){
            if(depth>0){depth--;i++;continue;}
            fragments.push(chunk.slice(tokenStart,i));finish();break;
          }
          if(c===","&&depth===0){fragments.push(chunk.slice(tokenStart,i));finish();break;}
          i++;
        }
        if(collecting)fragments.push(chunk.slice(tokenStart,i));
        continue;
      }
      const c=chunk[i]!;if(whitespace(c)){i++;continue;}
      if(mode==="root"){if(c!=="{")throw Error("fileInvalid");mode="key";allowEnd=true;i++;}
      else if(mode==="key"){if(c==="}"&&allowEnd){mode="end";i++;}else if(c==='"')start();else throw Error("fileInvalid");}
      else if(mode==="colon"){if(c!==":")throw Error("fileInvalid");mode="value";i++;}
      else if(mode==="value"){
        if((key==="records"||key==="photos")&&c==="["){array=[];Object.defineProperty(root,key,{value:array,enumerable:true,writable:true});mode="item";allowEnd=true;i++;}
        else start();
      }else if(mode==="item"){if(c==="]"&&allowEnd){array=undefined;mode="separator";i++;}else{if(c===","||c==="]")throw Error("fileInvalid");start();}}
      else if(mode==="arrayEnd"){if(c===","){mode="item";allowEnd=false;i++;}else if(c==="]"){array=undefined;mode="separator";i++;}else throw Error("fileInvalid");}
      else if(mode==="separator"){if(c===","){mode="key";allowEnd=false;i++;}else if(c==="}"){mode="end";i++;}else throw Error("fileInvalid");}
      else throw Error("fileInvalid");
    }
  };
  try{
    while(true){if(!current())throw new DOMException("Cancelled","AbortError");const part=await reader.read();if(part.done)break;feed(decoder.decode(part.value,{stream:true}));}
    feed(decoder.decode());if(collecting||(mode as string)!=="end")throw Error("fileInvalid");return root;
  }finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
}
