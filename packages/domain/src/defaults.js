import { DEFAULT_ADMIN_PIN } from "@elb/shared/constants";
function makeStructuredCost() {
    return {
        amount: "",
        note: "",
    };
}
export function createEmptyMasterData() {
    return {
        clerks: [],
        auctions: [],
        departments: [],
        titles: [],
        globalPdfRequiredFields: [],
        adminPin: DEFAULT_ADMIN_PIN,
    };
}
export function createEmptyObject(seed) {
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
export function createEmptyCase(seed) {
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
