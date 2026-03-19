import { describe, expect, it } from "vitest";
import { createEmptyCase, createEmptyClerk, createEmptyMasterData } from "@elb/domain/index";
import { addObjectToCase, assignAuction, consumeReceiptNumberIfNeeded, createCase, getSuggestedCaseNumber, reserveNextCaseNumber, validateCaseReadiness } from "./useCases";

function buildMasterData() {
  const masterData = createEmptyMasterData();
  masterData.clerks.push(createEmptyClerk({ id: "clerk-1", name: "Anna Test", email: "anna@example.com", phone: "123" }));
  masterData.auctions.push({ id: "auction-1", number: "123", month: "03", year: "2026" });
  masterData.auctions.push({ id: "auction-2", number: "ibid 44", month: "06", year: "2026" });
  masterData.departments.push({ id: "dep-1", code: "MOB", name: "Mobiliar" });
  masterData.globalPdfRequiredFields = ["meta.receiptNumber", "meta.clerkId"];
  return masterData;
}

describe("application use cases", () => {
  it("reserves the next case number per clerk", () => {
    const caseA = createEmptyCase({ id: "a", clerkId: "clerk-1", receiptNumber: "0003", createdAt: "2026-03-18T10:00:00.000Z" });
    const caseB = createEmptyCase({ id: "b", clerkId: "clerk-1", receiptNumber: "0008", createdAt: "2026-03-18T10:00:00.000Z" });
    expect(reserveNextCaseNumber({ clerkId: "clerk-1", drafts: [caseA], finalized: [caseB] })).toBe("0009");
  });

  it("creates a new case from workspace state", () => {
    const masterData = buildMasterData();
    const created = createCase({
      masterData,
      activeClerkId: "clerk-1",
      currentCase: null,
      drafts: [],
      finalized: []
    }, "desktop", {
      now: () => "2026-03-18T10:00:00.000Z",
      createId: () => "case-1"
    });

    expect(created.meta.id).toBe("case-1");
    expect(created.meta.receiptNumber).toBe("0001");
    expect(created.meta.clerkId).toBe("clerk-1");
  });

  it("keeps separate receipt number scopes per platform", () => {
    const masterData = buildMasterData();
    masterData.clerks[0]!.nextReceiptNumberDesktop = "0010";
    masterData.clerks[0]!.nextReceiptNumberWeb = "0200";

    expect(getSuggestedCaseNumber({
      masterData,
      clerkId: "clerk-1",
      scope: "desktop",
      drafts: [],
      finalized: []
    })).toBe("0010");

    expect(getSuggestedCaseNumber({
      masterData,
      clerkId: "clerk-1",
      scope: "web",
      drafts: [],
      finalized: []
    })).toBe("0200");

    const unchanged = consumeReceiptNumberIfNeeded({
      masterData,
      clerkId: "clerk-1",
      receiptNumber: "0999",
      scope: "desktop",
      drafts: [],
      finalized: []
    });
    expect(unchanged.clerks[0]?.nextReceiptNumberDesktop).toBe("0010");

    const consumed = consumeReceiptNumberIfNeeded({
      masterData,
      clerkId: "clerk-1",
      receiptNumber: "0010",
      scope: "desktop",
      drafts: [],
      finalized: []
    });
    expect(consumed.clerks[0]?.nextReceiptNumberDesktop).toBe("0011");
    expect(consumed.clerks[0]?.nextReceiptNumberWeb).toBe("0200");
  });

  it("adds objects with inherited auction and department", () => {
    const masterData = buildMasterData();
    let caseFile = createEmptyCase({ id: "case-1", clerkId: "clerk-1", receiptNumber: "0001", createdAt: "2026-03-18T10:00:00.000Z" });
    const first = addObjectToCase(caseFile, masterData, { now: () => "2026-03-18T10:00:00.000Z", createId: () => "obj-1" });
    caseFile = first.caseFile;
    const second = addObjectToCase(caseFile, masterData, { now: () => "2026-03-18T10:10:00.000Z", createId: () => "obj-2" });

    expect(first.caseFile.objects[0]?.intNumber).toBe("0001");
    expect(second.caseFile.objects[1]?.auctionId).toBe(first.caseFile.objects[0]?.auctionId);
    expect(second.caseFile.objects[1]?.departmentId).toBe(first.caseFile.objects[0]?.departmentId);
  });

  it("switches ibid auctions to start price mode", () => {
    const masterData = buildMasterData();
    const caseFile = createEmptyCase({ id: "case-1", clerkId: "clerk-1", receiptNumber: "0001", createdAt: "2026-03-18T10:00:00.000Z" });
    const added = addObjectToCase(caseFile, masterData, { now: () => "2026-03-18T10:00:00.000Z", createId: () => "obj-1" }).caseFile;
    const updated = assignAuction(added, masterData, "obj-1", "auction-2");

    expect(updated.objects[0]?.pricingMode).toBe("startPrice");
  });

  it("reports export readiness issues", () => {
    const masterData = buildMasterData();
    const caseFile = createEmptyCase({ id: "case-1", clerkId: "", receiptNumber: "", createdAt: "2026-03-18T10:00:00.000Z" });
    const report = validateCaseReadiness(caseFile, masterData);

    expect(report.export.isValid).toBe(false);
    expect(report.export.issues.length).toBeGreaterThan(0);
  });
});
