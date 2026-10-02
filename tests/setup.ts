import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { beforeEach, vi } from "vitest";

const stores = vi.hoisted(() => ({
  local: new Map<string, unknown>(),
  session: new Map<string, unknown>(),
}));

function area(store: Map<string, unknown>) {
  return {
    async get(keys?: string | string[]) {
      if (!keys) return Object.fromEntries(store);
      const names = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(names.filter((key) => store.has(key)).map((key) => [key, store.get(key)]));
    },
    async set(values: Record<string, unknown>) {
      for (const [key, value] of Object.entries(values)) store.set(key, value);
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key);
    },
    async clear() { store.clear(); },
  };
}

vi.mock("wxt/browser", () => ({
  browser: {
    storage: {
      local: area(stores.local),
      session: area(stores.session),
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: { sendMessage: vi.fn(), onMessage: { addListener: vi.fn(), removeListener: vi.fn() } },
    tabs: { query: vi.fn(), sendMessage: vi.fn() },
  },
}));

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

beforeEach(() => {
  stores.local.clear();
  stores.session.clear();
});
