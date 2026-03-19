import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { createEmptyCase } from "@elb/domain/index";
import { createExportMetadata, createExportPlan, createExportZipFromBundle } from "./index";

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

  it("writes image artifacts into the generated zip", async () => {
    const zipBlob = await createExportZipFromBundle({
      plan: {
        folderName: "Muster_Eva_0042",
        zipFileName: "Muster_Eva_0042.zip",
        artifacts: []
      },
      metadata: {
        appVersion: "0.1.0",
        exportedAt: "2026-03-19T10:00:00.000Z",
        receiptNumber: "0042",
        caseId: "case-1",
        clerkId: "clerk-1",
        status: "draft",
        objectCount: 0,
        imageCount: 1
      },
      artifacts: [
        { fileName: "bilder/manifest.json", mimeType: "application/json", content: "{\"count\":1}" },
        { fileName: "bilder/optimized/asset-1.jpg", mimeType: "image/jpeg", content: new Uint8Array([65, 66, 67]).buffer }
      ]
    });

    const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());

    expect(zip.file("Muster_Eva_0042/bilder/manifest.json")).toBeTruthy();
    expect(zip.file("Muster_Eva_0042/bilder/optimized/asset-1.jpg")).toBeTruthy();
  });
});
