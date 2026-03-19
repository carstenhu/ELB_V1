import { describe, expect, it } from "vitest";
import { createEmptyClerk, createEmptyMasterData } from "@elb/domain/index";
import { importMasterDataFromJson, serializeMasterData } from "./masterDataSync";

describe("master data sync", () => {
  it("normalizes imported master data payloads", () => {
    const raw = {
      clerks: [{ id: "clerk-1", name: "Anna", email: "", phone: "", signaturePng: "" }],
      auctions: [],
      departments: [],
      titles: [],
      globalPdfRequiredFields: ["meta.receiptNumber", "unknown.field"],
      adminPin: "1234"
    };

    const masterData = importMasterDataFromJson(JSON.stringify(raw));

    expect(masterData.clerks[0]?.nextReceiptNumberDesktop).toBe("1");
    expect(masterData.globalPdfRequiredFields).toEqual(["meta.receiptNumber"]);
  });

  it("serializes normalized master data", () => {
    const masterData = createEmptyMasterData();
    masterData.clerks = [createEmptyClerk({ id: "clerk-1", name: "Anna" })];

    const serialized = serializeMasterData(masterData);

    expect(serialized).toContain("\"clerks\"");
    expect(serialized).toContain("\"nextReceiptNumberDesktop\": \"1\"");
  });
});
