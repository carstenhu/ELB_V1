import type { AuditEntry } from "@elb/app-core/index";
import { buildExchangeBaseName, type Asset, type CaseFile, type MasterData } from "@elb/domain/index";
import type { AppStorageSnapshot } from "./storage";

interface FileSystemModule {
  BaseDirectory: {
    Download?: number | string;
    AppLocalData: number | string;
  };
  exists(path: string, options?: { baseDir?: number | string }): Promise<boolean>;
  mkdir(path: string, options?: { baseDir?: number | string; recursive?: boolean }): Promise<void>;
  readDir?(path: string, options?: { baseDir?: number | string }): Promise<Array<{ name: string; isDirectory?: boolean; isFile?: boolean }>>;
  readFile?(path: string, options?: { baseDir?: number | string }): Promise<Uint8Array>;
  readTextFile(path: string, options?: { baseDir?: number | string }): Promise<string>;
  writeTextFile(path: string, data: string, options?: { baseDir?: number | string }): Promise<void>;
  writeFile?(path: string, data: Uint8Array, options?: { baseDir?: number | string }): Promise<void>;
}

interface BrowserDirectoryHandle {
  kind?: string;
  name: string;
  values?(): AsyncIterable<BrowserDirectoryEntryHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<BrowserDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<BrowserFileHandle>;
  queryPermission?(options?: { mode?: "read" | "readwrite" }): Promise<"granted" | "denied" | "prompt">;
  requestPermission?(options?: { mode?: "read" | "readwrite" }): Promise<"granted" | "denied" | "prompt">;
}

interface BrowserFileHandle {
  kind?: string;
  name?: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: Blob | BufferSource | string): Promise<void>; close(): Promise<void> }>;
}

type BrowserDirectoryEntryHandle = BrowserDirectoryHandle | BrowserFileHandle;

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

interface CurrentDossierPointerStorage {
  caseId: string | null;
  savedAt: string;
}

interface ExchangeIndexStorage {
  nextVersionByBaseName: Record<string, number>;
}

export interface StoredExchangeZipFile {
  id: string;
  fileName: string;
  label: string;
}

const ROOT_DIR = "ELB_V1_Daten";
const WORKSPACE_META_FILE = `${ROOT_DIR}/workspace.json`;
const MASTER_DATA_FILE = `${ROOT_DIR}/Stammdaten/master-data.json`;
const AUDIT_FILE = `${ROOT_DIR}/Audit/audit-log.json`;
const CLERKS_ROOT = `${ROOT_DIR}/Sachbearbeiter`;
const CURRENT_DIR_NAME = "Aktuell";
const DOSSIERS_DIR_NAME = "Dossiers";
const EXCHANGE_DIR_NAME = "Austausch";
const EXCHANGE_INDEX_FILE_NAME = "austausch-index.json";
const SESSION_FILE_NAME = "session.json";
const CURRENT_POINTER_FILE_NAME = "current.json";
const DOSSIER_FILE_NAME = "dossier.json";
const ASSET_REF_PREFIX = "stored://";
const INDEXED_DB_NAME = "elb-v1-storage";
const INDEXED_DB_STORE = "files";
const INDEXED_DB_HANDLE_STORE = "handles";
const LINKED_DIRECTORY_HANDLE_KEY = "linked-directory-handle";

function getBrowserStorageKey(path: string): string {
  return `elb.v1.fs.${path}`;
}

function getLinkedDirectoryLabel(handle: BrowserDirectoryHandle | null): string | null {
  if (!handle) {
    return null;
  }

  return handle.name === ROOT_DIR ? ROOT_DIR : `${handle.name}/${ROOT_DIR}`;
}

function getClerkFolderSegment(name: string | null | undefined, clerkId: string): string {
  const normalizedName = (name ?? "").trim().replaceAll(/\s+/g, "_");
  return normalizedName || clerkId.trim() || "unassigned";
}

function getClerkRoot(clerkFolderSegment: string): string {
  return `${CLERKS_ROOT}/${clerkFolderSegment}`;
}

function getCurrentRoot(clerkFolderSegment: string): string {
  return `${getClerkRoot(clerkFolderSegment)}/${CURRENT_DIR_NAME}`;
}

function getCurrentSessionFile(clerkFolderSegment: string): string {
  return `${getCurrentRoot(clerkFolderSegment)}/${SESSION_FILE_NAME}`;
}

function getCurrentPointerFile(clerkFolderSegment: string): string {
  return `${getCurrentRoot(clerkFolderSegment)}/${CURRENT_POINTER_FILE_NAME}`;
}

function getDossiersRoot(clerkFolderSegment: string): string {
  return `${getClerkRoot(clerkFolderSegment)}/${DOSSIERS_DIR_NAME}`;
}

function getDossierRoot(clerkFolderSegment: string, caseId: string): string {
  return `${getDossiersRoot(clerkFolderSegment)}/${caseId}`;
}

function getDossierFile(clerkFolderSegment: string, caseId: string): string {
  return `${getDossierRoot(clerkFolderSegment, caseId)}/${DOSSIER_FILE_NAME}`;
}

function getDossierAssetsRoot(clerkFolderSegment: string, caseId: string): string {
  return `${getDossierRoot(clerkFolderSegment, caseId)}/assets/optimized`;
}

function getDossierPreviewRoot(clerkFolderSegment: string, caseId: string): string {
  return `${getDossierRoot(clerkFolderSegment, caseId)}/preview`;
}

function getCurrentAssetsRoot(clerkFolderSegment: string): string {
  return `${getCurrentRoot(clerkFolderSegment)}/assets/optimized`;
}

function getCurrentPreviewRoot(clerkFolderSegment: string): string {
  return `${getCurrentRoot(clerkFolderSegment)}/preview`;
}

function getExchangeRoot(clerkFolderSegment: string): string {
  return `${getClerkRoot(clerkFolderSegment)}/${EXCHANGE_DIR_NAME}`;
}

function getExchangeIndexFile(clerkFolderSegment: string): string {
  return `${getExchangeRoot(clerkFolderSegment)}/${EXCHANGE_INDEX_FILE_NAME}`;
}

function getExchangeZipPath(clerkFolderSegment: string, fileName: string): string {
  return `${getExchangeRoot(clerkFolderSegment)}/${fileName}`;
}

function getStoredExchangeZipId(clerkFolderSegment: string, fileName: string): string {
  return `${getExchangeRoot(clerkFolderSegment)}/${fileName}`;
}

function parseStoredExchangeZipId(zipId: string): { clerkFolderSegment: string; fileName: string } | null {
  const normalizedZipId = zipId.replaceAll("\\", "/").replace(/^\/+/, "");
  const pathSegments = normalizedZipId.split("/").filter(Boolean);
  if (pathSegments.length < 5) {
    return null;
  }

  const exchangeIndex = pathSegments.lastIndexOf(EXCHANGE_DIR_NAME);
  if (exchangeIndex !== 3 || pathSegments[0] !== ROOT_DIR || pathSegments[1] !== "Sachbearbeiter") {
    return null;
  }

  const fileName = pathSegments[pathSegments.length - 1];
  const clerkFolderSegment = pathSegments[exchangeIndex - 1];
  if (typeof clerkFolderSegment !== "string" || typeof fileName !== "string" || !fileName.toLowerCase().endsWith(".zip")) {
    return null;
  }

  return {
    clerkFolderSegment,
    fileName
  };
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

function getDesktopBaseDir(fsModule: FileSystemModule): number | string {
  return fsModule.BaseDirectory.Download ?? fsModule.BaseDirectory.AppLocalData;
}

function openIndexedDb(): Promise<IDBDatabase | null> {
  if (!("indexedDB" in globalThis)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(INDEXED_DB_NAME, 2);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(INDEXED_DB_STORE)) {
        database.createObjectStore(INDEXED_DB_STORE);
      }
      if (!database.objectStoreNames.contains(INDEXED_DB_HANDLE_STORE)) {
        database.createObjectStore(INDEXED_DB_HANDLE_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function indexedDbPut(storeName: string, key: string, value: unknown): Promise<void> {
  const database = await openIndexedDb();
  if (!database) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    store.put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function indexedDbGet<T>(storeName: string, key: string): Promise<T | null> {
  const database = await openIndexedDb();
  if (!database) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function indexedDbDelete(storeName: string, key: string): Promise<void> {
  const database = await openIndexedDb();
  if (!database) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    store.delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
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

function getBrowserLinkedDirectoryPicker(): (() => Promise<BrowserDirectoryHandle>) | null {
  const picker = Reflect.get(globalThis, "showDirectoryPicker");
  return typeof picker === "function" ? (picker as () => Promise<BrowserDirectoryHandle>) : null;
}

function getBrowserPathSegments(path: string): string[] {
  return path
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean)
    .filter((segment, index) => !(index === 0 && segment === ROOT_DIR));
}

async function ensureBrowserHandlePermission(handle: BrowserDirectoryHandle, mode: "read" | "readwrite"): Promise<boolean> {
  if (typeof handle.queryPermission === "function") {
    const state = await handle.queryPermission({ mode });
    if (state === "granted") {
      return true;
    }
  }

  if (typeof handle.requestPermission === "function") {
    const state = await handle.requestPermission({ mode });
    return state === "granted";
  }

  return true;
}

async function getStoredLinkedDirectoryHandle(): Promise<BrowserDirectoryHandle | null> {
  return indexedDbGet<BrowserDirectoryHandle>(INDEXED_DB_HANDLE_STORE, LINKED_DIRECTORY_HANDLE_KEY);
}

async function getBrowserLinkedDirectoryHandle(mode: "read" | "readwrite" = "readwrite"): Promise<BrowserDirectoryHandle | null> {
  const storedHandle = await getStoredLinkedDirectoryHandle();
  if (!storedHandle) {
    return null;
  }

  const granted = await ensureBrowserHandlePermission(storedHandle, mode);
  return granted ? storedHandle : null;
}

async function persistLinkedDirectoryHandle(handle: BrowserDirectoryHandle): Promise<void> {
  await indexedDbPut(INDEXED_DB_HANDLE_STORE, LINKED_DIRECTORY_HANDLE_KEY, handle);
}

async function clearLinkedDirectoryHandle(): Promise<void> {
  await indexedDbDelete(INDEXED_DB_HANDLE_STORE, LINKED_DIRECTORY_HANDLE_KEY);
}

async function getBrowserDirectoryHandle(path: string, options?: { create?: boolean }): Promise<BrowserDirectoryHandle | null> {
  const rootHandle = await getBrowserLinkedDirectoryHandle(options?.create ? "readwrite" : "read");
  if (!rootHandle) {
    return null;
  }

  const segments = getBrowserPathSegments(path);
  let currentHandle = rootHandle;

  for (const segment of segments) {
    try {
      currentHandle = await currentHandle.getDirectoryHandle(segment, { create: options?.create ?? false });
    } catch {
      if (options?.create) {
        throw new Error(`Der Browser-Datenordner konnte nicht erstellt werden: ${path}`);
      }

      return null;
    }
  }

  return currentHandle;
}

async function getBrowserFileHandle(path: string, options?: { create?: boolean }): Promise<BrowserFileHandle | null> {
  const segments = getBrowserPathSegments(path);
  const fileName = segments.pop();
  if (!fileName) {
    return null;
  }

  const parentPath = segments.length ? `${ROOT_DIR}/${segments.join("/")}` : ROOT_DIR;
  const parentHandle = await getBrowserDirectoryHandle(parentPath, options?.create ? { create: true } : undefined);
  if (!parentHandle) {
    return null;
  }

  return parentHandle.getFileHandle(fileName, { create: options?.create ?? false });
}

async function browserWriteTextData(path: string, data: string): Promise<boolean> {
  const fileHandle = await getBrowserFileHandle(path, { create: true });
  if (!fileHandle) {
    return false;
  }

  const writable = await fileHandle.createWritable();
  await writable.write(new Blob([data]));
  await writable.close();
  return true;
}

async function browserWriteBinaryData(path: string, data: Uint8Array): Promise<boolean> {
  const fileHandle = await getBrowserFileHandle(path, { create: true });
  if (!fileHandle) {
    return false;
  }

  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const writable = await fileHandle.createWritable();
  await writable.write(new Blob([buffer]));
  await writable.close();
  return true;
}

async function browserReadTextData(path: string): Promise<string | null> {
  try {
    const fileHandle = await getBrowserFileHandle(path, { create: false });
    if (!fileHandle) {
      return null;
    }

    const file = await fileHandle.getFile();
    return file.text();
  } catch {
    return null;
  }
}

export async function linkBrowserDataDirectory(): Promise<{ label: string; message: string }> {
  const picker = getBrowserLinkedDirectoryPicker();
  if (!picker) {
    throw new Error("Dieser Browser unterstuetzt keine verknuepfbaren Datenordner.");
  }

  const selectedHandle = await picker();
  const rootHandle = selectedHandle.name === ROOT_DIR
    ? selectedHandle
    : await selectedHandle.getDirectoryHandle(ROOT_DIR, { create: true });

  const granted = await ensureBrowserHandlePermission(rootHandle, "readwrite");
  if (!granted) {
    throw new Error("Der Datenordner konnte nicht mit Schreibrechten verknuepft werden.");
  }

  await persistLinkedDirectoryHandle(rootHandle);
  const label = getLinkedDirectoryLabel(rootHandle) ?? ROOT_DIR;
  return {
    label,
    message: `Web-Datenordner verknuepft: ${label}`
  };
}

export async function unlinkBrowserDataDirectory(): Promise<{ message: string }> {
  await clearLinkedDirectoryHandle();
  return { message: "Web-Datenordner-Verknuepfung wurde geloest." };
}

export async function getBrowserDataDirectoryStatus(): Promise<{
  supportsLinking: boolean;
  isLinked: boolean;
  label: string | null;
  message: string;
}> {
  const supportsLinking = Boolean(getBrowserLinkedDirectoryPicker());
  if (!supportsLinking) {
    return {
      supportsLinking,
      isLinked: false,
      label: null,
      message: "Dieser Browser unterstuetzt keine verknuepfbaren Datenordner."
    };
  }

  const handle = await getBrowserLinkedDirectoryHandle("read");
  if (!handle) {
    return {
      supportsLinking,
      isLinked: false,
      label: null,
      message: "Kein Web-Datenordner verknuepft. Waehle den Downloads-Ordner oder direkt ELB_V1_Daten aus."
    };
  }

  const label = getLinkedDirectoryLabel(handle);
  return {
    supportsLinking,
    isLinked: true,
    label,
    message: `Web-Datenordner aktiv: ${label ?? ROOT_DIR}`
  };
}

async function ensureDir(fsModule: FileSystemModule | null, path: string): Promise<void> {
  if (fsModule) {
    await fsModule.mkdir(path, {
      baseDir: getDesktopBaseDir(fsModule),
      recursive: true
    });
    return;
  }

  if (await getBrowserDirectoryHandle(path, { create: true })) {
    return;
  }

  globalThis.localStorage?.setItem(getBrowserStorageKey(`${path}/.dir`), "1");
}

async function writeTextData(fsModule: FileSystemModule | null, path: string, data: string): Promise<void> {
  if (fsModule) {
    await fsModule.writeTextFile(path, data, {
      baseDir: getDesktopBaseDir(fsModule)
    });
    return;
  }

  if (await browserWriteTextData(path, data)) {
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
      baseDir: getDesktopBaseDir(fsModule)
    });
    return;
  }

  if (await browserWriteBinaryData(path, data)) {
    return;
  }

  await indexedDbWrite(path, `base64:${bytesToBase64(data)}`);
}

async function readTextData(fsModule: FileSystemModule | null, path: string): Promise<string | null> {
  if (fsModule) {
    const exists = await fsModule.exists(path, {
      baseDir: getDesktopBaseDir(fsModule)
    });
    if (!exists) {
      return null;
    }

    return fsModule.readTextFile(path, {
      baseDir: getDesktopBaseDir(fsModule)
    });
  }

  const linkedValue = await browserReadTextData(path);
  if (linkedValue !== null) {
    return linkedValue;
  }

  return indexedDbRead(path);
}

async function readBinaryData(fsModule: FileSystemModule | null, path: string): Promise<Uint8Array | null> {
  if (fsModule?.readFile) {
    const exists = await fsModule.exists(path, {
      baseDir: getDesktopBaseDir(fsModule)
    });
    if (!exists) {
      return null;
    }

    return fsModule.readFile(path, {
      baseDir: getDesktopBaseDir(fsModule)
    });
  }

  try {
    const fileHandle = await getBrowserFileHandle(path, { create: false });
    if (fileHandle) {
      const file = await fileHandle.getFile();
      return new Uint8Array(await file.arrayBuffer());
    }
  } catch {
    // Fall back to IndexedDB/localStorage below.
  }

  const stored = await indexedDbRead(path);
  if (!stored?.startsWith("base64:")) {
    return null;
  }

  const binary = atob(stored.slice("base64:".length));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
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

function getDossierAssetPath(clerkFolderSegment: string, caseId: string, assetId: string): string {
  return `${getDossierAssetsRoot(clerkFolderSegment, caseId)}/${assetId}.optimized.txt`;
}

function findClerkFolderSegment(masterData: MasterData | null | undefined, clerkId: string): string {
  const clerk = masterData?.clerks.find((item) => item.id === clerkId);
  return getClerkFolderSegment(clerk?.name, clerkId);
}

async function resolveClerkFolderSegment(
  fsModule: FileSystemModule | null,
  clerkId: string,
  masterData?: MasterData | null
): Promise<string> {
  if (masterData) {
    return findClerkFolderSegment(masterData, clerkId);
  }

  const persistedMasterData = await readJsonFile<MasterData>(fsModule, MASTER_DATA_FILE);
  return findClerkFolderSegment(persistedMasterData, clerkId);
}

export function getClerkDataDirectoryRelativePath(clerkId: string, masterData: MasterData): string {
  return `Sachbearbeiter/${findClerkFolderSegment(masterData, clerkId)}`;
}

async function listDirectoryEntries(fsModule: FileSystemModule | null, path: string): Promise<Array<{ name: string; isFile: boolean; isDirectory: boolean }>> {
  if (fsModule?.readDir) {
    const exists = await fsModule.exists(path, {
      baseDir: getDesktopBaseDir(fsModule)
    });
    if (!exists) {
      return [];
    }

    const entries = await fsModule.readDir(path, {
      baseDir: getDesktopBaseDir(fsModule)
    });

    return entries.map((entry) => ({
      name: entry.name,
      isFile: Boolean(entry.isFile),
      isDirectory: Boolean(entry.isDirectory)
    }));
  }

  const directoryHandle = await getBrowserDirectoryHandle(path);
  if (!directoryHandle || typeof directoryHandle.values !== "function") {
    return [];
  }

  const entries: Array<{ name: string; isFile: boolean; isDirectory: boolean }> = [];

  for await (const entry of directoryHandle.values()) {
    const handle = entry as BrowserDirectoryEntryHandle;
    entries.push({
      name: handle.name ?? "",
      isFile: handle.kind === "file",
      isDirectory: handle.kind === "directory"
    });
  }

  return entries;
}

async function resolveAssetPayload(fsModule: FileSystemModule | null, value: string): Promise<string> {
  if (!isStoredRef(value)) {
    return value;
  }

  const stored = await readTextData(fsModule, fromStoredRef(value));
  return stored ?? "";
}

async function persistCaseAssetsForDossier(fsModule: FileSystemModule | null, clerkFolderSegment: string, caseFile: CaseFile): Promise<CaseFile> {
  const assets = await Promise.all(
    caseFile.assets.map(async (asset) => {
      const optimizedPayload = await resolveAssetPayload(fsModule, asset.optimizedPath || asset.originalPath);
      const storedPath = getDossierAssetPath(clerkFolderSegment, caseFile.meta.id, asset.id);

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
  session: ClerkSessionStorage,
  masterData: MasterData
): Promise<void> {
  const clerkFolderSegment = findClerkFolderSegment(masterData, clerkId);
  await ensureDir(fsModule, getCurrentRoot(clerkFolderSegment));
  await ensureDir(fsModule, getDossiersRoot(clerkFolderSegment));

  await writeJsonFile(fsModule, getCurrentPointerFile(clerkFolderSegment), {
    caseId: session.currentCase?.meta.id ?? null,
    savedAt: session.savedAt
  } satisfies CurrentDossierPointerStorage);

  await Promise.all(
    [session.currentCase, ...session.drafts, ...session.finalized]
      .filter((caseFile): caseFile is CaseFile => Boolean(caseFile))
      .map(async (caseFile) => {
        await ensureDir(fsModule, getDossierRoot(clerkFolderSegment, caseFile.meta.id));
        await ensureDir(fsModule, getDossierAssetsRoot(clerkFolderSegment, caseFile.meta.id));
        await ensureDir(fsModule, getDossierPreviewRoot(clerkFolderSegment, caseFile.meta.id));

        const persistedCaseFile = await persistCaseAssetsForDossier(fsModule, clerkFolderSegment, caseFile);
        await writeJsonFile(fsModule, getDossierFile(clerkFolderSegment, caseFile.meta.id), persistedCaseFile);
      })
  );
}

async function loadClerkSession(fsModule: FileSystemModule | null, clerkId: string, masterData: MasterData): Promise<ClerkSessionStorage | null> {
  const clerkFolderSegment = findClerkFolderSegment(masterData, clerkId);
  const dossierEntries = await listDirectoryEntries(fsModule, getDossiersRoot(clerkFolderSegment));
  const pointer = await readJsonFile<CurrentDossierPointerStorage>(fsModule, getCurrentPointerFile(clerkFolderSegment));
  if (!dossierEntries.length && !pointer?.caseId) {
    return null;
  }

  const cases = await Promise.all(
    dossierEntries
      .filter((entry) => entry.isDirectory && entry.name.trim())
      .map(async (entry) => {
        const storedCase = await readJsonFile<CaseFile>(fsModule, getDossierFile(clerkFolderSegment, entry.name.trim()));
        return storedCase ? hydrateCaseAssets(fsModule, storedCase) : null;
      })
  );

  const hydratedCases = cases.filter((caseFile): caseFile is CaseFile => Boolean(caseFile));
  const currentCase = pointer?.caseId ? hydratedCases.find((caseFile) => caseFile.meta.id === pointer.caseId) ?? null : null;
  const remainingCases = hydratedCases.filter((caseFile) => caseFile.meta.id !== currentCase?.meta.id);

  return {
    currentCase,
    drafts: remainingCases.filter((caseFile) => caseFile.meta.status !== "finalized"),
    finalized: remainingCases.filter((caseFile) => caseFile.meta.status === "finalized"),
    savedAt: pointer?.savedAt ?? new Date().toISOString()
  };
}

function buildClerkSessionSnapshot(snapshot: AppStorageSnapshot, clerkId: string): ClerkSessionStorage {
  const allCasesForClerk = [snapshot.currentCase, ...snapshot.drafts, ...snapshot.finalized]
    .filter((caseFile): caseFile is CaseFile => Boolean(caseFile))
    .filter((caseFile) => caseFile.meta.clerkId === clerkId);
  const currentCaseId = snapshot.currentDossierIdByClerk[clerkId]
    ?? (snapshot.currentCase?.meta.clerkId === clerkId ? snapshot.currentCase.meta.id : null);
  const currentCase = currentCaseId
    ? allCasesForClerk.find((caseFile) => caseFile.meta.id === currentCaseId) ?? null
    : null;
  const remainingCases = allCasesForClerk.filter((caseFile) => caseFile.meta.id !== currentCase?.meta.id);

  return {
    currentCase,
    drafts: remainingCases.filter((caseFile) => caseFile.meta.status !== "finalized"),
    finalized: remainingCases.filter((caseFile) => caseFile.meta.status === "finalized"),
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

async function getNextExchangeVersion(fsModule: FileSystemModule | null, clerkId: string, exchangeBaseName: string): Promise<number> {
  const clerkFolderSegment = await resolveClerkFolderSegment(fsModule, clerkId);
  const indexFile = getExchangeIndexFile(clerkFolderSegment);
  const currentIndex = (await readJsonFile<ExchangeIndexStorage>(fsModule, indexFile)) ?? { nextVersionByBaseName: {} };
  const nextVersion = currentIndex.nextVersionByBaseName[exchangeBaseName] ?? 1;

  await ensureDir(fsModule, getClerkRoot(clerkFolderSegment));
  await ensureDir(fsModule, getExchangeRoot(clerkFolderSegment));
  await writeJsonFile(fsModule, indexFile, {
    nextVersionByBaseName: {
      ...currentIndex.nextVersionByBaseName,
      [exchangeBaseName]: nextVersion + 1
    }
  } satisfies ExchangeIndexStorage);

  return nextVersion;
}

function getExchangeZipFileName(caseFile: CaseFile, version: number): string {
  return `${buildExchangeBaseName(caseFile.consignor, caseFile.meta.receiptNumber)}_v${version}.zip`;
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
      session: await loadClerkSession(fsModule, clerk.id, masterData)
    }))
  );

  const drafts: CaseFile[] = [];
  const finalized: CaseFile[] = [];
  const currentDossierIdByClerk: Record<string, string | null> = {};
  let currentCase: CaseFile | null = null;

  clerkSessions.forEach(({ clerkId, session }) => {
    if (!session) {
      return;
    }

    currentDossierIdByClerk[clerkId] = session.currentCase?.meta.id ?? null;

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
    currentDossierIdByClerk,
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
      await persistClerkSession(fsModule, clerkId, buildClerkSessionSnapshot(snapshot, clerkId), snapshot.masterData);
    })
  );
}

export async function persistCaseAssetImmediately(caseFile: CaseFile, asset: Asset): Promise<Asset> {
  const fsModule = await loadTauriFs();
  const clerkId = caseFile.meta.clerkId;
  const clerkFolderSegment = await resolveClerkFolderSegment(fsModule, clerkId);
  const optimizedPayload = await resolveAssetPayload(fsModule, asset.optimizedPath || asset.originalPath);

  await ensureDir(fsModule, ROOT_DIR);
  await ensureDir(fsModule, CLERKS_ROOT);
  await ensureDir(fsModule, getClerkRoot(clerkFolderSegment));
  await ensureDir(fsModule, getDossierRoot(clerkFolderSegment, caseFile.meta.id));
  await ensureDir(fsModule, getDossierAssetsRoot(clerkFolderSegment, caseFile.meta.id));
  await writeTextData(fsModule, getDossierAssetPath(clerkFolderSegment, caseFile.meta.id, asset.id), optimizedPayload);

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
}): Promise<{ exchangeZipPath: string }> {
  const fsModule = await loadTauriFs();
  const clerkId = args.caseFile.meta.clerkId;
  const clerkFolderSegment = await resolveClerkFolderSegment(fsModule, clerkId);
  const exchangeBaseName = buildExchangeBaseName(args.caseFile.consignor, args.caseFile.meta.receiptNumber);
  const version = await getNextExchangeVersion(fsModule, clerkId, args.caseFile.meta.receiptNumber.trim() || exchangeBaseName);
  const exchangeZipPath = getExchangeZipPath(clerkFolderSegment, getExchangeZipFileName(args.caseFile, version));

  await ensureDir(fsModule, ROOT_DIR);
  await ensureDir(fsModule, CLERKS_ROOT);
  await ensureDir(fsModule, getClerkRoot(clerkFolderSegment));
  await ensureDir(fsModule, getExchangeRoot(clerkFolderSegment));

  await writeBinaryData(fsModule, exchangeZipPath, await toBytes(args.zipContent));

  return {
    exchangeZipPath
  };
}

export async function persistGeneratedPdfToDisk(args: {
  caseFile: CaseFile;
  fileName: string;
  pdfContent: Blob | ArrayBuffer | Uint8Array;
}): Promise<string> {
  const fsModule = await loadTauriFs();
  const clerkId = args.caseFile.meta.clerkId;
  const clerkFolderSegment = await resolveClerkFolderSegment(fsModule, clerkId);
  const previewRoot = getDossierPreviewRoot(clerkFolderSegment, args.caseFile.meta.id);
  const parsedFileName = splitFileName(args.fileName);
  const targetPath = `${previewRoot}/${parsedFileName.name}-${createTimestampSegment()}${parsedFileName.extension}`;

  await ensureDir(fsModule, ROOT_DIR);
  await ensureDir(fsModule, CLERKS_ROOT);
  await ensureDir(fsModule, getClerkRoot(clerkFolderSegment));
  await ensureDir(fsModule, getDossierRoot(clerkFolderSegment, args.caseFile.meta.id));
  await ensureDir(fsModule, previewRoot);
  await writeBinaryData(fsModule, targetPath, await toBytes(args.pdfContent));

  return targetPath;
}

export async function listStoredExchangeZipFiles(args: {
  masterData: MasterData;
}): Promise<StoredExchangeZipFile[]> {
  const fsModule = await loadTauriFs();
  const clerkRootEntries = await listDirectoryEntries(fsModule, CLERKS_ROOT);
  const clerkFolders = clerkRootEntries
    .filter((entry) => entry.isDirectory && entry.name.trim())
    .map((entry) => entry.name.trim());

  const filesByClerk = await Promise.all(
    clerkFolders.map(async (clerkFolderSegment) => {
      const exchangeRoot = getExchangeRoot(clerkFolderSegment);
      const entries = await listDirectoryEntries(fsModule, exchangeRoot);
      const matchingClerk = args.masterData.clerks.find((clerk) => findClerkFolderSegment(args.masterData, clerk.id) === clerkFolderSegment);
      const clerkLabel = matchingClerk?.name ?? clerkFolderSegment.replaceAll("_", " ");

      return entries
        .filter((entry) => entry.isFile && entry.name.toLowerCase().endsWith(".zip"))
        .map((entry) => ({
          id: getStoredExchangeZipId(clerkFolderSegment, entry.name),
          fileName: entry.name,
          label: `${clerkLabel} · ${entry.name}`
        }));
    })
  );

  return filesByClerk
    .flat()
    .sort((left, right) => right.fileName.localeCompare(left.fileName, "de-CH", { numeric: true, sensitivity: "base" }));
}

export async function readStoredExchangeZipFile(args: {
  masterData: MasterData;
  zipId: string;
}): Promise<{ fileName: string; content: Uint8Array } | null> {
  const fsModule = await loadTauriFs();
  const storedZip = parseStoredExchangeZipId(args.zipId);
  if (!storedZip) {
    return null;
  }

  const zipPath = getExchangeZipPath(storedZip.clerkFolderSegment, storedZip.fileName);
  const content = await readBinaryData(fsModule, zipPath);

  if (!content) {
    return null;
  }

  return {
    fileName: storedZip.fileName,
    content
  };
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
