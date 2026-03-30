import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { createEmptyCase, createEmptyMasterData, createEmptyObject } from "@elb/domain/index";
import { createWordPreviewModel, generateWordDocx } from "./index";

function buildCaseWithObjects(count: number) {
  const caseFile = createEmptyCase({
    id: "case-1",
    clerkId: "clerk-1",
    receiptNumber: "2001",
    createdAt: "2026-03-30T10:00:00.000Z"
  });

  caseFile.objects = Array.from({ length: count }, (_, index) => {
    const objectItem = createEmptyObject({
      id: `object-${index + 1}`,
      intNumber: String(index + 1).padStart(4, "0"),
      auctionId: "",
      departmentId: ""
    });

    objectItem.shortDescription = `Objekt ${index + 1} mit echter Worttrennung fuer den Layouttest`;
    objectItem.description = `Zusatzbeschreibung ${index + 1} mit etwas mehr Text fuer den Layouttest`;
    objectItem.estimate.low = "1000";
    objectItem.estimate.high = "1500";
    return objectItem;
  });

  return caseFile;
}

function buildMasterData() {
  const masterData = createEmptyMasterData();
  masterData.clerks.push({
    id: "clerk-1",
    name: "Carsten Huebler",
    email: "",
    phone: "",
    signaturePng: "",
    nextReceiptNumberDesktop: "1",
    nextReceiptNumberWeb: "1"
  });
  return masterData;
}

describe("createWordPreviewModel", () => {
  it("keeps compact rows on one page", () => {
    const model = createWordPreviewModel(buildCaseWithObjects(5), buildMasterData());

    expect(model.pages).toHaveLength(1);
    expect(model.pages[0]?.rows).toHaveLength(5);
  });

  it("never creates a blank follow page when a list spans multiple pages", () => {
    const model = createWordPreviewModel(buildCaseWithObjects(6), buildMasterData());

    expect(model.pages.length).toBeGreaterThan(1);
    expect(model.pages.every((page) => page.rows.length > 0)).toBe(true);
  });

  it("writes object content into generated docx", async () => {
    const caseFile = buildCaseWithObjects(3);
    const blob = await generateWordDocx(caseFile, buildMasterData());
    const buffer = await blob.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file("word/document.xml")?.async("string");

    expect(documentXml).toBeTruthy();
    expect(documentXml).toContain("Objekt 1 mit echter Worttrennung fuer");
    expect(documentXml).toContain("Schaetzung: CHF 1 000 - 1 500");
  });
});
