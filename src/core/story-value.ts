/** Stable object-key order; array order remains meaningful for a scene and timeline. */
export const canonicalStoryValue = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);

export const sameStoryValue = (left: unknown, right: unknown): boolean => canonicalStoryValue(left) === canonicalStoryValue(right);
