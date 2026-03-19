import type { AdminSession, AuditSink, WorkspaceSnapshot } from "@elb/app-core/index";
import { loadSeedMasterData, normalizeMasterData, type CaseFile, type MasterData } from "@elb/domain/index";

export interface AppState {
  masterData: MasterData;
  activeClerkId: string | null;
  currentCase: CaseFile | null;
  drafts: CaseFile[];
  finalized: CaseFile[];
  adminSession: AdminSession | null;
}

function createInitialState(): AppState {
  return {
    masterData: loadSeedMasterData(),
    activeClerkId: null,
    currentCase: null,
    drafts: [],
    finalized: [],
    adminSession: null
  };
}

let state = createInitialState();
const listeners = new Set<() => void>();
let auditSink: AuditSink | null = null;
let pendingObjectSelectionId: string | null = null;

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState(): AppState {
  return state;
}

export function setState(nextState: AppState): void {
  state = nextState;
  emit();
}

export function updateState(updater: (current: AppState) => AppState): void {
  state = updater(state);
  emit();
}

export function setAuditSink(nextAuditSink: AuditSink | null): void {
  auditSink = nextAuditSink;
}

export function getAuditSink(): AuditSink | null {
  return auditSink;
}

export function setPendingObjectSelectionId(nextId: string | null): void {
  pendingObjectSelectionId = nextId;
}

export function consumePendingObjectSelectionId(): string | null {
  const nextId = pendingObjectSelectionId;
  pendingObjectSelectionId = null;
  return nextId;
}

export function createWorkspaceSnapshot(): WorkspaceSnapshot {
  return {
    masterData: state.masterData,
    activeClerkId: state.activeClerkId,
    currentCase: state.currentCase,
    drafts: state.drafts,
    finalized: state.finalized
  };
}

export function replaceWorkspaceSnapshot(snapshot: WorkspaceSnapshot): void {
  setState({
    ...snapshot,
    masterData: normalizeMasterData(snapshot.masterData),
    adminSession: state.adminSession
  });
}
