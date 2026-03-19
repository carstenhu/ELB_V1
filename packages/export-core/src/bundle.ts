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

function decodeDataUrl(dataUrl: string): Uint8Array {
  const [, base64 = ""] = dataUrl.split(",", 2);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function createPortableCaseFile(caseFile: CaseFile): CaseFile {
  return {
    ...caseFile,
    assets: caseFile.assets.map((asset) => ({
      ...asset,
      originalPath: `bilder/optimized/${asset.id}.jpg`,
      optimizedPath: `bilder/optimized/${asset.id}.jpg`
    }))
  };
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
        optimizedPath: `bilder/optimized/${asset.id}.jpg`,
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
  const portableCaseFile = createPortableCaseFile(caseFile);
  const elbPdfBytes = await generateElbPdf(caseFile, masterData);
  const supplementPdfBytes = await generateSupplementPdf(caseFile, masterData);
  const wordDocxBlob = await generateWordDocx(caseFile, masterData);
  const wordPdfBytes = await generateWordPdf(caseFile, masterData);

  const imageArtifacts = caseFile.assets.map((asset) => ({
    fileName: `bilder/optimized/${asset.id}.jpg`,
    mimeType: "image/jpeg",
    content: toArrayBuffer(decodeDataUrl(asset.optimizedPath || asset.originalPath))
  }));

  return {
    plan,
    metadata,
    artifacts: [
      { fileName: "case.json", mimeType: "application/json", content: JSON.stringify(createCaseEnvelope(portableCaseFile), null, 2) },
      { fileName: "master-data.json", mimeType: "application/json", content: JSON.stringify(masterData, null, 2) },
      { fileName: "manifest.json", mimeType: "application/json", content: JSON.stringify(metadata, null, 2) },
      { fileName: "elb.pdf", mimeType: "application/pdf", content: toArrayBuffer(elbPdfBytes) },
      { fileName: "zusatz.pdf", mimeType: "application/pdf", content: toArrayBuffer(supplementPdfBytes) },
      {
        fileName: "schaetzliste.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        content: wordDocxBlob
      },
      { fileName: "schaetzliste.pdf", mimeType: "application/pdf", content: toArrayBuffer(wordPdfBytes) },
      { fileName: "bilder/manifest.json", mimeType: "application/json", content: createImageManifest(caseFile) },
      ...imageArtifacts
    ]
  };
}

export async function createExportZipFromBundle(bundle: GeneratedExportBundle): Promise<Blob> {
  const zip = new JSZip();

  for (const artifact of bundle.artifacts) {
    zip.file(artifact.fileName, artifact.content);
  }

  return zip.generateAsync({ type: "blob" });
}

export async function createExportZip(caseFile: CaseFile, masterData: MasterData): Promise<Blob> {
  const bundle = await generateExportBundle(caseFile, masterData);
  return createExportZipFromBundle(bundle);
}
