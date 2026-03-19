import { describe, expect, it } from "vitest";
import { createEmptyCase } from "@elb/domain/index";
import { createExportMetadata, createExportPlan } from "./index";

describe("export-core", () => {
  it("creates a stable export plan", () => {
    const caseFile = createEmptyCase({ id: "case-1", clerkId: "clerk-1", receiptNumber: "0042", createdAt: "2026-03-18T10:00:00.000Z" });
    caseFile.consignor.lastName = "Muster";
    caseFile.consignor.firstName = "Eva";
    const plan = createExportPlan(caseFile);
    expect(plan.zipFileName).toContain("0042");
    expect(plan.artifacts.some((artifact) => artifact.fileName === "case.json")).toBe(true);
    expect(plan.artifacts.some((artifact) => artifact.fileName === "master-data.json")).toBe(true);
  });

  it("includes metadata for productive traceability", () => {
    const caseFile = createEmptyCase({ id: "case-1", clerkId: "clerk-1", receiptNumber: "0042", createdAt: "2026-03-18T10:00:00.000Z" });
    const metadata = createExportMetadata(caseFile);
    expect(metadata.caseId).toBe("case-1");
    expect(metadata.receiptNumber).toBe("0042");
  });
});
