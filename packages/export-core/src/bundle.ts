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

function normalizeIntNumberSegment(value: string, fallbackIndex: number): string {
  const digitsOnly = value.replace(/[^\d]/g, "");
  if (digitsOnly) {
    return digitsOnly.padStart(4, "0");
  }

  return String(fallbackIndex + 1).padStart(4, "0");
}

function ensureUniquePath(path: string, usedPaths: Set<string>): string {
  if (!usedPaths.has(path)) {
    usedPaths.add(path);
    return path;
  }

  const match = path.match(/^(.*?)(\.[^.]+)$/);
  const base = match ? match[1] : path;
  const extension = match ? match[2] : "";
  let counter = 2;
  let nextPath = `${base}_${counter}${extension}`;
  while (usedPaths.has(nextPath)) {
    counter += 1;
    nextPath = `${base}_${counter}${extension}`;
  }
  usedPaths.add(nextPath);
  return nextPath;
}

function buildAssetExportPathMap(caseFile: CaseFile): Map<string, string> {
  const pathByAssetId = new Map<string, string>();
  const usedPaths = new Set<string>();

  caseFile.objects.forEach((objectItem, objectIndex) => {
    const intSegment = normalizeIntNumberSegment(objectItem.intNumber, objectIndex);
    objectItem.photoAssetIds.forEach((assetId, photoIndex) => {
      if (!assetId || pathByAssetId.has(assetId)) {
        return;
      }

      const preferredPath = `bilder/optimized/${intSegment}_${photoIndex + 1}.jpg`;
      pathByAssetId.set(assetId, ensureUniquePath(preferredPath, usedPaths));
    });
  });

  caseFile.assets.forEach((asset, assetIndex) => {
    if (pathByAssetId.has(asset.id)) {
      return;
    }

    const fallbackPath = `bilder/optimized/asset_${String(assetIndex + 1).padStart(4, "0")}.jpg`;
    pathByAssetId.set(asset.id, ensureUniquePath(fallbackPath, usedPaths));
  });

  return pathByAssetId;
}

function createPortableCaseFile(caseFile: CaseFile, assetExportPathMap: Map<string, string>): CaseFile {
  return {
    ...caseFile,
    assets: caseFile.assets.map((asset) => ({
      ...asset,
      originalPath: assetExportPathMap.get(asset.id) ?? `bilder/optimized/${asset.id}.jpg`,
      optimizedPath: assetExportPathMap.get(asset.id) ?? `bilder/optimized/${asset.id}.jpg`
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

function createImageManifest(caseFile: CaseFile, assetExportPathMap: Map<string, string>): string {
  return JSON.stringify(
    {
      count: caseFile.assets.length,
      images: caseFile.assets.map((asset) => ({
        id: asset.id,
        fileName: asset.fileName,
        optimizedPath: assetExportPathMap.get(asset.id) ?? `bilder/optimized/${asset.id}.jpg`,
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
  const assetExportPathMap = buildAssetExportPathMap(caseFile);
  const portableCaseFile = createPortableCaseFile(caseFile, assetExportPathMap);
  const elbPdfBytes = await generateElbPdf(caseFile, masterData);
  const supplementPdfBytes = await generateSupplementPdf(caseFile, masterData);
  const wordDocxBlob = await generateWordDocx(caseFile, masterData);
  const wordPdfBytes = await generateWordPdf(caseFile, masterData);

  const imageArtifacts = caseFile.assets.map((asset) => ({
    fileName: assetExportPathMap.get(asset.id) ?? `bilder/optimized/${asset.id}.jpg`,
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
      { fileName: "bilder/manifest.json", mimeType: "application/json", content: createImageManifest(caseFile, assetExportPathMap) },
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
