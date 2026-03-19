import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readDir, readFile, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { createAuditRepository } from "@elb/persistence/auditRepository";
import { importExchangeFromEntries, importExchangeFromZip, type ExchangeImportEntry } from "@elb/persistence/exchangeImport";
import { importMasterDataFromJson, serializeMasterData } from "@elb/persistence/masterDataSync";
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
  exchangeImport: {
    importFromSelection: async () => {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Austauschordner auswaehlen"
      });

      const selectedPath = Array.isArray(selected) ? selected[0] : selected;
      if (!selectedPath) {
        return null;
      }

      const entries = await collectExchangeEntries(selectedPath, selectedPath);
      const imported = await importExchangeFromEntries(entries);

      return {
        ...imported,
        message: `Austauschordner wurde importiert: ${selectedPath}`
      };
    },
    importFromZipSelection: async () => {
      const selected = await open({
        directory: false,
        multiple: false,
        filters: [{ name: "ZIP", extensions: ["zip"] }],
        title: "Austausch-ZIP auswaehlen"
      });

      const selectedPath = Array.isArray(selected) ? selected[0] : selected;
      if (!selectedPath) {
        return null;
      }

      return {
        ...(await importExchangeFromZip(await readFile(selectedPath))),
        message: `Austausch-ZIP wurde importiert: ${selectedPath}`
      };
    }
  },
  masterDataSync: {
    exportCurrent: async (masterData) => {
      const targetPath = await save({
        defaultPath: "master-data.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
        title: "Stammdaten speichern"
      });

      if (!targetPath) {
        return { message: "Export der Stammdaten wurde abgebrochen." };
      }

      await writeTextFile(targetPath, serializeMasterData(masterData));
      return { message: `Stammdaten wurden gespeichert: ${targetPath}` };
    },
    importFromSelection: async () => {
      const selected = await open({
        directory: false,
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
        title: "Stammdaten-Datei auswaehlen"
      });

      const selectedPath = Array.isArray(selected) ? selected[0] : selected;
      if (!selectedPath) {
        return null;
      }

      return {
        masterData: importMasterDataFromJson(await readTextFile(selectedPath)),
        message: `Stammdaten wurden importiert: ${selectedPath}`
      };
    }
  },
  exportArtifacts: {
    persist: async (args) => {
      try {
        const { exchangeFolder, exchangeZipPath } = await persistExportArtifactsToDisk(args);
        return { message: `Austauschordner wurde lokal gespeichert: ${exchangeFolder}. ZIP wurde erzeugt: ${exchangeZipPath}` };
      } catch (error) {
        logger.error("Desktop-Exportartefakte konnten nicht gespeichert werden.", error);
        throw toError(error, "Austauschordner und ZIP konnten in der Desktop-App nicht gespeichert werden.");
      }
    }
  },
  shell: {
    openDataDirectory: () => invoke<string>("open_data_directory")
  }
};

function normalizePathSegment(value: string): string {
  return value.replaceAll("\\", "/");
}

function getRelativeEntryPath(rootPath: string, entryPath: string): string {
  const normalizedRoot = normalizePathSegment(rootPath).replace(/\/+$/, "");
  const normalizedEntry = normalizePathSegment(entryPath);
  return normalizedEntry.startsWith(`${normalizedRoot}/`) ? normalizedEntry.slice(normalizedRoot.length + 1) : normalizedEntry;
}

function isTextExchangeFile(path: string): boolean {
  return path.toLowerCase().endsWith(".json");
}

async function collectExchangeEntries(currentDirectory: string, rootDirectory: string): Promise<ExchangeImportEntry[]> {
  const directoryEntries = await readDir(currentDirectory);
  const collected: ExchangeImportEntry[] = [];

  for (const entry of directoryEntries) {
    const entryPath = `${currentDirectory}/${entry.name}`;

    if (entry.isDirectory) {
      collected.push(...await collectExchangeEntries(entryPath, rootDirectory));
      continue;
    }

    if (!entry.isFile) {
      continue;
    }

    const relativePath = getRelativeEntryPath(rootDirectory, entryPath);

    if (isTextExchangeFile(relativePath)) {
      collected.push({
        path: relativePath,
        content: await readTextFile(entryPath)
      });
      continue;
    }

    collected.push({
      path: relativePath,
      content: await readFile(entryPath)
    });
  }

  return collected;
}
