import { createAuditRepository } from "@elb/persistence/auditRepository";
import {
  getBrowserDataDirectoryStatus,
  getClerkDataDirectoryRelativePath,
  linkBrowserDataDirectory,
  persistCaseAssetImmediately,
  persistExportArtifactsToDisk,
  persistGeneratedPdfToDisk,
  unlinkBrowserDataDirectory
} from "@elb/persistence/filesystem";
import { importMasterDataFromJson, serializeMasterData } from "@elb/persistence/masterDataSync";
import type { AppPlatform } from "@elb/client-app/platform/platformTypes";
import { createWebWorkspaceRepository } from "./supabaseWorkspaceRepository";
import { workspaceSyncStatusStore } from "./workspaceSyncStatus";

function toBlob(content: Blob | ArrayBuffer | Uint8Array, mimeType?: string): Blob {
  if (content instanceof Blob) {
    return mimeType && content.type !== mimeType ? content.slice(0, content.size, mimeType) : content;
  }
  const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([buffer], mimeType ? { type: mimeType } : undefined);
}

function triggerDownload(fileName: string, content: Blob | ArrayBuffer | Uint8Array, mimeType?: string): void {
  const blob = toBlob(content, mimeType);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function preparePendingWindow(targetWindow: Window | null, title: string, message: string): Window | null {
  if (!targetWindow) return null;
  try {
    targetWindow.document.title = title;
    targetWindow.document.body.innerHTML = `<main style="font-family: sans-serif; padding: 24px;"><h1 style="font-size: 18px;">${title}</h1><p>${message}</p></main>`;
    return targetWindow;
  } catch {
    return null;
  }
}

function completePendingDownload(targetWindow: Window | null, fileName: string, content: Blob | ArrayBuffer | Uint8Array): void {
  const blob = toBlob(content, "application/zip");
  if (!targetWindow) {
    triggerDownload(fileName, blob, "application/zip");
    return;
  }
  const url = URL.createObjectURL(blob);
  try {
    targetWindow.document.title = `Download ${fileName}`;
    targetWindow.document.body.innerHTML = `<main style="font-family: sans-serif; padding: 24px;"><h1 style="font-size: 18px;">Download bereit</h1><p>Falls der Download nicht automatisch startet, nutze den Link unten.</p></main>`;
    const anchor = targetWindow.document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.textContent = `${fileName} herunterladen`;
    anchor.style.display = "inline-block";
    anchor.style.marginTop = "12px";
    targetWindow.document.body.append(anchor);
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    triggerDownload(fileName, blob, "application/zip");
  }
}

async function selectBrowserFile(accept: string): Promise<File | null> {
  return new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.addEventListener("change", () => {
      const file = input.files?.[0] ?? null;
      input.remove();
      resolve(file);
    }, { once: true });
    document.body.append(input);
    input.click();
  });
}

export const webPlatform: AppPlatform = {
  receiptNumberScope: "web",
  workspaceRepository: createWebWorkspaceRepository(),
  workspaceSyncStatus: workspaceSyncStatusStore,
  auditSink: createAuditRepository(),
  caseAssets: {
    persistAsset: (caseFile, asset) => persistCaseAssetImmediately(caseFile, asset)
  },
  pdfPreview: {
    open: async (args) => {
      await persistGeneratedPdfToDisk({
        caseFile: args.caseFile,
        fileName: args.fileName,
        pdfContent: args.pdfContent
      });
      const targetWindow = preparePendingWindow(args.initiatedWindow ?? null, "PDF wird vorbereitet", "Die PDF-Datei wird geladen. Falls kein neuer Tab erscheint, pruefe bitte den Popup-Blocker.");
      const blob = toBlob(args.pdfContent, "application/pdf");
      const url = URL.createObjectURL(blob);
      if (!targetWindow) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        targetWindow.location.href = url;
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return { message: "PDF wurde geoeffnet." };
    }
  },
  masterDataSync: {
    exportCurrent: async (masterData) => {
      triggerDownload("master-data.json", new Blob([serializeMasterData(masterData)], { type: "application/json" }), "application/json");
      return { message: "Stammdaten wurden als Download bereitgestellt." };
    },
    importFromSelection: async () => {
      const file = await selectBrowserFile(".json,application/json");
      if (!file) return null;
      return {
        masterData: importMasterDataFromJson(await file.text()),
        message: `Stammdaten wurden importiert: ${file.name}`
      };
    }
  },
  dataDirectory: {
    getStatus: () => getBrowserDataDirectoryStatus(),
    link: async () => {
      await linkBrowserDataDirectory();
      return getBrowserDataDirectoryStatus();
    },
    unlink: async () => {
      await unlinkBrowserDataDirectory();
      return getBrowserDataDirectoryStatus();
    }
  },
  exportArtifacts: {
    persist: async (args) => {
      const { savedPath } = await persistExportArtifactsToDisk(args);
      const fileName = savedPath.split("/").pop() || args.zipFileName;
      const targetWindow = preparePendingWindow(args.initiatedWindow ?? null, "Dossier wird gespeichert", "Die Dossierdateien werden geschrieben. Der Download startet automatisch.");
      completePendingDownload(targetWindow, fileName, args.zipContent);
      return { message: `Dossierdateien wurden gespeichert: ${savedPath}` };
    }
  },
  shell: {
    openDataDirectory: async ({ clerkId, masterData }) => {
      const status = await getBrowserDataDirectoryStatus();
      if (!status.isLinked) {
        throw new Error("Im Web ist noch kein Datenordner verknuepft.");
      }
      return `${status.label ?? "ELB_V1_Daten"}/${getClerkDataDirectoryRelativePath(clerkId, masterData)}`;
    }
  }
};
