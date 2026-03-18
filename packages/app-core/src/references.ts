import type { CaseFile, MasterData } from "@elb/domain/index";
import type { ValidationIssue } from "./validation";

export type MasterDataEntityType = "clerk" | "auction" | "department";

export interface ReferenceUsage {
  caseId: string;
  receiptNumber: string;
  target: MasterDataEntityType;
  path: string;
}

function collectCaseReferences(caseFile: CaseFile, entityType: MasterDataEntityType, entityId: string): ReferenceUsage[] {
  const usages: ReferenceUsage[] = [];

  if (entityType === "clerk" && caseFile.meta.clerkId === entityId) {
    usages.push({ caseId: caseFile.meta.id, receiptNumber: caseFile.meta.receiptNumber, target: entityType, path: "meta.clerkId" });
  }

  if (entityType === "auction") {
    caseFile.objects.forEach((objectItem, index) => {
      if (objectItem.auctionId === entityId) {
        usages.push({
          caseId: caseFile.meta.id,
          receiptNumber: caseFile.meta.receiptNumber,
          target: entityType,
          path: `objects.${index}.auctionId`
        });
      }
    });
  }

  if (entityType === "department") {
    caseFile.objects.forEach((objectItem, index) => {
      if (objectItem.departmentId === entityId) {
        usages.push({
          caseId: caseFile.meta.id,
          receiptNumber: caseFile.meta.receiptNumber,
          target: entityType,
          path: `objects.${index}.departmentId`
        });
      }
    });

    caseFile.internalInfo.interestDepartmentIds.forEach((departmentId, index) => {
      if (departmentId === entityId) {
        usages.push({
          caseId: caseFile.meta.id,
          receiptNumber: caseFile.meta.receiptNumber,
          target: entityType,
          path: `internalInfo.interestDepartmentIds.${index}`
        });
      }
    });
  }

  return usages;
}

export function collectMasterDataReferences(caseFiles: CaseFile[], entityType: MasterDataEntityType, entityId: string): ReferenceUsage[] {
  return caseFiles.flatMap((caseFile) => collectCaseReferences(caseFile, entityType, entityId));
}

export function validateCaseReferenceIntegrity(caseFile: CaseFile, masterData: MasterData): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (caseFile.meta.clerkId && !masterData.clerks.some((clerk) => clerk.id === caseFile.meta.clerkId)) {
    issues.push({
      code: "CLERK_REFERENCE_INVALID",
      scope: "domain",
      severity: "error",
      path: "meta.clerkId",
      message: "Der referenzierte Sachbearbeiter existiert nicht mehr."
    });
  }

  caseFile.objects.forEach((objectItem, index) => {
    if (objectItem.auctionId && !masterData.auctions.some((auction) => auction.id === objectItem.auctionId)) {
      issues.push({
        code: "AUCTION_REFERENCE_INVALID",
        scope: "domain",
        severity: "error",
        path: `objects.${index}.auctionId`,
        message: `Objekt ${index + 1} verweist auf eine gelöschte Auktion.`
      });
    }

    if (objectItem.departmentId && !masterData.departments.some((department) => department.id === objectItem.departmentId)) {
      issues.push({
        code: "DEPARTMENT_REFERENCE_INVALID",
        scope: "domain",
        severity: "error",
        path: `objects.${index}.departmentId`,
        message: `Objekt ${index + 1} verweist auf eine gelöschte Abteilung.`
      });
    }

    objectItem.photoAssetIds.forEach((assetId, assetIndex) => {
      if (!caseFile.assets.some((asset) => asset.id === assetId)) {
        issues.push({
          code: "OBJECT_ASSET_REFERENCE_INVALID",
          scope: "domain",
          severity: "error",
          path: `objects.${index}.photoAssetIds.${assetIndex}`,
          message: `Objekt ${index + 1} verweist auf ein fehlendes Bild.`
        });
      }
    });
  });

  caseFile.internalInfo.interestDepartmentIds.forEach((departmentId, index) => {
    if (!masterData.departments.some((department) => department.id === departmentId)) {
      issues.push({
        code: "INTEREST_DEPARTMENT_REFERENCE_INVALID",
        scope: "domain",
        severity: "error",
        path: `internalInfo.interestDepartmentIds.${index}`,
        message: "Ein Interessengebiet verweist auf eine gelöschte Abteilung."
      });
    }
  });

  if (caseFile.consignor.photoAssetId && !caseFile.assets.some((asset) => asset.id === caseFile.consignor.photoAssetId)) {
    issues.push({
      code: "CONSIGNOR_ASSET_REFERENCE_INVALID",
      scope: "domain",
      severity: "error",
      path: "consignor.photoAssetId",
      message: "Das Passfoto des Einlieferers fehlt."
    });
  }

  return issues;
}
