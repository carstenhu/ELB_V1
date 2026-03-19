import { createAuditRepository } from "@elb/persistence/auditRepository";
import { importExchangeFromEntries, importExchangeFromZip, type ExchangeImportEntry } from "@elb/persistence/exchangeImport";
import { importMasterDataFromJson, serializeMasterData } from "@elb/persistence/masterDataSync";
import {
  getClerkDataDirectoryRelativePath,
  listStoredExchangeZipFiles,
  persistCaseAssetImmediately,
  persistExportArtifactsToDisk,
  persistGeneratedPdfToDisk,
  readStoredExchangeZipFile
} from "@elb/persistence/filesystem";
import { createWorkspaceRepository } from "@elb/persistence/repository";
import { createLogger } from "@elb/shared/logger";
import type { AppPlatform } from "@elb/client-app/platform/platformTypes";
import type { MasterData } from "@elb/domain/index";

const logger = createLogger("desktop-platform");
const DEFAULT_SUPABASE_BUCKET = "elb-v1-data";
const REMOTE_MASTER_DATA_PATH = "Stammdaten/master-data.json";

async function loadTauriCore() {
  const module = await import("@tauri-apps/api/core");
  if (typeof module.invoke !== "function") {
    throw new Error("Tauri Core API ist nicht verfuegbar.");
  }

  return module;
}

async function loadTauriDialog() {
  return import("@tauri-apps/plugin-dialog");
}

async function loadTauriFs() {
  return import("@tauri-apps/plugin-fs");
}

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

function getDesktopSupabaseConfig(): { url: string; key: string; bucket: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim()
    || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
    || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

  if (!url || !key) {
    return null;
  }

  return {
    url,
    key,
    bucket: import.meta.env.VITE_SUPABASE_BUCKET?.trim() || DEFAULT_SUPABASE_BUCKET
  };
}

function buildSupabaseObjectUrl(url: string, bucket: string, path: string): string {
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${url.replace(/\/+$/, "")}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`;
}

async function loadMasterDataFromSupabase(): Promise<MasterData> {
  const config = getDesktopSupabaseConfig();
  if (!config) {
    throw new Error("Supabase ist in der Desktop-App nicht konfiguriert.");
  }

  const response = await fetch(buildSupabaseObjectUrl(config.url, config.bucket, REMOTE_MASTER_DATA_PATH), {
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`
    }
  });

  if (!response.ok) {
    throw new Error(`Supabase-Stammdaten konnten nicht geladen werden (${response.status}).`);
  }

  return importMasterDataFromJson(await response.text());
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
        const { invoke } = await loadTauriCore();
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
      const { open } = await loadTauriDialog();
      const { readDir, readFile, readTextFile } = await loadTauriFs();
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Austauschordner auswaehlen"
      });

      const selectedPath = Array.isArray(selected) ? selected[0] : selected;
      if (!selectedPath) {
        return null;
      }

      const entries = await collectExchangeEntries(readDir, readFile, readTextFile, selectedPath, selectedPath);
      const imported = await importExchangeFromEntries(entries);

      return {
        ...imported,
        message: `Austauschordner wurde importiert: ${selectedPath}`
      };
    },
    importFromZipSelection: async () => {
      const { open } = await loadTauriDialog();
      const { readFile } = await loadTauriFs();
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
    },
    listStoredZipOptions: ({ masterData }) => listStoredExchangeZipFiles({ masterData }),
    importStoredZip: async ({ masterData, zipId }) => {
      const zipFile = await readStoredExchangeZipFile({ masterData, zipId });
      if (!zipFile) {
        return null;
      }

      return {
        ...(await importExchangeFromZip(zipFile.content)),
        message: `Austausch-ZIP wurde geladen: ${zipFile.fileName}`
      };
    }
  },
  masterDataSync: {
    exportCurrent: async (masterData) => {
      const { save } = await loadTauriDialog();
      const { writeTextFile } = await loadTauriFs();
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
      const { open } = await loadTauriDialog();
      const { readTextFile } = await loadTauriFs();
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
    },
    importFromSupabase: async () => ({
      masterData: await loadMasterDataFromSupabase(),
      message: "Stammdaten wurden aus Supabase geladen."
    })
  },
  dataDirectory: {
    getStatus: async () => ({
      supportsLinking: false,
      isLinked: true,
      label: "Downloads/ELB_V1_Daten",
      message: "Die Desktop-App speichert direkt in Downloads/ELB_V1_Daten."
    }),
    link: async () => ({
      supportsLinking: false,
      isLinked: true,
      label: "Downloads/ELB_V1_Daten",
      message: "Die Desktop-App verwendet den Datenordner bereits direkt."
    }),
    unlink: async () => ({
      supportsLinking: false,
      isLinked: true,
      label: "Downloads/ELB_V1_Daten",
      message: "Die Desktop-App verwendet den Datenordner fest in Downloads/ELB_V1_Daten."
    })
  },
  exportArtifacts: {
    persist: async (args) => {
      try {
        const { exchangeZipPath } = await persistExportArtifactsToDisk(args);
        return { message: `ZIP wurde lokal gespeichert: ${exchangeZipPath}` };
      } catch (error) {
        logger.error("Desktop-Exportartefakte konnten nicht gespeichert werden.", error);
        throw toError(error, "ZIP konnte in der Desktop-App nicht gespeichert werden.");
      }
    }
  },
  shell: {
    openDataDirectory: async ({ clerkId, masterData }) => {
      const { invoke } = await loadTauriCore();
      return invoke<string>("open_data_directory", {
        relativePath: getClerkDataDirectoryRelativePath(clerkId, masterData)
      });
    }
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

async function collectExchangeEntries(
  readDir: typeof import("@tauri-apps/plugin-fs").readDir,
  readFile: typeof import("@tauri-apps/plugin-fs").readFile,
  readTextFile: typeof import("@tauri-apps/plugin-fs").readTextFile,
  currentDirectory: string,
  rootDirectory: string
): Promise<ExchangeImportEntry[]> {
  const directoryEntries = await readDir(currentDirectory);
  const collected: ExchangeImportEntry[] = [];

  for (const entry of directoryEntries) {
    const entryPath = `${currentDirectory}/${entry.name}`;

    if (entry.isDirectory) {
      collected.push(...await collectExchangeEntries(readDir, readFile, readTextFile, entryPath, rootDirectory));
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
