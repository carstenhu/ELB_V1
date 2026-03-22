import { useEffect, useState } from "react";
import { loadCaseById, openNewDossier } from "./appState";
import { type PageId } from "@elb/domain/index";
import { useAppState } from "./useAppState";
import { WorkspacePageContent } from "./app/WorkspacePageContent";
import { useWorkspaceLifecycle } from "./app/useWorkspaceLifecycle";
import { DossierCreateModal } from "./ui/caseModals";
import { SessionOverlay, TopBar } from "./ui/shell";

export function App() {
  const hydrated = useWorkspaceLifecycle();

  const state = useAppState();
  const [page, setPage] = useState<PageId>("consignor");
  const [exportStatus, setExportStatus] = useState("");
  const [clerkSelectorOpen, setClerkSelectorOpen] = useState(false);
  const [dossierModalOpen, setDossierModalOpen] = useState(false);
  const [dossierError, setDossierError] = useState("");

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    setClerkSelectorOpen(!state.activeClerkId);
  }, [hydrated, state.activeClerkId]);

  useEffect(() => {
    if (!hydrated || !state.activeClerkId) {
      setDossierModalOpen(false);
      return;
    }

    if (!state.currentCase) {
      setDossierModalOpen(true);
      return;
    }

    setDossierModalOpen(false);
    setDossierError("");
  }, [hydrated, state.activeClerkId, state.currentCase]);

  function handleOpenDossierModal() {
    setDossierError("");
    setDossierModalOpen(true);
  }

  function handleCreateDossier(input: { customerName: string; isCompany: boolean; receiptNumber: string }) {
    try {
      openNewDossier(input);
      setPage("consignor");
      setDossierError("");
      setDossierModalOpen(false);
    } catch (error) {
      setDossierError(error instanceof Error ? error.message : "Dossier konnte nicht eroeffnet werden.");
    }
  }

  const resumableCase =
    state.currentCase ??
    (state.activeClerkId
      ? [...state.drafts, ...state.finalized]
          .filter((caseFile) => caseFile.meta.clerkId === state.activeClerkId)
          .sort((left, right) => right.meta.updatedAt.localeCompare(left.meta.updatedAt, "de-CH", { numeric: true, sensitivity: "base" }))[0] ?? null
      : null);

  const currentDossierLabel = resumableCase
    ? `${resumableCase.consignor.company.trim() || resumableCase.consignor.lastName.trim() || "Unbenannt"} · ELB ${resumableCase.meta.receiptNumber}`
    : undefined;

  if (!hydrated) {
    return (
      <div className="app-shell">
        <main className="empty-state">
          <h1>Workspace wird geladen</h1>
          <p>Gespeicherte Daten und Einstellungen werden vorbereitet.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <SessionOverlay open={clerkSelectorOpen} onSelect={() => setClerkSelectorOpen(false)} />
      {dossierModalOpen && state.activeClerkId ? (
        <DossierCreateModal
          errorMessage={dossierError}
          initialCustomerName={resumableCase ? (resumableCase.consignor.company.trim() || resumableCase.consignor.lastName.trim()) : ""}
          initialReceiptNumber={resumableCase?.meta.receiptNumber ?? ""}
          initialIsCompany={resumableCase?.consignor.useCompanyAddress ?? false}
          onConfirm={handleCreateDossier}
          onLoadExisting={() => {
            setDossierError("");
            setDossierModalOpen(false);
            setPage("loadCenter");
          }}
          {...(currentDossierLabel ? { currentDossierLabel } : {})}
          {...(resumableCase
            ? {
                onContinueCurrent: () => {
                  loadCaseById(resumableCase.meta.id);
                  setDossierError("");
                  setDossierModalOpen(false);
                  setPage("consignor");
                }
              }
            : {})}
          {...(resumableCase ? { onCancel: () => setDossierModalOpen(false) } : {})}
        />
      ) : null}
      <TopBar page={page} onPageChange={setPage} onOpenClerkSelector={() => setClerkSelectorOpen(true)} onOpenDossierCreate={handleOpenDossierModal} />
      <WorkspacePageContent
        page={page}
        caseFile={state.currentCase}
        exportStatus={exportStatus}
        onExportStatusChange={setExportStatus}
        onPageChange={setPage}
        onOpenDossierCreate={handleOpenDossierModal}
        onOpenClerkSelector={() => setClerkSelectorOpen(true)}
      />
    </div>
  );
}
