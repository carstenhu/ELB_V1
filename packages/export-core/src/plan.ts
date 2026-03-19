import { buildFolderName, type CaseFile } from "@elb/domain/index";
import type { ExportPlan } from "./types";

function sanitizeSegment(value: string): string {
  return value.trim().replaceAll(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "") || "Unbekannt";
}

export function createExportPlan(caseFile: CaseFile): ExportPlan {
  const folderName = buildFolderName(caseFile.consignor.lastName, caseFile.consignor.firstName, caseFile.meta.receiptNumber);
  const nameSegment = sanitizeSegment(
    caseFile.consignor.useCompanyAddress && caseFile.consignor.company.trim()
      ? caseFile.consignor.company
      : caseFile.consignor.lastName || caseFile.consignor.firstName
  );
  const zipFileName = `${nameSegment}_${caseFile.meta.receiptNumber}.zip`;

  return {
    folderName,
    zipFileName,
    artifacts: [
      { fileName: "case.json", type: "json", required: true },
      { fileName: "master-data.json", type: "json", required: true },
      { fileName: "manifest.json", type: "json", required: true },
      { fileName: "elb.pdf", type: "pdf", required: true },
      { fileName: "zusatz.pdf", type: "pdf", required: true },
      { fileName: "schaetzliste.docx", type: "docx", required: true },
      { fileName: "schaetzliste.pdf", type: "pdf", required: true },
      { fileName: "bilder/manifest.json", type: "image", required: true }
    ]
  };
}
