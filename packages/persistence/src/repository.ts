import type { WorkspaceRepository, WorkspaceSnapshot } from "@elb/app-core/index";
import type { MasterData } from "@elb/domain/index";
import { hydrateSnapshotFromDisk, persistMasterDataToDisk, persistSnapshotToDisk } from "./filesystem";

export function createWorkspaceRepository(): WorkspaceRepository {
  return {
    load: () => hydrateSnapshotFromDisk() as Promise<WorkspaceSnapshot | null>,
    save: (snapshot) => persistSnapshotToDisk(snapshot)
  };
}

export function createMasterDataRepository(): { save(masterData: MasterData): Promise<void> } {
  return {
    save: (masterData) => persistMasterDataToDisk(masterData)
  };
}
