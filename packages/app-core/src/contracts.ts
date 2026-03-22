import type { CaseFile, MasterData } from "@elb/domain/index";

export interface WorkspaceSnapshot {
  masterData: MasterData;
  activeClerkId: string | null;
  currentCase: CaseFile | null;
  currentDossierIdByClerk: Record<string, string | null>;
  drafts: CaseFile[];
  finalized: CaseFile[];
}

export interface WorkspaceRepository {
  load(): Promise<WorkspaceSnapshot | null>;
  save(snapshot: WorkspaceSnapshot): Promise<void>;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actorId: string | null;
  action: string;
  entityType: "case" | "masterData" | "import" | "export" | "system";
  entityId: string;
  summary: string;
  metadata?: Record<string, string>;
}

export interface AuditSink {
  append(entry: AuditEntry): Promise<void>;
}

export interface SyncVersionVector {
  caseId: string;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
}

export interface SyncEnvelope<TPayload> {
  schemaVersion: number;
  payload: TPayload;
  version: SyncVersionVector;
}
