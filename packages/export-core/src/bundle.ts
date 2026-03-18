import JSZip from "jszip";
import { createCaseEnvelope } from "@elb/app-core/index";
import type { CaseFile, MasterData } from "@elb/domain/index";
import { generateElbPdf, generateSupplementPdf } from "@elb/pdf-core/index";
import { getRuntimeConfig } from "@elb/shared/config";
import { generateWordDocx, generateWordPdf } from "@elb/word-core/index";
import { createExportPlan } from "./plan";
import type { ExportMetadata, GeneratedExportBundle } from "./types";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function createExportMetadata(caseFile: CaseFile): ExportMetadata {
  const config = getRuntimeConfig();
  return {
    appVersion: config.appVersion,
    exportedAt: new Date().toISOString(),
    receiptNumber: caseFile.meta.receiptNumber,
    caseId: caseFile.meta.id,
    clerkId: caseFile.meta.clerkId,
    status: caseFile.meta.status,
    objectCount: caseFile.objects.length,
    imageCount: caseFile.assets.length
  };
}

function createImageManifest(caseFile: CaseFile): string {
  return JSON.stringify(
    {
      count: caseFile.assets.length,
      images: caseFile.assets.map((asset) => ({
        id: asset.id,
        fileName: asset.fileName,
        optimizedPath: asset.optimizedPath,
        width: asset.width,
        height: asset.height
      }))
    },
    null,
    2
  );
}

export async function generateExportBundle(caseFile: CaseFile, masterData: MasterData): Promise<GeneratedExportBundle> {
  const plan = createExportPlan(caseFile);
  const metadata = createExportMetadata(caseFile);
  const elbPdfBytes = await generateElbPdf(caseFile, masterData);
  const supplementPdfBytes = await generateSupplementPdf(caseFile, masterData);
  const wordDocxBlob = await generateWordDocx(caseFile, masterData);
  const wordPdfBytes = await generateWordPdf(caseFile, masterData);

  return {
    plan,
    metadata,
    artifacts: [
      { fileName: "payload.json", mimeType: "application/json", content: JSON.stringify(createCaseEnvelope(caseFile), null, 2) },
      { fileName: "metadata.json", mimeType: "application/json", content: JSON.stringify(metadata, null, 2) },
      { fileName: "elb.pdf", mimeType: "application/pdf", content: toArrayBuffer(elbPdfBytes) },
      { fileName: "zusatz.pdf", mimeType: "application/pdf", content: toArrayBuffer(supplementPdfBytes) },
      {
        fileName: "schaetzliste.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        content: wordDocxBlob
      },
      { fileName: "schaetzliste.pdf", mimeType: "application/pdf", content: toArrayBuffer(wordPdfBytes) },
      { fileName: "bilder/manifest.json", mimeType: "application/json", content: createImageManifest(caseFile) }
    ]
  };
}

export async function createExportZip(caseFile: CaseFile, masterData: MasterData): Promise<Blob> {
  const bundle = await generateExportBundle(caseFile, masterData);
  const zip = new JSZip();
  const root = zip.folder(bundle.plan.folderName);

  if (!root) {
    throw new Error("ZIP-Ordner konnte nicht erstellt werden.");
  }

  for (const artifact of bundle.artifacts) {
    root.file(artifact.fileName, artifact.content);
  }

  return zip.generateAsync({ type: "blob" });
}
