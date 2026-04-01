import type { CaseFile } from "@elb/domain/index";
import type { ValidationIssue } from "@elb/app-core/index";
import { createLogger } from "@elb/shared/logger";
import { createSnapshot, finalizeCurrentCase, saveDraft } from "../../appState";
import { usePlatform } from "../../platform/platformContext";
import { useAppState } from "../../useAppState";
import type { PreviewEditableFieldIssue } from "./previewProblemFields";

const logger = createLogger("preview-actions");

export interface PreviewProblemDetails {
  title: string;
  message: string;
  reasons: string[];
  fields: PreviewEditableFieldIssue[];
}

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

function buildProblemStatus(problem: PreviewProblemDetails | null, fallback: string): string {
  if (!problem) {
    return fallback;
  }

  const reasons = problem.reasons.slice(0, 3).join(" | ");
  if (!reasons) {
    return problem.message || fallback;
  }

  return `${problem.message} ${reasons}`;
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

function isValidationIssue(value: unknown): value is ValidationIssue {
  return typeof value === "object"
    && value !== null
    && "message" in value
    && typeof value.message === "string";
}

function formatIssuePath(path: string): string {
  if (!path) {
    return "Allgemein";
  }

  if (path === "bank.iban") return "IBAN";
  if (path === "bank.bic") return "BIC";
  if (path === "meta.receiptNumber") return "ELB-Nummer";
  if (path === "meta.clerkId") return "Sachbearbeiter";
  if (path === "consignor.street") return "Einlieferer: Strasse";
  if (path === "consignor.zip") return "Einlieferer: PLZ";
  if (path === "consignor.city") return "Einlieferer: Ort";
  if (path === "consignor.firstName") return "Einlieferer: Vorname";
  if (path === "consignor.lastName") return "Einlieferer: Name";
  if (path === "consignor.birthDate") return "Einlieferer: Geburtsdatum";
  if (path === "consignor.nationality") return "Einlieferer: Nationalitaet";
  if (path === "consignor.passportNumber") return "Einlieferer: Passnummer";
  if (path === "bank.beneficiary") return "Beguenstigter";
  if (path === "bank.beneficiaryOverride.reason") return "Abweichender Beguenstigter: Grund";
  if (path === "bank.beneficiaryOverride.name") return "Abweichender Beguenstigter: Name";

  const costMatch = path.match(/^costs\.(commission|insurance|transport|imaging|expertise|internet)\.amount$/);
  if (costMatch) {
    const labels: Record<string, string> = {
      commission: "Kommission",
      insurance: "Versicherung",
      transport: "Transport",
      imaging: "Abb.-Kosten",
      expertise: "Kosten Expertisen",
      internet: "Internet"
    };
    const costKey = costMatch[1];
    return costKey ? (labels[costKey] ?? path) : path;
  }

  const objectMatch = path.match(/^objects\.(\d+)\.(.+)$/);
  if (objectMatch) {
    const objectNumber = Number.parseInt(objectMatch[1] ?? "0", 10) + 1;
    const fieldPath = objectMatch[2] ?? "";

    if (fieldPath === "intNumber") return `Objekt ${objectNumber}: Int.-Nr.`;
    if (fieldPath === "auctionId") return `Objekt ${objectNumber}: Auktion`;
    if (fieldPath === "departmentId") return `Objekt ${objectNumber}: Abteilung`;
    if (fieldPath === "shortDescription") return `Objekt ${objectNumber}: Kurzbeschreibung`;
    if (fieldPath === "priceValue") return `Objekt ${objectNumber}: Preis`;
    if (fieldPath === "estimate.low") return `Objekt ${objectNumber}: Untere Schaetzung`;
    if (fieldPath === "estimate.high") return `Objekt ${objectNumber}: Obere Schaetzung`;

    return `Objekt ${objectNumber}: ${fieldPath}`;
  }

  return path;
}

function extractProblemDetails(error: unknown, title: string): PreviewProblemDetails | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  const details = "details" in error ? error.details : undefined;
  const fieldIssues = Array.isArray(details)
    ? details
      .filter(isValidationIssue)
      .map((issue) => ({
        path: issue.path,
        label: formatIssuePath(issue.path),
        message: issue.message.trim()
      }))
      .filter((issue) => issue.message)
    : [];
  const reasons = fieldIssues.map((issue) => (issue.label ? `${issue.label}: ${issue.message}` : issue.message));

  if (!message && !reasons.length) {
    return null;
  }

  return {
    title,
    message: message || "Die Aktion konnte nicht abgeschlossen werden.",
    reasons: Array.from(new Set(reasons)),
    fields: fieldIssues.filter((issue, index, items) => items.findIndex((candidate) => candidate.path === issue.path) === index)
  };
}

async function ensureCaseReady(
  caseFile: CaseFile,
  masterData: ReturnType<typeof useAppState>["masterData"],
  exportTarget: "pdf" | "word" | "bundle"
): Promise<void> {
  const { requireCaseReadyForExport } = await import("@elb/app-core/index");
  requireCaseReadyForExport(caseFile, masterData, exportTarget);
}

async function createPdfBytes(caseFile: CaseFile, masterData: ReturnType<typeof useAppState>["masterData"]): Promise<Uint8Array> {
  const { generateElbPdf } = await import("@elb/pdf-core/index");
  return generateElbPdf(caseFile, masterData);
}

async function createSupplementPdfBytes(caseFile: CaseFile, masterData: ReturnType<typeof useAppState>["masterData"]): Promise<Uint8Array> {
  const { generateSupplementPdf } = await import("@elb/pdf-core/index");
  return generateSupplementPdf(caseFile, masterData);
}

async function createWordDocxBlob(caseFile: CaseFile, masterData: ReturnType<typeof useAppState>["masterData"]): Promise<Blob> {
  const { generateWordDocx } = await import("@elb/word-core/index");
  return generateWordDocx(caseFile, masterData);
}

async function createZipBundle(caseFile: CaseFile, masterData: ReturnType<typeof useAppState>["masterData"]) {
  const [{ generateExportBundle, createExportZipFromBundle }] = await Promise.all([import("@elb/export-core/index")]);
  const bundle = await generateExportBundle(caseFile, masterData);
  const zipBlob = await createExportZipFromBundle(bundle);
  return { bundle, zipBlob };
}

export function usePreviewActions(
  caseFile: CaseFile,
  onExportStatusChange: (value: string) => void,
  onPreviewProblem?: (problem: PreviewProblemDetails) => void
) {
  const platform = usePlatform();
  const state = useAppState();

  async function openDataFolder(): Promise<void> {
    try {
      const path = await platform.shell.openDataDirectory({
        clerkId: caseFile.meta.clerkId,
        masterData: state.masterData
      });
      onExportStatusChange(`Datenordner geoeffnet: ${path}`);
    } catch {
      onExportStatusChange("Datenordner kann nur in der echten Tauri-App geoeffnet werden.");
    }
  }

  async function openPdf(): Promise<void> {
    let previewWindow: Window | null = null;

    try {
      previewWindow = openPendingWindow("PDF wird vorbereitet", "Die PDF-Datei wird erzeugt und gleich geoeffnet.");
      await ensureCaseReady(caseFile, state.masterData, "word");
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
      const problem = extractProblemDetails(error, "PDF kann nicht angezeigt werden");
      if (problem) {
        onPreviewProblem?.(problem);
      }
      onExportStatusChange(problem ? buildProblemStatus(problem, "PDF konnte nicht geoeffnet werden.") : formatErrorMessage(error, "PDF konnte nicht geoeffnet werden."));
    }
  }

  async function openSupplementPdf(): Promise<void> {
    let previewWindow: Window | null = null;

    try {
      previewWindow = openPendingWindow("Zusatz-PDF wird vorbereitet", "Die Zusatz-PDF-Datei wird erzeugt und gleich geoeffnet.");
      await ensureCaseReady(caseFile, state.masterData, "word");
      onExportStatusChange("Zusatz-PDF wird erzeugt...");
      const pdfBytes = await createSupplementPdfBytes(caseFile, state.masterData);
      const result = await platform.pdfPreview.open({
        caseFile,
        fileName: "zusatz.pdf",
        pdfContent: pdfBytes,
        initiatedWindow: previewWindow
      });
      onExportStatusChange(result.message);
    } catch (error) {
      if (previewWindow && !previewWindow.closed) {
        previewWindow.close();
      }
      logger.error("Zusatz-PDF-Vorschau fehlgeschlagen.", error);
      const problem = extractProblemDetails(error, "Zusatz-PDF kann nicht angezeigt werden");
      if (problem) {
        onPreviewProblem?.(problem);
      }
      onExportStatusChange(problem ? buildProblemStatus(problem, "Zusatz-PDF konnte nicht geoeffnet werden.") : formatErrorMessage(error, "Zusatz-PDF konnte nicht geoeffnet werden."));
    }
  }

  async function downloadWordDocx(): Promise<void> {
    try {
      await ensureCaseReady(caseFile, state.masterData, "pdf");
      onExportStatusChange("Word-Datei wird erzeugt...");
      const [{ createExportPlan }, wordDocxBlob] = await Promise.all([
        import("@elb/export-core/index"),
        createWordDocxBlob(caseFile, state.masterData)
      ]);
      const plan = createExportPlan(caseFile);
      const url = URL.createObjectURL(wordDocxBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${plan.baseName}-schaetzliste.docx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      onExportStatusChange(`Word-Datei wurde neu erzeugt: ${anchor.download}`);
    } catch (error) {
      logger.error("Word-Datei konnte nicht erzeugt werden.", error);
      const problem = extractProblemDetails(error, "Word-Datei kann nicht erzeugt werden");
      if (problem) {
        onPreviewProblem?.(problem);
      }
      onExportStatusChange(problem ? buildProblemStatus(problem, "Word-Datei konnte nicht erzeugt werden.") : formatErrorMessage(error, "Word-Datei konnte nicht erzeugt werden."));
    }
  }

  async function exportArtifacts(): Promise<void> {
    let downloadWindow: Window | null = null;

    try {
      downloadWindow = openPendingWindow("ZIP wird vorbereitet", "Der Export wird erzeugt und der Download startet gleich.");
      await ensureCaseReady(caseFile, state.masterData, "bundle");
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
      await platform.workspaceRepository.save(createSnapshot());
      onExportStatusChange(`${result.message}. Workspace wurde aktualisiert.`);
    } catch (error) {
      if (downloadWindow && !downloadWindow.closed) {
        downloadWindow.close();
      }
      logger.error("Export fehlgeschlagen.", error);
      const problem = extractProblemDetails(error, "Export nicht moeglich");
      if (problem) {
        onPreviewProblem?.(problem);
      }
      onExportStatusChange(problem ? buildProblemStatus(problem, "Export fehlgeschlagen.") : formatErrorMessage(error, "Export fehlgeschlagen."));
    }
  }

  return {
    downloadWordDocx,
    exportArtifacts,
    openDataFolder,
    openPdf,
    openSupplementPdf,
    saveDraft
  };
}
