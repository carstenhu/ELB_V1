import type { ContactAddress } from "./types";

export function formatReceiptNumber(index: number): string {
  return String(index);
}

export function formatIntNumber(index: number): string {
  return String(index).padStart(4, "0");
}

export function formatAmountForDisplay(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) {
    return "";
  }

  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function isIbidAuction(number: string): boolean {
  return number.trim().toLowerCase().startsWith("ibid");
}

export function buildFolderName(lastName: string, firstName: string, receiptNumber: string): string {
  const normalizedLastName = lastName.trim().replaceAll(/\s+/g, "_") || "Unbekannt";
  const normalizedFirstName = firstName.trim().replaceAll(/\s+/g, "_") || "Unbekannt";
  return `${normalizedLastName}_${normalizedFirstName}_${receiptNumber}`;
}

function sanitizeFileNameSegment(value: string): string {
  return value.trim().replaceAll(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").toLowerCase() || "unbekannt";
}

export function buildExchangeBaseName(
  consignor: Pick<ContactAddress, "useCompanyAddress" | "company" | "lastName" | "firstName">,
  receiptNumber: string
): string {
  const displayName = consignor.useCompanyAddress && consignor.company.trim()
    ? consignor.company
    : consignor.lastName.trim() || consignor.firstName.trim() || "Unbekannt";

  return `${sanitizeFileNameSegment(displayName)}_${receiptNumber.trim() || "ohne_nummer"}`;
}
