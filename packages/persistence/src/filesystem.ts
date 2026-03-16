import { buildFolderName, type CaseFile } from "@elb/domain/index";
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

function getBrowserStorageKey(path: string): string {
  return `elb.v1.fs.${path}`;
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

async function writeJsonFile<T>(fsModule: FileSystemModule | null, path: string, value: T): Promise<void> {
  const serialized = JSON.stringify(value, null, 2);
  if (fsModule) {
    await fsModule.writeTextFile(path, serialized, {
      baseDir: fsModule.BaseDirectory.AppLocalData
    });
    return;
  }

  globalThis.localStorage?.setItem(getBrowserStorageKey(path), serialized);
}

async function readJsonFile<T>(fsModule: FileSystemModule | null, path: string): Promise<T | null> {
  if (fsModule) {
    const exists = await fsModule.exists(path, {
      baseDir: fsModule.BaseDirectory.AppLocalData
    });
    if (!exists) {
      return null;
    }

    const raw = await fsModule.readTextFile(path, {
      baseDir: fsModule.BaseDirectory.AppLocalData
    });
    return JSON.parse(raw) as T;
  }

  const raw = globalThis.localStorage?.getItem(getBrowserStorageKey(path));
  return raw ? (JSON.parse(raw) as T) : null;
}

function getCaseFolder(caseFile: CaseFile): string {
  return `${ROOT_DIR}/cases/${buildFolderName(caseFile.consignor.lastName, caseFile.consignor.firstName, caseFile.meta.receiptNumber)}`;
}

export async function hydrateSnapshotFromDisk(): Promise<AppStorageSnapshot | null> {
  const fsModule = await loadTauriFs();
  return readJsonFile<AppStorageSnapshot>(fsModule, SNAPSHOT_FILE);
}

export async function persistSnapshotToDisk(snapshot: AppStorageSnapshot): Promise<void> {
  const fsModule = await loadTauriFs();

  await ensureDir(fsModule, ROOT_DIR);
  await ensureDir(fsModule, `${ROOT_DIR}/master-data`);
  await ensureDir(fsModule, `${ROOT_DIR}/cases`);
  await ensureDir(fsModule, `${ROOT_DIR}/archive`);

  for (const caseFile of [...snapshot.drafts, ...snapshot.finalized]) {
    const caseFolder = getCaseFolder(caseFile);
    await ensureDir(fsModule, caseFolder);
    await ensureDir(fsModule, `${caseFolder}/images`);
    await ensureDir(fsModule, `${caseFolder}/exports`);
    await writeJsonFile(fsModule, `${caseFolder}/payload.json`, caseFile);
  }

  await writeJsonFile(fsModule, MASTER_DATA_FILE, snapshot.masterData);
  await writeJsonFile(fsModule, SNAPSHOT_FILE, snapshot);
}
