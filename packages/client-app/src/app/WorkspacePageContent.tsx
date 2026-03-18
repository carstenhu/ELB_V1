import { lazy, Suspense } from "react";
import type { PageId } from "@elb/domain/index";
import type { CaseFile } from "@elb/domain/index";
import { AdminPage } from "../ui/adminPage";
import { ConsignorPage, InternalPage, ObjectsPage } from "../ui/editorPages";

const PdfPreviewPage = lazy(async () => {
  const module = await import("../ui/pdfPreviewPage");
  return { default: module.PdfPreviewPage };
});

const WordTemplatePreviewPage = lazy(async () => {
  const module = await import("../ui/wordPreviewPage");
  return { default: module.WordTemplatePreviewPage };
});

function PreviewLoadingState() {
  return (
    <div className="preview-card">
      <p>Vorschau wird geladen...</p>
    </div>
  );
}

export function WorkspacePageContent(props: {
  page: PageId;
  caseFile: CaseFile | null;
  exportStatus: string;
  onExportStatusChange: (value: string) => void;
}) {
  if (!props.caseFile && props.page !== "admin") {
    return (
      <main className="empty-state">
        <h1>Kein aktiver Vorgang</h1>
        <p>Bitte zuerst einen Sachbearbeiter waehlen oder einen neuen Vorgang anlegen.</p>
      </main>
    );
  }

  return (
    <main className="page">
      {props.page === "admin" ? <AdminPage /> : null}
      {props.page === "consignor" && props.caseFile ? <ConsignorPage caseFile={props.caseFile} /> : null}
      {props.page === "objects" && props.caseFile ? <ObjectsPage caseFile={props.caseFile} /> : null}
      {props.page === "internal" && props.caseFile ? <InternalPage caseFile={props.caseFile} /> : null}
      {props.page === "pdfPreview" && props.caseFile ? (
        <Suspense fallback={<PreviewLoadingState />}>
          <PdfPreviewPage caseFile={props.caseFile} exportStatus={props.exportStatus} onExportStatusChange={props.onExportStatusChange} />
        </Suspense>
      ) : null}
      {props.page === "wordPreview" && props.caseFile ? (
        <Suspense fallback={<PreviewLoadingState />}>
          <WordTemplatePreviewPage caseFile={props.caseFile} exportStatus={props.exportStatus} onExportStatusChange={props.onExportStatusChange} />
        </Suspense>
      ) : null}
    </main>
  );
}
