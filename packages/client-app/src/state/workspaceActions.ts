import {
  addObjectToCase,
  assignAuction,
  createAuditEntry,
  createCase,
  finalizeCase,
  isAdminSessionActive,
  saveDraftCase,
  type AuditSink,
  unlockAdminSession,
  type WorkspaceStateLike
} from "@elb/app-core/index";
import type { CaseFile, MasterData } from "@elb/domain/index";
import { createLogger } from "@elb/shared/logger";
import {
  consumePendingObjectSelectionId,
  createWorkspaceSnapshot,
  getAuditSink,
  getState,
  replaceWorkspaceSnapshot,
  setAuditSink,
  setPendingObjectSelectionId,
  setState,
  subscribe,
  updateState
} from "./workspaceStore";

const logger = createLogger("workspace-actions");

export { consumePendingObjectSelectionId, createWorkspaceSnapshot as createSnapshot, getState, replaceWorkspaceSnapshot as replaceState, subscribe };

export function configureStateServices(services: { auditSink?: AuditSink | null }): void {
  setAuditSink(services.auditSink ?? null);
}

function appendAudit(entry: ReturnType<typeof createAuditEntry>): void {
  logger.info(entry.summary, entry);
  const auditSink = getAuditSink();
  if (!auditSink) {
    return;
  }

  void auditSink.append(entry).catch((error) => {
    logger.warn("Audit-Eintrag konnte nicht persistiert werden.", error);
  });
}

export function unlockAdmin(inputPin: string): boolean {
  try {
    const nextSession = unlockAdminSession(inputPin, getState().masterData, new Date().toISOString());
    updateState((current) => ({
      ...current,
      adminSession: nextSession
    }));
    return true;
  } catch {
    return false;
  }
}

export function lockAdmin(): void {
  updateState((current) => ({
    ...current,
    adminSession: null
  }));
}

export function hasAdminAccess(): boolean {
  return isAdminSessionActive(getState().adminSession, new Date().toISOString());
}

export function selectClerk(clerkId: string): void {
  updateState((current) => ({
    ...current,
    activeClerkId: clerkId
  }));

  if (!getState().currentCase) {
    createNewCase();
  }
}

export function createNewCase(): void {
  const currentState = getState();
  if (!currentState.activeClerkId) {
    return;
  }

  const nextCase = createCase(currentState as WorkspaceStateLike);
  updateState((current) => ({
    ...current,
    currentCase: nextCase
  }));
  appendAudit(createAuditEntry({
    actorId: getState().activeClerkId,
    action: "case.created",
    entityType: "case",
    entityId: nextCase.meta.id,
    summary: `Vorgang ${nextCase.meta.receiptNumber} wurde erstellt.`
  }));
}

export function updateMasterData(updater: (current: MasterData) => MasterData): void {
  const previous = getState().masterData;
  updateState((current) => ({
    ...current,
    masterData: updater(current.masterData)
  }));

  const state = getState();
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
}

export function updateCurrentCase(updater: (current: CaseFile) => CaseFile): void {
  const currentCase = getState().currentCase;
  if (!currentCase) {
    return;
  }

  updateState((current) => ({
    ...current,
    currentCase: updater({
      ...currentCase,
      meta: {
        ...currentCase.meta,
        updatedAt: new Date().toISOString()
      }
    })
  }));
}

export function saveDraft(): void {
  const currentCase = getState().currentCase;
  if (!currentCase) {
    return;
  }

  updateState((current) => ({
    ...current,
    drafts: saveDraftCase(currentCase, current.drafts)
  }));
  appendAudit(createAuditEntry({
    actorId: getState().activeClerkId,
    action: "case.draft-saved",
    entityType: "case",
    entityId: currentCase.meta.id,
    summary: `Vorgang ${currentCase.meta.receiptNumber} wurde als Entwurf gespeichert.`
  }));
}

export function finalizeCurrentCase(): void {
  const currentCase = getState().currentCase;
  if (!currentCase) {
    return;
  }

  const finalizedCase = finalizeCase(currentCase);
  updateState((current) => ({
    ...current,
    currentCase: finalizedCase,
    drafts: current.drafts.filter((draft) => draft.meta.id !== finalizedCase.meta.id),
    finalized: [...current.finalized.filter((item) => item.meta.id !== finalizedCase.meta.id), finalizedCase]
  }));
  appendAudit(createAuditEntry({
    actorId: getState().activeClerkId,
    action: "case.finalized",
    entityType: "case",
    entityId: finalizedCase.meta.id,
    summary: `Vorgang ${finalizedCase.meta.receiptNumber} wurde finalisiert.`
  }));
}

export function loadCaseById(id: string): void {
  const currentState = getState();
  const found = [...currentState.drafts, ...currentState.finalized].find((caseFile) => caseFile.meta.id === id) ?? null;

  updateState((current) => ({
    ...current,
    currentCase: found,
    activeClerkId: found?.meta.clerkId ?? current.activeClerkId
  }));

  if (!found) {
    return;
  }

  appendAudit(createAuditEntry({
    actorId: found.meta.clerkId,
    action: "case.loaded",
    entityType: "case",
    entityId: found.meta.id,
    summary: `Vorgang ${found.meta.receiptNumber} wurde geladen.`
  }));
}

export function addObject(): string | null {
  const state = getState();
  if (!state.currentCase) {
    return null;
  }

  const result = addObjectToCase(state.currentCase, state.masterData);
  setPendingObjectSelectionId(result.objectId);
  updateState((current) => ({
    ...current,
    currentCase: result.caseFile
  }));

  return result.objectId;
}

export function updateObject(
  objectId: string,
  updater: (current: CaseFile["objects"][number]) => CaseFile["objects"][number]
): void {
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
  const state = getState();
  const currentCase = state.currentCase;
  if (!currentCase) {
    return;
  }

  const objectItem = currentCase.objects.find((item) => item.id === objectId);
  if (!objectItem) {
    return;
  }

  updateState((current) => ({
    ...current,
    currentCase: assignAuction(currentCase, current.masterData, objectId, objectItem.auctionId)
  }));
}

export function resetStateForTests(snapshot: ReturnType<typeof createWorkspaceSnapshot>): void {
  setState({
    ...snapshot,
    adminSession: null
  });
}
