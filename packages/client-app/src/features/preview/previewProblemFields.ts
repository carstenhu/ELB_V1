import { normalizeIntNumberInput, type CaseFile } from "@elb/domain/index";
import { updateCurrentCase } from "../../appState";

export interface PreviewEditableFieldIssue {
  path: string;
  label: string;
  message: string;
}

type CostAmountKey = "commission" | "insurance" | "transport" | "imaging" | "expertise" | "internet";

export function getPreviewFieldValue(caseFile: CaseFile, path: string): string {
  if (path === "meta.receiptNumber") return caseFile.meta.receiptNumber;
  if (path === "meta.clerkId") return caseFile.meta.clerkId;
  if (path === "consignor.lastName") return caseFile.consignor.lastName;
  if (path === "consignor.street") return caseFile.consignor.street;
  if (path === "consignor.zip") return caseFile.consignor.zip;
  if (path === "consignor.city") return caseFile.consignor.city;
  if (path === "bank.iban") return caseFile.bank.iban;
  if (path === "bank.bic") return caseFile.bank.bic;
  if (path === "bank.beneficiaryOverride.reason") return caseFile.bank.beneficiaryOverride.reason;
  if (path === "bank.beneficiaryOverride.name") return caseFile.bank.beneficiaryOverride.name;

  const costMatch = path.match(/^costs\.(commission|insurance|transport|imaging|expertise|internet)\.amount$/);
  if (costMatch?.[1]) {
    const costKey = costMatch[1] as CostAmountKey;
    return caseFile.costs[costKey].amount;
  }

  const objectMatch = path.match(/^objects\.(\d+)\.(.+)$/);
  if (objectMatch?.[1] && objectMatch[2]) {
    const objectIndex = Number.parseInt(objectMatch[1], 10);
    const objectItem = caseFile.objects[objectIndex];
    if (!objectItem) {
      return "";
    }

    const fieldPath = objectMatch[2];
    if (fieldPath === "intNumber") return objectItem.intNumber;
    if (fieldPath === "auctionId") return objectItem.auctionId;
    if (fieldPath === "departmentId") return objectItem.departmentId;
    if (fieldPath === "shortDescription") return objectItem.shortDescription;
    if (fieldPath === "priceValue") return objectItem.priceValue;
    if (fieldPath === "estimate.low") return objectItem.estimate.low;
    if (fieldPath === "estimate.high") return objectItem.estimate.high;
  }

  return "";
}

export function updatePreviewFieldValue(path: string, value: string): void {
  updateCurrentCase((current) => {
    if (path === "meta.receiptNumber") return { ...current, meta: { ...current.meta, receiptNumber: value } };
    if (path === "meta.clerkId") return { ...current, meta: { ...current.meta, clerkId: value } };
    if (path === "consignor.lastName") return { ...current, consignor: { ...current.consignor, lastName: value } };
    if (path === "consignor.street") return { ...current, consignor: { ...current.consignor, street: value } };
    if (path === "consignor.zip") return { ...current, consignor: { ...current.consignor, zip: value } };
    if (path === "consignor.city") return { ...current, consignor: { ...current.consignor, city: value } };
    if (path === "bank.iban") return { ...current, bank: { ...current.bank, iban: value } };
    if (path === "bank.bic") return { ...current, bank: { ...current.bank, bic: value } };
    if (path === "bank.beneficiaryOverride.reason") {
      return { ...current, bank: { ...current.bank, beneficiaryOverride: { ...current.bank.beneficiaryOverride, reason: value } } };
    }
    if (path === "bank.beneficiaryOverride.name") {
      return { ...current, bank: { ...current.bank, beneficiaryOverride: { ...current.bank.beneficiaryOverride, name: value } } };
    }

    const costMatch = path.match(/^costs\.(commission|insurance|transport|imaging|expertise|internet)\.amount$/);
    if (costMatch?.[1]) {
      const costKey = costMatch[1] as CostAmountKey;
      return {
        ...current,
        costs: {
          ...current.costs,
          [costKey]: {
            ...current.costs[costKey],
            amount: value
          }
        }
      };
    }

    const objectMatch = path.match(/^objects\.(\d+)\.(.+)$/);
    if (objectMatch?.[1] && objectMatch[2]) {
      const objectIndex = Number.parseInt(objectMatch[1], 10);
      const fieldPath = objectMatch[2];

      return {
        ...current,
        objects: current.objects.map((item, index) => {
          if (index !== objectIndex) {
            return item;
          }

          if (fieldPath === "intNumber") return { ...item, intNumber: normalizeIntNumberInput(value) };
          if (fieldPath === "auctionId") return { ...item, auctionId: value };
          if (fieldPath === "departmentId") return { ...item, departmentId: value };
          if (fieldPath === "shortDescription") return { ...item, shortDescription: value };
          if (fieldPath === "priceValue") return { ...item, priceValue: value };
          if (fieldPath === "estimate.low") return { ...item, estimate: { ...item.estimate, low: value } };
          if (fieldPath === "estimate.high") return { ...item, estimate: { ...item.estimate, high: value } };

          return item;
        })
      };
    }

    return current;
  });
}
