import type { WorkspaceRepository, WorkspaceSnapshot } from "@elb/app-core/index";
import { hydrateSnapshotFromDisk, persistSnapshotToDisk } from "./filesystem";

export function createWorkspaceRepository(): WorkspaceRepository {
  return {
    load: () => hydrateSnapshotFromDisk() as Promise<WorkspaceSnapshot | null>,
    save: (snapshot) => persistSnapshotToDisk(snapshot)
  };
}
