import type { CastMember } from "./cast-initialization";
import { castText } from "./cast-i18n";
import type { Locale } from "./types";

/** Presentation only. Keep the original explanation, evidence and lore untouched.
 * Never guess a translation of technical model prose into story facts. */
const technicalReason = /\b(?:entity|entry|world|book|template)_[\p{L}\p{N}_-]+\b|\b(?:protagonist|romance)\s*[:=]?\s*(?:true|false)\b|\b(?:relationships|sheet|null)\b|\bstate\.|(?:\bin|в)\s+state\b/iu;
export function castReviewReason(member: CastMember, locale: Locale): string {
  return technicalReason.test(member.reason) ? castText(locale, "reviewReasonFallback") : member.reason;
}
