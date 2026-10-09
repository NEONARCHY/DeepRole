/** Local world/backup files have no application size quota. Reject invalid metadata. */
export function importFileTooLarge(size: number, _kind: "world" | "backup"): boolean {
  return !Number.isFinite(size) || size < 0;
}
