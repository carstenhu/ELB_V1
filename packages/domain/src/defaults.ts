import { normalizeRequiredFieldKeys } from "./requiredFields";
import type { CaseFile, Clerk, Costs, MasterData, ObjectItem } from "./types";
import { DEFAULT_ADMIN_PIN } from "@elb/shared/constants";

const INITIAL_RECEIPT_NUMBER = "1";

function normalizeReceiptCounter(value: unknown): string {
  return typeof value === "string" && /^\d+$/.test(value.trim()) ? value.trim() : INITIAL_RECEIPT_NUMBER;
}

function makeStructuredCost(): Costs["commission"] {
  return {
    amount: "",
    note: "",
  };
}

export function createEmptyMasterData(): MasterData {
  return {
    clerks: [],
    auctions: [],
    departments: [],
    titles: [],
    globalPdfRequiredFields: [],
    adminPin: DEFAULT_ADMIN_PIN,
  };
}

export function createEmptyClerk(seed: {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  signaturePng?: string;
  nextReceiptNumberDesktop?: string;
  nextReceiptNumberWeb?: string;
}): Clerk {
  return {
    id: seed.id,
    name: seed.name ?? "",
    email: seed.email ?? "",
    phone: seed.phone ?? "",
    signaturePng: seed.signaturePng ?? "",
    nextReceiptNumberDesktop: normalizeReceiptCounter(seed.nextReceiptNumberDesktop),
    nextReceiptNumberWeb: normalizeReceiptCounter(seed.nextReceiptNumberWeb)
  };
}

export function normalizeMasterData(masterData: MasterData): MasterData {
  return {
    ...createEmptyMasterData(),
    ...masterData,
    globalPdfRequiredFields: normalizeRequiredFieldKeys(masterData.globalPdfRequiredFields),
    clerks: masterData.clerks.map((clerk) =>
      createEmptyClerk({
        id: clerk.id,
        name: clerk.name,
        email: clerk.email,
        phone: clerk.phone,
        signaturePng: clerk.signaturePng,
        nextReceiptNumberDesktop: clerk.nextReceiptNumberDesktop,
        nextReceiptNumberWeb: clerk.nextReceiptNumberWeb
      })
    )
  };
}

export function createEmptyObject(seed: {
  id: string;
  intNumber: string;
  auctionId: string;
  departmentId: string;
}): ObjectItem {
  return {
    id: seed.id,
    intNumber: seed.intNumber,
    auctionId: seed.auctionId,
    departmentId: seed.departmentId,
    shortDescription: "",
    description: "",
    estimate: {
      low: "",
      high: "",
    },
    pricingMode: "limit",
    priceValue: "",
    referenceNumber: "",
    remarks: "",
    photoAssetIds: [],
  };
}

export function createEmptyCase(seed: {
  id: string;
  receiptNumber: string;
  clerkId: string;
  createdAt: string;
}): CaseFile {
  return {
    meta: {
      id: seed.id,
      receiptNumber: seed.receiptNumber,
      clerkId: seed.clerkId,
      createdAt: seed.createdAt,
      updatedAt: seed.createdAt,
      status: "draft",
    },
    consignor: {
      useCompanyAddress: false,
      customerNumber: "",
      vatCategory: "",
      vatNumber: "",
      company: "",
      title: "",
      firstName: "",
      lastName: "",
      addressAddon: "",
      street: "",
      houseNumber: "",
      zip: "",
      city: "",
      country: "",
      email: "",
      phone: "",
      birthDate: "",
      nationality: "",
      passportNumber: "",
      photoAssetId: "",
    },
    owner: {
      sameAsConsignor: true,
      firstName: "",
      lastName: "",
      street: "",
      houseNumber: "",
      zip: "",
      city: "",
      country: "",
    },
    bank: {
      beneficiary: "",
      iban: "",
      bic: "",
      beneficiaryOverride: {
        enabled: false,
        reason: "",
        name: "",
      },
    },
    costs: {
      commission: makeStructuredCost(),
      insurance: makeStructuredCost(),
      transport: makeStructuredCost(),
      imaging: makeStructuredCost(),
      expertise: makeStructuredCost(),
      internet: makeStructuredCost(),
      onlyIfSuccessful: false,
      provenance: "",
    },
    internalInfo: {
      notes: "",
      interestDepartmentIds: [],
    },
    objects: [],
    signatures: {
      consignorSignaturePng: "",
    },
    assets: [],
  };
}
