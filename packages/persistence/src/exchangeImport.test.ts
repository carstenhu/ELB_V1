import { describe, expect, it } from "vitest";
import { createCaseEnvelope } from "@elb/app-core/index";
import { createEmptyCase, createEmptyClerk, createEmptyMasterData } from "@elb/domain/index";
import { importExchangeFromEntries } from "./exchangeImport";

describe("exchange import", () => {
  it("roundtrips an export bundle with optimized image files", async () => {
    const masterData = createEmptyMasterData();
    masterData.clerks = [createEmptyClerk({ id: "clerk-1", name: "Clerk 1" })];

    const caseFile = createEmptyCase({
      id: "case-1",
      clerkId: "clerk-1",
      receiptNumber: "0001",
      createdAt: "2026-03-19T09:00:00.000Z"
    });
    caseFile.consignor.lastName = "Muster";
    caseFile.consignor.firstName = "Eva";
    caseFile.assets = [
      {
        id: "asset-1",
        fileName: "foto.jpg",
        originalPath: "bilder/optimized/asset-1.jpg",
        optimizedPath: "bilder/optimized/asset-1.jpg",
        width: 100,
        height: 80
      }
    ];
    const entries = [
      {
        path: "Muster_Eva_0001/case.json",
        content: JSON.stringify(createCaseEnvelope(caseFile), null, 2)
      },
      {
        path: "Muster_Eva_0001/master-data.json",
        content: JSON.stringify(masterData, null, 2)
      },
      {
        path: "Muster_Eva_0001/bilder/optimized/asset-1.jpg",
        content: new Uint8Array([65, 66, 67, 68])
      }
    ];

    const imported = await importExchangeFromEntries(entries);

    expect(imported.masterData.clerks).toHaveLength(1);
    expect(imported.caseFile.meta.id).toBe("case-1");
    expect(imported.caseFile.assets[0]?.optimizedPath).toMatch(/^data:image\/jpeg;base64,/);
    expect(imported.caseFile.assets[0]?.originalPath).toBe(imported.caseFile.assets[0]?.optimizedPath);
  });

  it("ignores system files around a valid exchange folder", async () => {
    const imported = await importExchangeFromEntries([
      {
        path: "__MACOSX/._case.json",
        content: new Uint8Array([1, 2, 3])
      },
      {
        path: ".DS_Store",
        content: new Uint8Array([1, 2, 3])
      },
      {
        path: "Huebler_Carsten_0001_v2/case.json",
        content: JSON.stringify(createCaseEnvelope(createEmptyCase({
          id: "case-2",
          clerkId: "clerk-1",
          receiptNumber: "0002",
          createdAt: "2026-03-19T09:00:00.000Z"
        })), null, 2)
      },
      {
        path: "Huebler_Carsten_0001_v2/master-data.json",
        content: JSON.stringify(createEmptyMasterData(), null, 2)
      }
    ]);

    expect(imported.caseFile.meta.id).toBe("case-2");
  });
});
