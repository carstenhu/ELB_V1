import { createAuditRepository } from "@elb/persistence/auditRepository";
import { importMasterDataFromJson, serializeMasterData } from "@elb/persistence/masterDataSync";
import {
  getClerkDataDirectoryRelativePath,
  persistCaseAssetImmediately,
  persistExportArtifactsToDisk,
  persistGeneratedPdfToDisk
} from "@elb/persistence/filesystem";
import { createMasterDataRepository, createWorkspaceRepository } from "@elb/persistence/repository";
import { createLogger } from "@elb/shared/logger";
import type { AppPlatform } from "@elb/client-app/platform/platformTypes";
import type { MasterData } from "@elb/domain/index";

const logger = createLogger("desktop-platform");
const DEFAULT_SUPABASE_BUCKET = "elb-v1-data";
const REMOTE_MASTER_DATA_PATH = "Stammdaten/master-data.json";
const REMOTE_DOSSIER_EXPORTS_ROOT = "desktop-dossiers";

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
  if (error instanceof Error) return error;
  if (typeof error === "string" && error.trim()) return new Error(error);
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") return new Error(serialized);
  } catch {
    // Ignore serialization failures.
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
  const encodedPath = path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  return `${url.replace(/\/+$/, "")}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`;
}

function sanitizeRemoteSegment(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "unassigned";
}

function buildRemoteExportPath(clerkId: string, caseId: string, zipFileName: string): string {
  return `${REMOTE_DOSSIER_EXPORTS_ROOT}/${sanitizeRemoteSegment(clerkId)}/${sanitizeRemoteSegment(caseId)}/${sanitizeRemoteSegment(zipFileName)}`;
}

async function toBinaryBytes(input: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (input instanceof Blob) return new Uint8Array(await input.arrayBuffer());
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function uploadExportZipToSupabase(args: { clerkId: string; caseId: string; zipFileName: string; zipContent: Blob | ArrayBuffer | Uint8Array }): Promise<string | null> {
  const config = getDesktopSupabaseConfig();
  if (!config) return null;

  const path = buildRemoteExportPath(args.clerkId, args.caseId, args.zipFileName);
  const response = await fetch(buildSupabaseObjectUrl(config.url, config.bucket, path), {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "x-upsert": "true",
      "content-type": "application/zip"
    },
    body: new Blob([toArrayBuffer(await toBinaryBytes(args.zipContent))], { type: "application/zip" })
  });

  if (!response.ok) {
    throw new Error(`Supabase-Upload fuer Dossier-ZIP fehlgeschlagen (${response.status}).`);
  }

  return path;
}

async function loadMasterDataFromSupabase(): Promise<MasterData> {
  const config = getDesktopSupabaseConfig();
  if (!config) throw new Error("Supabase ist in der Desktop-App nicht konfiguriert.");

  const response = await fetch(buildSupabaseObjectUrl(config.url, config.bucket, REMOTE_MASTER_DATA_PATH), {
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}` }
  });

  if (!response.ok) {
    throw new Error(`Supabase-Stammdaten konnten nicht geladen werden (${response.status}).`);
  }

  return importMasterDataFromJson(await response.text());
}

export const desktopPlatform: AppPlatform = {
  receiptNumberScope: "desktop",
  workspaceRepository: createWorkspaceRepository(),
  masterDataRepository: createMasterDataRepository(),
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
  masterDataSync: {
    exportCurrent: async (masterData) => {
      const { save } = await loadTauriDialog();
      const { writeTextFile } = await loadTauriFs();
      const targetPath = await save({
        defaultPath: "master-data.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
        title: "Stammdaten speichern"
      });

      if (!targetPath) return { message: "Export der Stammdaten wurde abgebrochen." };
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
      if (!selectedPath) return null;
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
        const { savedPath } = await persistExportArtifactsToDisk(args);
        const zipFileName = savedPath.split("/").pop() || args.zipFileName;

        try {
          const remoteZipPath = await uploadExportZipToSupabase({
            clerkId: args.caseFile.meta.clerkId,
            caseId: args.caseFile.meta.id,
            zipFileName,
            zipContent: args.zipContent
          });
          return {
            message: remoteZipPath
              ? `Dossierdateien wurden lokal gespeichert: ${savedPath}. Online gespeichert unter: ${remoteZipPath}`
              : `Dossierdateien wurden lokal gespeichert: ${savedPath}`
          };
        } catch (uploadError) {
          logger.warn("Desktop-Dossier-ZIP konnte nicht nach Supabase hochgeladen werden.", uploadError);
          return { message: `Dossierdateien wurden lokal gespeichert: ${savedPath}. Supabase-Upload ist fehlgeschlagen.` };
        }
      } catch (error) {
        logger.error("Desktop-Dossierdateien konnten nicht gespeichert werden.", error);
        throw toError(error, "Dossierdateien konnten in der Desktop-App nicht gespeichert werden.");
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
