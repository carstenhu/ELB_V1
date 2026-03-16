import { buildFolderName } from "@elb/domain/index";
const ROOT_DIR = "elb-v1-data";
const SNAPSHOT_FILE = `${ROOT_DIR}/snapshot.json`;
const MASTER_DATA_FILE = `${ROOT_DIR}/master-data/master-data.json`;
function getBrowserStorageKey(path) {
    return `elb.v1.fs.${path}`;
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
async function writeJsonFile(fsModule, path, value) {
    const serialized = JSON.stringify(value, null, 2);
    if (fsModule) {
        await fsModule.writeTextFile(path, serialized, {
            baseDir: fsModule.BaseDirectory.AppLocalData
        });
        return;
    }
    globalThis.localStorage?.setItem(getBrowserStorageKey(path), serialized);
}
async function readJsonFile(fsModule, path) {
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
        return JSON.parse(raw);
    }
    const raw = globalThis.localStorage?.getItem(getBrowserStorageKey(path));
    return raw ? JSON.parse(raw) : null;
}
function getCaseFolder(caseFile) {
    return `${ROOT_DIR}/cases/${buildFolderName(caseFile.consignor.lastName, caseFile.consignor.firstName, caseFile.meta.receiptNumber)}`;
}
export async function hydrateSnapshotFromDisk() {
    const fsModule = await loadTauriFs();
    return readJsonFile(fsModule, SNAPSHOT_FILE);
}
export async function persistSnapshotToDisk(snapshot) {
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
