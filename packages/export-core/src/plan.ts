import { buildExchangeBaseName, type CaseFile } from "@elb/domain/index";
import type { ExportPlan } from "./types";

export function createExportPlan(caseFile: CaseFile): ExportPlan {
  const baseName = buildExchangeBaseName(caseFile.consignor, caseFile.meta.receiptNumber);
  const zipFileName = `${baseName}.zip`;

  return {
    baseName,
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
