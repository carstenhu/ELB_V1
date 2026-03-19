import { describe, expect, it } from "vitest";
import { createEmptyCase, createEmptyMasterData } from "@elb/domain/index";
import {
  buildCostFieldValue,
  buildEstimateText,
  buildObjectEstimate,
  buildObjectText,
  createPdfPreviewModel,
  FOLLOW_UP_VALUE,
  getAuctionLabel,
  getDepartmentCode,
  getPriceLabel,
  getVatCategoryLabel,
  isFollowUpValue,
  joinAddressLines
} from "./previewModel";

describe("pdf preview model", () => {
  it("creates a preview model with derived labels and missing fields", () => {
    const caseFile = createEmptyCase({
      id: "case-1",
      clerkId: "clerk-1",
      receiptNumber: "0042",
      createdAt: "2026-03-18T10:00:00.000Z"
    });
    const masterData = createEmptyMasterData();

    masterData.clerks.push({
      id: "clerk-1",
      name: "Anna Admin",
      email: "anna@example.com",
      phone: "123",
      signaturePng: ""
    });
    masterData.auctions.push({
      id: "auction-1",
      number: "123",
      month: "06",
      year: "2026"
    });
    masterData.departments.push({
      id: "department-1",
      code: "A1",
      name: "Schmuck"
    });
    masterData.globalPdfRequiredFields = [
      "meta.receiptNumber",
      "meta.clerkId",
      "consignor.street",
      "objects[].shortDescription",
      "objects[].estimate.low",
      "objects[].estimate.high"
    ];

    caseFile.consignor.firstName = "Eva";
    caseFile.consignor.lastName = "Muster";
    caseFile.consignor.street = "Hauptstrasse";
    caseFile.consignor.houseNumber = "5";
    caseFile.consignor.zip = "8000";
    caseFile.consignor.city = "Zuerich";
    caseFile.bank.iban = "CH9300762011623852957";
    caseFile.bank.bic = "POFICHBEXXX";
    caseFile.objects.push({
      id: "object-1",
      intNumber: "0001",
      auctionId: "auction-1",
      departmentId: "department-1",
      shortDescription: "",
      description: "Goldring",
      estimate: { low: "", high: "" },
      pricingMode: "limit",
      priceValue: "1200",
      referenceNumber: "",
      remarks: "",
      photoAssetIds: []
    });

    const model = createPdfPreviewModel(caseFile, masterData);

    expect(model.receiptNumber).toBe("0042");
    expect(model.clerkLabel).toContain("Anna Admin");
    expect(model.beneficiary).toContain("Eva Muster");
    expect(model.addressLines).toContain("Hauptstrasse 5");
    expect(model.objectRows[0]?.auctionLabel).toBe("123 06/26");
    expect(model.objectRows[0]?.departmentCode).toBe("A1");
    expect(model.objectRows[0]?.priceLabel).toBe("Limite");
    expect(model.objectRows[0]?.priceValue).toBe("1 200");
    expect(model.missingRequiredFields).toEqual([
      "Objekt 1: Kurzbeschrieb",
      "Objekt 1: Schaetzung von",
      "Objekt 1: Schaetzung bis"
    ]);
  });

  it("supports small pure helpers deterministically", () => {
    expect(getAuctionLabel({ id: "a1", number: "999", month: "11", year: "2027" })).toBe("999 11/27");
    expect(getDepartmentCode([{ id: "d1", code: "AS", name: "Asian Art" }], "d1")).toBe("AS");
    expect(getDepartmentCode([{ id: "d1", code: "AS", name: "Asian Art" }], "unknown")).toBe("");
    expect(getPriceLabel({ id: "a2", number: "IBID 2", month: "01", year: "2027" }, { pricingMode: "limit" } as never)).toBe("Startpreis");
    expect(getPriceLabel(undefined, { pricingMode: "netLimit" } as never)).toBe("Nettolimite");
    expect(buildObjectEstimate({ estimate: { low: "1000", high: "2500" } } as never)).toBe("1 000 - 2 500");
    expect(buildObjectText({
      id: "r1",
      intNumber: "1",
      auctionLabel: "",
      departmentCode: "",
      shortDescription: "Vase",
      description: "China",
      referenceNumber: "REF-7",
      remarks: "Haarriss",
      estimate: "",
      priceLabel: "",
      priceValue: ""
    })).toContain("Referenznr.: REF-7");
    expect(buildEstimateText({ estimate: "1 000 - 2 000", priceLabel: "Limite", priceValue: "2 500" } as never)).toBe("1 000 - 2 000\nLimite: 2 500");
    expect(buildCostFieldValue({ amount: "12%", note: "inkl. MwSt." })).toBe("12% inkl. MwSt.");
    expect(getVatCategoryLabel("A")).toBe("Privat Schweiz");
    expect(getVatCategoryLabel("B")).toBe("Ausland");
    expect(getVatCategoryLabel("C")).toBe("Haendler Schweiz");
    expect(joinAddressLines(["Anna", "", "Zuerich"])).toBe("Anna\r\nZuerich");
    expect(isFollowUpValue(`${FOLLOW_UP_VALUE}\nmehr`)).toBe(true);
    expect(isFollowUpValue("bereits vorhanden")).toBe(false);
  });
});
