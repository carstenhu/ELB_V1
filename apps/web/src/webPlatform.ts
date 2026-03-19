import { createAuditRepository } from "@elb/persistence/auditRepository";
import { importExchangeFromEntries, importExchangeFromZip, type ExchangeImportEntry } from "@elb/persistence/exchangeImport";
import {
  getBrowserDataDirectoryStatus,
  getClerkDataDirectoryRelativePath,
  linkBrowserDataDirectory,
  listStoredExchangeZipFiles,
  readStoredExchangeZipFile,
  unlinkBrowserDataDirectory
} from "@elb/persistence/filesystem";
import { importMasterDataFromJson, serializeMasterData } from "@elb/persistence/masterDataSync";
import { persistCaseAssetImmediately, persistExportArtifactsToDisk, persistGeneratedPdfToDisk } from "@elb/persistence/filesystem";
import type { AppPlatform } from "@elb/client-app/platform/platformTypes";
import { createWebWorkspaceRepository } from "./supabaseWorkspaceRepository";

function toBlob(content: Blob | ArrayBuffer | Uint8Array, mimeType?: string): Blob {
  if (content instanceof Blob) {
    return mimeType && content.type !== mimeType ? content.slice(0, content.size, mimeType) : content;
  }

  if (content instanceof Uint8Array) {
    const copy = new Uint8Array(content.byteLength);
    copy.set(content);
    return new Blob([copy], mimeType ? { type: mimeType } : undefined);
  }

  return new Blob([new Uint8Array(content)], mimeType ? { type: mimeType } : undefined);
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
  if (!targetWindow) {
    return null;
  }

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
  const url = URL.createObjectURL(blob);

  if (!targetWindow) {
    triggerDownload(fileName, blob, "application/zip");
    return;
  }

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

function normalizeWebPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+/, "");
}

async function collectBrowserDirectoryEntries(): Promise<ExchangeImportEntry[] | null> {
  const picker = Reflect.get(globalThis, "showDirectoryPicker") as (() => Promise<unknown>) | undefined;
  if (typeof picker === "function") {
    const rootHandle = await picker();
    return collectEntriesFromHandle(rootHandle, "");
  }

  return new Promise<ExchangeImportEntry[] | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    (input as HTMLInputElement & { webkitdirectory?: boolean }).webkitdirectory = true;
    input.style.position = "fixed";
    input.style.left = "-9999px";

    input.addEventListener("change", async () => {
      const files = Array.from(input.files ?? []);
      input.remove();

      if (!files.length) {
        resolve(null);
        return;
      }

      const entries = await Promise.all(
        files.map(async (file) => ({
          path: normalizeWebPath(file.webkitRelativePath || file.name),
          content: file.name.toLowerCase().endsWith(".json")
            ? await file.text()
            : new Uint8Array(await file.arrayBuffer())
        }))
      );

      resolve(entries);
    }, { once: true });

    document.body.append(input);
    input.click();
  });
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

async function collectEntriesFromHandle(handle: unknown, prefix: string): Promise<ExchangeImportEntry[]> {
  const directoryHandle = handle as {
    values: () => AsyncIterable<unknown>;
    kind?: string;
    name?: string;
  };
  const entries: ExchangeImportEntry[] = [];

  for await (const childHandle of directoryHandle.values()) {
    const nextHandle = childHandle as {
      kind: "file" | "directory";
      name: string;
      getFile?: () => Promise<File>;
      values?: () => AsyncIterable<unknown>;
    };
    const relativePath = normalizeWebPath(prefix ? `${prefix}/${nextHandle.name}` : nextHandle.name);

    if (nextHandle.kind === "directory" && typeof nextHandle.values === "function") {
      entries.push(...await collectEntriesFromHandle(nextHandle, relativePath));
      continue;
    }

    if (nextHandle.kind !== "file" || typeof nextHandle.getFile !== "function") {
      continue;
    }

    const file = await nextHandle.getFile();
    entries.push({
      path: relativePath,
      content: file.name.toLowerCase().endsWith(".json")
        ? await file.text()
        : new Uint8Array(await file.arrayBuffer())
    });
  }

  return entries;
}

export const webPlatform: AppPlatform = {
  receiptNumberScope: "web",
  workspaceRepository: createWebWorkspaceRepository(),
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
      const targetWindow = preparePendingWindow(
        args.initiatedWindow ?? null,
        "PDF wird vorbereitet",
        "Die PDF-Datei wird geladen. Falls kein neuer Tab erscheint, pruefe bitte den Popup-Blocker."
      );
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
  exchangeImport: {
    importFromSelection: async () => {
      const entries = await collectBrowserDirectoryEntries();
      if (!entries?.length) {
        return null;
      }

      const imported = await importExchangeFromEntries(entries);
      return {
        ...imported,
        message: "Austauschordner wurde aus dem Browser-Dateisystem importiert."
      };
    },
    importFromZipSelection: async () => {
      const file = await selectBrowserFile(".zip,application/zip");
      if (!file) {
        return null;
      }

      const imported = await importExchangeFromZip(await file.arrayBuffer());
      return {
        ...imported,
        message: `Austausch-ZIP wurde importiert: ${file.name}`
      };
    },
    listStoredZipOptions: ({ clerkId, masterData }) => listStoredExchangeZipFiles({ clerkId, masterData }),
    importStoredZip: async ({ clerkId, masterData, zipId }) => {
      const zipFile = await readStoredExchangeZipFile({ clerkId, masterData, zipId });
      if (!zipFile) {
        return null;
      }

      const imported = await importExchangeFromZip(zipFile.content);
      return {
        ...imported,
        message: `Austausch-ZIP wurde geladen: ${zipFile.fileName}`
      };
    }
  },
  masterDataSync: {
    exportCurrent: async (masterData) => {
      triggerDownload("master-data.json", new Blob([serializeMasterData(masterData)], { type: "application/json" }), "application/json");
      return { message: "Stammdaten wurden als Download bereitgestellt." };
    },
    importFromSelection: async () => {
      const file = await selectBrowserFile(".json,application/json");
      if (!file) {
        return null;
      }

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
      const { exchangeZipPath } = await persistExportArtifactsToDisk(args);
      const exchangeZipFileName = exchangeZipPath.split("/").pop() || args.zipFileName;
      const targetWindow = preparePendingWindow(args.initiatedWindow ?? null, "ZIP wird vorbereitet", "Der Export wird erstellt. Der Download startet automatisch.");
      completePendingDownload(targetWindow, exchangeZipFileName, args.zipContent);
      return { message: `ZIP wurde als Browser-Download bereitgestellt: ${exchangeZipFileName}. Interner ZIP-Pfad: ${exchangeZipPath}` };
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
