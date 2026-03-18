import {
  addObjectToCase,
  createAdminSession,
  type AuditSink,
  type AdminSession,
  assignAuction,
  createAuditEntry,
  createCase,
  finalizeCase,
  isAdminSessionActive,
  saveDraftCase,
  type WorkspaceStateLike
} from "@elb/app-core/index";
import { loadSeedMasterData, type CaseFile, type MasterData } from "@elb/domain/index";
import type { AppStorageSnapshot } from "@elb/persistence/storage";
import { createLogger } from "@elb/shared/logger";

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
let pendingObjectSelectionId: string | null = null;
const logger = createLogger("app-state");
let auditSink: AuditSink | null = null;

export function configureStateServices(services: { auditSink?: AuditSink | null }): void {
  auditSink = services.auditSink ?? null;
}

function appendAudit(entry: ReturnType<typeof createAuditEntry>): void {
  logger.info(entry.summary, entry);
  if (!auditSink) {
    return;
  }

  void auditSink.append(entry).catch((error) => {
    logger.warn("Audit-Eintrag konnte nicht persistiert werden.", error);
  });
}

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

export function consumePendingObjectSelectionId(): string | null {
  const nextId = pendingObjectSelectionId;
  pendingObjectSelectionId = null;
  return nextId;
}

export function createSnapshot(): AppStorageSnapshot {
  return {
    masterData: state.masterData,
    activeClerkId: state.activeClerkId,
    currentCase: state.currentCase,
    drafts: state.drafts,
    finalized: state.finalized
  };
}

export function replaceState(nextState: AppStorageSnapshot): void {
  state = {
    ...nextState,
    adminSession: state.adminSession
  };
  emit();
}

export function unlockAdmin(inputPin: string): boolean {
  if (inputPin.trim() !== state.masterData.adminPin.trim()) {
    return false;
  }

  state = {
    ...state,
    adminSession: createAdminSession(new Date().toISOString())
  };
  emit();
  return true;
}

export function lockAdmin(): void {
  state = {
    ...state,
    adminSession: null
  };
  emit();
}

export function hasAdminAccess(): boolean {
  return isAdminSessionActive(state.adminSession, new Date().toISOString());
}

export function selectClerk(clerkId: string): void {
  state = {
    ...state,
    activeClerkId: clerkId
  };

  if (!state.currentCase) {
    createNewCase();
    return;
  }

  emit();
}

export function createNewCase(): void {
  if (!state.activeClerkId) {
    return;
  }

  const nextCase = createCase(state as WorkspaceStateLike);

  state = {
    ...state,
    currentCase: nextCase
  };
  appendAudit(createAuditEntry({
    actorId: state.activeClerkId,
    action: "case.created",
    entityType: "case",
    entityId: nextCase.meta.id,
    summary: `Vorgang ${nextCase.meta.receiptNumber} wurde erstellt.`
  }));
  emit();
}

export function updateMasterData(updater: (current: MasterData) => MasterData): void {
  const previous = state.masterData;
  state = {
    ...state,
    masterData: updater(state.masterData)
  };
  appendAudit(createAuditEntry({
    actorId: state.activeClerkId,
    action: "master-data.updated",
    entityType: "masterData",
    entityId: "master-data",
    summary: "Stammdaten wurden aktualisiert.",
    metadata: {
      clerkCount: String(state.masterData.clerks.length),
      auctionCount: String(state.masterData.auctions.length),
      departmentCount: String(state.masterData.departments.length),
      previousClerkCount: String(previous.clerks.length)
    }
  }));
  emit();
}

export function updateCurrentCase(updater: (current: CaseFile) => CaseFile): void {
  if (!state.currentCase) {
    return;
  }

  state = {
    ...state,
    currentCase: updater({
      ...state.currentCase,
      meta: {
        ...state.currentCase.meta,
        updatedAt: new Date().toISOString()
      }
    })
  };
  emit();
}

export function saveDraft(): void {
  if (!state.currentCase) {
    return;
  }

  const currentCase = state.currentCase;

  state = {
    ...state,
    drafts: saveDraftCase(currentCase, state.drafts)
  };
  appendAudit(createAuditEntry({
    actorId: state.activeClerkId,
    action: "case.draft-saved",
    entityType: "case",
    entityId: currentCase.meta.id,
    summary: `Vorgang ${currentCase.meta.receiptNumber} wurde als Entwurf gespeichert.`
  }));
  emit();
}

export function finalizeCurrentCase(): void {
  if (!state.currentCase) {
    return;
  }

  const finalizedCase: CaseFile = finalizeCase(state.currentCase);

  state = {
    ...state,
    currentCase: finalizedCase,
    drafts: state.drafts.filter((draft) => draft.meta.id !== finalizedCase.meta.id),
    finalized: [...state.finalized.filter((item) => item.meta.id !== finalizedCase.meta.id), finalizedCase]
  };
  appendAudit(createAuditEntry({
    actorId: state.activeClerkId,
    action: "case.finalized",
    entityType: "case",
    entityId: finalizedCase.meta.id,
    summary: `Vorgang ${finalizedCase.meta.receiptNumber} wurde finalisiert.`
  }));
  emit();
}

export function loadCaseById(id: string): void {
  const found = [...state.drafts, ...state.finalized].find((caseFile) => caseFile.meta.id === id) ?? null;
  state = {
    ...state,
    currentCase: found,
    activeClerkId: found?.meta.clerkId ?? state.activeClerkId
  };
  if (found) {
    appendAudit(createAuditEntry({
      actorId: state.activeClerkId,
      action: "case.loaded",
      entityType: "case",
      entityId: found.meta.id,
      summary: `Vorgang ${found.meta.receiptNumber} wurde geladen.`
    }));
  }
  emit();
}

export function addObject(): string | null {
  if (!state.currentCase) {
    return null;
  }

  const result = addObjectToCase(state.currentCase, state.masterData);
  pendingObjectSelectionId = result.objectId;
  state = {
    ...state,
    currentCase: result.caseFile
  };
  emit();

  return result.objectId;
}

export function updateObject(objectId: string, updater: (current: CaseFile["objects"][number]) => CaseFile["objects"][number]): void {
  updateCurrentCase((current) => ({
    ...current,
    objects: current.objects.map((item) => (item.id === objectId ? updater(item) : item))
  }));
}

export function deleteObject(objectId: string): void {
  updateCurrentCase((current) => ({
    ...current,
    objects: current.objects.filter((item) => item.id !== objectId)
  }));
}

export function applyAuctionPricingRules(objectId: string): void {
  const current = state.currentCase;
  if (!current) {
    return;
  }

  const objectItem = current.objects.find((item) => item.id === objectId);
  if (!objectItem) {
    return;
  }

  state = {
    ...state,
    currentCase: assignAuction(current, state.masterData, objectId, objectItem.auctionId)
  };
  emit();
}
