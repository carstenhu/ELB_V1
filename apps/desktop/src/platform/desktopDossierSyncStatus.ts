import type { DossierSyncEntrySnapshot, DossierSyncStatusSnapshot } from "@elb/client-app/platform/platformTypes";
import type { WorkspaceSnapshot } from "@elb/app-core/index";

const listeners = new Set<() => void>();
let snapshot: DossierSyncStatusSnapshot | null = null;

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

function buildEntries(snapshotToStore: WorkspaceSnapshot, state: DossierSyncEntrySnapshot["state"]): Record<string, DossierSyncEntrySnapshot> {
  return Object.fromEntries(
    snapshotToStore.dossiers.map((caseFile) => [
      caseFile.meta.id,
      {
        state,
        updatedAt: caseFile.meta.updatedAt
      } satisfies DossierSyncEntrySnapshot
    ])
  );
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

export const desktopDossierSyncStatusStore = {
  getSnapshot(): DossierSyncStatusSnapshot | null {
    return snapshot;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
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

    setSnapshot({
      source: "local",
      offline: currentOfflineState(),
      dossiers: buildEntries(snapshotToStore, "local-only")
    });
  },
  markMergedLoaded(args: { localSnapshot: WorkspaceSnapshot | null; remoteSnapshot: WorkspaceSnapshot | null; mergedSnapshot: WorkspaceSnapshot }) {
    const localEntries = args.localSnapshot ? buildEntries(args.localSnapshot, "local-only") : {};
    const remoteEntries = args.remoteSnapshot ? buildEntries(args.remoteSnapshot, "synced") : {};

    setSnapshot({
      source: args.remoteSnapshot ? "supabase" : "local",
      offline: currentOfflineState(),
      dossiers: {
        ...localEntries,
        ...remoteEntries
      }
    });
  },
  markSaved(snapshotToStore: WorkspaceSnapshot) {
    const previousEntries = snapshot?.dossiers ?? {};
    const nextEntries: Record<string, DossierSyncEntrySnapshot> = {};

    snapshotToStore.dossiers.forEach((caseFile) => {
      nextEntries[caseFile.meta.id] = previousEntries[caseFile.meta.id] ?? {
        state: "local-only",
        updatedAt: caseFile.meta.updatedAt
      };
    });

    setSnapshot({
      source: snapshot?.source ?? "local",
      offline: currentOfflineState(),
      dossiers: nextEntries
    });
  }
};

