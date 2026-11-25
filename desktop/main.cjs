const { app, BrowserWindow, ipcMain, Menu, nativeTheme, session, safeStorage } = require("electron");
const { mkdir, readFile, writeFile, rename } = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { providerSettings, saveProvider, imageRequest, imageReceipt } = require("./provider.cjs");
const { chatRequest } = require("./chat-store.cjs");

const origin = "https://deeprole.local";
const web = app.isPackaged ? path.join(__dirname, "web") : path.resolve(__dirname, "../.output/desktop-web");
const data = process.env.DEEPROLE_DESKTOP_DATA
  ? path.resolve(process.env.DEEPROLE_DESKTOP_DATA)
  : app.isPackaged ? path.join(path.dirname(process.execPath), "DeepRole Data") : path.resolve(__dirname, "../.output/desktop-data");
app.setPath("userData", data);
app.setAppUserModelId("DeepRole.Desktop");

const windows = new Map();
const pending = new Map();
const ports = new Map();
const grants = new Set();
const memory = new Map();
let background;
let foreground;
let settings = {};
let writeQueue = Promise.resolve();
let backgroundReady;
let quitting = false;
app.on("before-quit", () => { quitting = true; });

const appUrl = value => {
  const url = new URL(value, origin);
  if (url.origin !== origin || url.username || url.password) throw Error("Invalid application URL");
  return url;
};
const isChatPath = pathname => pathname === "/" || /^\/(?:a\/)?chat\/(?:s\/)?[\w-]+\/?$/u.test(pathname);
const trustedFrame = frame => Boolean(frame && frame.url.startsWith(origin + "/"));
const contents = (frame, packet) => { if (trustedFrame(frame) && !frame.detached) frame.send("deeprole:event", packet); };
const broadcast = packet => {
  for (const win of [background, ...windows.values()]) if (win && !win.isDestroyed()) {
    for (const frame of win.webContents.mainFrame.framesInSubtree) contents(frame, packet);
  }
};

function tab(win) {
  return { id: win.id, windowId: win.id, active: foreground === win.id, url: win.webContents.getURL(), title: win.getTitle(), incognito: false };
}

function captionStyle() {
  return nativeTheme.shouldUseDarkColors
    ? { color: "#202020", symbolColor: "#f5f5f5", height: 32 }
    : { color: "#f5f5f5", symbolColor: "#262626", height: 32 };
}

function makeWindow({ url = origin, active = true, type = "normal", width, height, worker = false } = {}) {
  const themedCaption = process.platform === "win32" && !worker
    && (url === "about:blank" ? type === "popup" : isChatPath(appUrl(url).pathname));
  const win = new BrowserWindow({
    title: "DeepRole",
    icon: path.join(web, "icons", "icon-128.png"),
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#171717" : "#ffffff",
    width: width ?? 1440,
    height: height ?? 940,
    minWidth: worker ? 240 : 360,
    minHeight: worker ? 240 : 480,
    show: false,
    autoHideMenuBar: true,
    ...(themedCaption ? { titleBarStyle: "hidden", titleBarOverlay: captionStyle() } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  if (themedCaption) {
    const updateCaption = () => { if (!win.isDestroyed()) win.setTitleBarOverlay(captionStyle()); };
    nativeTheme.on("updated", updateCaption);
    win.once("closed", () => nativeTheme.removeListener("updated", updateCaption));
  }
  win.removeMenu();
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith(origin + "/")) makeWindow({ url: target });
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, target) => {
    if (!target.startsWith(origin + "/")) event.preventDefault();
  });
  win.webContents.on("context-menu", (_event, details) => {
    const items = [];
    const ru = settings.deeprole_settings?.locale !== "en";
    if (details.isEditable) {
      items.push({ role: "cut", enabled: details.editFlags.canCut }, { role: "copy", enabled: details.editFlags.canCopy },
        { role: "paste", enabled: details.editFlags.canPaste }, { role: "selectAll", enabled: details.editFlags.canSelectAll });
    } else if (details.selectionText.trim() && /^\/(?:a\/)?chat\//.test(new URL(details.pageURL).pathname)) {
      items.push({ role: "copy" }, {
        label: ru ? "Запомнить выделенное в DeepRole" : "Save selection to DeepRole",
        click: () => void deliver(win.webContents.mainFrame, {
          event: "message", value: { type: "DR_SAVE_SELECTION", text: details.selectionText },
          sender: { id: "deeprole-desktop", url: win.webContents.getURL(), tab: tab(win) },
        }),
      });
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });
  if (!worker) {
    windows.set(win.id, win);
    win.kind = type;
    win.on("focus", () => {
      foreground = win.id;
      broadcast({ event: "activated", value: { tabId: win.id, windowId: win.id } });
    });
    const updated = () => broadcast({ event: "updated", value: [win.id, { url: win.webContents.getURL(), status: "complete" }, tab(win)] });
    win.webContents.on("did-finish-load", updated);
    win.webContents.on("did-navigate-in-page", updated);
    win.on("closed", () => {
      windows.delete(win.id);
      if (quitting) return;
      for (const [id, port] of ports) if (port.tabId === win.id) closePort(id);
      broadcast({ event: "removed", value: win.id });
      if (!windows.size) setImmediate(() => { if (!windows.size && !quitting) app.quit(); });
    });
    if (active) win.once("ready-to-show", () => { win.show(); win.focus(); });
  }
  void win.loadURL(url === "about:blank" ? url : appUrl(url).href).catch(() => undefined);
  return win;
}

function deliver(frame, packet, timeout = 120_000) {
  if (!trustedFrame(frame)) return Promise.resolve(undefined);
  const id = randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pending.delete(id); resolve(undefined); }, timeout);
    pending.set(id, { frame, resolve: value => { clearTimeout(timer); pending.delete(id); resolve(value); } });
    contents(frame, { ...packet, id });
  });
}

function closePort(id) {
  const port = ports.get(id);
  if (!port) return;
  ports.delete(id);
  contents(port.client, { event: "portClose", port: id });
  contents(port.server, { event: "portClose", port: id });
}

async function changeStorage(area, updates, removed = []) {
  const store = area === "local" ? settings : Object.fromEntries(memory);
  const next = new Map(Object.entries(store));
  const changes = {};
  for (const [key, newValue] of Object.entries(updates)) {
    Object.defineProperty(changes, key, { value: { oldValue: next.get(key), newValue }, enumerable: true });
    next.set(key, newValue);
  }
  for (const key of removed) if (next.has(key)) {
    Object.defineProperty(changes, key, { value: { oldValue: next.get(key) }, enumerable: true });
    next.delete(key);
  }
  if (area === "local") {
    const file = path.join(data, "settings.json");
    const nextSettings = Object.fromEntries(next);
    await writeFile(file + ".tmp", JSON.stringify(nextSettings));
    await rename(file + ".tmp", file);
    settings = nextSettings;
  } else {
    memory.clear();
    for (const [key, value] of next) memory.set(key, value);
  }
  broadcast({ event: "storage", value: [changes, area] });
}

const currentWindow = id => {
  const win = windows.get(id);
  if (!win || win.isDestroyed()) throw Error("Window unavailable");
  return win;
};

ipcMain.handle("deeprole:call", async (event, method, args) => {
  const frame = event.senderFrame;
  if (!trustedFrame(frame)) throw Error("Untrusted window");
  const win = BrowserWindow.fromWebContents(event.sender);
  const source = { id: "deeprole-desktop", url: frame.url, frameId: frame === event.sender.mainFrame ? 0 : 1, ...(windows.has(win.id) ? { tab: tab(win) } : {}) };
  const [one, two, three] = args;
  switch (method) {
    case "ready":
      if (win === background) backgroundReady?.();
      break;
    case "provider": return providerSettings(data, safeStorage);
    case "saveProvider": return saveProvider(data, one, safeStorage);
    case "setTheme": {
      if (one !== "light" && one !== "dark") throw Error("Unsupported theme");
      const result = writeQueue.then(async () => {
        await changeStorage("local", { desktopTheme: one });
        nativeTheme.themeSource = one;
      });
      writeQueue = result.catch(() => undefined);
      return result;
    }
    case "storageGet": {
      const store = one === "local" ? settings : Object.fromEntries(memory);
      if (two == null) return store;
      const keys = typeof two === "string" ? [two] : Array.isArray(two) ? two : Object.keys(two);
      return Object.fromEntries(keys.filter(key => Object.hasOwn(store, key) || !Array.isArray(two) && two && typeof two === "object" && Object.hasOwn(two, key))
        .map(key => [key, Object.hasOwn(store, key) ? store[key] : two[key]]));
    }
    case "storageSet":
    case "storageRemove": {
      const operation = () => changeStorage(one, method === "storageSet" ? two : {}, method === "storageRemove" ? [two].flat() : []);
      const result = writeQueue.then(operation);
      writeQueue = result.catch(() => undefined);
      return result;
    }
    case "runtimeSend": return deliver(background.webContents.mainFrame, { event: "message", value: one, sender: source });
    case "runtimeSendEmbedded": {
      const library = frame.frames.find(child => child.url === origin + "/sidepanel.html?embedded=1");
      if (!library) throw Error("Library frame unavailable");
      return deliver(background.webContents.mainFrame, { event: "message", value: one, sender: { ...source, url: library.url, frameId: library.routingId } });
    }
    case "reply": {
      const item = pending.get(one);
      if (item?.frame === frame) item.resolve(two);
      break;
    }
    case "portOpen": {
      if (ports.has(one)) throw Error("Port already open");
      const server = background.webContents.mainFrame;
      ports.set(one, { client: frame, server, tabId: win.id });
      contents(server, { event: "portOpen", value: two, port: one, sender: source });
      break;
    }
    case "portData": {
      const port = ports.get(one);
      if (port && (frame === port.client || frame === port.server)) contents(frame === port.client ? port.server : port.client, { event: "portData", port: one, value: two });
      break;
    }
    case "portClose": {
      const port = ports.get(one);
      if (port && (frame === port.client || frame === port.server)) closePort(one);
      break;
    }
    case "tabSend": {
      const target = currentWindow(one).webContents.mainFrame;
      if (!target.url.startsWith(origin + "/")) return;
      return deliver(target, { event: "message", value: two, sender: source }, three?.timeout ?? 120_000);
    }
    case "tabGet": return tab(currentWindow(one));
    case "tabQuery": {
      const ownWindow = windows.has(win.id) ? win.id : foreground;
      return [...windows.values()].filter(candidate => !candidate.isDestroyed()).filter(candidate => {
        const details = tab(candidate);
        return (!one.currentWindow || candidate.id === ownWindow) && (one.windowId === undefined || candidate.id === one.windowId)
          && (one.active === undefined || (candidate.id === (one.currentWindow ? ownWindow : foreground)) === one.active)
          && (!one.windowType || (candidate.kind ?? "normal") === one.windowType) && (!one.url || details.url.startsWith(String(one.url).replace(/\*$/, "")));
      }).map(candidate => ({ ...tab(candidate), ...(one.currentWindow ? { active: candidate.id === ownWindow } : {}) }));
    }
    case "tabCreate": return tab(makeWindow(one));
    case "winCreate": {
      const opened = makeWindow({ ...one, active: one.focused !== false });
      return { id: opened.id, tabs: [tab(opened)], incognito: false, type: opened.kind };
    }
    case "tabUpdate": {
      const target = currentWindow(one);
      if (two.url) await target.loadURL(two.url === "about:blank" ? two.url : appUrl(two.url).href);
      if (two.active) { target.show(); target.focus(); }
      return tab(target);
    }
    case "tabRemove": currentWindow(one).close(); break;
    case "winUpdate": {
      const target = currentWindow(one);
      if (two.focused) { target.show(); target.focus(); }
      return { id: target.id, tabs: [tab(target)], incognito: false, type: target.kind };
    }
    case "winFocused": {
      const target = currentWindow(foreground);
      return { id: target.id, tabs: [tab(target)], incognito: false, type: target.kind };
    }
    case "reload": win.reload(); break;
    case "permissions": {
      const requested = two?.origins ?? [];
      if (one === "request") {
        for (const pattern of requested) if (typeof pattern === "string" && /^https?:\/\/[^/*]+\/\*$/.test(pattern)) grants.add(pattern);
        const result = writeQueue.then(() => changeStorage("local", { desktopImageGrants: [...grants] }));
        writeQueue = result.catch(() => undefined);
        await result;
      }
      return requested.every(pattern => grants.has(pattern));
    }
    default: throw Error("Unsupported desktop action");
  }
});

const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
async function serve(request) {
  const url = appUrl(request.url);
  if (url.pathname === "/__desktop/image" && request.method === "POST") return imageRequest(request, grants, data);
  if (url.pathname === "/__desktop/image-receipt" && request.method === "POST") return imageReceipt(data, request);
  if (url.pathname.startsWith("/__desktop/") || url.pathname.startsWith("/api/v0/chat/")) return chatRequest(data, safeStorage, request);
  const requested = decodeURIComponent(url.pathname);
  const file = path.resolve(web, isChatPath(requested) ? "index.html" : "." + requested);
  if (!file.startsWith(web + path.sep)) return new Response(null, { status: 404 });
  try {
    return new Response(await readFile(file), {
      headers: {
        "Content-Type": mime[path.extname(file)] ?? "application/octet-stream",
        "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'",
      },
    });
  } catch { return new Response(null, { status: 404 }); }
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (windows.has(foreground)) currentWindow(foreground).focus(); });
  app.whenReady().then(async () => {
    await mkdir(data, { recursive: true });
    try { settings = JSON.parse(await readFile(path.join(data, "settings.json"), "utf8")); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      settings = { deeprole_settings: { locale: "ru", onboardingComplete: true } };
    }
    nativeTheme.themeSource = settings.desktopTheme === "light" ? "light" : "dark";
    for (const pattern of settings.desktopImageGrants ?? []) grants.add(pattern);
    session.defaultSession.protocol.handle("https", request => request.url.startsWith(origin + "/") ? serve(request) : new Response(null, { status: 403 }));
    const ready = new Promise(resolve => { backgroundReady = resolve; });
    background = makeWindow({ url: origin + "/background.html", worker: true });
    await Promise.race([ready, new Promise((_, reject) => setTimeout(() => reject(Error("DeepRole background startup timed out")), 20_000))]);
    makeWindow({ url: origin });
  }).catch(error => { console.error(error.message); app.exit(1); });
}
