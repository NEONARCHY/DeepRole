// Local, lossless file conversion. Nothing is uploaded or installed into a browser.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { createServer } from "vite";

const [input, output, mode = "smart"] = process.argv.slice(2);
if (!input || !output || !["smart", "manual"].includes(mode) || path.resolve(input) === path.resolve(output)) {
  throw new Error("Usage: node scripts/prepare-bds.mjs INPUT OUTPUT [smart|manual]. Output must be a new file.");
}
const original = await readFile(input);
const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
const server = await createServer({ configFile: false, server: { middlewareMode: true }, logLevel: "error" });
try {
  const { parseBds, buildBdsImport } = await server.ssrLoadModule("/src/core/bds-import.ts");
  const items = parseBds(original.toString("utf8"));
  const records = buildBdsImport(items, path.basename(input, path.extname(input)), mode);
  const entries = records.filter((record) => record.kind === "entry");
  if (entries.length !== items.length || entries.some(({ data }, i) => data.title !== items[i].title || data.content !== items[i].content || data.source.originalImportance !== items[i].importance)) throw new Error("Lossless conversion failed");
  if (hash(await readFile(input)) !== hash(original)) throw new Error("Source changed during conversion");
  await writeFile(output, JSON.stringify({ format: "deeprole-world", version: 1, records }, null, 2), { flag: "wx", encoding: "utf8" });
  const result = JSON.parse(await readFile(output, "utf8"));
  if (JSON.stringify(result.records) !== JSON.stringify(records)) throw new Error("Output verification failed");
  console.log(JSON.stringify({ output: path.resolve(output), entries: entries.length, always: items.filter((item) => item.importance === "always").length, called: items.filter((item) => item.importance === "called").length, calledMode: mode, sourceUnchanged: hash(await readFile(input)) === hash(original) }));
} finally { await server.close(); }
