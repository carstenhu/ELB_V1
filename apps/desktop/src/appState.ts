import { createEmptyCase, createEmptyObject, formatReceiptNumber, isIbidAuction, loadSeedMasterData, type CaseFile, type MasterData } from "@elb/domain/index";
import { loadSnapshot, saveSnapshot, type AppStorageSnapshot } from "@elb/persistence/storage";

export interface AppState {
  masterData: MasterData;
  activeClerkId: string | null;
  currentCase: CaseFile | null;
  drafts: CaseFile[];
  finalized: CaseFile[];
}

function createInitialState(): AppState {
  const persisted = loadSnapshot();
  if (persisted) {
    return persisted;
  }

  return {
    masterData: loadSeedMasterData(),
    activeClerkId: null,
    currentCase: null,
    drafts: [],
    finalized: []
  };
}

let state = createInitialState();
const listeners = new Set<() => void>();
let pendingObjectSelectionId: string | null = null;

function emit(): void {
  const snapshot: AppStorageSnapshot = {
    masterData: state.masterData,
    activeClerkId: state.activeClerkId,
    currentCase: state.currentCase,
    drafts: state.drafts,
    finalized: state.finalized
  };
  saveSnapshot(snapshot);
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

export function replaceState(nextState: AppState): void {
  state = nextState;
  emit();
}

function nextReceiptNumberForClerk(clerkId: string): string {
  const allCases = [...state.drafts, ...state.finalized].filter((caseFile) => caseFile.meta.clerkId === clerkId);
  const maxValue = allCases.reduce((current, caseFile) => {
    const value = Number.parseInt(caseFile.meta.receiptNumber, 10);
    return Number.isFinite(value) ? Math.max(current, value) : current;
  }, 0);

  return formatReceiptNumber(maxValue + 1);
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

  const now = new Date().toISOString();
  const nextCase = createEmptyCase({
    id: crypto.randomUUID(),
    clerkId: state.activeClerkId,
    receiptNumber: nextReceiptNumberForClerk(state.activeClerkId),
    createdAt: now
  });

  state = {
    ...state,
    currentCase: nextCase
  };
  emit();
}

export function updateMasterData(updater: (current: MasterData) => MasterData): void {
  state = {
    ...state,
    masterData: updater(state.masterData)
  };
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

  const others = state.drafts.filter((draft) => draft.meta.id !== state.currentCase?.meta.id);
  state = {
    ...state,
    drafts: [...others, state.currentCase]
  };
  emit();
}

export function finalizeCurrentCase(): void {
  if (!state.currentCase) {
    return;
  }

  const finalizedCase: CaseFile = {
    ...state.currentCase,
    meta: {
      ...state.currentCase.meta,
      status: "finalized",
      updatedAt: new Date().toISOString()
    }
  };

  state = {
    ...state,
    currentCase: finalizedCase,
    drafts: state.drafts.filter((draft) => draft.meta.id !== finalizedCase.meta.id),
    finalized: [...state.finalized.filter((item) => item.meta.id !== finalizedCase.meta.id), finalizedCase]
  };
  emit();
}

export function loadCaseById(id: string): void {
  const found = [...state.drafts, ...state.finalized].find((caseFile) => caseFile.meta.id === id) ?? null;
  state = {
    ...state,
    currentCase: found,
    activeClerkId: found?.meta.clerkId ?? state.activeClerkId
  };
  emit();
}

export function addObject(): string | null {
  if (!state.currentCase) {
    return null;
  }

  const lastObject = state.currentCase.objects.at(-1);
  const nextAuctionId = lastObject?.auctionId ?? state.masterData.auctions[0]?.id ?? "";
  const nextDepartmentId = lastObject?.departmentId ?? state.masterData.departments[0]?.id ?? "";

  const objectId = crypto.randomUUID();
  pendingObjectSelectionId = objectId;

  updateCurrentCase((current) => ({
    ...current,
    objects: [
      ...current.objects,
      createEmptyObject({
        id: objectId,
        intNumber: formatReceiptNumber(current.objects.length + 1),
        auctionId: nextAuctionId,
        departmentId: nextDepartmentId
      })
    ]
  }));

  return objectId;
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

  const auction = state.masterData.auctions.find((item) => item.id === objectItem.auctionId);
  const ibid = auction ? isIbidAuction(auction.number) : false;

  updateObject(objectId, (item) => ({
    ...item,
    pricingMode: ibid ? "startPrice" : item.pricingMode === "startPrice" ? "limit" : item.pricingMode
  }));
}
