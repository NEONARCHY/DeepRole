/** Serialize leaves separately: no single JSON string containing the entire library. */
export function jsonFileBlob(value: unknown): Blob {
  const active = new Set<object>(), parts: BlobPart[] = [];
  const primitive = (v: unknown) => JSON.stringify(v);
  const write = (v: unknown) => {
    if (!v || typeof v !== "object") { const text = primitive(v); if (text !== undefined) parts.push(text); return; }
    if (active.has(v)) throw Error("export-data-invalid"); active.add(v);
    if (Array.isArray(v)) {
      parts.push("["); for (let i=0;i<v.length;i++) { if (i) parts.push(","); if (v[i] === undefined || typeof v[i] === "function" || typeof v[i] === "symbol") parts.push("null"); else write(v[i]); } parts.push("]");
    } else {
      parts.push("{"); let first=true;
      for (const [key,item] of Object.entries(v)) { if (item === undefined || typeof item === "function" || typeof item === "symbol") continue; if (!first) parts.push(","); first=false; parts.push(JSON.stringify(key),":"); write(item); }
      parts.push("}");
    }
    active.delete(v);
  };
  write(value);return new Blob(parts,{type:"application/json"});
}
