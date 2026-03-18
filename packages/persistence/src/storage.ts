import type { CaseFile, MasterData } from "@elb/domain/index";

export interface AppStorageSnapshot {
  masterData: MasterData;
  activeClerkId: string | null;
  currentCase: CaseFile | null;
  drafts: CaseFile[];
  finalized: CaseFile[];
}
