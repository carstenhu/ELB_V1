import { useEffect, useRef, useState } from "react";
import { type PageId } from "@elb/domain/index";
import { createAuditRepository } from "@elb/persistence/auditRepository";
import { createWorkspaceRepository } from "@elb/persistence/repository";
import { useAppState } from "./useAppState";
import { AdminPage } from "./ui/adminPage";
import { ConsignorPage, InternalPage, ObjectsPage } from "./ui/editorPages";
import { PdfPreviewPage } from "./ui/pdfPreviewPage";
import { SessionOverlay, TopBar } from "./ui/shell";
import { WordTemplatePreviewPage } from "./ui/wordPreviewPage";
import { configureStateServices, createSnapshot, replaceState } from "./appState";

const workspaceRepository = createWorkspaceRepository();
const auditRepository = createAuditRepository();
configureStateServices({ auditSink: auditRepository });

export function App() {
  const state = useAppState();
  const [page, setPage] = useState<PageId>("consignor");
  const [hydrated, setHydrated] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const firstSaveRef = useRef(true);
  const caseFile = state.currentCase;

  useEffect(() => {
    let active = true;

    workspaceRepository.load()
      .then((snapshot) => {
        if (!active || !snapshot) {
          return;
        }

        replaceState(snapshot);
      })
      .finally(() => {
        if (active) {
          setHydrated(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (firstSaveRef.current) {
      firstSaveRef.current = false;
      return;
    }

    void workspaceRepository.save(createSnapshot());
  }, [hydrated, state]);

  return (
    <div className="app-shell">
      <SessionOverlay />
      <TopBar page={page} onPageChange={setPage} />
      {!caseFile && page !== "admin" ? (
        <main className="empty-state">
          <h1>Kein aktiver Vorgang</h1>
          <p>Bitte zuerst einen Sachbearbeiter wählen oder einen neuen Vorgang anlegen.</p>
        </main>
      ) : (
        <main className="page">
          {page === "admin" ? <AdminPage /> : null}
          {page === "consignor" && caseFile ? <ConsignorPage caseFile={caseFile} /> : null}
          {page === "objects" && caseFile ? <ObjectsPage caseFile={caseFile} /> : null}
          {page === "internal" && caseFile ? <InternalPage caseFile={caseFile} /> : null}
          {page === "pdfPreview" && caseFile ? <PdfPreviewPage caseFile={caseFile} exportStatus={exportStatus} onExportStatusChange={setExportStatus} /> : null}
          {page === "wordPreview" && caseFile ? <WordTemplatePreviewPage caseFile={caseFile} exportStatus={exportStatus} onExportStatusChange={setExportStatus} /> : null}
        </main>
      )}
    </div>
  );
}


