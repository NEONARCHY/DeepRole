import type { Browser } from "wxt/browser";

type Wire = {
  event: string;
  value?: any;
  id?: string;
  port?: string;
  sender?: Browser.runtime.MessageSender;
};
interface DesktopBridge {
  call<T = any>(method: string, ...args: unknown[]): Promise<T>;
  listen(callback: (packet: Wire) => void): () => void;
}
declare global {
  interface Window { deepRoleDesktop: DesktopBridge }
}
const topLevel = window.parent === window;
export const desktop = topLevel ? window.deepRoleDesktop : window.parent.deepRoleDesktop;

function event<T extends (...args: any[]) => any>() {
  const listeners = new Set<T>();
  return {
    addListener: (fn: T) => { listeners.add(fn); },
    removeListener: (fn: T) => { listeners.delete(fn); },
    hasListener: (fn: T) => listeners.has(fn),
    emit: (...args: Parameters<T>) => { for (const fn of listeners) fn(...args); },
    async request(...args: Parameters<T>) {
      for (const fn of listeners) {
        const result = fn(...args);
        if (result !== undefined) return result;
      }
    },
  };
}
const onMessage = event<(message: any, sender: Browser.runtime.MessageSender) => any>();
const onConnect = event<(port: ReturnType<typeof connectPort>) => void>();
const onStorage = event<(changes: Record<string, Browser.storage.StorageChange>, area: string) => void>();
const onActivated = event<(value: Browser.tabs.OnActivatedInfo) => void>();
const onUpdated = event<(id: number, properties: Browser.tabs.OnUpdatedInfo, tab: Browser.tabs.Tab) => void>();
const onRemoved = event<(id: number) => void>();
const ports = new Map<string, ReturnType<typeof connectPort>>();

function connectPort(name: string, id: string, sender?: Browser.runtime.MessageSender) {
  const onMessage = event<(value: any) => void>();
  const onDisconnect = event<() => void>();
  const ready = sender ? Promise.resolve() : desktop.call("portOpen", id, name);
  const port = {
    name, sender, onMessage, onDisconnect,
    postMessage: (value: unknown) => { void ready.then(() => desktop.call("portData", id, value)).catch(() => onDisconnect.emit()); },
    disconnect: () => { void ready.then(() => desktop.call("portClose", id)).catch(() => undefined); },
  };
  ports.set(id, port);
  return port;
}

desktop.listen(packet => {
  switch (packet.event) {
    case "storage": onStorage.emit(packet.value[0], packet.value[1]); break;
    case "activated": onActivated.emit(packet.value); break;
    case "updated": onUpdated.emit(packet.value[0], packet.value[1], packet.value[2]); break;
    case "removed": onRemoved.emit(packet.value); break;
    case "portOpen": if (topLevel && packet.port && packet.sender) onConnect.emit(connectPort(packet.value, packet.port, packet.sender)); break;
    case "portData": if (packet.port) ports.get(packet.port)?.onMessage.emit(packet.value); break;
    case "portClose": if (packet.port) { ports.get(packet.port)?.onDisconnect.emit(); ports.delete(packet.port); } break;
    case "message":
      if (!packet.sender) break;
      if (topLevel) {
        void onMessage.request(packet.value, packet.sender)
          .then(result => desktop.call("reply", packet.id, result), () => desktop.call("reply", packet.id, undefined));
      } else if (["DR_DATA_CHANGED", "DR_PENDING_SUGGESTIONS"].includes(packet.value?.type)) {
        onMessage.emit(packet.value, packet.sender);
      }
      break;
  }
});

const storage = (area: string) => ({
  get: (keys?: unknown) => desktop.call("storageGet", area, keys),
  set: (values: unknown) => desktop.call("storageSet", area, values),
  remove: (keys: unknown) => desktop.call("storageRemove", area, keys),
});
const empty = event<() => void>();
const contextMenu = event<() => void>();
export const browser = {
  storage: { local: storage("local"), session: storage("session"), onChanged: onStorage },
  runtime: {
    id: "deeprole-desktop",
    getURL: (value: string) => new URL(value, location.origin).href,
    sendMessage: async (message: any) => {
      if (!topLevel && message?.type === "DR_MENU_TAB") {
        const [tab] = await desktop.call("tabQuery", { currentWindow: true, active: true });
        return { ok: !!tab, tabId: tab?.id };
      }
      return desktop.call(topLevel ? "runtimeSend" : "runtimeSendEmbedded", message);
    },
    onMessage, onConnect,
    connect: ({ name }: { name: string }) => connectPort(name, crypto.randomUUID()),
    onInstalled: empty,
    getManifest: () => ({ version: "0.1.0", name: "DeepRole" }),
    getPlatformInfo: async () => ({ os: "win", arch: "x86-64" }),
    reload: () => { void desktop.call("reload"); },
  },
  tabs: {
    query: (properties: unknown) => desktop.call("tabQuery", properties),
    get: (id: number) => desktop.call("tabGet", id),
    sendMessage: (id: number, value: unknown, options?: unknown) => desktop.call("tabSend", id, value, options),
    create: (properties: unknown) => desktop.call("tabCreate", properties),
    update: (id: number, properties: unknown) => desktop.call("tabUpdate", id, properties),
    remove: (id: number) => desktop.call("tabRemove", id),
    onActivated, onUpdated, onRemoved,
  },
  windows: {
    create: (properties: unknown) => desktop.call("winCreate", properties),
    update: (id: number, properties: unknown) => desktop.call("winUpdate", id, properties),
    getLastFocused: () => desktop.call("winFocused"),
  },
  permissions: {
    contains: (value: unknown) => desktop.call("permissions", "contains", value),
    request: (value: unknown) => desktop.call("permissions", "request", value),
  },
  action: { onClicked: empty },
  contextMenus: { onClicked: contextMenu, removeAll: async () => undefined, create: () => undefined },
  i18n: { getMessage: () => "" },
} as unknown as typeof import("wxt/browser").browser;
