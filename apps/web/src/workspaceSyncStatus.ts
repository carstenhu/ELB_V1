import type { WorkspaceSyncStatusSnapshot } from "@elb/client-app/platform/platformTypes";

let snapshot: WorkspaceSyncStatusSnapshot | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export const workspaceSyncStatusStore = {
  getSnapshot(): WorkspaceSyncStatusSnapshot | null {
    return snapshot;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  set(nextSnapshot: WorkspaceSyncStatusSnapshot | null) {
    snapshot = nextSnapshot;
    emit();
  }
};
