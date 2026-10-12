import { validNativeStoryId, validStoryTransportIdentity, type StoryTransportIdentity } from "./story-transport";

export interface StoryDispatchIdentity { requestId: string; identity: StoryTransportIdentity }
export type StoryDispatchDelivery = { status: "accepted"; httpStatus: number } | { status: "failed"; code: "network" | "aborted" | "http" | "redirected" | "unavailable" | "superseded"; httpStatus?: number };
export type StoryDispatchPacket = StoryDispatchIdentity & { transport: "fetch" | "xhr" } & ({ phase: "started" } | { phase: "settled"; delivery: StoryDispatchDelivery });
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const shape = (value: unknown, keys: string[]) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
const http = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599;
function validDelivery(value: unknown): value is StoryDispatchDelivery {
  if (!object(value)) return false;
  if (value.status === "accepted") return shape(value, ["status", "httpStatus"]) && http(value.httpStatus) && value.httpStatus >= 200 && value.httpStatus < 300;
  return value.status === "failed" && shape(value, ["status", "code", ...(Object.prototype.hasOwnProperty.call(value, "httpStatus") ? ["httpStatus"] : [])])
    && ["network", "aborted", "http", "redirected", "unavailable", "superseded"].includes(value.code as string)
    && (!Object.prototype.hasOwnProperty.call(value, "httpStatus") || http(value.httpStatus))
    && (value.code !== "http" || http(value.httpStatus) && (value.httpStatus < 200 || value.httpStatus >= 300));
}
/** Transient network metadata only. Not a story receipt, reply link or completion proof. */
export function validStoryDispatchPacket(value: unknown): value is StoryDispatchPacket {
  if (!object(value) || !validNativeStoryId(value.requestId) || !validStoryTransportIdentity(value.identity) || !["fetch", "xhr"].includes(value.transport as string)) return false;
  return value.phase === "started" ? shape(value, ["requestId", "identity", "transport", "phase"])
    : value.phase === "settled" && shape(value, ["requestId", "identity", "transport", "phase", "delivery"]) && validDelivery(value.delivery);
}

/** One exact outgoing call, one terminal HTTP outcome. Abort after headers cannot rewrite it.
 * No timers/global log/response reader. A reporting failure must never affect the website.
 */
export function createStoryDispatchTracker(input: StoryDispatchIdentity | undefined, transport: "fetch" | "xhr", emit: (packet: StoryDispatchPacket) => void) {
  if (!input || !shape(input, ["requestId", "identity"]) || !validNativeStoryId(input.requestId) || !validStoryTransportIdentity(input.identity) || !["fetch", "xhr"].includes(transport)) return null;
  const frozen = { requestId: input.requestId, identity: { ...input.identity }, transport };
  let started = false, settled = false;
  const publish = (packet: StoryDispatchPacket) => { try { emit(packet); } catch { /* Diagnostics cannot block sending. */ } };
  const settle = (delivery: StoryDispatchDelivery) => {
    if (!started || settled || !validDelivery(delivery)) return false;
    settled = true; publish({ ...frozen, identity: { ...frozen.identity }, phase: "settled", delivery: { ...delivery } }); return true;
  };
  return {
    start() { if (started) return false; started = true; publish({ ...frozen, identity: { ...frozen.identity }, phase: "started" }); return true; },
    fail(code: Extract<StoryDispatchDelivery, { status: "failed" }>["code"]) { return settle({ status: "failed", code }); },
    headers(status: number, redirected = false) {
      return !http(status) ? settle({ status: "failed", code: "unavailable" }) : redirected ? settle({ status: "failed", code: "redirected", httpStatus: status })
        : status >= 200 && status < 300 ? settle({ status: "accepted", httpStatus: status }) : settle({ status: "failed", code: "http", httpStatus: status });
    },
  };
}
