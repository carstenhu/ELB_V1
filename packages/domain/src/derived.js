import { isIbidAuction } from "./format";
export function deriveBeneficiary(consignor, bank) {
    if (bank.beneficiaryOverride.enabled && bank.beneficiaryOverride.reason.trim()) {
        return bank.beneficiaryOverride.name;
    }
    if (consignor.useCompanyAddress && consignor.company.trim()) {
        return consignor.company;
    }
    return [consignor.firstName, consignor.lastName].filter(Boolean).join(" ").trim();
}
export function deriveOwner(consignor, owner) {
    if (!owner.sameAsConsignor) {
        return owner;
    }
    return {
        sameAsConsignor: true,
        firstName: consignor.firstName,
        lastName: consignor.lastName,
        street: consignor.street,
        houseNumber: consignor.houseNumber,
        zip: consignor.zip,
        city: consignor.city,
        country: consignor.country,
    };
}
export function deriveAddressLines(consignor) {
    const lines = [];
    if (consignor.useCompanyAddress && consignor.company.trim()) {
        lines.push(consignor.company.trim());
    }
    const nameLine = [consignor.title, consignor.firstName, consignor.lastName].filter(Boolean).join(" ").trim();
    if (nameLine) {
        lines.push(nameLine);
    }
    if (consignor.addressAddon.trim()) {
        lines.push(consignor.addressAddon.trim());
    }
    const streetLine = [consignor.street, consignor.houseNumber].filter(Boolean).join(" ").trim();
    if (streetLine) {
        lines.push(streetLine);
    }
    const cityLine = [consignor.zip, consignor.city].filter(Boolean).join(" ").trim();
    if (cityLine) {
        lines.push(cityLine);
    }
    if (consignor.country.trim()) {
        lines.push(consignor.country.trim());
    }
    return lines;
}
export function objectUsesStartPrice(auction) {
    return auction ? isIbidAuction(auction.number) : false;
}
