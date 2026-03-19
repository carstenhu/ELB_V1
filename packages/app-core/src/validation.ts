import { z } from "zod";
import {
  caseFileSchema,
  collectMissingRequiredFields,
  deriveBeneficiary,
  deriveOwner,
  parseAmountNumber,
  type CaseFile,
  type MasterData,
  type MissingRequiredField,
  type ObjectItem
} from "@elb/domain/index";
import { validateCaseReferenceIntegrity } from "./references";

export type ValidationSeverity = "error" | "warning";
export type ValidationScope = "field" | "domain" | "export";

export interface ValidationIssue {
  code: string;
  scope: ValidationScope;
  severity: ValidationSeverity;
  path: string;
  message: string;
}

export interface ValidationReport {
  isValid: boolean;
  issues: ValidationIssue[];
}

const nonEmptyTrimmed = z.string().transform((value) => value.trim());

export function validateMasterDataConsistency(masterData: MasterData): ValidationReport {
  const issues: ValidationIssue[] = [];
  const clerkIds = new Set<string>();
  const auctionIds = new Set<string>();
  const departmentIds = new Set<string>();

  masterData.clerks.forEach((clerk, index) => {
    if (clerkIds.has(clerk.id)) {
      issues.push({
        code: "CLERK_ID_DUPLICATE",
        scope: "domain",
        severity: "error",
        path: `clerks.${index}.id`,
        message: "Sachbearbeiter-IDs muessen eindeutig sein."
      });
    }
    clerkIds.add(clerk.id);
  });

  masterData.auctions.forEach((auction, index) => {
    if (auctionIds.has(auction.id)) {
      issues.push({
        code: "AUCTION_ID_DUPLICATE",
        scope: "domain",
        severity: "error",
        path: `auctions.${index}.id`,
        message: "Auktions-IDs muessen eindeutig sein."
      });
    }
    auctionIds.add(auction.id);
  });

  masterData.departments.forEach((department, index) => {
    if (departmentIds.has(department.id)) {
      issues.push({
        code: "DEPARTMENT_ID_DUPLICATE",
        scope: "domain",
        severity: "error",
        path: `departments.${index}.id`,
        message: "Abteilungs-IDs muessen eindeutig sein."
      });
    }
    departmentIds.add(department.id);
  });

  if (!masterData.adminPin.trim()) {
    issues.push({
      code: "ADMIN_PIN_REQUIRED",
      scope: "domain",
      severity: "error",
      path: "adminPin",
      message: "Eine Admin-PIN ist erforderlich."
    });
  }

  return {
    isValid: issues.every((issue) => issue.severity !== "error"),
    issues
  };
}

export function validateCaseSchema(caseFile: CaseFile): ValidationReport {
  const result = caseFileSchema.safeParse(caseFile);
  if (result.success) {
    return { isValid: true, issues: [] };
  }

  return {
    isValid: false,
    issues: result.error.issues.map((issue) => ({
      code: issue.code,
      scope: "field",
      severity: "error",
      path: issue.path.join("."),
      message: issue.message
    }))
  };
}

function validateConsignor(caseFile: CaseFile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const consignorName = [caseFile.consignor.firstName, caseFile.consignor.lastName].filter(Boolean).join(" ").trim();

  if (!caseFile.consignor.useCompanyAddress && !consignorName) {
    issues.push({
      code: "CONSIGNOR_NAME_REQUIRED",
      scope: "domain",
      severity: "error",
      path: "consignor",
      message: "Fuer Privatadressen muss ein Vor- oder Nachname vorhanden sein."
    });
  }

  if (caseFile.consignor.useCompanyAddress && !caseFile.consignor.company.trim()) {
    issues.push({
      code: "CONSIGNOR_COMPANY_REQUIRED",
      scope: "domain",
      severity: "error",
      path: "consignor.company",
      message: "Bei Firmenadresse muss eine Firma erfasst sein."
    });
  }

  if (caseFile.consignor.vatCategory === "C" && !caseFile.consignor.vatNumber.trim()) {
    issues.push({
      code: "VAT_NUMBER_REQUIRED",
      scope: "domain",
      severity: "error",
      path: "consignor.vatNumber",
      message: "Fuer MwSt-Kategorie C ist eine MwSt-Nr. erforderlich."
    });
  }

  return issues;
}

function validateOwner(caseFile: CaseFile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const owner = deriveOwner(caseFile.consignor, caseFile.owner);

  if (!owner.sameAsConsignor) {
    const parsed = nonEmptyTrimmed.safeParse(owner.lastName);
    if (!parsed.success) {
      issues.push({
        code: "OWNER_LAST_NAME_REQUIRED",
        scope: "domain",
        severity: "error",
        path: "owner.lastName",
        message: "Fuer einen separaten Eigentuemer ist der Nachname erforderlich."
      });
    }
  }

  return issues;
}

function validateBank(caseFile: CaseFile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const override = caseFile.bank.beneficiaryOverride;

  if (override.enabled && !override.reason.trim()) {
    issues.push({
      code: "BENEFICIARY_REASON_REQUIRED",
      scope: "domain",
      severity: "error",
      path: "bank.beneficiaryOverride.reason",
      message: "Fuer einen abweichenden Beguenstigten muss ein Grund erfasst werden."
    });
  }

  if (override.enabled && override.reason.trim() && !override.name.trim()) {
    issues.push({
      code: "BENEFICIARY_NAME_REQUIRED",
      scope: "domain",
      severity: "error",
      path: "bank.beneficiaryOverride.name",
      message: "Sobald ein Grund erfasst ist, muss auch der Name des Beguenstigten gesetzt werden."
    });
  }

  if (!deriveBeneficiary(caseFile.consignor, caseFile.bank).trim()) {
    issues.push({
      code: "BENEFICIARY_MISSING",
      scope: "domain",
      severity: "warning",
      path: "bank.beneficiary",
      message: "Es konnte kein Beguenstigter aus den erfassten Daten abgeleitet werden."
    });
  }

  return issues;
}

function validateObject(objectItem: ObjectItem, index: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!objectItem.intNumber.trim()) {
    issues.push({
      code: "OBJECT_INT_NUMBER_REQUIRED",
      scope: "domain",
      severity: "error",
      path: `objects.${index}.intNumber`,
      message: `Objekt ${index + 1} benoetigt eine Int.-Nr.`
    });
  }

  if (!objectItem.auctionId.trim()) {
    issues.push({
      code: "OBJECT_AUCTION_REQUIRED",
      scope: "domain",
      severity: "error",
      path: `objects.${index}.auctionId`,
      message: `Objekt ${index + 1} benoetigt eine Auktion.`
    });
  }

  if (!objectItem.departmentId.trim()) {
    issues.push({
      code: "OBJECT_DEPARTMENT_REQUIRED",
      scope: "domain",
      severity: "error",
      path: `objects.${index}.departmentId`,
      message: `Objekt ${index + 1} benoetigt eine Abteilung.`
    });
  }

  const lowEstimate = parseAmountNumber(objectItem.estimate.low);
  const highEstimate = parseAmountNumber(objectItem.estimate.high);

  if (lowEstimate !== null && highEstimate !== null && highEstimate < lowEstimate) {
    issues.push({
      code: "OBJECT_ESTIMATE_RANGE_INVALID",
      scope: "domain",
      severity: "error",
      path: `objects.${index}.estimate.high`,
      message: "Obere Schaetzung muss gleich gross oder groesser als die untere Schaetzung sein."
    });
  }

  return issues;
}

export function validateCaseBusinessRules(caseFile: CaseFile): ValidationReport {
  const issues = [
    ...validateConsignor(caseFile),
    ...validateOwner(caseFile),
    ...validateBank(caseFile),
    ...caseFile.objects.flatMap((objectItem, index) => validateObject(objectItem, index))
  ];

  return {
    isValid: issues.every((issue) => issue.severity !== "error"),
    issues
  };
}

export function validateCaseForExport(caseFile: CaseFile, masterData: MasterData): ValidationReport {
  const issues: ValidationIssue[] = [...validateMasterDataConsistency(masterData).issues, ...validateCaseReferenceIntegrity(caseFile, masterData)];
  issues.push(...collectMissingRequiredFields(caseFile, masterData.globalPdfRequiredFields).map(toExportValidationIssue));
  if (!caseFile.objects.length && !issues.some((issue) => issue.path === "objects")) {
    issues.push(toExportValidationIssue({ key: "objects[].create", label: "Mindestens ein Objekt", inputKind: "action" }));
  }

  return {
    isValid: issues.every((issue) => issue.severity !== "error"),
    issues
  };
}

function toExportValidationIssue(entry: MissingRequiredField): ValidationIssue {
  if (entry.key === "objects[].create") {
    return {
      code: "AT_LEAST_ONE_OBJECT_REQUIRED",
      scope: "export",
      severity: "error",
      path: "objects",
      message: "Fuer den Export ist mindestens ein Objekt erforderlich."
    };
  }

  if (entry.key === "meta.receiptNumber") {
    return { code: "RECEIPT_REQUIRED", scope: "export", severity: "error", path: entry.key, message: "Die ELB-Nummer fehlt." };
  }
  if (entry.key === "meta.clerkId") {
    return { code: "CLERK_REQUIRED", scope: "export", severity: "error", path: entry.key, message: "Ein Sachbearbeiter ist erforderlich." };
  }
  if (entry.key === "consignor.lastName") {
    return { code: "CONSIGNOR_IDENTITY_REQUIRED", scope: "export", severity: "error", path: entry.key, message: "Einlieferername oder Firma fehlt." };
  }
  if (entry.key === "consignor.street") {
    return { code: "CONSIGNOR_STREET_REQUIRED", scope: "export", severity: "error", path: entry.key, message: "Die Strasse des Einlieferers fehlt." };
  }
  if (entry.key === "consignor.zip") {
    return { code: "CONSIGNOR_ZIP_REQUIRED", scope: "export", severity: "error", path: entry.key, message: "Die PLZ des Einlieferers fehlt." };
  }
  if (entry.key === "consignor.city") {
    return { code: "CONSIGNOR_CITY_REQUIRED", scope: "export", severity: "error", path: entry.key, message: "Die Stadt des Einlieferers fehlt." };
  }
  if (entry.key === "bank.beneficiaryOverride.reason") {
    return { code: "BENEFICIARY_OVERRIDE_REASON_REQUIRED", scope: "export", severity: "error", path: entry.key, message: "Der Grund fuer den abweichenden Beguenstigten fehlt." };
  }
  if (entry.key === "bank.beneficiaryOverride.name") {
    return { code: "BENEFICIARY_OVERRIDE_NAME_REQUIRED", scope: "export", severity: "error", path: entry.key, message: "Der Name des abweichenden Beguenstigten fehlt." };
  }
  if (entry.key === "objects[].departmentId") {
    return { code: "OBJECT_DEPARTMENT_REQUIRED", scope: "export", severity: "error", path: `objects.${entry.objectIndex}.departmentId`, message: `${entry.label} fehlt.` };
  }
  if (entry.key === "objects[].auctionId") {
    return { code: "OBJECT_AUCTION_REQUIRED", scope: "export", severity: "error", path: `objects.${entry.objectIndex}.auctionId`, message: `${entry.label} fehlt.` };
  }
  if (entry.key === "objects[].shortDescription") {
    return { code: "OBJECT_SHORT_DESCRIPTION_REQUIRED", scope: "export", severity: "error", path: `objects.${entry.objectIndex}.shortDescription`, message: `${entry.label} fehlt.` };
  }
  if (entry.key === "objects[].estimate.low") {
    return { code: "OBJECT_ESTIMATE_LOW_REQUIRED", scope: "export", severity: "error", path: `objects.${entry.objectIndex}.estimate.low`, message: `${entry.label} fehlt.` };
  }

  return { code: "OBJECT_ESTIMATE_HIGH_REQUIRED", scope: "export", severity: "error", path: `objects.${entry.objectIndex}.estimate.high`, message: `${entry.label} fehlt.` };
}
