import { describe, expect, it } from "vitest";
import { createEmptyCase, createEmptyClerk, createEmptyMasterData, createEmptyObject } from "@elb/domain/index";
import { collectMasterDataReferences, validateCaseReferenceIntegrity } from "./references";

describe("reference integrity", () => {
  it("findet Referenzen auf Stammdaten in Fällen", () => {
    const caseFile = createEmptyCase({
      id: "case-1",
      receiptNumber: "0001",
      clerkId: "clerk-1",
      createdAt: "2026-03-18T10:00:00.000Z"
    });
    caseFile.objects.push(
      createEmptyObject({
        id: "object-1",
        intNumber: "0001",
        auctionId: "auction-1",
        departmentId: "department-1"
      })
    );
    caseFile.internalInfo.interestDepartmentIds = ["department-1"];

    const references = collectMasterDataReferences([caseFile], "department", "department-1");

    expect(references).toHaveLength(2);
    expect(references[0]?.receiptNumber).toBe("0001");
  });

  it("meldet fehlende referenzierte Stammdaten und Assets", () => {
    const masterData = createEmptyMasterData();
    masterData.clerks.push(createEmptyClerk({ id: "clerk-1", name: "A" }));
    const caseFile = createEmptyCase({
      id: "case-1",
      receiptNumber: "0001",
      clerkId: "clerk-1",
      createdAt: "2026-03-18T10:00:00.000Z"
    });
    caseFile.objects.push(
      createEmptyObject({
        id: "object-1",
        intNumber: "0001",
        auctionId: "missing-auction",
        departmentId: "missing-department"
      })
    );
    caseFile.objects[0]!.photoAssetIds = ["missing-asset"];
    caseFile.consignor.photoAssetId = "missing-passport";
    caseFile.internalInfo.interestDepartmentIds = ["missing-department"];

    const issues = validateCaseReferenceIntegrity(caseFile, masterData);

    expect(issues.some((issue) => issue.code === "AUCTION_REFERENCE_INVALID")).toBe(true);
    expect(issues.some((issue) => issue.code === "DEPARTMENT_REFERENCE_INVALID")).toBe(true);
    expect(issues.some((issue) => issue.code === "OBJECT_ASSET_REFERENCE_INVALID")).toBe(true);
    expect(issues.some((issue) => issue.code === "CONSIGNOR_ASSET_REFERENCE_INVALID")).toBe(true);
  });
});
