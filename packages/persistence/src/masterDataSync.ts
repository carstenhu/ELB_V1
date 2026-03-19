import { toAppError } from "@elb/app-core/index";
import { masterDataSchema, normalizeMasterData, type MasterData } from "@elb/domain/index";

export interface MasterDataSyncResult {
  masterData: MasterData;
  message: string;
}

export function serializeMasterData(masterData: MasterData): string {
  return JSON.stringify(normalizeMasterData(masterData), null, 2);
}

export function importMasterDataFromJson(jsonText: string): MasterData {
  try {
    return normalizeMasterData(masterDataSchema.parse(JSON.parse(jsonText)));
  } catch (error) {
    throw toAppError(error, "IMPORT_ERROR", "Stammdaten konnten nicht importiert werden.");
  }
}
