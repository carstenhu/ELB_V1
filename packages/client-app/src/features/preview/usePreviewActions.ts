import type { CaseFile } from "@elb/domain/index";
import { createLogger } from "@elb/shared/logger";
import { finalizeCurrentCase, saveDraft } from "../../appState";
import { usePlatform } from "../../platform/platformContext";
import { useAppState } from "../../useAppState";

const logger = createLogger("preview-actions");

function formatErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") {
      return serialized;
    }
  } catch {
    // Ignore serialization failures and use the fallback below.
  }

  return fallback;
}

function openPendingWindow(title: string, message: string): Window | null {
  let pendingWindow: Window | null = null;

  try {
    pendingWindow = window.open("", "_blank");
  } catch {
    return null;
  }

  if (!pendingWindow) {
    return null;
  }

  try {
    pendingWindow.document.title = title;
    pendingWindow.document.body.innerHTML = `<main style="font-family: sans-serif; padding: 24px;"><h1 style="font-size: 18px;">${title}</h1><p>${message}</p></main>`;
  } catch {
    return pendingWindow;
  }

  return pendingWindow;
}

async function ensureCaseReady(caseFile: CaseFile, masterData: ReturnType<typeof useAppState>["masterData"]): Promise<void> {
  const { requireCaseReadyForExport } = await import("@elb/app-core/index");
  requireCaseReadyForExport(caseFile, masterData);
}

async function createPdfBytes(caseFile: CaseFile, masterData: ReturnType<typeof useAppState>["masterData"]): Promise<Uint8Array> {
  const { generateElbPdf } = await import("@elb/pdf-core/index");
  return generateElbPdf(caseFile, masterData);
}

async function createZipBundle(caseFile: CaseFile, masterData: ReturnType<typeof useAppState>["masterData"]) {
  const [{ generateExportBundle, createExportZip }] = await Promise.all([import("@elb/export-core/index")]);
  const bundle = await generateExportBundle(caseFile, masterData);
  const zipBlob = await createExportZip(caseFile, masterData);
  return { bundle, zipBlob };
}

export function usePreviewActions(caseFile: CaseFile, onExportStatusChange: (value: string) => void) {
  const platform = usePlatform();
  const state = useAppState();

  async function openDataFolder(): Promise<void> {
    try {
      const path = await platform.shell.openDataDirectory();
      onExportStatusChange(`Datenordner geoeffnet: ${path}`);
    } catch {
      onExportStatusChange("Datenordner kann nur in der echten Tauri-App geoeffnet werden.");
    }
  }

  async function openPdf(): Promise<void> {
    let previewWindow: Window | null = null;

    try {
      previewWindow = openPendingWindow("PDF wird vorbereitet", "Die PDF-Datei wird erzeugt und gleich geoeffnet.");
      await ensureCaseReady(caseFile, state.masterData);
      onExportStatusChange("PDF wird erzeugt...");
      const pdfBytes = await createPdfBytes(caseFile, state.masterData);
      const result = await platform.pdfPreview.open({
        caseFile,
        fileName: "elb.pdf",
        pdfContent: pdfBytes,
        initiatedWindow: previewWindow
      });
      onExportStatusChange(result.message);
    } catch (error) {
      if (previewWindow && !previewWindow.closed) {
        previewWindow.close();
      }
      logger.error("PDF-Vorschau fehlgeschlagen.", error);
      onExportStatusChange(formatErrorMessage(error, "PDF konnte nicht geoeffnet werden."));
    }
  }

  async function exportArtifacts(): Promise<void> {
    let downloadWindow: Window | null = null;

    try {
      downloadWindow = openPendingWindow("ZIP wird vorbereitet", "Der Export wird erzeugt und der Download startet gleich.");
      await ensureCaseReady(caseFile, state.masterData);
      onExportStatusChange("ZIP wird erzeugt...");
      const { bundle, zipBlob } = await createZipBundle(caseFile, state.masterData);

      const result = await platform.exportArtifacts.persist({
        caseFile,
        artifacts: bundle.artifacts,
        zipFileName: bundle.plan.zipFileName,
        zipContent: zipBlob,
        initiatedWindow: downloadWindow
      });

      finalizeCurrentCase();
      onExportStatusChange(result.message);
    } catch (error) {
      if (downloadWindow && !downloadWindow.closed) {
        downloadWindow.close();
      }
      logger.error("Export fehlgeschlagen.", error);
      onExportStatusChange(formatErrorMessage(error, "Export fehlgeschlagen."));
    }
  }

  return {
    exportArtifacts,
    openDataFolder,
    openPdf,
    saveDraft
  };
}
