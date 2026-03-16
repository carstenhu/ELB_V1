import { createEmptyCase, createEmptyObject, formatReceiptNumber, isIbidAuction, loadSeedMasterData } from "@elb/domain/index";
import { loadSnapshot, saveSnapshot } from "@elb/persistence/storage";
function createInitialState() {
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
const listeners = new Set();
let pendingObjectSelectionId = null;
function emit() {
    const snapshot = {
        masterData: state.masterData,
        activeClerkId: state.activeClerkId,
        currentCase: state.currentCase,
        drafts: state.drafts,
        finalized: state.finalized
    };
    saveSnapshot(snapshot);
    listeners.forEach((listener) => listener());
}
export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
export function getState() {
    return state;
}
export function consumePendingObjectSelectionId() {
    const nextId = pendingObjectSelectionId;
    pendingObjectSelectionId = null;
    return nextId;
}
export function createSnapshot() {
    return {
        masterData: state.masterData,
        activeClerkId: state.activeClerkId,
        currentCase: state.currentCase,
        drafts: state.drafts,
        finalized: state.finalized
    };
}
export function replaceState(nextState) {
    state = nextState;
    emit();
}
function nextReceiptNumberForClerk(clerkId) {
    const allCases = [...state.drafts, ...state.finalized].filter((caseFile) => caseFile.meta.clerkId === clerkId);
    const maxValue = allCases.reduce((current, caseFile) => {
        const value = Number.parseInt(caseFile.meta.receiptNumber, 10);
        return Number.isFinite(value) ? Math.max(current, value) : current;
    }, 0);
    return formatReceiptNumber(maxValue + 1);
}
export function selectClerk(clerkId) {
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
export function createNewCase() {
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
export function updateMasterData(updater) {
    state = {
        ...state,
        masterData: updater(state.masterData)
    };
    emit();
}
export function updateCurrentCase(updater) {
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
export function saveDraft() {
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
export function finalizeCurrentCase() {
    if (!state.currentCase) {
        return;
    }
    const finalizedCase = {
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
export function loadCaseById(id) {
    const found = [...state.drafts, ...state.finalized].find((caseFile) => caseFile.meta.id === id) ?? null;
    state = {
        ...state,
        currentCase: found,
        activeClerkId: found?.meta.clerkId ?? state.activeClerkId
    };
    emit();
}
export function addObject() {
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
export function updateObject(objectId, updater) {
    updateCurrentCase((current) => ({
        ...current,
        objects: current.objects.map((item) => (item.id === objectId ? updater(item) : item))
    }));
}
export function deleteObject(objectId) {
    updateCurrentCase((current) => ({
        ...current,
        objects: current.objects.filter((item) => item.id !== objectId)
    }));
}
export function applyAuctionPricingRules(objectId) {
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
