import {
  createEmptyCase,
  createEmptyObject,
  formatReceiptNumber,
  isIbidAuction,
  type CaseFile,
  type Clerk,
  type MasterData,
  type ObjectItem
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

export function createCase(state: WorkspaceStateLike, context: UseCaseContext = defaultUseCaseContext): CaseFile {
  if (!state.activeClerkId) {
    throw new AppError("NO_ACTIVE_CLERK", "Ein neuer Vorgang benötigt einen aktiven Sachbearbeiter.");
  }

  const createdAt = context.now();
  return createEmptyCase({
    id: context.createId(),
    clerkId: state.activeClerkId,
    receiptNumber: reserveNextCaseNumber({
      clerkId: state.activeClerkId,
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
