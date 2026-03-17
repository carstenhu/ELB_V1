import JSZip from "jszip";
import type { CaseFile, MasterData } from "@elb/domain/index";
import { buildFolderName } from "@elb/domain/index";
import { generateElbPdf, generateSupplementPdf } from "@elb/pdf-core/index";
import { generateWordDocx, generateWordPdf } from "@elb/word-core/index";

export interface ExportArtifactPlan {
  fileName: string;
  type: "json" | "pdf" | "docx" | "image" | "zip";
  required: boolean;
}

export interface ExportPlan {
  folderName: string;
  zipFileName: string;
  artifacts: ExportArtifactPlan[];
}

export interface ExportMetadata {
  appVersion: string;
  exportedAt: string;
  receiptNumber: string;
  caseId: string;
  clerkId: string;
  status: string;
  objectCount: number;
  imageCount: number;
}

export interface GeneratedArtifact {
  fileName: string;
  mimeType: string;
  content: string | ArrayBuffer | Blob;
}

export interface GeneratedExportBundle {
  plan: ExportPlan;
  metadata: ExportMetadata;
  artifacts: GeneratedArtifact[];
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function createExportPlan(caseFile: CaseFile): ExportPlan {
  const folderName = buildFolderName(caseFile.consignor.lastName, caseFile.consignor.firstName, caseFile.meta.receiptNumber);
  const zipFileName = `ELB_${caseFile.meta.receiptNumber}_${folderName}.zip`;

  return {
    folderName,
    zipFileName,
    artifacts: [
      { fileName: "payload.json", type: "json", required: true },
      { fileName: "metadata.json", type: "json", required: true },
      { fileName: "elb.pdf", type: "pdf", required: true },
      { fileName: "zusatz.pdf", type: "pdf", required: true },
      { fileName: "schaetzliste.docx", type: "docx", required: true },
      { fileName: "schaetzliste.pdf", type: "pdf", required: true },
      { fileName: "bilder/manifest.json", type: "image", required: true },
      { fileName: zipFileName, type: "zip", required: true }
    ]
  };
}

export function createExportMetadata(caseFile: CaseFile): ExportMetadata {
  return {
    appVersion: "0.1.0",
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
      {
        fileName: "payload.json",
        mimeType: "application/json",
        content: JSON.stringify(caseFile, null, 2)
      },
      {
        fileName: "metadata.json",
        mimeType: "application/json",
        content: JSON.stringify(metadata, null, 2)
      },
      {
        fileName: "elb.pdf",
        mimeType: "application/pdf",
        content: toArrayBuffer(elbPdfBytes)
      },
      {
        fileName: "zusatz.pdf",
        mimeType: "application/pdf",
        content: toArrayBuffer(supplementPdfBytes)
      },
      {
        fileName: "schaetzliste.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        content: wordDocxBlob
      },
      {
        fileName: "schaetzliste.pdf",
        mimeType: "application/pdf",
        content: toArrayBuffer(wordPdfBytes)
      },
      {
        fileName: "bilder/manifest.json",
        mimeType: "application/json",
        content: createImageManifest(caseFile)
      }
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

export function triggerDownload(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
