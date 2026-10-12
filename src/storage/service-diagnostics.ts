import { browser } from "wxt/browser";
import { serviceDiagnosticSnapshot, type ServiceJournalState } from "../core/service-diagnostics";
import { repository, VaultLockedError, type DeepRoleRepository } from "./repository";

type Reader = Pick<DeepRoleRepository, "isLocked" | "list">;
type LocalReader = Pick<typeof browser.storage.local, "get">;
/** Read-only: no outbox flush/reconciliation, model, tabs, jobs or lore access. */
export async function readServiceDiagnostics(repo: Reader = repository, local: LocalReader = browser.storage.local) {
 const [journal, pending] = await Promise.all([
  (async (): Promise<{ status: ServiceJournalState; values?: unknown }> => {
   try {
    if (await repo.isLocked()) return { status: "locked" };
    const values = await repo.list("service");
    // A lock during the read must not leave decrypted metadata on this screen.
    if (await repo.isLocked()) return { status: "locked" };
    return { status: "read", values };
   } catch (error) { return { status: error instanceof VaultLockedError ? "locked" : "unavailable" }; }
  })(),
  (async () => { try { return { status: "read" as const, values: await local.get() }; } catch { return { status: "unavailable" as const }; } })(),
 ]);
 return serviceDiagnosticSnapshot(journal, pending);
}
