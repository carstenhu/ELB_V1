const STORAGE_KEY = "elb.v1.snapshot";
export function loadSnapshot() {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) {
        return null;
    }
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
export function saveSnapshot(snapshot) {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}
export function clearSnapshot() {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
}
