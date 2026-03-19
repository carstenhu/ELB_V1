import {
  collectMissingRequiredFields,
  type CaseFile,
  type MissingRequiredField,
  type RequiredFieldKey
} from "@elb/domain/index";
import { addObject, updateCurrentCase } from "../../appState";

export type RequiredFieldEntry = MissingRequiredField;

export function getRequiredFieldEntries(caseFile: CaseFile, requiredFields: readonly RequiredFieldKey[]): RequiredFieldEntry[] {
  return collectMissingRequiredFields(caseFile, requiredFields);
}

export function updateRequiredFieldValue(entry: RequiredFieldEntry, value?: string) {
  if (entry.key === "objects[].create") {
    addObject();
    return;
  }

  updateCurrentCase((current) => applyRequiredFieldUpdate(current, entry, value ?? ""));
}

export function updateRequiredFieldValues(entries: RequiredFieldEntry[], value: string) {
  const fillableEntries = entries.filter((entry) => entry.inputKind !== "action");
  if (!fillableEntries.length) {
    return;
  }

  updateCurrentCase((current) => fillableEntries.reduce((nextCaseFile, entry) => applyRequiredFieldUpdate(nextCaseFile, entry, value), current));
}

export function getRequiredFieldCurrentValue(caseFile: CaseFile, entry: RequiredFieldEntry): string {
  if (entry.key === "meta.receiptNumber") return caseFile.meta.receiptNumber;
  if (entry.key === "meta.clerkId") return caseFile.meta.clerkId;
  if (entry.key === "consignor.lastName") return caseFile.consignor.lastName;
  if (entry.key === "consignor.street") return caseFile.consignor.street;
  if (entry.key === "consignor.zip") return caseFile.consignor.zip;
  if (entry.key === "consignor.city") return caseFile.consignor.city;
  if (entry.key === "bank.beneficiaryOverride.reason") return caseFile.bank.beneficiaryOverride.reason;
  if (entry.key === "bank.beneficiaryOverride.name") return caseFile.bank.beneficiaryOverride.name;
  if (entry.key === "objects[].auctionId") return caseFile.objects[entry.objectIndex ?? -1]?.auctionId ?? "";
  if (entry.key === "objects[].departmentId") return caseFile.objects[entry.objectIndex ?? -1]?.departmentId ?? "";
  if (entry.key === "objects[].shortDescription") return caseFile.objects[entry.objectIndex ?? -1]?.shortDescription ?? "";
  if (entry.key === "objects[].estimate.low") return caseFile.objects[entry.objectIndex ?? -1]?.estimate.low ?? "";
  if (entry.key === "objects[].estimate.high") return caseFile.objects[entry.objectIndex ?? -1]?.estimate.high ?? "";
  return "";
}

function applyRequiredFieldUpdate(caseFile: CaseFile, entry: RequiredFieldEntry, value: string): CaseFile {
  if (entry.key === "meta.receiptNumber") {
    return { ...caseFile, meta: { ...caseFile.meta, receiptNumber: value } };
  }
  if (entry.key === "meta.clerkId") {
    return { ...caseFile, meta: { ...caseFile.meta, clerkId: value } };
  }
  if (entry.key === "consignor.lastName") {
    return { ...caseFile, consignor: { ...caseFile.consignor, lastName: value } };
  }
  if (entry.key === "consignor.street") {
    return { ...caseFile, consignor: { ...caseFile.consignor, street: value } };
  }
  if (entry.key === "consignor.zip") {
    return { ...caseFile, consignor: { ...caseFile.consignor, zip: value } };
  }
  if (entry.key === "consignor.city") {
    return { ...caseFile, consignor: { ...caseFile.consignor, city: value } };
  }
  if (entry.key === "bank.beneficiaryOverride.reason") {
    return { ...caseFile, bank: { ...caseFile.bank, beneficiaryOverride: { ...caseFile.bank.beneficiaryOverride, reason: value } } };
  }
  if (entry.key === "bank.beneficiaryOverride.name") {
    return { ...caseFile, bank: { ...caseFile.bank, beneficiaryOverride: { ...caseFile.bank.beneficiaryOverride, name: value } } };
  }

  if (entry.objectIndex === undefined) {
    return caseFile;
  }

  return {
    ...caseFile,
    objects: caseFile.objects.map((item, index) => {
      if (index !== entry.objectIndex) {
        return item;
      }

      if (entry.key === "objects[].departmentId") {
        return { ...item, departmentId: value };
      }
      if (entry.key === "objects[].auctionId") {
        return { ...item, auctionId: value };
      }
      if (entry.key === "objects[].shortDescription") {
        return { ...item, shortDescription: value };
      }
      if (entry.key === "objects[].estimate.low") {
        return { ...item, estimate: { ...item.estimate, low: value } };
      }
      if (entry.key === "objects[].estimate.high") {
        return { ...item, estimate: { ...item.estimate, high: value } };
      }

      return item;
    })
  };
}
