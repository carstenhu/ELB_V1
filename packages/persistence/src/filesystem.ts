import type { AuditEntry } from "@elb/app-core/index";
import { buildFolderName, type Asset, type CaseFile, type MasterData } from "@elb/domain/index";
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

interface WorkspaceMetaStorage {
  activeClerkId: string | null;
  savedAt: string;
}

interface ClerkSessionStorage {
  currentCase: CaseFile | null;
  drafts: CaseFile[];
  finalized: CaseFile[];
  savedAt: string;
}

interface ExchangeIndexStorage {
  nextVersion: number;
}

const ROOT_DIR = "Daten";
const WORKSPACE_META_FILE = `${ROOT_DIR}/workspace.json`;
const MASTER_DATA_FILE = `${ROOT_DIR}/Stammdaten/master-data.json`;
const AUDIT_FILE = `${ROOT_DIR}/Audit/audit-log.json`;
const CLERKS_ROOT = `${ROOT_DIR}/Sachbearbeiter`;
const CURRENT_DIR_NAME = "Aktuell";
const EXCHANGE_DIR_NAME = "Austausch";
const SESSION_FILE_NAME = "session.json";
const ASSET_REF_PREFIX = "stored://";
const INDEXED_DB_NAME = "elb-v1-storage";
const INDEXED_DB_STORE = "files";

function getBrowserStorageKey(path: string): string {
  return `elb.v1.fs.${path}`;
}

function getClerkFolderSegment(clerkId: string): string {
  return clerkId.trim() || "unassigned";
}

function getClerkRoot(clerkId: string): string {
  return `${CLERKS_ROOT}/${getClerkFolderSegment(clerkId)}`;
}

function getCurrentRoot(clerkId: string): string {
  return `${getClerkRoot(clerkId)}/${CURRENT_DIR_NAME}`;
}

function getCurrentSessionFile(clerkId: string): string {
  return `${getCurrentRoot(clerkId)}/${SESSION_FILE_NAME}`;
}

function getCurrentAssetsRoot(clerkId: string): string {
  return `${getCurrentRoot(clerkId)}/assets/optimized`;
}

function getCurrentPreviewRoot(clerkId: string): string {
  return `${getCurrentRoot(clerkId)}/preview`;
}

function getExchangeRoot(clerkId: string): string {
  return `${getClerkRoot(clerkId)}/${EXCHANGE_DIR_NAME}`;
}

function getExchangeIndexFile(clerkId: string): string {
  return `${getExchangeRoot(clerkId)}/index.json`;
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

async function toBytes(content: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (content instanceof Uint8Array) {
    return content;
  }

  if (content instanceof ArrayBuffer) {
    return new Uint8Array(content);
  }

  return new Uint8Array(await content.arrayBuffer());
}

function getCurrentAssetPath(clerkId: string, assetId: string): string {
  return `${getCurrentAssetsRoot(clerkId)}/${assetId}.optimized.txt`;
}

async function resolveAssetPayload(fsModule: FileSystemModule | null, value: string): Promise<string> {
  if (!isStoredRef(value)) {
    return value;
  }

  const stored = await readTextData(fsModule, fromStoredRef(value));
  return stored ?? "";
}

async function persistCaseAssetsForCurrent(fsModule: FileSystemModule | null, clerkId: string, caseFile: CaseFile): Promise<CaseFile> {
  const assets = await Promise.all(
    caseFile.assets.map(async (asset) => {
      const optimizedPayload = await resolveAssetPayload(fsModule, asset.optimizedPath || asset.originalPath);
      const storedPath = getCurrentAssetPath(clerkId, asset.id);

      await writeTextData(fsModule, storedPath, optimizedPayload);

      return {
        ...asset,
        originalPath: toStoredRef(storedPath),
        optimizedPath: toStoredRef(storedPath)
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
    caseFile.assets.map(async (asset) => {
      const optimizedPayload = await resolveAssetPayload(fsModule, asset.optimizedPath || asset.originalPath);

      return {
        ...asset,
        originalPath: optimizedPayload,
        optimizedPath: optimizedPayload
      };
    })
  );

  return {
    ...caseFile,
    assets
  };
}

function dedupeCases(caseFiles: CaseFile[]): CaseFile[] {
  const byId = new Map<string, CaseFile>();

  caseFiles.forEach((caseFile) => {
    byId.set(caseFile.meta.id, caseFile);
  });

  return [...byId.values()];
}

async function persistClerkSession(
  fsModule: FileSystemModule | null,
  clerkId: string,
  session: ClerkSessionStorage
): Promise<void> {
  const currentRoot = getCurrentRoot(clerkId);

  await ensureDir(fsModule, currentRoot);
  await ensureDir(fsModule, getCurrentAssetsRoot(clerkId));
  await ensureDir(fsModule, getCurrentPreviewRoot(clerkId));

  const persistedCurrentCase = session.currentCase
    ? await persistCaseAssetsForCurrent(fsModule, clerkId, session.currentCase)
    : null;
  const persistedDrafts = await Promise.all(session.drafts.map((caseFile) => persistCaseAssetsForCurrent(fsModule, clerkId, caseFile)));
  const persistedFinalized = await Promise.all(session.finalized.map((caseFile) => persistCaseAssetsForCurrent(fsModule, clerkId, caseFile)));

  await writeJsonFile(fsModule, getCurrentSessionFile(clerkId), {
    ...session,
    currentCase: persistedCurrentCase,
    drafts: persistedDrafts,
    finalized: persistedFinalized
  });
}

async function loadClerkSession(fsModule: FileSystemModule | null, clerkId: string): Promise<ClerkSessionStorage | null> {
  const stored = await readJsonFile<ClerkSessionStorage>(fsModule, getCurrentSessionFile(clerkId));
  if (!stored) {
    return null;
  }

  return {
    ...stored,
    currentCase: stored.currentCase ? await hydrateCaseAssets(fsModule, stored.currentCase) : null,
    drafts: await Promise.all(stored.drafts.map((caseFile) => hydrateCaseAssets(fsModule, caseFile))),
    finalized: await Promise.all(stored.finalized.map((caseFile) => hydrateCaseAssets(fsModule, caseFile)))
  };
}

function buildClerkSessionSnapshot(snapshot: AppStorageSnapshot, clerkId: string): ClerkSessionStorage {
  return {
    currentCase: snapshot.currentCase?.meta.clerkId === clerkId ? snapshot.currentCase : null,
    drafts: snapshot.drafts.filter((caseFile) => caseFile.meta.clerkId === clerkId),
    finalized: snapshot.finalized.filter((caseFile) => caseFile.meta.clerkId === clerkId),
    savedAt: new Date().toISOString()
  };
}

function getRelevantClerkIds(snapshot: AppStorageSnapshot): string[] {
  const ids = new Set<string>();

  snapshot.masterData.clerks.forEach((clerk) => ids.add(clerk.id));
  if (snapshot.activeClerkId) {
    ids.add(snapshot.activeClerkId);
  }
  snapshot.drafts.forEach((caseFile) => ids.add(caseFile.meta.clerkId));
  snapshot.finalized.forEach((caseFile) => ids.add(caseFile.meta.clerkId));
  if (snapshot.currentCase?.meta.clerkId) {
    ids.add(snapshot.currentCase.meta.clerkId);
  }

  return [...ids];
}

async function getNextExchangeVersion(fsModule: FileSystemModule | null, clerkId: string): Promise<number> {
  const exchangeRoot = getExchangeRoot(clerkId);
  const indexFile = getExchangeIndexFile(clerkId);
  const currentIndex = (await readJsonFile<ExchangeIndexStorage>(fsModule, indexFile)) ?? { nextVersion: 1 };
  const nextVersion = currentIndex.nextVersion;

  await ensureDir(fsModule, exchangeRoot);
  await writeJsonFile(fsModule, indexFile, { nextVersion: nextVersion + 1 });

  return nextVersion;
}

function getExchangeVersionFolder(clerkId: string, version: number): string {
  return `${getExchangeRoot(clerkId)}/v${String(version).padStart(3, "0")}`;
}

function getExchangeCaseFolder(caseFile: CaseFile): string {
  return buildFolderName(caseFile.consignor.lastName, caseFile.consignor.firstName, caseFile.meta.receiptNumber);
}

export async function hydrateSnapshotFromDisk(): Promise<AppStorageSnapshot | null> {
  const fsModule = await loadTauriFs();
  const masterData = await readJsonFile<MasterData>(fsModule, MASTER_DATA_FILE);
  if (!masterData) {
    return null;
  }

  const workspaceMeta = await readJsonFile<WorkspaceMetaStorage>(fsModule, WORKSPACE_META_FILE);
  const clerkSessions = await Promise.all(
    masterData.clerks.map(async (clerk) => ({
      clerkId: clerk.id,
      session: await loadClerkSession(fsModule, clerk.id)
    }))
  );

  const drafts: CaseFile[] = [];
  const finalized: CaseFile[] = [];
  let currentCase: CaseFile | null = null;

  clerkSessions.forEach(({ clerkId, session }) => {
    if (!session) {
      return;
    }

    if (session.currentCase) {
      if (clerkId === workspaceMeta?.activeClerkId && !currentCase) {
        currentCase = session.currentCase;
      } else {
        drafts.push(session.currentCase);
      }
    }

    drafts.push(...session.drafts);
    finalized.push(...session.finalized);
  });

  const dedupedDrafts = dedupeCases(drafts).filter((caseFile) => caseFile.meta.id !== currentCase?.meta.id);
  const dedupedFinalized = dedupeCases(finalized).filter((caseFile) => caseFile.meta.id !== currentCase?.meta.id);

  if (!currentCase && workspaceMeta?.activeClerkId) {
    const activeDraftIndex = dedupedDrafts.findIndex((caseFile) => caseFile.meta.clerkId === workspaceMeta.activeClerkId);
    if (activeDraftIndex >= 0) {
      currentCase = dedupedDrafts[activeDraftIndex] ?? null;
      if (currentCase) {
        dedupedDrafts.splice(activeDraftIndex, 1);
      }
    }
  }

  return {
    masterData,
    activeClerkId: workspaceMeta?.activeClerkId ?? null,
    currentCase,
    drafts: dedupedDrafts,
    finalized: dedupedFinalized
  };
}

export async function persistSnapshotToDisk(snapshot: AppStorageSnapshot): Promise<void> {
  const fsModule = await loadTauriFs();

  await ensureDir(fsModule, ROOT_DIR);
  await ensureDir(fsModule, `${ROOT_DIR}/Stammdaten`);
  await ensureDir(fsModule, `${ROOT_DIR}/Audit`);
  await ensureDir(fsModule, CLERKS_ROOT);

  await writeJsonFile(fsModule, MASTER_DATA_FILE, snapshot.masterData);
  await writeJsonFile(fsModule, WORKSPACE_META_FILE, {
    activeClerkId: snapshot.activeClerkId,
    savedAt: new Date().toISOString()
  } satisfies WorkspaceMetaStorage);

  const clerkIds = getRelevantClerkIds(snapshot);

  await Promise.all(
    clerkIds.map(async (clerkId) => {
      await persistClerkSession(fsModule, clerkId, buildClerkSessionSnapshot(snapshot, clerkId));
    })
  );
}

export async function persistCaseAssetImmediately(caseFile: CaseFile, asset: Asset): Promise<Asset> {
  const fsModule = await loadTauriFs();
  const clerkId = caseFile.meta.clerkId;
  const currentAssetsRoot = getCurrentAssetsRoot(clerkId);
  const optimizedPayload = await resolveAssetPayload(fsModule, asset.optimizedPath || asset.originalPath);

  await ensureDir(fsModule, ROOT_DIR);
  await ensureDir(fsModule, CLERKS_ROOT);
  await ensureDir(fsModule, getClerkRoot(clerkId));
  await ensureDir(fsModule, getCurrentRoot(clerkId));
  await ensureDir(fsModule, currentAssetsRoot);
  await writeTextData(fsModule, getCurrentAssetPath(clerkId, asset.id), optimizedPayload);

  return {
    ...asset,
    originalPath: optimizedPayload,
    optimizedPath: optimizedPayload
  };
}

export async function persistExportArtifactsToDisk(args: {
  caseFile: CaseFile;
  artifacts: Array<{ fileName: string; content: string | ArrayBuffer | Blob | Uint8Array }>;
  zipFileName: string;
  zipContent: Blob | ArrayBuffer | Uint8Array;
}): Promise<string> {
  const fsModule = await loadTauriFs();
  const clerkId = args.caseFile.meta.clerkId;
  const version = await getNextExchangeVersion(fsModule, clerkId);
  const exchangeFolder = getExchangeVersionFolder(clerkId, version);
  const caseFolder = `${exchangeFolder}/${getExchangeCaseFolder(args.caseFile)}`;

  await ensureDir(fsModule, ROOT_DIR);
  await ensureDir(fsModule, CLERKS_ROOT);
  await ensureDir(fsModule, getClerkRoot(clerkId));
  await ensureDir(fsModule, getExchangeRoot(clerkId));
  await ensureDir(fsModule, exchangeFolder);
  await ensureDir(fsModule, caseFolder);

  for (const artifact of args.artifacts) {
    const targetPath = `${caseFolder}/${artifact.fileName}`;
    await ensureParentDir(fsModule, targetPath);

    if (typeof artifact.content === "string") {
      await writeTextData(fsModule, targetPath, artifact.content);
    } else {
      await writeBinaryData(fsModule, targetPath, await toBytes(artifact.content));
    }
  }

  return caseFolder;
}

export async function persistGeneratedPdfToDisk(args: {
  caseFile: CaseFile;
  fileName: string;
  pdfContent: Blob | ArrayBuffer | Uint8Array;
}): Promise<string> {
  const fsModule = await loadTauriFs();
  const clerkId = args.caseFile.meta.clerkId;
  const previewRoot = getCurrentPreviewRoot(clerkId);
  const parsedFileName = splitFileName(args.fileName);
  const targetPath = `${previewRoot}/${parsedFileName.name}-${createTimestampSegment()}${parsedFileName.extension}`;

  await ensureDir(fsModule, ROOT_DIR);
  await ensureDir(fsModule, CLERKS_ROOT);
  await ensureDir(fsModule, getClerkRoot(clerkId));
  await ensureDir(fsModule, getCurrentRoot(clerkId));
  await ensureDir(fsModule, previewRoot);
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
