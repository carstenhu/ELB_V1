import { invoke } from "@tauri-apps/api/core";
import { createAuditRepository } from "@elb/persistence/auditRepository";
import {
  persistCaseAssetImmediately,
  persistExportArtifactsToDisk,
  persistGeneratedPdfToDisk
} from "@elb/persistence/filesystem";
import { createWorkspaceRepository } from "@elb/persistence/repository";
import { createLogger } from "@elb/shared/logger";
import type { AppPlatform } from "@elb/client-app/platform/platformTypes";

const logger = createLogger("desktop-platform");

function toError(error: unknown, fallback: string): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string" && error.trim()) {
    return new Error(error);
  }

  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") {
      return new Error(serialized);
    }
  } catch {
    // Ignore serialization failures and use the fallback below.
  }

  return new Error(fallback);
}

export const desktopPlatform: AppPlatform = {
  receiptNumberScope: "desktop",
  workspaceRepository: createWorkspaceRepository(),
  auditSink: createAuditRepository(),
  caseAssets: {
    persistAsset: (caseFile, asset) => persistCaseAssetImmediately(caseFile, asset)
  },
  pdfPreview: {
    open: async (args) => {
      try {
        const relativePath = await persistGeneratedPdfToDisk({
          caseFile: args.caseFile,
          fileName: args.fileName,
          pdfContent: args.pdfContent
        });
        const absolutePath = await invoke<string>("open_app_local_data_path", { relativePath });
        return { message: `PDF wurde lokal gespeichert und geoeffnet: ${absolutePath}` };
      } catch (error) {
        logger.error("Desktop-PDF konnte nicht gespeichert oder geoeffnet werden.", error);
        throw toError(error, "PDF konnte in der Desktop-App nicht gespeichert werden.");
      }
    }
  },
  exportArtifacts: {
    persist: async (args) => {
      try {
        const exportFolder = await persistExportArtifactsToDisk(args);
        return { message: `ZIP wurde lokal gespeichert: ${exportFolder}` };
      } catch (error) {
        logger.error("Desktop-Exportartefakte konnten nicht gespeichert werden.", error);
        throw toError(error, "ZIP konnte in der Desktop-App nicht gespeichert werden.");
      }
    }
  },
  shell: {
    openDataDirectory: () => invoke<string>("open_data_directory")
  }
};
