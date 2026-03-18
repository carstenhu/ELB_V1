import type { AuditEntry } from "./contracts";

export function createAuditEntry(args: Omit<AuditEntry, "id" | "timestamp"> & { idFactory?: () => string; now?: () => string }): AuditEntry {
  const idFactory = args.idFactory ?? (() => crypto.randomUUID());
  const now = args.now ?? (() => new Date().toISOString());

  return {
    id: idFactory(),
    timestamp: now(),
    actorId: args.actorId,
    action: args.action,
    entityType: args.entityType,
    entityId: args.entityId,
    summary: args.summary,
    ...(args.metadata ? { metadata: args.metadata } : {})
  };
}
