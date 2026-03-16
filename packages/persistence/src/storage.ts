import type { CaseFile, MasterData } from "@elb/domain/index";

export interface AppStorageSnapshot {
  masterData: MasterData;
  activeClerkId: string | null;
  currentCase: CaseFile | null;
  drafts: CaseFile[];
  finalized: CaseFile[];
}

const STORAGE_KEY = "elb.v1.snapshot";

export function loadSnapshot(): AppStorageSnapshot | null {
  const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AppStorageSnapshot;
  } catch {
    return null;
  }
}

export function saveSnapshot(snapshot: AppStorageSnapshot): void {
  globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

export function clearSnapshot(): void {
  globalThis.localStorage?.removeItem(STORAGE_KEY);
}
