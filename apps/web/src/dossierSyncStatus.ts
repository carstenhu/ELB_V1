import type { DossierSyncEntrySnapshot, DossierSyncStatusSnapshot } from "@elb/client-app/platform/platformTypes";
import type { WorkspaceSnapshot } from "@elb/app-core/index";

const listeners = new Set<() => void>();
let snapshot: DossierSyncStatusSnapshot | null = null;
type DossierCacheState = NonNullable<DossierSyncEntrySnapshot["cache"]>;

const DOSSIER_INDEX_KEY = "elb.v1.web.dossier-index";

interface StoredDossierIndexEntry {
  caseId: string;
  clerkId: string;
  updatedAt: string;
}

interface StoredDossierIndex {
  savedAt: string;
  dossiers: StoredDossierIndexEntry[];
}

function emit() {
  listeners.forEach((listener) => listener());
}

function currentOfflineState(): boolean {
  return typeof navigator !== "undefined" ? !navigator.onLine : false;
}

function setSnapshot(nextSnapshot: DossierSyncStatusSnapshot | null) {
  snapshot = nextSnapshot;
  emit();
}

function persistIndex(snapshotToStore: WorkspaceSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  const index: StoredDossierIndex = {
    savedAt: new Date().toISOString(),
    dossiers: snapshotToStore.dossiers.map((caseFile) => ({
      caseId: caseFile.meta.id,
      clerkId: caseFile.meta.clerkId,
      updatedAt: caseFile.meta.updatedAt
    }))
  };

  window.localStorage.setItem(DOSSIER_INDEX_KEY, JSON.stringify(index));
}

function buildEntriesFromSnapshot(
  snapshotToStore: WorkspaceSnapshot,
  state: DossierSyncEntrySnapshot["state"],
  cache: DossierCacheState = "local"
): Record<string, DossierSyncEntrySnapshot> {
  return Object.fromEntries(
    snapshotToStore.dossiers.map((caseFile) => [
      caseFile.meta.id,
      {
        state,
        cache,
        updatedAt: caseFile.meta.updatedAt
      } satisfies DossierSyncEntrySnapshot
    ])
  );
}

function mergeEntries(
  currentEntries: Record<string, DossierSyncEntrySnapshot>,
  nextEntries: Record<string, DossierSyncEntrySnapshot>
): Record<string, DossierSyncEntrySnapshot> {
  return { ...currentEntries, ...nextEntries };
}

function updateOfflineState() {
  if (!snapshot) {
    return;
  }

  setSnapshot({
    ...snapshot,
    offline: currentOfflineState()
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("online", updateOfflineState);
  window.addEventListener("offline", updateOfflineState);
}

export const dossierSyncStatusStore = {
  getSnapshot(): DossierSyncStatusSnapshot | null {
    return snapshot;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  markRemoteLoaded(snapshotToStore: WorkspaceSnapshot) {
    persistIndex(snapshotToStore);
    setSnapshot({
      source: "supabase",
      offline: currentOfflineState(),
      dossiers: buildEntriesFromSnapshot(snapshotToStore, "synced", "local")
    });
  },
  markLocalLoaded(snapshotToStore: WorkspaceSnapshot | null) {
    if (!snapshotToStore) {
      setSnapshot({
        source: "local",
        offline: currentOfflineState(),
        dossiers: {}
      });
      return;
    }

    persistIndex(snapshotToStore);
    setSnapshot({
      source: "local",
      offline: currentOfflineState(),
      dossiers: buildEntriesFromSnapshot(snapshotToStore, "local-only", "local")
    });
  },
  markRemoteSaved(snapshotToStore: WorkspaceSnapshot) {
    persistIndex(snapshotToStore);
    setSnapshot({
      source: "supabase",
      offline: currentOfflineState(),
      dossiers: buildEntriesFromSnapshot(snapshotToStore, "synced", "local")
    });
  },
  markRemoteSaveFailed(snapshotToStore: WorkspaceSnapshot) {
    persistIndex(snapshotToStore);
    const currentEntries = snapshot?.dossiers ?? {};
    const pendingEntries = buildEntriesFromSnapshot(snapshotToStore, currentOfflineState() ? "pending" : "error", "local");
    setSnapshot({
      source: snapshot?.source ?? "local",
      offline: currentOfflineState(),
      dossiers: mergeEntries(currentEntries, pendingEntries)
    });
  }
};
