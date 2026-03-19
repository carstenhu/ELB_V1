import type { Asset, CaseFile } from "@elb/domain/index";

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Datei konnte nicht gelesen werden: ${file.name}`));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  });
}

async function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Bild konnte nicht geladen werden."));
    image.src = dataUrl;
  });
}

export async function createOptimizedImageAsset(file: File): Promise<Asset> {
  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageElement(originalDataUrl);
  const scale = Math.min(1500 / image.width, 1000 / image.height, 1);
  const targetWidth = Math.max(Math.round(image.width * scale), 1);
  const targetHeight = Math.max(Math.round(image.height * scale), 1);
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Bildkontext konnte nicht erzeugt werden.");
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  const optimizedDataUrl = canvas.toDataURL("image/jpeg", 0.5);

  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    originalPath: optimizedDataUrl,
    optimizedPath: optimizedDataUrl,
    width: targetWidth,
    height: targetHeight
  };
}

export function findAsset(caseFile: CaseFile, assetId: string): Asset | undefined {
  return caseFile.assets.find((asset) => asset.id === assetId);
}
