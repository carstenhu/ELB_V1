import { buildFolderName } from "@elb/domain/index";
const ROOT_DIR = "elb-v1-data";
const SNAPSHOT_FILE = `${ROOT_DIR}/snapshot.json`;
const MASTER_DATA_FILE = `${ROOT_DIR}/master-data/master-data.json`;
const ASSET_REF_PREFIX = "stored://";
const INDEXED_DB_NAME = "elb-v1-storage";
const INDEXED_DB_STORE = "files";
function getBrowserStorageKey(path) {
    return `elb.v1.fs.${path}`;
}
function toStoredRef(path) {
    return `${ASSET_REF_PREFIX}${path}`;
}
function isStoredRef(path) {
    return path.startsWith(ASSET_REF_PREFIX);
}
function fromStoredRef(path) {
    return path.slice(ASSET_REF_PREFIX.length);
}
function getCaseFolder(caseFile) {
    return `${ROOT_DIR}/cases/${buildFolderName(caseFile.consignor.lastName, caseFile.consignor.firstName, caseFile.meta.receiptNumber)}`;
}
async function loadTauriFs() {
    const tauriFlag = Reflect.get(globalThis, "__TAURI_INTERNALS__");
    if (!tauriFlag) {
        return null;
    }
    try {
        return (await import("@tauri-apps/plugin-fs"));
    }
    catch {
        return null;
    }
}
function openIndexedDb() {
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
async function indexedDbWrite(path, value) {
    const database = await openIndexedDb();
    if (!database) {
        globalThis.localStorage?.setItem(getBrowserStorageKey(path), value);
        return;
    }
    await new Promise((resolve, reject) => {
        const transaction = database.transaction(INDEXED_DB_STORE, "readwrite");
        const store = transaction.objectStore(INDEXED_DB_STORE);
        store.put(value, path);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}
async function indexedDbRead(path) {
    const database = await openIndexedDb();
    if (!database) {
        return globalThis.localStorage?.getItem(getBrowserStorageKey(path)) ?? null;
    }
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(INDEXED_DB_STORE, "readonly");
        const store = transaction.objectStore(INDEXED_DB_STORE);
        const request = store.get(path);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
    });
}
async function ensureDir(fsModule, path) {
    if (fsModule) {
        await fsModule.mkdir(path, {
            baseDir: fsModule.BaseDirectory.AppLocalData,
            recursive: true
        });
        return;
    }
    globalThis.localStorage?.setItem(getBrowserStorageKey(`${path}/.dir`), "1");
}
async function writeTextData(fsModule, path, data) {
    if (fsModule) {
        await fsModule.writeTextFile(path, data, {
            baseDir: fsModule.BaseDirectory.AppLocalData
        });
        return;
    }
    await indexedDbWrite(path, data);
}
async function readTextData(fsModule, path) {
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
async function writeJsonFile(fsModule, path, value) {
    await writeTextData(fsModule, path, JSON.stringify(value, null, 2));
}
async function readJsonFile(fsModule, path) {
    const raw = await readTextData(fsModule, path);
    return raw ? JSON.parse(raw) : null;
}
function getAssetStoragePaths(caseFolder, assetId) {
    return {
        originalPath: `${caseFolder}/images/${assetId}.original.txt`,
        optimizedPath: `${caseFolder}/images/${assetId}.optimized.txt`
    };
}
async function resolveAssetPayload(fsModule, value) {
    if (!isStoredRef(value)) {
        return value;
    }
    const stored = await readTextData(fsModule, fromStoredRef(value));
    return stored ?? "";
}
async function persistCaseAssets(fsModule, caseFile) {
    const caseFolder = getCaseFolder(caseFile);
    const assets = await Promise.all(caseFile.assets.map(async (asset) => {
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
    }));
    return {
        ...caseFile,
        assets
    };
}
async function hydrateCaseAssets(fsModule, caseFile) {
    const assets = await Promise.all(caseFile.assets.map(async (asset) => ({
        ...asset,
        originalPath: await resolveAssetPayload(fsModule, asset.originalPath),
        optimizedPath: await resolveAssetPayload(fsModule, asset.optimizedPath)
    })));
    return {
        ...caseFile,
        assets
    };
}
async function serializeSnapshot(snapshot, fsModule) {
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
async function hydrateSnapshot(snapshot, fsModule) {
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
export async function hydrateSnapshotFromDisk() {
    const fsModule = await loadTauriFs();
    const snapshot = await readJsonFile(fsModule, SNAPSHOT_FILE);
    if (!snapshot) {
        return null;
    }
    return hydrateSnapshot(snapshot, fsModule);
}
export async function persistSnapshotToDisk(snapshot) {
    const fsModule = await loadTauriFs();
    await ensureDir(fsModule, ROOT_DIR);
    await ensureDir(fsModule, `${ROOT_DIR}/master-data`);
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
export async function persistCaseAssetImmediately(caseFile, asset) {
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
