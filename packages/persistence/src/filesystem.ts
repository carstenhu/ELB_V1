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
}

const ROOT_DIR = "elb-v1-data";
const SNAPSHOT_FILE = `${ROOT_DIR}/snapshot.json`;
const MASTER_DATA_FILE = `${ROOT_DIR}/master-data/master-data.json`;
const AUDIT_FILE = `${ROOT_DIR}/audit/audit-log.json`;
const ASSET_REF_PREFIX = "stored://";
const INDEXED_DB_NAME = "elb-v1-storage";
const INDEXED_DB_STORE = "files";

function getBrowserStorageKey(path: string): string {
  return `elb.v1.fs.${path}`;
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
  return `${ROOT_DIR}/cases/${buildFolderName(caseFile.consignor.lastName, caseFile.consignor.firstName, caseFile.meta.receiptNumber)}`;
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

function getAssetStoragePaths(caseFolder: string, assetId: string): { originalPath: string; optimizedPath: string } {
  return {
    originalPath: `${caseFolder}/images/${assetId}.original.txt`,
    optimizedPath: `${caseFolder}/images/${assetId}.optimized.txt`
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
  await ensureDir(fsModule, `${ROOT_DIR}/master-data`);
  await ensureDir(fsModule, `${ROOT_DIR}/audit`);
  await ensureDir(fsModule, `${ROOT_DIR}/cases`);
  await ensureDir(fsModule, `${ROOT_DIR}/archive`);

  const serializedSnapshot = await serializeSnapshot(snapshot, fsModule);

  for (const caseFile of [...serializedSnapshot.drafts, ...serializedSnapshot.finalized, ...(serializedSnapshot.currentCase ? [serializedSnapshot.currentCase] : [])]) {
    const caseFolder = getCaseFolder(caseFile);
    await ensureDir(fsModule, caseFolder);
    await ensureDir(fsModule, `${caseFolder}/images`);
    await ensureDir(fsModule, `${caseFolder}/exports`);
    await writeJsonFile(fsModule, `${caseFolder}/payload.json`, caseFile);
  }

  await writeJsonFile(fsModule, MASTER_DATA_FILE, serializedSnapshot.masterData);
  await writeJsonFile(fsModule, SNAPSHOT_FILE, serializedSnapshot);
}

export async function persistCaseAssetImmediately(caseFile: CaseFile, asset: Asset): Promise<Asset> {
  const fsModule = await loadTauriFs();
  const caseFolder = getCaseFolder(caseFile);
  await ensureDir(fsModule, ROOT_DIR);
  await ensureDir(fsModule, `${ROOT_DIR}/cases`);
  await ensureDir(fsModule, caseFolder);
  await ensureDir(fsModule, `${caseFolder}/images`);

  const storagePaths = getAssetStoragePaths(caseFolder, asset.id);
  await writeTextData(fsModule, storagePaths.originalPath, asset.originalPath);
  await writeTextData(fsModule, storagePaths.optimizedPath, asset.optimizedPath);

  return {
    ...asset,
    originalPath: asset.originalPath,
    optimizedPath: asset.optimizedPath
  };
}

export async function loadAuditLogFromDisk(): Promise<AuditEntry[]> {
  const fsModule = await loadTauriFs();
  return (await readJsonFile<AuditEntry[]>(fsModule, AUDIT_FILE)) ?? [];
}

export async function appendAuditEntryToDisk(entry: AuditEntry): Promise<void> {
  const fsModule = await loadTauriFs();
  await ensureDir(fsModule, ROOT_DIR);
  await ensureDir(fsModule, `${ROOT_DIR}/audit`);
  const currentEntries = (await readJsonFile<AuditEntry[]>(fsModule, AUDIT_FILE)) ?? [];
  currentEntries.push(entry);
  await writeJsonFile(fsModule, AUDIT_FILE, currentEntries);
}
