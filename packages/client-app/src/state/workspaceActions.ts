import {
  addObjectToCase,
  assignAuction,
  consumeReceiptNumberIfNeeded,
  createAuditEntry,
  createCase,
  finalizeCase,
  isAdminSessionActive,
  openDossier,
  saveDraftCase,
  type AuditSink,
  unlockAdminSession,
  type WorkspaceStateLike
} from "@elb/app-core/index";
import type { CaseFile, MasterData, ReceiptNumberScope } from "@elb/domain/index";
import { createLogger } from "@elb/shared/logger";
import type { ExchangeImportResult } from "../platform/platformTypes";
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

let receiptNumberScope: ReceiptNumberScope = "desktop";

function findCurrentDossierForClerk(state: ReturnType<typeof getState>, clerkId: string): CaseFile | null {
  const currentDossierId = state.currentDossierIdByClerk[clerkId];
  const allCases = [state.currentCase, ...state.drafts, ...state.finalized]
    .filter((caseFile): caseFile is CaseFile => Boolean(caseFile))
    .filter((caseFile) => caseFile.meta.clerkId === clerkId);

  if (currentDossierId) {
    const matched = allCases.find((caseFile) => caseFile.meta.id === currentDossierId);
    if (matched) {
      return matched;
    }
  }

  return allCases
    .sort((left, right) => right.meta.updatedAt.localeCompare(left.meta.updatedAt, "de-CH", { numeric: true, sensitivity: "base" }))[0]
    ?? null;
}

function dedupeCases(caseFiles: readonly CaseFile[]): CaseFile[] {
  const byId = new Map<string, CaseFile>();

  caseFiles.forEach((caseFile) => {
    byId.set(caseFile.meta.id, caseFile);
  });

  return [...byId.values()];
}

function applyReceiptNumberConsumption(current: ReturnType<typeof getState>, caseFile: CaseFile | null) {
  if (!caseFile?.meta.clerkId.trim() || !caseFile.meta.receiptNumber.trim()) {
    return current;
  }

  const nextMasterData = consumeReceiptNumberIfNeeded({
    masterData: current.masterData,
    clerkId: caseFile.meta.clerkId,
    receiptNumber: caseFile.meta.receiptNumber,
    scope: receiptNumberScope,
    drafts: current.drafts,
    finalized: current.finalized
  });

  return nextMasterData === current.masterData ? current : { ...current, masterData: nextMasterData };
}

export function configureStateServices(services: { auditSink?: AuditSink | null; receiptNumberScope?: ReceiptNumberScope }): void {
  setAuditSink(services.auditSink ?? null);
  receiptNumberScope = services.receiptNumberScope ?? "desktop";
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
  updateState((current) => {
    const currentCaseForClerk = findCurrentDossierForClerk(current, clerkId);

    return {
      ...current,
      activeClerkId: clerkId,
      currentCase: currentCaseForClerk
    };
  });
}

export function createNewCase(): void {
  const currentState = getState();
  if (!currentState.activeClerkId) {
    return;
  }

  const nextCase = createCase(currentState as WorkspaceStateLike, receiptNumberScope);
  updateState((current) => ({
    ...current,
    currentCase: nextCase,
    currentDossierIdByClerk: {
      ...current.currentDossierIdByClerk,
      [nextCase.meta.clerkId]: nextCase.meta.id
    }
  }));
  appendAudit(createAuditEntry({
    actorId: getState().activeClerkId,
    action: "case.created",
    entityType: "case",
    entityId: nextCase.meta.id,
    summary: `Vorgang ${nextCase.meta.receiptNumber} wurde erstellt.`
  }));
}

export function openNewDossier(input: { customerName: string; isCompany: boolean; receiptNumber: string }): void {
  const currentState = getState();
  if (!currentState.activeClerkId) {
    return;
  }

  const nextCase = openDossier({
    state: currentState as WorkspaceStateLike,
    scope: receiptNumberScope,
    customerName: input.customerName,
    isCompany: input.isCompany,
    receiptNumber: input.receiptNumber
  });

  updateState((current) => ({
    ...current,
    currentCase: nextCase
  }));
  appendAudit(createAuditEntry({
    actorId: getState().activeClerkId,
    action: "case.created",
    entityType: "case",
    entityId: nextCase.meta.id,
    summary: `Dossier ${nextCase.meta.receiptNumber} wurde eroeffnet.`
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

  updateState((current) => {
    const nextCase = updater({
      ...currentCase,
      meta: {
        ...currentCase.meta,
        updatedAt: new Date().toISOString()
      }
    });

    return applyReceiptNumberConsumption({
      ...current,
      currentCase: nextCase
    }, nextCase);
  });
}

export function saveDraft(): void {
  const currentCase = getState().currentCase;
  if (!currentCase) {
    return;
  }

  updateState((current) => ({
    ...applyReceiptNumberConsumption(current, currentCase),
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
    ...applyReceiptNumberConsumption(current, finalizedCase),
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
  const found = [currentState.currentCase, ...currentState.drafts, ...currentState.finalized]
    .filter((caseFile): caseFile is CaseFile => Boolean(caseFile))
    .find((caseFile) => caseFile.meta.id === id) ?? null;

  updateState((current) => ({
    ...current,
    currentCase: found,
    activeClerkId: found?.meta.clerkId ?? current.activeClerkId,
    currentDossierIdByClerk: found
      ? {
          ...current.currentDossierIdByClerk,
          [found.meta.clerkId]: found.meta.id
        }
      : current.currentDossierIdByClerk
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

export function importExchangeData(result: ExchangeImportResult): void {
  updateState((current) => {
    const preservedCurrentDraft =
      current.currentCase && current.currentCase.meta.clerkId !== result.caseFile.meta.clerkId && current.currentCase.meta.id !== result.caseFile.meta.id
        ? [current.currentCase]
        : [];

    const remainingDrafts = current.drafts.filter(
      (caseFile) => caseFile.meta.clerkId !== result.caseFile.meta.clerkId && caseFile.meta.id !== result.caseFile.meta.id
    );
    const remainingFinalized = current.finalized.filter(
      (caseFile) => caseFile.meta.clerkId !== result.caseFile.meta.clerkId && caseFile.meta.id !== result.caseFile.meta.id
    );

    return {
      ...current,
      masterData: result.masterData,
      activeClerkId: result.caseFile.meta.clerkId,
      currentCase: result.caseFile,
      currentDossierIdByClerk: {
        ...current.currentDossierIdByClerk,
        [result.caseFile.meta.clerkId]: result.caseFile.meta.id
      },
      drafts: dedupeCases([...preservedCurrentDraft, ...remainingDrafts]),
      finalized: dedupeCases(remainingFinalized)
    };
  });

  appendAudit(
    createAuditEntry({
      actorId: result.caseFile.meta.clerkId,
      action: "exchange.imported",
      entityType: "import",
      entityId: result.caseFile.meta.id,
      summary: `Austauschdaten fuer Vorgang ${result.caseFile.meta.receiptNumber} wurden importiert.`,
      metadata: {
        clerkId: result.caseFile.meta.clerkId,
        receiptNumber: result.caseFile.meta.receiptNumber,
        warningCount: String(result.warnings.length)
      }
    })
  );
}

export function importMasterDataSnapshot(masterData: MasterData): void {
  updateState((current) => {
    const hasActiveClerk = current.activeClerkId
      ? masterData.clerks.some((clerk) => clerk.id === current.activeClerkId)
      : true;

    return {
      ...current,
      masterData,
      activeClerkId: hasActiveClerk ? current.activeClerkId : null
    };
  });

  appendAudit(
    createAuditEntry({
      actorId: getState().activeClerkId,
      action: "master-data.imported",
      entityType: "import",
      entityId: "master-data",
      summary: "Stammdaten wurden importiert.",
      metadata: {
        clerkCount: String(masterData.clerks.length),
        auctionCount: String(masterData.auctions.length),
        departmentCount: String(masterData.departments.length)
      }
    })
  );
}

export function addObject(): string | null {
  const state = getState();
  if (!state.currentCase) {
    return null;
  }

  const result = addObjectToCase(state.currentCase, state.masterData);
  setPendingObjectSelectionId(result.objectId);
  updateState((current) =>
    applyReceiptNumberConsumption({
      ...current,
      currentCase: result.caseFile
    }, result.caseFile)
  );

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

  updateState((current) => {
    const nextCase = assignAuction(currentCase, current.masterData, objectId, objectItem.auctionId);
    return applyReceiptNumberConsumption({
      ...current,
      currentCase: nextCase
    }, nextCase);
  });
}

export function resetStateForTests(snapshot: ReturnType<typeof createWorkspaceSnapshot>): void {
  setState({
    ...snapshot,
    adminSession: null
  });
}
