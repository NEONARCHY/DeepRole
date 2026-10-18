/** Literal-aware, iterative delimiter scan. No intent/roleplay interpretation,
 * regex nesting or recursion. Escapes, quoted text and code stay opaque. */
function literalEnd(text:string,start:number):number|undefined {
  const c=text[start]!;
  if(c==='\\')return Math.min(start+1,text.length-1);
  if(c==='>'&&/^\s*$/u.test(text.slice(text.lastIndexOf('\n',start-1)+1,start))){
    const end=text.indexOf('\n',start);return end<0?text.length-1:end-1;
  }
  if(c==='`'||c==='~'&&text.startsWith('~~~',start)){
    let n=1;while(text[start+n]===c)n++;
    const end=text.indexOf(c.repeat(n),start+n);
    return end<0?text.length-1:end+n-1;
  }
  const close=c==='«'?'»':c==='“'?'”':c==='„'?'“':c==='‘'?'’':c==='"'?'"':c==="'"&&!/[\p{L}\p{N}]/u.test(text[start-1]??'')?"'":undefined;
  if(!close)return;
  for(let i=start+1;i<text.length;i++){if(text[i]==='\\'){i++;continue;}if(text[i]===close)return i;}
  return text.length-1;
}
function closing(text:string,start:number,open='[',close=']'):number {
  let depth=1;
  for(let i=start+1;i<text.length;i++){
    const end=literalEnd(text,i);if(end!==undefined){i=end;continue;}
    if(text[i]===open)depth++;else if(text[i]===close&&!--depth)return i;
  }
  return -1;
}
export function wholeBracketedMessage(draft:string):string|null {
  const text=draft.trim();
  if(!text.startsWith('[')||closing(text,0)!==text.length-1)return null;
  const body=text.slice(1,-1).trim();return body?body:null;
}
/** Complete unquoted notes only; Markdown links/images/code/escapes are data.
 * Never edit the original transport, stored message or source quote. */
export function bracketNotes(draft:string):Array<{start:number;end:number}> {
  const spans:Array<{start:number;end:number}>=[];
  for(let i=0;i<draft.length;i++){
    const end=literalEnd(draft,i);if(end!==undefined){i=end;continue;}
    if(draft[i]!=='[')continue;
    const close=closing(draft,i);if(close<0)break;
    const suffix=draft[close+1];
    if(draft[i-1]==='!'||suffix==='('||suffix==='['||suffix===':'){
      const tail=suffix==='('?closing(draft,close+1,'(',')'):suffix==='['?closing(draft,close+1):-1;
      i=Math.max(close,tail);continue;
    }
    if(draft.slice(i+1,close).trim())spans.push({start:i,end:close+1});
    i=close;
  }
  return spans;
}
export const hasBracketNotes=(draft:string)=>bracketNotes(draft).length>0;
export function withoutBracketNotes(draft:string):string {
  let result='',cursor=0;
  // Classification only: even a malformed note or Markdown label must not
  // smuggle a stand-alone "do not continue" sentence into the played text.
  // This does NOT turn links/broken spans into model instructions.
  for(let i=0;i<draft.length;i++){
    const end=literalEnd(draft,i);if(end!==undefined){i=end;continue;}
    if(draft[i]!=='[')continue;
    const close=closing(draft,i);result+=draft.slice(cursor,i)+' ';
    if(close<0)return result;
    cursor=close+1;i=close;
  }
  return result+draft.slice(cursor);
}
