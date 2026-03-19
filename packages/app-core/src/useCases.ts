import {
  createEmptyCase,
  createEmptyObject,
  formatReceiptNumber,
  isIbidAuction,
  type CaseFile,
  type Clerk,
  type MasterData,
  type ObjectItem,
  type ReceiptNumberScope
} from "@elb/domain/index";
import { AppError } from "./errors";
import { validateCaseBusinessRules, validateCaseForExport, validateCaseSchema } from "./validation";

export interface WorkspaceStateLike {
  masterData: MasterData;
  activeClerkId: string | null;
  currentCase: CaseFile | null;
  drafts: CaseFile[];
  finalized: CaseFile[];
}

export interface UseCaseContext {
  now: () => string;
  createId: () => string;
}

export const defaultUseCaseContext: UseCaseContext = {
  now: () => new Date().toISOString(),
  createId: () => crypto.randomUUID()
};

export function reserveNextCaseNumber(args: {
  clerkId: string;
  drafts: CaseFile[];
  finalized: CaseFile[];
}): string {
  const allCases = [...args.drafts, ...args.finalized].filter((caseFile) => caseFile.meta.clerkId === args.clerkId);
  const maxValue = allCases.reduce((current, caseFile) => {
    const value = Number.parseInt(caseFile.meta.receiptNumber, 10);
    return Number.isFinite(value) ? Math.max(current, value) : current;
  }, 0);

  return formatReceiptNumber(maxValue + 1);
}

function toPositiveNumericString(value: string): string {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : "1";
}

function getClerkReceiptCounter(clerk: Clerk, scope: ReceiptNumberScope): string {
  return scope === "desktop" ? clerk.nextReceiptNumberDesktop : clerk.nextReceiptNumberWeb;
}

function setClerkReceiptCounter(clerk: Clerk, scope: ReceiptNumberScope, receiptNumber: string): Clerk {
  return scope === "desktop"
    ? { ...clerk, nextReceiptNumberDesktop: receiptNumber }
    : { ...clerk, nextReceiptNumberWeb: receiptNumber };
}

export function getSuggestedCaseNumber(args: {
  masterData: MasterData;
  clerkId: string;
  scope: ReceiptNumberScope;
  drafts: CaseFile[];
  finalized: CaseFile[];
}): string {
  const clerk = args.masterData.clerks.find((item) => item.id === args.clerkId);
  const storedValue = clerk ? Number.parseInt(getClerkReceiptCounter(clerk, args.scope), 10) : 0;
  const fallbackValue = Number.parseInt(reserveNextCaseNumber({
    clerkId: args.clerkId,
    drafts: args.drafts,
    finalized: args.finalized
  }), 10);

  return toPositiveNumericString(String(Math.max(storedValue || 0, fallbackValue || 1)));
}

export function consumeReceiptNumberIfNeeded(args: {
  masterData: MasterData;
  clerkId: string;
  receiptNumber: string;
  scope: ReceiptNumberScope;
  drafts: CaseFile[];
  finalized: CaseFile[];
}): MasterData {
  const clerk = args.masterData.clerks.find((item) => item.id === args.clerkId);
  if (!clerk) {
    return args.masterData;
  }

  const suggestedNumber = getSuggestedCaseNumber(args);
  if (args.receiptNumber.trim() !== suggestedNumber) {
    return args.masterData;
  }

  const nextNumber = toPositiveNumericString(String((Number.parseInt(suggestedNumber, 10) || 0) + 1));
  return {
    ...args.masterData,
    clerks: args.masterData.clerks.map((item) => (item.id === clerk.id ? setClerkReceiptCounter(item, args.scope, nextNumber) : item))
  };
}

export function createCase(
  state: WorkspaceStateLike,
  scope: ReceiptNumberScope,
  context: UseCaseContext = defaultUseCaseContext
): CaseFile {
  if (!state.activeClerkId) {
    throw new AppError("NO_ACTIVE_CLERK", "Ein neuer Vorgang benötigt einen aktiven Sachbearbeiter.");
  }

  const createdAt = context.now();
  return createEmptyCase({
    id: context.createId(),
    clerkId: state.activeClerkId,
    receiptNumber: getSuggestedCaseNumber({
      masterData: state.masterData,
      clerkId: state.activeClerkId,
      scope,
      drafts: state.drafts,
      finalized: state.finalized
    }),
    createdAt
  });
}

export function updateCaseMeta(caseFile: CaseFile, patch: Partial<CaseFile["meta"]>, context: UseCaseContext = defaultUseCaseContext): CaseFile {
  return {
    ...caseFile,
    meta: {
      ...caseFile.meta,
      ...patch,
      updatedAt: context.now()
    }
  };
}

export function updateConsignor(caseFile: CaseFile, patch: Partial<CaseFile["consignor"]>, context: UseCaseContext = defaultUseCaseContext): CaseFile {
  return {
    ...caseFile,
    consignor: {
      ...caseFile.consignor,
      ...patch
    },
    meta: {
      ...caseFile.meta,
      updatedAt: context.now()
    }
  };
}

export function updateMasterData(current: MasterData, updater: (current: MasterData) => MasterData): MasterData {
  const next = updater(current);
  return next;
}

export function addObjectToCase(caseFile: CaseFile, masterData: MasterData, context: UseCaseContext = defaultUseCaseContext): { caseFile: CaseFile; objectId: string } {
  const lastObject = caseFile.objects.at(-1);
  const objectId = context.createId();
  const nextObject = createEmptyObject({
    id: objectId,
    intNumber: formatReceiptNumber(caseFile.objects.length + 1),
    auctionId: lastObject?.auctionId ?? masterData.auctions[0]?.id ?? "",
    departmentId: lastObject?.departmentId ?? masterData.departments[0]?.id ?? ""
  });

  return {
    objectId,
    caseFile: {
      ...caseFile,
      objects: [...caseFile.objects, nextObject],
      meta: {
        ...caseFile.meta,
        updatedAt: context.now()
      }
    }
  };
}

export function updateObjectInCase(caseFile: CaseFile, objectId: string, updater: (current: ObjectItem) => ObjectItem, context: UseCaseContext = defaultUseCaseContext): CaseFile {
  return {
    ...caseFile,
    objects: caseFile.objects.map((item) => (item.id === objectId ? updater(item) : item)),
    meta: {
      ...caseFile.meta,
      updatedAt: context.now()
    }
  };
}

export function assignAuction(caseFile: CaseFile, masterData: MasterData, objectId: string, auctionId: string, context: UseCaseContext = defaultUseCaseContext): CaseFile {
  const auction = masterData.auctions.find((item) => item.id === auctionId);
  return updateObjectInCase(
    caseFile,
    objectId,
    (item) => ({
      ...item,
      auctionId,
      pricingMode: auction && isIbidAuction(auction.number) ? "startPrice" : item.pricingMode === "startPrice" ? "limit" : item.pricingMode
    }),
    context
  );
}

export function saveDraftCase(caseFile: CaseFile, drafts: CaseFile[]): CaseFile[] {
  return [...drafts.filter((draft) => draft.meta.id !== caseFile.meta.id), { ...caseFile, meta: { ...caseFile.meta, status: "draft" } }];
}

export function finalizeCase(caseFile: CaseFile, context: UseCaseContext = defaultUseCaseContext): CaseFile {
  return updateCaseMeta(caseFile, { status: "finalized" }, context);
}

export function validateCaseReadiness(caseFile: CaseFile, masterData: MasterData) {
  return {
    schema: validateCaseSchema(caseFile),
    business: validateCaseBusinessRules(caseFile),
    export: validateCaseForExport(caseFile, masterData)
  };
}

export function requireCaseReadyForExport(caseFile: CaseFile, masterData: MasterData): void {
  const report = validateCaseReadiness(caseFile, masterData);
  const issues = [...report.schema.issues, ...report.business.issues, ...report.export.issues].filter((issue) => issue.severity === "error");

  if (issues.length) {
    throw new AppError("EXPORT_NOT_READY", "Der Vorgang ist noch nicht exportbereit.", issues);
  }
}

export function selectActiveClerk(state: WorkspaceStateLike, clerkId: string): Clerk {
  const clerk = state.masterData.clerks.find((item) => item.id === clerkId);
  if (!clerk) {
    throw new AppError("VALIDATION_ERROR", "Der gewählte Sachbearbeiter existiert nicht.");
  }
  return clerk;
}
