export function formatReceiptNumber(index: number): string {
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

