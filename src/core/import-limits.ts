/** Keep large portrait exports portable without accepting unbounded JSON. */
export const MAX_WORLD_FILE_BYTES = 100_000_000;
export const MAX_BACKUP_FILE_BYTES = 200_000_000;
// Base64 grows ciphertext by about one third; leave room for the envelope.
export const MAX_BACKUP_CIPHERTEXT_BYTES = 149_000_000;

export function importFileTooLarge(size: number, kind: "world" | "backup"): boolean {
  return !Number.isFinite(size) || size < 0 || size > (kind === "world" ? MAX_WORLD_FILE_BYTES : MAX_BACKUP_FILE_BYTES);
}
