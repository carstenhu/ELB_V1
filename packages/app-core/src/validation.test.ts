import { describe, expect, it } from "vitest";
import { createEmptyCase, createEmptyMasterData } from "@elb/domain/index";
import { validateCaseBusinessRules, validateCaseForExport } from "./validation";

describe("validation", () => {
  it("requires vat number for category C", () => {
    const caseFile = createEmptyCase({ id: "case-1", clerkId: "clerk-1", receiptNumber: "0001", createdAt: "2026-03-18T10:00:00.000Z" });
    caseFile.consignor.vatCategory = "C";
    const report = validateCaseBusinessRules(caseFile);
    expect(report.isValid).toBe(false);
    expect(report.issues.some((issue) => issue.path === "consignor.vatNumber")).toBe(true);
  });

  it("requires objects for export", () => {
    const caseFile = createEmptyCase({ id: "case-1", clerkId: "clerk-1", receiptNumber: "0001", createdAt: "2026-03-18T10:00:00.000Z" });
    const masterData = createEmptyMasterData();
    const report = validateCaseForExport(caseFile, masterData);
    expect(report.isValid).toBe(false);
    expect(report.issues.some((issue) => issue.path === "objects")).toBe(true);
  });
});
