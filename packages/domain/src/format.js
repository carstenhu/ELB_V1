export function formatReceiptNumber(index) {
    return String(index).padStart(4, "0");
}
export function formatAmountForDisplay(raw) {
    const digits = raw.replace(/[^\d]/g, "");
    if (!digits) {
        return "";
    }
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
export function isIbidAuction(number) {
    return number.trim().toLowerCase().startsWith("ibid");
}
export function buildFolderName(lastName, firstName, receiptNumber) {
    const normalizedLastName = lastName.trim().replaceAll(/\s+/g, "_") || "Unbekannt";
    const normalizedFirstName = firstName.trim().replaceAll(/\s+/g, "_") || "Unbekannt";
    return `${normalizedLastName}_${normalizedFirstName}_${receiptNumber}`;
}
