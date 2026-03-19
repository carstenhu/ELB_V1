import { lazy, Suspense, useState } from "react";
import { type CaseFile } from "@elb/domain/index";
import { createExportPlan } from "@elb/export-core/index";
import { createPdfPreviewModel } from "@elb/pdf-core/index";
import type { PreviewProblemDetails } from "../features/preview/usePreviewActions";
import { PdfCanvasPreview, type PdfEditTarget } from "../pdfPreview";
import { getRequiredFieldEntries } from "../features/preview/requiredFields";
import { useAppState } from "../useAppState";
import { PdfEditModal } from "../features/pdfPreview/PdfEditModal";
import { ExportStatusCard } from "./ExportStatusCard";

const PreviewActionButtons = lazy(async () => {
  const module = await import("../features/preview/PreviewActionButtons");
  return { default: module.PreviewActionButtons };
});

const RequiredFieldsModal = lazy(async () => {
  const module = await import("../features/preview/RequiredFieldsModal");
  return { default: module.RequiredFieldsModal };
});

const PreviewProblemModal = lazy(async () => {
  const module = await import("../features/preview/PreviewProblemModal");
  return { default: module.PreviewProblemModal };
});

function PreviewActionsFallback() {
  return <span>Aktionen werden geladen...</span>;
}

function RequiredFieldsFallback() {
  return (
    <div className="pin-modal">
      <div className="overlay__card">
        <p>Pflichtfelder werden geladen...</p>
      </div>
    </div>
  );
}

export function PdfPreviewPage(props: { caseFile: CaseFile; exportStatus: string; onExportStatusChange: (value: string) => void }) {
  const state = useAppState();
  const model = createPdfPreviewModel(props.caseFile, state.masterData);
  const exportPlan = createExportPlan(props.caseFile);
  const requiredEntries = getRequiredFieldEntries(props.caseFile, state.masterData.globalPdfRequiredFields);
  const hasMissingRequiredFields = requiredEntries.length > 0;
  const [editTarget, setEditTarget] = useState<PdfEditTarget | null>(null);
  const [requiredFieldsOpen, setRequiredFieldsOpen] = useState(false);
  const [previewProblem, setPreviewProblem] = useState<PreviewProblemDetails | null>(null);

  return (
    <div className="preview-page">
      <div className="preview-sheet">
        <div className="preview-sheet__content">
          <PdfCanvasPreview caseFile={props.caseFile} masterData={state.masterData} onEdit={setEditTarget} />
          <ExportStatusCard
            beneficiary={model.beneficiary}
            clerkLabel={model.clerkLabel}
            zipFileName={exportPlan.zipFileName}
            missingRequiredFields={requiredEntries.map((entry) => entry.label)}
            exportStatus={props.exportStatus}
            onCaptureMissing={() => setRequiredFieldsOpen(true)}
            actions={
              <Suspense fallback={<PreviewActionsFallback />}>
                <PreviewActionButtons
                  caseFile={props.caseFile}
                  hasMissingRequiredFields={hasMissingRequiredFields}
                  onExportStatusChange={props.onExportStatusChange}
                  onCaptureMissing={() => setRequiredFieldsOpen(true)}
                  onPreviewProblem={setPreviewProblem}
                />
              </Suspense>
            }
          />
        </div>
        <PdfEditModal caseFile={props.caseFile} openTarget={editTarget} onClose={() => setEditTarget(null)} onTargetChange={setEditTarget} />
        {requiredFieldsOpen ? (
          <Suspense fallback={<RequiredFieldsFallback />}>
            <RequiredFieldsModal caseFile={props.caseFile} entries={requiredEntries} onClose={() => setRequiredFieldsOpen(false)} />
          </Suspense>
        ) : null}
        {previewProblem ? (
          <Suspense fallback={<RequiredFieldsFallback />}>
            <PreviewProblemModal caseFile={props.caseFile} problem={previewProblem} onClose={() => setPreviewProblem(null)} />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}
