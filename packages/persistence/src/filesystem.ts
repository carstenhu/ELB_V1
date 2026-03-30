import type { AuditEntry } from "@elb/app-core/index";
import type { Asset, CaseFile, MasterData } from "@elb/domain/index";
import type { AppStorageSnapshot } from "./storage";

interface FileSystemModule {
  BaseDirectory: { Download?: number | string; AppLocalData: number | string };
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
  values?(): AsyncIterable<BrowserDirectoryHandle | BrowserFileHandle>;
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

interface WorkspaceMetaStorage {
  activeClerkId: string | null;
  savedAt: string;
}

interface CurrentDossierPointerStorage {
  caseId: string | null;
  savedAt: string;
}

const ROOT_DIR = "ELB_V1_Daten";
const WORKSPACE_META_FILE = `${ROOT_DIR}/workspace.json`;
const MASTER_DATA_FILE = `${ROOT_DIR}/Stammdaten/master-data.json`;
const AUDIT_FILE = `${ROOT_DIR}/Audit/audit-log.json`;
const CLERKS_ROOT = `${ROOT_DIR}/Sachbearbeiter`;
const DOSSIERS_DIR_NAME = "Dossiers";
const CURRENT_POINTER_FILE_NAME = "current.json";
const DOSSIER_FILE_NAME = "dossier.json";
const ASSET_REF_PREFIX = "stored://";
const INDEXED_DB_NAME = "elb-v1-storage";
const INDEXED_DB_STORE = "files";
const INDEXED_DB_HANDLE_STORE = "handles";
const LINKED_DIRECTORY_HANDLE_KEY = "linked-directory-handle";

function getClerkFolderSegment(name: string | null | undefined, clerkId: string): string {
  const normalizedName = (name ?? "").trim().replaceAll(/\s+/g, "_");
  return normalizedName || clerkId.trim() || "unassigned";
}

function getClerkRoot(clerkFolderSegment: string): string {
  return `${CLERKS_ROOT}/${clerkFolderSegment}`;
}

function getCurrentPointerFile(clerkFolderSegment: string): string {
  return `${getClerkRoot(clerkFolderSegment)}/${CURRENT_POINTER_FILE_NAME}`;
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

function getDossierExportsRoot(clerkFolderSegment: string, caseId: string): string {
  return `${getDossierRoot(clerkFolderSegment, caseId)}/exports`;
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
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-").replace("T", "_").replace("Z", "");
}

function splitFileName(fileName: string): { name: string; extension: string } {
  const lastDotIndex = fileName.lastIndexOf(".");
  return lastDotIndex <= 0
    ? { name: fileName, extension: "" }
    : { name: fileName.slice(0, lastDotIndex), extension: fileName.slice(lastDotIndex) };
}

function buildVersionedFileName(fileName: string, version: number): string {
  const parsed = splitFileName(fileName);
  return `${parsed.name}_v${version}${parsed.extension}`;
}

async function findNextExportVersion(fsModule: FileSystemModule | null, exportsRoot: string, baseZipFileName: string): Promise<number> {
  const exportEntries = await listDirectoryEntries(fsModule, exportsRoot);
  if (!exportEntries.length) {
    return 1;
  }

  const parsedBaseName = splitFileName(baseZipFileName).name;
  const versionPattern = new RegExp(`^${parsedBaseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_v(\\d+)\\.zip$`, "i");
  let highestVersion = 0;

  for (const entry of exportEntries) {
    if (!entry.name.trim()) {
      continue;
    }

    if (entry.isFile) {
      const match = entry.name.trim().match(versionPattern);
      if (!match) {
        continue;
      }

      const parsedVersion = Number.parseInt(match[1] ?? "", 10);
      if (Number.isFinite(parsedVersion)) {
        highestVersion = Math.max(highestVersion, parsedVersion);
      }
      continue;
    }

    if (!entry.isDirectory) {
      continue;
    }

    const files = await listDirectoryEntries(fsModule, `${exportsRoot}/${entry.name.trim()}`);
    for (const file of files) {
      if (!file.isFile || !file.name.trim()) {
        continue;
      }

      const match = file.name.trim().match(versionPattern);
      if (!match) {
        continue;
      }

      const parsedVersion = Number.parseInt(match[1] ?? "", 10);
      if (Number.isFinite(parsedVersion)) {
        highestVersion = Math.max(highestVersion, parsedVersion);
      }
    }
  }

  return highestVersion + 1;
}

async function loadTauriFs(): Promise<FileSystemModule | null> {
  if (!Reflect.get(globalThis as object, "__TAURI_INTERNALS__")) {
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

function findClerkFolderSegment(masterData: MasterData | null | undefined, clerkId: string): string {
  const clerk = masterData?.clerks.find((item) => item.id === clerkId);
  return getClerkFolderSegment(clerk?.name, clerkId);
}

async function resolveClerkFolderSegment(fsModule: FileSystemModule | null, clerkId: string, masterData?: MasterData | null): Promise<string> {
  if (masterData) {
    return findClerkFolderSegment(masterData, clerkId);
  }

  const persistedMasterData = await readJsonFile<MasterData>(fsModule, MASTER_DATA_FILE);
  return findClerkFolderSegment(persistedMasterData, clerkId);
}

export function getClerkDataDirectoryRelativePath(clerkId: string, masterData: MasterData): string {
  return `Sachbearbeiter/${findClerkFolderSegment(masterData, clerkId)}`;
}

function getBrowserStorageKey(path: string): string {
  return `elb.v1.fs.${path}`;
}

function getBrowserStoragePath(key: string): string | null {
  return key.startsWith("elb.v1.fs.") ? key.slice("elb.v1.fs.".length) : null;
}

function getLinkedDirectoryLabel(handle: BrowserDirectoryHandle | null): string | null {
  if (!handle) {
    return null;
  }

  return handle.name === ROOT_DIR ? ROOT_DIR : `${handle.name}/${ROOT_DIR}`;
}

function openIndexedDb(): Promise<IDBDatabase | null> {
  if (!("indexedDB" in globalThis)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(INDEXED_DB_NAME, 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(INDEXED_DB_STORE)) database.createObjectStore(INDEXED_DB_STORE);
      if (!database.objectStoreNames.contains(INDEXED_DB_HANDLE_STORE)) database.createObjectStore(INDEXED_DB_HANDLE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function indexedDbPut(storeName: string, key: string, value: unknown): Promise<void> {
  const database = await openIndexedDb();
  if (!database) return;
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function indexedDbGet<T>(storeName: string, key: string): Promise<T | null> {
  const database = await openIndexedDb();
  if (!database) return null;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function indexedDbDelete(storeName: string, key: string): Promise<void> {
  const database = await openIndexedDb();
  if (!database) return;
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(key);
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
    transaction.objectStore(INDEXED_DB_STORE).put(value, path);
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
    const request = transaction.objectStore(INDEXED_DB_STORE).get(path);
    request.onsuccess = () => resolve((request.result as string | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

function getBrowserPathSegments(path: string): string[] {
  return path.replaceAll("\\", "/").split("/").filter(Boolean).filter((segment, index) => !(index === 0 && segment === ROOT_DIR));
}

async function ensureBrowserHandlePermission(handle: BrowserDirectoryHandle, mode: "read" | "readwrite"): Promise<boolean> {
  if (typeof handle.queryPermission === "function") {
    const state = await handle.queryPermission({ mode });
    if (state === "granted") return true;
  }
  if (typeof handle.requestPermission === "function") {
    return (await handle.requestPermission({ mode })) === "granted";
  }
  return true;
}

async function getBrowserLinkedDirectoryHandle(mode: "read" | "readwrite" = "readwrite"): Promise<BrowserDirectoryHandle | null> {
  const storedHandle = await indexedDbGet<BrowserDirectoryHandle>(INDEXED_DB_HANDLE_STORE, LINKED_DIRECTORY_HANDLE_KEY);
  if (!storedHandle) return null;
  return (await ensureBrowserHandlePermission(storedHandle, mode)) ? storedHandle : null;
}

async function getBrowserDirectoryHandle(path: string, options?: { create?: boolean }): Promise<BrowserDirectoryHandle | null> {
  const rootHandle = await getBrowserLinkedDirectoryHandle(options?.create ? "readwrite" : "read");
  if (!rootHandle) return null;

  let currentHandle = rootHandle;
  for (const segment of getBrowserPathSegments(path)) {
    try {
      currentHandle = await currentHandle.getDirectoryHandle(segment, { create: options?.create ?? false });
    } catch {
      if (options?.create) throw new Error(`Der Browser-Datenordner konnte nicht erstellt werden: ${path}`);
      return null;
    }
  }
  return currentHandle;
}

async function getBrowserFileHandle(path: string, options?: { create?: boolean }): Promise<BrowserFileHandle | null> {
  const segments = getBrowserPathSegments(path);
  const fileName = segments.pop();
  if (!fileName) return null;
  const parentPath = segments.length ? `${ROOT_DIR}/${segments.join("/")}` : ROOT_DIR;
  const parentHandle = await getBrowserDirectoryHandle(parentPath, options?.create ? { create: true } : undefined);
  return parentHandle ? parentHandle.getFileHandle(fileName, { create: options?.create ?? false }) : null;
}

async function ensureDir(fsModule: FileSystemModule | null, path: string): Promise<void> {
  if (fsModule) {
    await fsModule.mkdir(path, { baseDir: getDesktopBaseDir(fsModule), recursive: true });
    return;
  }
  if (await getBrowserDirectoryHandle(path, { create: true })) return;
  globalThis.localStorage?.setItem(getBrowserStorageKey(`${path}/.dir`), "1");
}

async function writeTextData(fsModule: FileSystemModule | null, path: string, data: string): Promise<void> {
  if (fsModule) {
    await fsModule.writeTextFile(path, data, { baseDir: getDesktopBaseDir(fsModule) });
    return;
  }
  const fileHandle = await getBrowserFileHandle(path, { create: true });
  if (fileHandle) {
    const writable = await fileHandle.createWritable();
    await writable.write(new Blob([data]));
    await writable.close();
    return;
  }
  await indexedDbWrite(path, data);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary);
}

async function writeBinaryData(fsModule: FileSystemModule | null, path: string, data: Uint8Array): Promise<void> {
  if (fsModule?.writeFile) {
    await fsModule.writeFile(path, data, { baseDir: getDesktopBaseDir(fsModule) });
    return;
  }
  const fileHandle = await getBrowserFileHandle(path, { create: true });
  if (fileHandle) {
    const writable = await fileHandle.createWritable();
    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    await writable.write(new Blob([buffer]));
    await writable.close();
    return;
  }
  await indexedDbWrite(path, `base64:${bytesToBase64(data)}`);
}

async function readTextData(fsModule: FileSystemModule | null, path: string): Promise<string | null> {
  if (fsModule) {
    const exists = await fsModule.exists(path, { baseDir: getDesktopBaseDir(fsModule) });
    return exists ? fsModule.readTextFile(path, { baseDir: getDesktopBaseDir(fsModule) }) : null;
  }
  const fileHandle = await getBrowserFileHandle(path, { create: false });
  if (fileHandle) {
    return (await fileHandle.getFile()).text();
  }
  return indexedDbRead(path);
}

async function readBinaryData(fsModule: FileSystemModule | null, path: string): Promise<Uint8Array | null> {
  if (fsModule?.readFile) {
    const exists = await fsModule.exists(path, { baseDir: getDesktopBaseDir(fsModule) });
    return exists ? fsModule.readFile(path, { baseDir: getDesktopBaseDir(fsModule) }) : null;
  }
  const fileHandle = await getBrowserFileHandle(path, { create: false });
  if (fileHandle) {
    return new Uint8Array(await (await fileHandle.getFile()).arrayBuffer());
  }
  const stored = await indexedDbRead(path);
  if (!stored?.startsWith("base64:")) return null;
  const binary = atob(stored.slice("base64:".length));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function writeJsonFile<T>(fsModule: FileSystemModule | null, path: string, value: T): Promise<void> {
  await writeTextData(fsModule, path, JSON.stringify(value, null, 2));
}

async function readJsonFile<T>(fsModule: FileSystemModule | null, path: string): Promise<T | null> {
  const raw = await readTextData(fsModule, path);
  return raw ? (JSON.parse(raw) as T) : null;
}

async function toBytes(content: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  return new Uint8Array(await content.arrayBuffer());
}

export async function linkBrowserDataDirectory(): Promise<{ label: string; message: string }> {
  const picker = Reflect.get(globalThis, "showDirectoryPicker") as (() => Promise<BrowserDirectoryHandle>) | undefined;
  if (typeof picker !== "function") {
    throw new Error("Dieser Browser unterstuetzt keine verknuepfbaren Datenordner.");
  }

  const selectedHandle = await picker();
  const rootHandle = selectedHandle.name === ROOT_DIR ? selectedHandle : await selectedHandle.getDirectoryHandle(ROOT_DIR, { create: true });
  if (!(await ensureBrowserHandlePermission(rootHandle, "readwrite"))) {
    throw new Error("Der Datenordner konnte nicht mit Schreibrechten verknuepft werden.");
  }

  await indexedDbPut(INDEXED_DB_HANDLE_STORE, LINKED_DIRECTORY_HANDLE_KEY, rootHandle);
  const label = getLinkedDirectoryLabel(rootHandle) ?? ROOT_DIR;
  return { label, message: `Web-Datenordner verknuepft: ${label}` };
}

export async function unlinkBrowserDataDirectory(): Promise<{ message: string }> {
  await indexedDbDelete(INDEXED_DB_HANDLE_STORE, LINKED_DIRECTORY_HANDLE_KEY);
  return { message: "Web-Datenordner-Verknuepfung wurde geloest." };
}

export async function getBrowserDataDirectoryStatus(): Promise<{
  supportsLinking: boolean;
  isLinked: boolean;
  label: string | null;
  message: string;
}> {
  const picker = Reflect.get(globalThis, "showDirectoryPicker");
  if (typeof picker !== "function") {
    return { supportsLinking: false, isLinked: false, label: null, message: "Dieser Browser unterstuetzt keine verknuepfbaren Datenordner." };
  }

  const handle = await getBrowserLinkedDirectoryHandle("read");
  if (!handle) {
    return {
      supportsLinking: true,
      isLinked: false,
      label: null,
      message: "Kein Web-Datenordner verknuepft. Waehle den Downloads-Ordner oder direkt ELB_V1_Daten aus."
    };
  }

  const label = getLinkedDirectoryLabel(handle);
  return { supportsLinking: true, isLinked: true, label, message: `Web-Datenordner aktiv: ${label ?? ROOT_DIR}` };
}

function getDossierAssetPath(clerkFolderSegment: string, caseId: string, assetId: string): string {
  return `${getDossierAssetsRoot(clerkFolderSegment, caseId)}/${assetId}.optimized.txt`;
}

async function resolveAssetPayload(fsModule: FileSystemModule | null, value: string): Promise<string> {
  if (!isStoredRef(value)) return value;
  return (await readTextData(fsModule, fromStoredRef(value))) ?? "";
}

async function persistCaseAssetsForDossier(fsModule: FileSystemModule | null, clerkFolderSegment: string, caseFile: CaseFile): Promise<CaseFile> {
  const assets = await Promise.all(caseFile.assets.map(async (asset) => {
    const optimizedPayload = await resolveAssetPayload(fsModule, asset.optimizedPath || asset.originalPath);
    const storedPath = getDossierAssetPath(clerkFolderSegment, caseFile.meta.id, asset.id);
    await ensureDir(fsModule, getDossierAssetsRoot(clerkFolderSegment, caseFile.meta.id));
    await writeTextData(fsModule, storedPath, optimizedPayload);
    return { ...asset, originalPath: toStoredRef(storedPath), optimizedPath: toStoredRef(storedPath) };
  }));
  return { ...caseFile, assets };
}

async function hydrateCaseAssets(fsModule: FileSystemModule | null, caseFile: CaseFile): Promise<CaseFile> {
  const assets = await Promise.all(caseFile.assets.map(async (asset) => {
    const optimizedPayload = await resolveAssetPayload(fsModule, asset.optimizedPath || asset.originalPath);
    return { ...asset, originalPath: optimizedPayload, optimizedPath: optimizedPayload };
  }));
  return { ...caseFile, assets };
}

function dedupeCases(caseFiles: readonly CaseFile[]): CaseFile[] {
  const byId = new Map<string, CaseFile>();
  caseFiles.forEach((caseFile) => byId.set(caseFile.meta.id, caseFile));
  return [...byId.values()];
}

function sortCases(caseFiles: readonly CaseFile[]): CaseFile[] {
  return [...caseFiles].sort((left, right) => right.meta.updatedAt.localeCompare(left.meta.updatedAt, "de-CH", { numeric: true, sensitivity: "base" }));
}

function getAllCasesForClerk(snapshot: AppStorageSnapshot, clerkId: string): CaseFile[] {
  return dedupeCases([snapshot.currentCase, ...snapshot.dossiers].filter((caseFile): caseFile is CaseFile => Boolean(caseFile)).filter((caseFile) => caseFile.meta.clerkId === clerkId));
}

function getRelevantClerkIds(snapshot: AppStorageSnapshot): string[] {
  const ids = new Set<string>();
  snapshot.masterData.clerks.forEach((clerk) => ids.add(clerk.id));
  snapshot.dossiers.forEach((caseFile) => ids.add(caseFile.meta.clerkId));
  if (snapshot.currentCase?.meta.clerkId) ids.add(snapshot.currentCase.meta.clerkId);
  if (snapshot.activeClerkId) ids.add(snapshot.activeClerkId);
  return [...ids];
}

async function persistClerk(snapshot: AppStorageSnapshot, fsModule: FileSystemModule | null, clerkId: string): Promise<void> {
  const clerkFolderSegment = findClerkFolderSegment(snapshot.masterData, clerkId);
  const currentCaseId = snapshot.currentDossierIdByClerk[clerkId] ?? (snapshot.currentCase?.meta.clerkId === clerkId ? snapshot.currentCase.meta.id : null);
  const clerkCases = getAllCasesForClerk(snapshot, clerkId);
  await ensureDir(fsModule, getClerkRoot(clerkFolderSegment));
  await ensureDir(fsModule, getDossiersRoot(clerkFolderSegment));
  await writeJsonFile(fsModule, getCurrentPointerFile(clerkFolderSegment), { caseId: currentCaseId, savedAt: new Date().toISOString() } satisfies CurrentDossierPointerStorage);
  await Promise.all(clerkCases.map(async (caseFile) => {
    await ensureDir(fsModule, getDossierRoot(clerkFolderSegment, caseFile.meta.id));
    await ensureDir(fsModule, getDossierPreviewRoot(clerkFolderSegment, caseFile.meta.id));
    await ensureDir(fsModule, getDossierExportsRoot(clerkFolderSegment, caseFile.meta.id));
    const persistedCaseFile = await persistCaseAssetsForDossier(fsModule, clerkFolderSegment, caseFile);
    await writeJsonFile(fsModule, getDossierFile(clerkFolderSegment, caseFile.meta.id), persistedCaseFile);
  }));
}

async function listDirectoryEntries(fsModule: FileSystemModule | null, path: string): Promise<Array<{ name: string; isFile: boolean; isDirectory: boolean }>> {
  if (fsModule?.readDir) {
    const exists = await fsModule.exists(path, { baseDir: getDesktopBaseDir(fsModule) });
    if (!exists) return [];
    const entries = await fsModule.readDir(path, { baseDir: getDesktopBaseDir(fsModule) });
    return entries.map((entry) => ({ name: entry.name, isFile: Boolean(entry.isFile), isDirectory: Boolean(entry.isDirectory) }));
  }

  const directoryHandle = await getBrowserDirectoryHandle(path);
  if (directoryHandle && typeof directoryHandle.values === "function") {
    const entries: Array<{ name: string; isFile: boolean; isDirectory: boolean }> = [];
    for await (const entry of directoryHandle.values()) {
      entries.push({ name: entry.name ?? "", isFile: entry.kind === "file", isDirectory: entry.kind === "directory" });
    }
    return entries;
  }

  const normalizedPath = path.replaceAll("\\", "/").replace(/\/+$/, "");
  const prefix = `${normalizedPath}/`;
  const collected = new Map<string, { name: string; isFile: boolean; isDirectory: boolean }>();

  const rememberEntry = (name: string, nextPath: string, isDirectoryHint: boolean) => {
    if (!name) return;
    const existing = collected.get(name);
    const isDirectory = isDirectoryHint || nextPath.includes("/");
    collected.set(name, {
      name,
      isFile: existing?.isFile ?? !isDirectory,
      isDirectory: existing?.isDirectory ?? isDirectory
    });
  };

  const localStorageRef = globalThis.localStorage;
  if (!localStorageRef) {
    return [];
  }

  for (let index = 0; index < localStorageRef.length; index += 1) {
    const storageKey = localStorageRef.key(index);
    if (!storageKey) continue;
    const storedPath = getBrowserStoragePath(storageKey);
    if (!storedPath?.startsWith(prefix)) continue;
    const remainder = storedPath.slice(prefix.length);
    if (!remainder) continue;
    const isDirectoryMarker = remainder.endsWith("/.dir");
    const cleanRemainder = isDirectoryMarker ? remainder.slice(0, -"/.dir".length) : remainder;
    if (!cleanRemainder) continue;
    const [name, ...rest] = cleanRemainder.split("/");
    if (!name) continue;
    rememberEntry(name, rest.join("/"), isDirectoryMarker || rest.length > 0);
  }

  return [...collected.values()];
}

async function loadClerkDossiers(fsModule: FileSystemModule | null, clerkId: string, masterData: MasterData): Promise<{ currentCaseId: string | null; dossiers: CaseFile[] } | null> {
  const clerkFolderSegment = findClerkFolderSegment(masterData, clerkId);
  const pointer = await readJsonFile<CurrentDossierPointerStorage>(fsModule, getCurrentPointerFile(clerkFolderSegment));
  const dossierEntries = await listDirectoryEntries(fsModule, getDossiersRoot(clerkFolderSegment));
  if (!pointer && !dossierEntries.length) return null;

  const dossiers = await Promise.all(dossierEntries.filter((entry) => entry.isDirectory && entry.name.trim()).map(async (entry) => {
    const storedCase = await readJsonFile<CaseFile>(fsModule, getDossierFile(clerkFolderSegment, entry.name.trim()));
    return storedCase ? hydrateCaseAssets(fsModule, storedCase) : null;
  }));

  return { currentCaseId: pointer?.caseId ?? null, dossiers: dossiers.filter((caseFile): caseFile is CaseFile => Boolean(caseFile)) };
}

export async function hydrateSnapshotFromDisk(): Promise<AppStorageSnapshot | null> {
  const fsModule = await loadTauriFs();
  const masterData = await readJsonFile<MasterData>(fsModule, MASTER_DATA_FILE);
  if (!masterData) return null;

  const workspaceMeta = await readJsonFile<WorkspaceMetaStorage>(fsModule, WORKSPACE_META_FILE);
  const loadedByClerk = await Promise.all(masterData.clerks.map(async (clerk) => ({ clerkId: clerk.id, loaded: await loadClerkDossiers(fsModule, clerk.id, masterData) })));
  const currentDossierIdByClerk: Record<string, string | null> = {};
  const dossiers: CaseFile[] = [];

  loadedByClerk.forEach(({ clerkId, loaded }) => {
    if (!loaded) return;
    currentDossierIdByClerk[clerkId] = loaded.currentCaseId;
    dossiers.push(...loaded.dossiers);
  });

  const sortedDossiers = sortCases(dedupeCases(dossiers));
  const activeClerkId = workspaceMeta?.activeClerkId ?? null;
  const activeCurrentId = activeClerkId ? currentDossierIdByClerk[activeClerkId] : null;
  const currentCase = activeCurrentId
    ? sortedDossiers.find((caseFile) => caseFile.meta.id === activeCurrentId) ?? null
    : activeClerkId
      ? sortedDossiers.find((caseFile) => caseFile.meta.clerkId === activeClerkId) ?? null
      : null;

  return { masterData, activeClerkId, currentCase, currentDossierIdByClerk, dossiers: sortedDossiers };
}

export async function persistMasterDataToDisk(masterData: MasterData): Promise<void> {
  const fsModule = await loadTauriFs();
  await ensureDir(fsModule, ROOT_DIR);
  await ensureDir(fsModule, `${ROOT_DIR}/Stammdaten`);
  await writeJsonFile(fsModule, MASTER_DATA_FILE, masterData);
}

export async function persistSnapshotToDisk(snapshot: AppStorageSnapshot): Promise<void> {
  const fsModule = await loadTauriFs();
  await ensureDir(fsModule, ROOT_DIR);
  await ensureDir(fsModule, `${ROOT_DIR}/Stammdaten`);
  await ensureDir(fsModule, `${ROOT_DIR}/Audit`);
  await ensureDir(fsModule, CLERKS_ROOT);
  await writeJsonFile(fsModule, MASTER_DATA_FILE, snapshot.masterData);
  await writeJsonFile(fsModule, WORKSPACE_META_FILE, { activeClerkId: snapshot.activeClerkId, savedAt: new Date().toISOString() } satisfies WorkspaceMetaStorage);
  await Promise.all(getRelevantClerkIds(snapshot).map((clerkId) => persistClerk(snapshot, fsModule, clerkId)));
}

export async function persistCaseAssetImmediately(caseFile: CaseFile, asset: Asset): Promise<Asset> {
  const fsModule = await loadTauriFs();
  const clerkFolderSegment = await resolveClerkFolderSegment(fsModule, caseFile.meta.clerkId);
  const optimizedPayload = await resolveAssetPayload(fsModule, asset.optimizedPath || asset.originalPath);
  await ensureDir(fsModule, ROOT_DIR);
  await ensureDir(fsModule, CLERKS_ROOT);
  await ensureDir(fsModule, getDossierRoot(clerkFolderSegment, caseFile.meta.id));
  await ensureDir(fsModule, getDossierAssetsRoot(clerkFolderSegment, caseFile.meta.id));
  await writeTextData(fsModule, getDossierAssetPath(clerkFolderSegment, caseFile.meta.id, asset.id), optimizedPayload);
  return { ...asset, originalPath: optimizedPayload, optimizedPath: optimizedPayload };
}

export async function persistGeneratedPdfToDisk(args: {
  caseFile: CaseFile;
  fileName: string;
  pdfContent: Blob | ArrayBuffer | Uint8Array;
}): Promise<string> {
  const fsModule = await loadTauriFs();
  const clerkFolderSegment = await resolveClerkFolderSegment(fsModule, args.caseFile.meta.clerkId);
  const previewRoot = getDossierPreviewRoot(clerkFolderSegment, args.caseFile.meta.id);
  const parsedFileName = splitFileName(args.fileName);
  const targetPath = `${previewRoot}/${parsedFileName.name}-${createTimestampSegment()}${parsedFileName.extension}`;
  await ensureDir(fsModule, ROOT_DIR);
  await ensureDir(fsModule, CLERKS_ROOT);
  await ensureDir(fsModule, getDossierRoot(clerkFolderSegment, args.caseFile.meta.id));
  await ensureDir(fsModule, previewRoot);
  await writeBinaryData(fsModule, targetPath, await toBytes(args.pdfContent));
  return targetPath;
}

export async function persistExportArtifactsToDisk(args: {
  caseFile: CaseFile;
  artifacts: Array<{ fileName: string; content: string | ArrayBuffer | Blob | Uint8Array }>;
  zipFileName: string;
  zipContent: Blob | ArrayBuffer | Uint8Array;
}): Promise<{ savedPath: string }> {
  const fsModule = await loadTauriFs();
  const clerkFolderSegment = await resolveClerkFolderSegment(fsModule, args.caseFile.meta.clerkId);
  const dossierExportsRoot = getDossierExportsRoot(clerkFolderSegment, args.caseFile.meta.id);
  const exportVersion = await findNextExportVersion(fsModule, dossierExportsRoot, args.zipFileName);
  const versionedZipFileName = buildVersionedFileName(args.zipFileName, exportVersion);
  const exportsRoot = `${dossierExportsRoot}/${createTimestampSegment()}`;
  const zipPath = `${exportsRoot}/${versionedZipFileName}`;
  await ensureDir(fsModule, ROOT_DIR);
  await ensureDir(fsModule, CLERKS_ROOT);
  await ensureDir(fsModule, getDossierRoot(clerkFolderSegment, args.caseFile.meta.id));
  await ensureDir(fsModule, dossierExportsRoot);
  await ensureDir(fsModule, exportsRoot);

  await Promise.all(args.artifacts.map(async (artifact) => {
    const targetPath = `${exportsRoot}/${artifact.fileName}`;
    if (typeof artifact.content === "string") {
      await writeTextData(fsModule, targetPath, artifact.content);
    } else {
      await writeBinaryData(fsModule, targetPath, await toBytes(artifact.content));
    }
  }));

  await writeBinaryData(fsModule, zipPath, await toBytes(args.zipContent));
  return { savedPath: zipPath };
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
