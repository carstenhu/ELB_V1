import { describe, expect, it } from "vitest";
import { createEmptyCase, createEmptyMasterData, createEmptyObject } from "@elb/domain/index";
import { createWordPreviewModel } from "./index";

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

    objectItem.shortDescription = `Sehr lange Objektbezeichnung ${index + 1} mit mehreren Woertern fuer einen echten Zeilenumbruch`;
    objectItem.description = `Zusatzbeschreibung ${index + 1} mit weiterem Inhalt fuer die Schaetzliste`;
    objectItem.estimate.low = "1000";
    objectItem.estimate.high = "1500";
    return objectItem;
  });

  return caseFile;
}

describe("createWordPreviewModel", () => {
  it("keeps a medium object list on one page without creating a blank follow page", () => {
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

    const model = createWordPreviewModel(buildCaseWithObjects(8), masterData);

    expect(model.pages).toHaveLength(1);
    expect(model.pages[0]?.rows).toHaveLength(8);
  });
});
