import type { CaseFile } from "@elb/domain/index";

function hasValue(value: string): boolean {
  return value.trim().length > 0;
}

export function hasSeparateOwnerData(owner: CaseFile["owner"]): boolean {
  return [
    owner.firstName,
    owner.lastName,
    owner.street,
    owner.houseNumber,
    owner.zip,
    owner.city,
    owner.country
  ].some(hasValue);
}

export function clearOwnerData(): CaseFile["owner"] {
  return {
    sameAsConsignor: true,
    firstName: "",
    lastName: "",
    street: "",
    houseNumber: "",
    zip: "",
    city: "",
    country: ""
  };
}
