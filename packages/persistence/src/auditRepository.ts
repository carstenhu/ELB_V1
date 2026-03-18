import type { AuditEntry, AuditSink } from "@elb/app-core/index";
import { appendAuditEntryToDisk, loadAuditLogFromDisk } from "./filesystem";

export interface AuditRepository extends AuditSink {
  list(): Promise<AuditEntry[]>;
}

export function createAuditRepository(): AuditRepository {
  return {
    append: (entry) => appendAuditEntryToDisk(entry),
    list: () => loadAuditLogFromDisk()
  };
}
