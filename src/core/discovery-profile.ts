import { PROFILE_FIELDS, readProfileProposal, type ProfileValues, type ProfileProposal } from "./character-profile";
import { validNativeStoryId } from "./story-transport";

/** Source-backed draft, never a live entity or a creative fallback. */
export interface DiscoveryProfile {
  headRevisionId: string;
  name: string;
  values: ProfileValues;
  proposal: ProfileProposal;
  proofs: { revisionId: string; quote: string }[];
  partial: boolean;
}
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function validDiscoveryValues(v: unknown): v is ProfileValues {
  return obj(v) && Object.keys(v).length === 4 && PROFILE_FIELDS.every(k => typeof v[k] === "string" && (v[k] as string).length <= (k === "background" ? 1600 : 1200));
}
export function validDiscoveryProfile(v: unknown): v is DiscoveryProfile {
  if (!obj(v) || Object.keys(v).length !== 6 || !["headRevisionId", "name", "values", "proposal", "proofs", "partial"].every(k => Object.hasOwn(v, k))
    || !validNativeStoryId(v.headRevisionId) || typeof v.name !== "string" || !v.name.trim() || v.name !== v.name.trim() || v.name.length > 80 || !validDiscoveryValues(v.values) || typeof v.partial !== "boolean"
    || !Array.isArray(v.proofs) || v.proofs.length > 32 || !v.proofs.every(p => obj(p) && Object.keys(p).length === 2 && validNativeStoryId(p.revisionId) && typeof p.quote === "string" && !!p.quote.trim() && p.quote.length <= 4000)) return false;
  try {
    const p = readProfileProposal(JSON.stringify(v.proposal), [...PROFILE_FIELDS]);
    const proofs = v.proofs as DiscoveryProfile["proofs"];
    return PROFILE_FIELDS.every(k => p[k]?.status !== "suggested" && p[k]!.evidence.every(q => proofs.some(proof => proof.quote === q)))
      && proofs.every(proof => PROFILE_FIELDS.some(k => p[k]!.evidence.includes(proof.quote)));
  } catch { return false; }
}
