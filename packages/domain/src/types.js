import { z } from "zod";
export const pageIdSchema = z.enum([
    "consignor",
    "objects",
    "internal",
    "admin",
    "pdfPreview",
    "wordPreview",
]);
export const caseStatusSchema = z.enum(["draft", "finalized"]);
export const clerkSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    phone: z.string(),
    signaturePng: z.string(),
});
export const auctionSchema = z.object({
    id: z.string(),
    number: z.string(),
    month: z.string(),
    year: z.string(),
});
export const departmentSchema = z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
});
export const masterDataSchema = z.object({
    clerks: z.array(clerkSchema),
    auctions: z.array(auctionSchema),
    departments: z.array(departmentSchema),
    titles: z.array(z.string()),
    globalPdfRequiredFields: z.array(z.string()),
    adminPin: z.string(),
});
export const contactAddressSchema = z.object({
    useCompanyAddress: z.boolean(),
    customerNumber: z.string(),
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
export const beneficiaryOverrideSchema = z.object({
    enabled: z.boolean(),
    reason: z.string(),
    name: z.string(),
});
export const bankSchema = z.object({
    beneficiary: z.string(),
    iban: z.string(),
    bic: z.string(),
    beneficiaryOverride: beneficiaryOverrideSchema,
});
export const structuredCostSchema = z.object({
    amount: z.string(),
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
export const internalInfoSchema = z.object({
    notes: z.string(),
    interestDepartmentIds: z.array(z.string()),
});
export const assetSchema = z.object({
    id: z.string(),
    fileName: z.string(),
    originalPath: z.string(),
    optimizedPath: z.string(),
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative(),
});
export const estimateSchema = z.object({
    low: z.string(),
    high: z.string(),
});
export const objectPricingModeSchema = z.enum(["limit", "netLimit", "startPrice"]);
export const objectItemSchema = z.object({
    id: z.string(),
    intNumber: z.string(),
    auctionId: z.string(),
    departmentId: z.string(),
    shortDescription: z.string(),
    description: z.string(),
    estimate: estimateSchema,
    pricingMode: objectPricingModeSchema,
    priceValue: z.string(),
    referenceNumber: z.string(),
    remarks: z.string(),
    photoAssetIds: z.array(z.string()),
});
export const signaturesSchema = z.object({
    consignorSignaturePng: z.string(),
});
export const caseMetaSchema = z.object({
    id: z.string(),
    receiptNumber: z.string(),
    clerkId: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    status: caseStatusSchema,
});
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
