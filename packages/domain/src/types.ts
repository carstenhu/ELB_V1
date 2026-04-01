import { z } from "zod";
import {
  adminPinSchema,
  amountInputSchema,
  bicSchema,
  emailLikeSchema,
  ibanSchema,
  intNumberSchema,
  receiptNumberSchema,
  vatCategorySchema
} from "./valueObjects";
import { requiredFieldKeySchema } from "./requiredFields";

export const pageIdSchema = z.enum([
  "consignor",
  "objects",
  "internal",
  "admin",
  "loadCenter",
  "pdfPreview",
  "wordPreview",
]);

export type PageId = z.infer<typeof pageIdSchema>;

export const caseStatusSchema = z.enum(["draft", "finalized"]);
export type CaseStatus = z.infer<typeof caseStatusSchema>;

export const receiptNumberScopeSchema = z.enum(["desktop", "web"]);
export type ReceiptNumberScope = z.infer<typeof receiptNumberScopeSchema>;

export const clerkSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: emailLikeSchema,
  phone: z.string(),
  signaturePng: z.string(),
  nextReceiptNumberDesktop: receiptNumberSchema.default("1"),
  nextReceiptNumberWeb: receiptNumberSchema.default("1"),
});

export type Clerk = z.infer<typeof clerkSchema>;

export const auctionSchema = z.object({
  id: z.string(),
  number: z.string(),
  month: z.string(),
  year: z.string(),
});

export type Auction = z.infer<typeof auctionSchema>;

export const departmentSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
});

export type Department = z.infer<typeof departmentSchema>;

export const masterDataSchema = z.object({
  clerks: z.array(clerkSchema),
  auctions: z.array(auctionSchema),
  departments: z.array(departmentSchema),
  titles: z.array(z.string()),
  globalPdfRequiredFields: z.array(z.string()).default([]).transform((values) =>
    values
      .map((value) => value.trim())
      .filter((value): value is z.infer<typeof requiredFieldKeySchema> => requiredFieldKeySchema.safeParse(value).success)
  ),
  globalWordRequiredFields: z.array(z.string()).default([]).transform((values) =>
    values
      .map((value) => value.trim())
      .filter((value): value is z.infer<typeof requiredFieldKeySchema> => requiredFieldKeySchema.safeParse(value).success)
  ),
  adminPin: adminPinSchema,
});

export type MasterData = z.infer<typeof masterDataSchema>;

export const contactAddressSchema = z.object({
  useCompanyAddress: z.boolean(),
  customerNumber: z.string(),
  vatCategory: vatCategorySchema,
  vatNumber: z.string(),
  company: z.string(),
  title: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  addressAddon: z.string(),
  street: z.string(),
  houseNumber: z.string(),
  zip: z.string(),
  city: z.string(),
  country: z.string(),
  email: z.string(),
  phone: z.string(),
  birthDate: z.string(),
  nationality: z.string(),
  passportNumber: z.string(),
  photoAssetId: z.string(),
});

export type ContactAddress = z.infer<typeof contactAddressSchema>;

export const ownerSchema = z.object({
  sameAsConsignor: z.boolean(),
  firstName: z.string(),
  lastName: z.string(),
  street: z.string(),
  houseNumber: z.string(),
  zip: z.string(),
  city: z.string(),
  country: z.string(),
});

export type Owner = z.infer<typeof ownerSchema>;

export const beneficiaryOverrideSchema = z.object({
  enabled: z.boolean(),
  reason: z.string(),
  name: z.string(),
});

export const bankSchema = z.object({
  beneficiary: z.string(),
  iban: ibanSchema,
  bic: bicSchema,
  beneficiaryOverride: beneficiaryOverrideSchema,
});

export type BankData = z.infer<typeof bankSchema>;

export const structuredCostSchema = z.object({
  amount: amountInputSchema,
  note: z.string(),
});

export const costsSchema = z.object({
  commission: structuredCostSchema,
  insurance: structuredCostSchema,
  transport: structuredCostSchema,
  imaging: structuredCostSchema,
  expertise: structuredCostSchema,
  internet: structuredCostSchema,
  onlyIfSuccessful: z.boolean(),
  provenance: z.string(),
});

export type Costs = z.infer<typeof costsSchema>;

export const internalInfoSchema = z.object({
  notes: z.string(),
  interestDepartmentIds: z.array(z.string()),
});

export type InternalInfo = z.infer<typeof internalInfoSchema>;

export const assetSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  originalPath: z.string(),
  optimizedPath: z.string(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
});

export type Asset = z.infer<typeof assetSchema>;

export const estimateSchema = z.object({
  low: z.string(),
  high: z.string(),
});

export const objectPricingModeSchema = z.enum(["limit", "netLimit", "startPrice"]);

export const objectItemSchema = z.object({
  id: z.string(),
  intNumber: intNumberSchema,
  auctionId: z.string(),
  departmentId: z.string(),
  shortDescription: z.string(),
  description: z.string(),
  estimate: z.object({
    low: amountInputSchema,
    high: amountInputSchema,
  }),
  pricingMode: objectPricingModeSchema,
  priceValue: amountInputSchema,
  referenceNumber: z.string(),
  remarks: z.string(),
  photoAssetIds: z.array(z.string()),
});

export type ObjectItem = z.infer<typeof objectItemSchema>;

export const signaturesSchema = z.object({
  consignorSignaturePng: z.string(),
});

export type Signatures = z.infer<typeof signaturesSchema>;

export const caseMetaSchema = z.object({
  id: z.string(),
  receiptNumber: receiptNumberSchema,
  clerkId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: caseStatusSchema,
});

export type CaseMeta = z.infer<typeof caseMetaSchema>;

export const caseFileSchema = z.object({
  meta: caseMetaSchema,
  consignor: contactAddressSchema,
  owner: ownerSchema,
  bank: bankSchema,
  costs: costsSchema,
  internalInfo: internalInfoSchema,
  objects: z.array(objectItemSchema),
  signatures: signaturesSchema,
  assets: z.array(assetSchema),
});

export type CaseFile = z.infer<typeof caseFileSchema>;
