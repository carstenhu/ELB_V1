import { buildFolderName, type Asset, type CaseFile } from "@elb/domain/index";
import type { AuditEntry } from "@elb/app-core/index";
import type { AppStorageSnapshot } from "./storage";

interface FileSystemModule {
  BaseDirectory: {
    AppLocalData: number | string;
  };
  exists(path: string, options?: { baseDir?: number | string }): Promise<boolean>;
  mkdir(path: string, options?: { baseDir?: number | string; recursive?: boolean }): Promise<void>;
  readTextFile(path: string, options?: { baseDir?: number | string }): Promise<string>;
  writeTextFile(path: string, data: string, options?: { baseDir?: number | string }): Promise<void>;
  writeFile?(path: string, data: Uint8Array, options?: { baseDir?: number | string }): Promise<void>;
}

const ROOT_DIR = "Daten";
const SNAPSHOT_FILE = `${ROOT_DIR}/snapshot.json`;
const MASTER_DATA_FILE = `${ROOT_DIR}/Stammdaten/master-data.json`;
const AUDIT_FILE = `${ROOT_DIR}/Audit/audit-log.json`;
const ASSET_REF_PREFIX = "stored://";
const INDEXED_DB_NAME = "elb-v1-storage";
const INDEXED_DB_STORE = "files";

function getBrowserStorageKey(path: string): string {
  return `elb.v1.fs.${path}`;
}

function getClerkFolderSegment(clerkId: string): string {
  return clerkId.trim() || "unassigned";
}

function toStoredRef(path: string): string {
  return `${ASSET_REF_PREFIX}${path}`;
}

function isStoredRef(path: string): boolean {
  return path.startsWith(ASSET_REF_PREFIX);
}

function fromStoredRef(path: string): string {
  return path.slice(ASSET_REF_PREFIX.length);
}

function getCaseFolder(caseFile: CaseFile): string {
  return `${ROOT_DIR}/Sachbearbeiter/${getClerkFolderSegment(caseFile.meta.clerkId)}/Vorgaenge/${buildFolderName(caseFile.consignor.lastName, caseFile.consignor.firstName, caseFile.meta.receiptNumber)}`;
}

function createTimestampSegment(): string {
  return new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replaceAll(".", "-")
    .replace("T", "_")
    .replace("Z", "");
}

function splitFileName(fileName: string): { name: string; extension: string } {
  const lastDotIndex = fileName.lastIndexOf(".");
  if (lastDotIndex <= 0) {
    return { name: fileName, extension: "" };
  }

  return {
    name: fileName.slice(0, lastDotIndex),
    extension: fileName.slice(lastDotIndex)
  };
}

async function loadTauriFs(): Promise<FileSystemModule | null> {
  const tauriFlag = Reflect.get(globalThis as object, "__TAURI_INTERNALS__");
  if (!tauriFlag) {
    return null;
  }

  try {
    return (await import("@tauri-apps/plugin-fs")) as unknown as FileSystemModule;
  } catch {
    return null;
  }
}

function openIndexedDb(): Promise<IDBDatabase | null> {
  if (!("indexedDB" in globalThis)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(INDEXED_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(INDEXED_DB_STORE)) {
        database.createObjectStore(INDEXED_DB_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function indexedDbWrite(path: string, value: string): Promise<void> {
  const database = await openIndexedDb();
  if (!database) {
    globalThis.localStorage?.setItem(getBrowserStorageKey(path), value);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(INDEXED_DB_STORE, "readwrite");
    const store = transaction.objectStore(INDEXED_DB_STORE);
    store.put(value, path);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function indexedDbRead(path: string): Promise<string | null> {
  const database = await openIndexedDb();
  if (!database) {
    return globalThis.localStorage?.getItem(getBrowserStorageKey(path)) ?? null;
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(INDEXED_DB_STORE, "readonly");
    const store = transaction.objectStore(INDEXED_DB_STORE);
    const request = store.get(path);
    request.onsuccess = () => resolve((request.result as string | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function ensureDir(fsModule: FileSystemModule | null, path: string): Promise<void> {
  if (fsModule) {
    await fsModule.mkdir(path, {
      baseDir: fsModule.BaseDirectory.AppLocalData,
      recursive: true
    });
    return;
  }

  globalThis.localStorage?.setItem(getBrowserStorageKey(`${path}/.dir`), "1");
}

async function writeTextData(fsModule: FileSystemModule | null, path: string, data: string): Promise<void> {
  if (fsModule) {
    await fsModule.writeTextFile(path, data, {
      baseDir: fsModule.BaseDirectory.AppLocalData
    });
    return;
  }

  await indexedDbWrite(path, data);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, Math.min(index + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function writeBinaryData(fsModule: FileSystemModule | null, path: string, data: Uint8Array): Promise<void> {
  if (fsModule?.writeFile) {
    await fsModule.writeFile(path, data, {
      baseDir: fsModule.BaseDirectory.AppLocalData
    });
    return;
  }

  await indexedDbWrite(path, `base64:${bytesToBase64(data)}`);
}

async function readTextData(fsModule: FileSystemModule | null, path: string): Promise<string | null> {
  if (fsModule) {
    const exists = await fsModule.exists(path, {
      baseDir: fsModule.BaseDirectory.AppLocalData
    });
    if (!exists) {
      return null;
    }

    return fsModule.readTextFile(path, {
      baseDir: fsModule.BaseDirectory.AppLocalData
    });
  }

  return indexedDbRead(path);
}

async function writeJsonFile<T>(fsModule: FileSystemModule | null, path: string, value: T): Promise<void> {
  await writeTextData(fsModule, path, JSON.stringify(value, null, 2));
}

async function readJsonFile<T>(fsModule: FileSystemModule | null, path: string): Promise<T | null> {
  const raw = await readTextData(fsModule, path);
  return raw ? (JSON.parse(raw) as T) : null;
}

async function ensureParentDir(fsModule: FileSystemModule | null, path: string): Promise<void> {
  const parts = path.split("/").slice(0, -1);
  if (!parts.length) {
    return;
  }

  let currentPath = "";
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    await ensureDir(fsModule, currentPath);
  }
}

async function toBytes(content: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (content instanceof Uint8Array) {
    return content;
  }

  if (content instanceof ArrayBuffer) {
    return new Uint8Array(content);
  }

  return new Uint8Array(await content.arrayBuffer());
}

function getAssetStoragePaths(caseFolder: string, assetId: string): { originalPath: string; optimizedPath: string } {
  return {
    originalPath: `${caseFolder}/Bilder/${assetId}.original.txt`,
    optimizedPath: `${caseFolder}/Bilder/${assetId}.optimized.txt`
  };
}

async function resolveAssetPayload(fsModule: FileSystemModule | null, value: string): Promise<string> {
  if (!isStoredRef(value)) {
    return value;
  }

  const stored = await readTextData(fsModule, fromStoredRef(value));
  return stored ?? "";
}

async function persistCaseAssets(fsModule: FileSystemModule | null, caseFile: CaseFile): Promise<CaseFile> {
  const caseFolder = getCaseFolder(caseFile);
  const assets = await Promise.all(
    caseFile.assets.map(async (asset) => {
      const storagePaths = getAssetStoragePaths(caseFolder, asset.id);
      const originalPayload = await resolveAssetPayload(fsModule, asset.originalPath);
      const optimizedPayload = await resolveAssetPayload(fsModule, asset.optimizedPath);

      await writeTextData(fsModule, storagePaths.originalPath, originalPayload);
      await writeTextData(fsModule, storagePaths.optimizedPath, optimizedPayload);

      return {
        ...asset,
        originalPath: toStoredRef(storagePaths.originalPath),
        optimizedPath: toStoredRef(storagePaths.optimizedPath)
      };
    })
  );

  return {
    ...caseFile,
    assets
  };
}

async function hydrateCaseAssets(fsModule: FileSystemModule | null, caseFile: CaseFile): Promise<CaseFile> {
  const assets = await Promise.all(
    caseFile.assets.map(async (asset) => ({
      ...asset,
      originalPath: await resolveAssetPayload(fsModule, asset.originalPath),
      optimizedPath: await resolveAssetPayload(fsModule, asset.optimizedPath)
    }))
  );

  return {
    ...caseFile,
    assets
  };
}

async function serializeSnapshot(snapshot: AppStorageSnapshot, fsModule: FileSystemModule | null): Promise<AppStorageSnapshot> {
  const drafts = await Promise.all(snapshot.drafts.map((caseFile) => persistCaseAssets(fsModule, caseFile)));
  const finalized = await Promise.all(snapshot.finalized.map((caseFile) => persistCaseAssets(fsModule, caseFile)));
  const currentCase = snapshot.currentCase ? await persistCaseAssets(fsModule, snapshot.currentCase) : null;

  return {
    ...snapshot,
    drafts,
    finalized,
    currentCase
  };
}

async function hydrateSnapshot(snapshot: AppStorageSnapshot, fsModule: FileSystemModule | null): Promise<AppStorageSnapshot> {
  const drafts = await Promise.all(snapshot.drafts.map((caseFile) => hydrateCaseAssets(fsModule, caseFile)));
  const finalized = await Promise.all(snapshot.finalized.map((caseFile) => hydrateCaseAssets(fsModule, caseFile)));
  const currentCase = snapshot.currentCase ? await hydrateCaseAssets(fsModule, snapshot.currentCase) : null;

  return {
    ...snapshot,
    drafts,
    finalized,
    currentCase
  };
}

export async function hydrateSnapshotFromDisk(): Promise<AppStorageSnapshot | null> {
  const fsModule = await loadTauriFs();
  const snapshot = await readJsonFile<AppStorageSnapshot>(fsModule, SNAPSHOT_FILE);
  if (!snapshot) {
    return null;
  }

  return hydrateSnapshot(snapshot, fsModule);
}

export async function persistSnapshotToDisk(snapshot: AppStorageSnapshot): Promise<void> {
  const fsModule = await loadTauriFs();

  await ensureDir(fsModule, ROOT_DIR);
  await ensureDir(fsModule, `${ROOT_DIR}/Stammdaten`);
  await ensureDir(fsModule, `${ROOT_DIR}/Audit`);
  await ensureDir(fsModule, `${ROOT_DIR}/Sachbearbeiter`);
  await ensureDir(fsModule, `${ROOT_DIR}/Archiv`);

  const serializedSnapshot = await serializeSnapshot(snapshot, fsModule);

  for (const caseFile of [...serializedSnapshot.drafts, ...serializedSnapshot.finalized, ...(serializedSnapshot.currentCase ? [serializedSnapshot.currentCase] : [])]) {
    const caseFolder = getCaseFolder(caseFile);
    await ensureDir(fsModule, caseFolder);
    await ensureDir(fsModule, `${caseFolder}/Bilder`);
    await ensureDir(fsModule, `${caseFolder}/Exporte`);
    await ensureDir(fsModule, `${caseFolder}/Payload`);
    await ensureDir(fsModule, `${caseFolder}/Entwurf`);
    await writeJsonFile(fsModule, `${caseFolder}/Payload/payload.json`, caseFile);
    if (caseFile.meta.status === "draft") {
      await writeJsonFile(fsModule, `${caseFolder}/Entwurf/entwurf.json`, caseFile);
    }
  }

  await writeJsonFile(fsModule, MASTER_DATA_FILE, serializedSnapshot.masterData);
  await writeJsonFile(fsModule, SNAPSHOT_FILE, serializedSnapshot);
}

export async function persistCaseAssetImmediately(caseFile: CaseFile, asset: Asset): Promise<Asset> {
  const fsModule = await loadTauriFs();
  const caseFolder = getCaseFolder(caseFile);
  await ensureDir(fsModule, ROOT_DIR);
  await ensureDir(fsModule, `${ROOT_DIR}/Sachbearbeiter`);
  await ensureDir(fsModule, caseFolder);
  await ensureDir(fsModule, `${caseFolder}/Bilder`);

  const storagePaths = getAssetStoragePaths(caseFolder, asset.id);
  await writeTextData(fsModule, storagePaths.originalPath, asset.originalPath);
  await writeTextData(fsModule, storagePaths.optimizedPath, asset.optimizedPath);

  return {
    ...asset,
    originalPath: asset.originalPath,
    optimizedPath: asset.optimizedPath
  };
}

export async function persistExportArtifactsToDisk(args: {
  caseFile: CaseFile;
  artifacts: Array<{ fileName: string; content: string | ArrayBuffer | Blob | Uint8Array }>;
  zipFileName: string;
  zipContent: Blob | ArrayBuffer | Uint8Array;
}): Promise<string> {
  const fsModule = await loadTauriFs();
  const caseFolder = getCaseFolder(args.caseFile);
  const exportsFolder = `${caseFolder}/Exporte`;
  const exportRunFolder = `${exportsFolder}/Export_${createTimestampSegment()}`;

  await ensureDir(fsModule, ROOT_DIR);
  await ensureDir(fsModule, `${ROOT_DIR}/Sachbearbeiter`);
  await ensureDir(fsModule, caseFolder);
  await ensureDir(fsModule, exportsFolder);
  await ensureDir(fsModule, exportRunFolder);

  for (const artifact of args.artifacts) {
    const targetPath = `${exportRunFolder}/${artifact.fileName}`;
    await ensureParentDir(fsModule, targetPath);

    if (typeof artifact.content === "string") {
      await writeTextData(fsModule, targetPath, artifact.content);
      continue;
    }

    await writeBinaryData(fsModule, targetPath, await toBytes(artifact.content));
  }

  await writeBinaryData(fsModule, `${exportRunFolder}/${args.zipFileName}`, await toBytes(args.zipContent));

  return exportRunFolder;
}

export async function persistGeneratedPdfToDisk(args: {
  caseFile: CaseFile;
  fileName: string;
  pdfContent: Blob | ArrayBuffer | Uint8Array;
}): Promise<string> {
  const fsModule = await loadTauriFs();
  const caseFolder = getCaseFolder(args.caseFile);
  const previewFolder = `${caseFolder}/Vorschau`;
  const parsedFileName = splitFileName(args.fileName);
  const targetPath = `${previewFolder}/${parsedFileName.name}-${createTimestampSegment()}${parsedFileName.extension}`;

  await ensureDir(fsModule, ROOT_DIR);
  await ensureDir(fsModule, `${ROOT_DIR}/Sachbearbeiter`);
  await ensureDir(fsModule, caseFolder);
  await ensureDir(fsModule, previewFolder);
  await writeBinaryData(fsModule, targetPath, await toBytes(args.pdfContent));

  return targetPath;
}

export async function loadAuditLogFromDisk(): Promise<AuditEntry[]> {
  const fsModule = await loadTauriFs();
  return (await readJsonFile<AuditEntry[]>(fsModule, AUDIT_FILE)) ?? [];
}

export async function appendAuditEntryToDisk(entry: AuditEntry): Promise<void> {
  const fsModule = await loadTauriFs();
  await ensureDir(fsModule, ROOT_DIR);
  await ensureDir(fsModule, `${ROOT_DIR}/Audit`);
  const currentEntries = (await readJsonFile<AuditEntry[]>(fsModule, AUDIT_FILE)) ?? [];
  currentEntries.push(entry);
  await writeJsonFile(fsModule, AUDIT_FILE, currentEntries);
}
