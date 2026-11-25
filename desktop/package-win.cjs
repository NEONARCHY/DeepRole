const { access, cp, mkdir, mkdtemp, readdir, rename, rm } = require("node:fs/promises");
const { createReadStream, createWriteStream } = require("node:fs");
const { createHash } = require("node:crypto");
const { spawn } = require("node:child_process");
const { pipeline } = require("node:stream/promises");
const path = require("node:path");
const { version } = require("./package.json");

async function main() {
  if (process.platform !== "win32") throw Error("The Windows package must be built on Windows.");
  const root = path.join(__dirname, "..");
  const runtime = path.join(root, "node_modules", "electron", "dist");
  const outputDir = path.join(root, ".output");
  const directory = await mkdtemp(path.join(outputDir, "desktop-portable-"));
  const bundle = path.join(directory, "DeepRole");
  const app = path.join(bundle, "resources", "app");
  const build = new Date().toISOString().replace(/[-:]/gu, "").replace("T", "-").slice(0, 15);
  const output = path.join(root, "downloads", `DeepRole-Desktop-${version}-Windows-x64-${build}.zip`);
  const temp = output + ".tmp";
  try {
    await access(path.join(runtime, "electron.exe"));
    await mkdir(app, { recursive: true });
    for (const entry of await readdir(runtime)) {
      if (entry === "resources") continue;
      await cp(path.join(runtime, entry), path.join(bundle, entry === "electron.exe" ? "DeepRole.exe" : entry), { recursive: true });
    }
    for (const name of ["package.json", "main.cjs", "preload.cjs", "provider.cjs", "chat-store.cjs", "model-context.cjs", "usage.cjs", "spending.cjs"]) {
      await cp(path.join(__dirname, name), path.join(app, name));
    }
    await cp(path.join(outputDir, "desktop-web"), path.join(app, "web"), { recursive: true });
    await cp(path.join(__dirname, "START-RU.md"), path.join(bundle, "START-RU.md"));
    await cp(path.join(root, "public", "fonts", "Manrope-OFL.txt"), path.join(bundle, "Manrope-OFL.txt"));
    await mkdir(path.join(root, "downloads"), { recursive: true });
    // Existing archives stay intact if packaging fails.
    const archive = spawn("tar.exe", ["--format", "zip", "-cf", "-", "-C", directory, "DeepRole"], { stdio: ["ignore", "pipe", "inherit"], windowsHide: true });
    const finished = new Promise((resolve, reject) => {
      archive.on("error", reject);
      archive.on("exit", code => code === 0 ? resolve() : reject(Error("Archive exited with " + code)));
    });
    await Promise.all([pipeline(archive.stdout, createWriteStream(temp)), finished]);
    await rename(temp, output);
  } finally {
    if (path.dirname(path.resolve(directory)) === outputDir && path.basename(directory).startsWith("desktop-portable-")) await rm(directory, { recursive: true, force: true });
    await rm(temp, { force: true });
  }
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(output)) hash.update(chunk);
  console.log(output);
  console.log("SHA-256 " + hash.digest("hex"));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
