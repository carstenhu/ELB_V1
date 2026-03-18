import {
  deriveAddressLines,
  deriveBeneficiary,
  formatAmountForDisplay,
  type Auction,
  type CaseFile,
  type Department,
  type MasterData
} from "@elb/domain/index";
import type { PdfPreviewModel, PdfPreviewObjectRow } from "./types";

export const FOLLOW_UP_VALUE = "Angaben folgen";

export function getAuctionLabel(auction: Auction | undefined): string {
  if (!auction) {
    return "";
  }

  const monthYear = [auction.month, auction.year.slice(-2)].filter(Boolean).join("/");
  return monthYear ? `${auction.number} ${monthYear}` : auction.number;
}

export function getPriceLabel(auction: Auction | undefined, objectItem: CaseFile["objects"][number]): string {
  if (auction?.number.toLowerCase().startsWith("ibid")) {
    return "Startpreis";
  }

  return objectItem.pricingMode === "netLimit" ? "Nettolimite" : "Limite";
}

function getDepartment(departments: Department[], departmentId: string): Department | undefined {
  return departments.find((item) => item.id === departmentId);
}

export function getDepartmentCode(departments: Department[], departmentId: string): string {
  return getDepartment(departments, departmentId)?.code ?? "";
}

function collectMissingRequiredFields(caseFile: CaseFile, masterData: MasterData): string[] {
  const missing: string[] = [];

  for (const field of masterData.globalPdfRequiredFields) {
    if (field === "meta.receiptNumber" && !caseFile.meta.receiptNumber.trim()) missing.push("ELB-Nummer");
    if (field === "meta.clerkId" && !caseFile.meta.clerkId.trim()) missing.push("Sachbearbeiter");
    if (field === "consignor.lastName" && !caseFile.consignor.lastName.trim()) missing.push("Nachname Einlieferer");
    if (field === "consignor.street" && !caseFile.consignor.street.trim()) missing.push("StraÃŸe Einlieferer");
    if (field === "consignor.zip" && !caseFile.consignor.zip.trim()) missing.push("PLZ Einlieferer");
    if (field === "consignor.city" && !caseFile.consignor.city.trim()) missing.push("Stadt Einlieferer");
    if (field === "bank.beneficiaryOverride.reason" && caseFile.bank.beneficiaryOverride.enabled && !caseFile.bank.beneficiaryOverride.reason.trim()) missing.push("Grund abweichender BegÃ¼nstigter");
    if (field === "bank.beneficiaryOverride.name" && caseFile.bank.beneficiaryOverride.enabled && !caseFile.bank.beneficiaryOverride.name.trim()) missing.push("Name abweichender BegÃ¼nstigter");
  }

  caseFile.objects.forEach((item, index) => {
    if (!item.departmentId.trim()) missing.push(`Objekt ${index + 1}: Abteilung`);
    if (!item.shortDescription.trim()) missing.push(`Objekt ${index + 1}: Kurzbeschrieb`);
    if (!item.estimate.low.trim()) missing.push(`Objekt ${index + 1}: SchÃ¤tzung von`);
    if (!item.estimate.high.trim()) missing.push(`Objekt ${index + 1}: SchÃ¤tzung bis`);
  });

  if (caseFile.objects.length === 0) {
    missing.push("Mindestens ein Objekt");
  }

  return missing;
}

export function joinAddressLines(lines: string[]): string {
  return lines.filter(Boolean).join("\r\n");
}

export function isFollowUpValue(value: string): boolean {
  return value
    .split(/\r?\n/)
    .some((part) => part.trim() === FOLLOW_UP_VALUE);
}

export function buildObjectEstimate(objectItem: CaseFile["objects"][number]): string {
  return [formatAmountForDisplay(objectItem.estimate.low), formatAmountForDisplay(objectItem.estimate.high)]
    .filter(Boolean)
    .join(" - ");
}

export function buildObjectText(row: PdfPreviewObjectRow): string {
  const parts = [
    row.shortDescription,
    row.description,
    row.referenceNumber ? `Referenznr.: ${row.referenceNumber}` : "",
    row.remarks ? `Bemerkungen: ${row.remarks}` : ""
  ].filter(Boolean);

  return parts.join("\n");
}

export function buildEstimateText(row: PdfPreviewObjectRow): string {
  return [row.estimate, row.priceValue ? `${row.priceLabel}: ${row.priceValue}` : ""].filter(Boolean).join("\n");
}

export function buildCostFieldValue(cost: { amount: string; note: string }): string {
  return [cost.amount.trim(), cost.note.trim()].filter(Boolean).join(" ");
}

export function getVatCategoryLabel(vatCategory: CaseFile["consignor"]["vatCategory"]): string {
  if (vatCategory === "A") return "Privat Schweiz";
  if (vatCategory === "B") return "Ausland";
  if (vatCategory === "C") return "HÃ¤ndler Schweiz";
  return "";
}

export function createPdfPreviewModel(caseFile: CaseFile, masterData: MasterData): PdfPreviewModel {
  const clerk = masterData.clerks.find((item) => item.id === caseFile.meta.clerkId);

  return {
    receiptNumber: caseFile.meta.receiptNumber,
    clerkLabel: clerk ? [clerk.name, clerk.phone, clerk.email].filter(Boolean).join(", ") : "",
    addressLines: deriveAddressLines(caseFile.consignor),
    beneficiary: deriveBeneficiary(caseFile.consignor, caseFile.bank),
    objectRows: caseFile.objects.map((item) => {
      const auction = masterData.auctions.find((candidate) => candidate.id === item.auctionId);
      return {
        id: item.id,
        intNumber: item.intNumber,
        auctionLabel: getAuctionLabel(auction),
        departmentCode: getDepartmentCode(masterData.departments, item.departmentId),
        shortDescription: item.shortDescription,
        description: item.description,
        referenceNumber: item.referenceNumber,
        remarks: item.remarks,
        estimate: buildObjectEstimate(item),
        priceLabel: getPriceLabel(auction, item),
        priceValue: formatAmountForDisplay(item.priceValue)
      };
    }),
    missingRequiredFields: collectMissingRequiredFields(caseFile, masterData)
  };
}
