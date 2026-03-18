import { z } from "zod";
import {
  caseFileSchema,
  deriveBeneficiary,
  deriveOwner,
  type CaseFile,
  type MasterData,
  type ObjectItem
} from "@elb/domain/index";

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
      message: "Für Privatadressen muss ein Vor- oder Nachname vorhanden sein."
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
      message: "Für MwSt-Kategorie C ist eine MwSt-Nr. erforderlich."
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
        message: "Für einen separaten Eigentümer ist der Nachname erforderlich."
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
      message: "Für einen abweichenden Begünstigten muss ein Grund erfasst werden."
    });
  }

  if (override.enabled && override.reason.trim() && !override.name.trim()) {
    issues.push({
      code: "BENEFICIARY_NAME_REQUIRED",
      scope: "domain",
      severity: "error",
      path: "bank.beneficiaryOverride.name",
      message: "Sobald ein Grund erfasst ist, muss auch der Name des Begünstigten gesetzt werden."
    });
  }

  if (!deriveBeneficiary(caseFile.consignor, caseFile.bank).trim()) {
    issues.push({
      code: "BENEFICIARY_MISSING",
      scope: "domain",
      severity: "warning",
      path: "bank.beneficiary",
      message: "Es konnte kein Begünstigter aus den erfassten Daten abgeleitet werden."
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
      message: `Objekt ${index + 1} benötigt eine Int.-Nr.`
    });
  }

  if (!objectItem.auctionId.trim()) {
    issues.push({
      code: "OBJECT_AUCTION_REQUIRED",
      scope: "domain",
      severity: "error",
      path: `objects.${index}.auctionId`,
      message: `Objekt ${index + 1} benötigt eine Auktion.`
    });
  }

  if (!objectItem.departmentId.trim()) {
    issues.push({
      code: "OBJECT_DEPARTMENT_REQUIRED",
      scope: "domain",
      severity: "error",
      path: `objects.${index}.departmentId`,
      message: `Objekt ${index + 1} benötigt eine Abteilung.`
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
  const issues: ValidationIssue[] = [];

  for (const field of masterData.globalPdfRequiredFields) {
    if (field === "meta.receiptNumber" && !caseFile.meta.receiptNumber.trim()) {
      issues.push({ code: "RECEIPT_REQUIRED", scope: "export", severity: "error", path: field, message: "Die ELB-Nummer fehlt." });
    }
    if (field === "meta.clerkId" && !caseFile.meta.clerkId.trim()) {
      issues.push({ code: "CLERK_REQUIRED", scope: "export", severity: "error", path: field, message: "Ein Sachbearbeiter ist erforderlich." });
    }
    if (field === "consignor.lastName" && !caseFile.consignor.lastName.trim() && !caseFile.consignor.company.trim()) {
      issues.push({ code: "CONSIGNOR_IDENTITY_REQUIRED", scope: "export", severity: "error", path: field, message: "Einlieferername oder Firma fehlt." });
    }
    if (field === "consignor.street" && !caseFile.consignor.street.trim()) {
      issues.push({ code: "CONSIGNOR_STREET_REQUIRED", scope: "export", severity: "error", path: field, message: "Die Straße des Einlieferers fehlt." });
    }
    if (field === "consignor.zip" && !caseFile.consignor.zip.trim()) {
      issues.push({ code: "CONSIGNOR_ZIP_REQUIRED", scope: "export", severity: "error", path: field, message: "Die PLZ des Einlieferers fehlt." });
    }
    if (field === "consignor.city" && !caseFile.consignor.city.trim()) {
      issues.push({ code: "CONSIGNOR_CITY_REQUIRED", scope: "export", severity: "error", path: field, message: "Die Stadt des Einlieferers fehlt." });
    }
  }

  if (!caseFile.objects.length) {
    issues.push({
      code: "AT_LEAST_ONE_OBJECT_REQUIRED",
      scope: "export",
      severity: "error",
      path: "objects",
      message: "Für den Export ist mindestens ein Objekt erforderlich."
    });
  }

  caseFile.objects.forEach((objectItem, index) => {
    if (!objectItem.shortDescription.trim()) {
      issues.push({
        code: "OBJECT_SHORT_DESCRIPTION_REQUIRED",
        scope: "export",
        severity: "error",
        path: `objects.${index}.shortDescription`,
        message: `Objekt ${index + 1} benötigt einen Kurzbeschrieb.`
      });
    }
    if (!objectItem.estimate.low.trim() || !objectItem.estimate.high.trim()) {
      issues.push({
        code: "OBJECT_ESTIMATE_REQUIRED",
        scope: "export",
        severity: "error",
        path: `objects.${index}.estimate`,
        message: `Objekt ${index + 1} benötigt eine vollständige Schätzung.`
      });
    }
  });

  return {
    isValid: issues.every((issue) => issue.severity !== "error"),
    issues
  };
}
