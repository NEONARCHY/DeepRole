import { expect, it, vi } from "vitest";
import { REPOSITORY_CHUNK, requestJsonPort, serveJsonPort, type JsonPort } from "../src/storage/repository-stream";

function pair() {
  let closed = false;
  const events = () => { const listeners = new Set<any>(); return { addListener: (fn: any) => listeners.add(fn), removeListener: (fn: any) => listeners.delete(fn), emit: (value?: unknown) => { for (const fn of [...listeners]) fn(value); }, size: () => listeners.size }; };
  const clientEvents = events(), serverEvents = events(), clientClose = events(), serverClose = events();
  const sizes: number[] = [];
  const disconnect = () => { if (closed) return; closed = true; clientClose.emit(); serverClose.emit(); };
  const client: JsonPort = { onMessage: clientEvents, onDisconnect: clientClose, disconnect, postMessage: value => { if (closed) throw Error("disconnected"); sizes.push(JSON.stringify(value).length); queueMicrotask(() => { if (!closed) serverEvents.emit(value); }); } };
  const server: JsonPort = { onMessage: serverEvents, onDisconnect: serverClose, disconnect, postMessage: value => { if (closed) throw Error("disconnected"); sizes.push(JSON.stringify(value).length); queueMicrotask(() => { if (!closed) clientEvents.emit(value); }); } };
  return { client, server, sizes, clientEvents, serverEvents, disconnect };
}
it("transfers >64 MB in each direction using small acknowledged packets", async () => {
  const ports = pair(), text = "A".repeat(70_000_000);
  const handler = vi.fn((request: any) => ({ ok: true, data: request.text }));
  serveJsonPort(ports.server, handler);
  const result = await requestJsonPort<{ ok: boolean; data: string }>(ports.client, { type: "DR_REPOSITORY", text });
  expect(result.ok).toBe(true); expect(result.data === text).toBe(true);
  expect(handler).toHaveBeenCalledOnce();
  expect(Math.max(...ports.sizes)).toBeLessThan(REPOSITORY_CHUNK + 100);
  expect(ports.clientEvents.size()).toBe(0); expect(ports.serverEvents.size()).toBe(0);
}, 30_000);
it("drops an interrupted upload without invoking the repository", () => {
  const ports = pair(), handle = vi.fn();
  serveJsonPort(ports.server, handle);
  ports.serverEvents.emit({ type: "request", index: 0, part: '{"type":"DR_REPOSITORY",' });
  ports.disconnect();
  expect(handle).not.toHaveBeenCalled(); expect(ports.serverEvents.size()).toBe(0);
});
it.each([{ type: "request", index: 1, part: "{}" }, { type: "request", index: 0, part: "A".repeat(REPOSITORY_CHUNK + 1) }, { type: "execute" }])("rejects invalid ordering or packets without a write", packet => {
  const ports = pair(), handle = vi.fn(); serveJsonPort(ports.server, handle);
  ports.serverEvents.emit(packet); expect(handle).not.toHaveBeenCalled(); expect(ports.serverEvents.size()).toBe(0);
});
it("rejects a disconnected read and propagates a structured storage error", async () => {
  const ports = pair(); serveJsonPort(ports.server, () => ({ ok: false, error: "character-conflict" }));
  expect(await requestJsonPort(ports.client, { type: "DR_REPOSITORY" })).toEqual({ ok: false, error: "character-conflict" });
  const interrupted = pair(); const request = requestJsonPort(interrupted.client, { type: "DR_REPOSITORY" });
  interrupted.disconnect(); await expect(request).rejects.toThrow("storage-unavailable");
});
