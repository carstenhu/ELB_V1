import { AppError, importCaseFromJson, toAppError } from "@elb/app-core/index";
import { masterDataSchema, normalizeMasterData, type CaseFile, type MasterData } from "@elb/domain/index";

export interface ExchangeImportEntry {
  path: string;
  content: string | Uint8Array;
}

export interface ExchangeImportResult {
  caseFile: CaseFile;
  masterData: MasterData;
  warnings: string[];
}

interface NormalizedExchangeEntry {
  path: string;
  lowerCasePath: string;
  content: string | Uint8Array;
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

function getDirectoryName(path: string): string {
  const normalized = normalizePath(path);
  const lastSlashIndex = normalized.lastIndexOf("/");
  return lastSlashIndex >= 0 ? normalized.slice(0, lastSlashIndex) : "";
}

function joinPaths(basePath: string, relativePath: string): string {
  if (!basePath) {
    return normalizePath(relativePath);
  }

  return normalizePath(`${basePath}/${relativePath}`);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, Math.min(index + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }

  if (typeof btoa === "function") {
    return btoa(binary);
  }

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const combined = (first << 16) | (second << 8) | third;

    output += alphabet[(combined >> 18) & 63];
    output += alphabet[(combined >> 12) & 63];
    output += index + 1 < bytes.length ? alphabet[(combined >> 6) & 63] : "=";
    output += index + 2 < bytes.length ? alphabet[combined & 63] : "=";
  }

  return output;
}

function guessMimeType(path: string): string {
  const normalized = normalizePath(path).toLowerCase();

  if (normalized.endsWith(".png")) {
    return "image/png";
  }

  if (normalized.endsWith(".webp")) {
    return "image/webp";
  }

  if (normalized.endsWith(".gif")) {
    return "image/gif";
  }

  return "image/jpeg";
}

function createDataUrl(path: string, bytes: Uint8Array): string {
  return `data:${guessMimeType(path)};base64,${bytesToBase64(bytes)}`;
}

function findEntry(entries: readonly NormalizedExchangeEntry[], fileName: string): NormalizedExchangeEntry | null {
  const lowerCaseName = fileName.toLowerCase();
  return entries.find((entry) => entry.lowerCasePath === lowerCaseName || entry.lowerCasePath.endsWith(`/${lowerCaseName}`)) ?? null;
}

function getEntryBytes(entry: NormalizedExchangeEntry): Uint8Array {
  if (entry.content instanceof Uint8Array) {
    return entry.content;
  }

  return new TextEncoder().encode(entry.content);
}

function getEntryText(entry: NormalizedExchangeEntry): string {
  if (typeof entry.content === "string") {
    return entry.content;
  }

  return new TextDecoder().decode(entry.content);
}

function buildPortableEntryMap(entries: readonly ExchangeImportEntry[]): NormalizedExchangeEntry[] {
  return entries.map((entry) => {
    const normalizedPath = normalizePath(entry.path);

    return {
      path: normalizedPath,
      lowerCasePath: normalizedPath.toLowerCase(),
      content: entry.content
    };
  });
}

function resolveAssetEntry(
  entryMap: readonly NormalizedExchangeEntry[],
  caseRoot: string,
  asset: CaseFile["assets"][number]
): NormalizedExchangeEntry | null {
  const candidatePaths = [
    asset.optimizedPath,
    asset.originalPath,
    `bilder/optimized/${asset.id}.jpg`,
    `bilder/optimized/${asset.id}.jpeg`,
    `bilder/optimized/${asset.id}.png`,
    `bilder/optimized/${asset.id}.webp`
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .filter((value) => !value.startsWith("data:"))
    .map((value) => normalizePath(value));

  for (const candidate of candidatePaths) {
    const relativeEntry = findEntry(entryMap, joinPaths(caseRoot, candidate));
    if (relativeEntry) {
      return relativeEntry;
    }

    const directEntry = findEntry(entryMap, candidate);
    if (directEntry) {
      return directEntry;
    }
  }

  return null;
}

function hydrateImportedAssets(
  entryMap: readonly NormalizedExchangeEntry[],
  caseRoot: string,
  caseFile: CaseFile
): CaseFile {
  return {
    ...caseFile,
    assets: caseFile.assets.map((asset) => {
      const imageEntry = resolveAssetEntry(entryMap, caseRoot, asset);

      if (!imageEntry) {
        return asset;
      }

      const dataUrl = createDataUrl(imageEntry.path, getEntryBytes(imageEntry));
      return {
        ...asset,
        originalPath: dataUrl,
        optimizedPath: dataUrl
      };
    })
  };
}

export async function importExchangeFromEntries(entries: readonly ExchangeImportEntry[]): Promise<ExchangeImportResult> {
  try {
    const entryMap = buildPortableEntryMap(entries);
    const caseEntry = findEntry(entryMap, "case.json");
    const masterDataEntry = findEntry(entryMap, "master-data.json");

    if (!caseEntry) {
      throw new AppError("IMPORT_ERROR", "Austauschordner enthaelt keine case.json.");
    }

    if (!masterDataEntry) {
      throw new AppError("IMPORT_ERROR", "Austauschordner enthaelt keine master-data.json.");
    }

    const importedCase = importCaseFromJson(getEntryText(caseEntry));
    const parsedMasterData = masterDataSchema.parse(JSON.parse(getEntryText(masterDataEntry)));
    const caseRoot = getDirectoryName(caseEntry.path);

    return {
      caseFile: hydrateImportedAssets(entryMap, caseRoot, importedCase.caseFile),
      masterData: normalizeMasterData(parsedMasterData),
      warnings: importedCase.warnings
    };
  } catch (error) {
    throw toAppError(error, "IMPORT_ERROR", "Austauschordner konnte nicht importiert werden.");
  }
}
