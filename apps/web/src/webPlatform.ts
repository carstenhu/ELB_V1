import { createAuditRepository } from "@elb/persistence/auditRepository";
import { persistCaseAssetImmediately } from "@elb/persistence/filesystem";
import { createWorkspaceRepository } from "@elb/persistence/repository";
import type { AppPlatform } from "@elb/client-app/platform/platformTypes";

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

export const webPlatform: AppPlatform = {
  workspaceRepository: createWorkspaceRepository(),
  auditSink: createAuditRepository(),
  caseAssets: {
    persistAsset: (caseFile, asset) => persistCaseAssetImmediately(caseFile, asset)
  },
  pdfPreview: {
    open: async (args) => {
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
  exportArtifacts: {
    persist: async (args) => {
      const targetWindow = preparePendingWindow(args.initiatedWindow ?? null, "ZIP wird vorbereitet", "Der Export wird erstellt. Der Download startet automatisch.");
      completePendingDownload(targetWindow, args.zipFileName, args.zipContent);
      return { message: "ZIP wurde als Browser-Download bereitgestellt und der Vorgang wurde finalisiert." };
    }
  },
  shell: {
    openDataDirectory: async () => {
      throw new Error("Im Web gibt es keinen Datenordner.");
    }
  }
};
