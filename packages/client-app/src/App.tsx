import { useEffect, useState } from "react";
import { openNewDossier } from "./appState";
import { type PageId } from "@elb/domain/index";
import { useAppState } from "./useAppState";
import { WorkspacePageContent } from "./app/WorkspacePageContent";
import { useWorkspaceLifecycle } from "./app/useWorkspaceLifecycle";
import { SessionOverlay, TopBar } from "./ui/shell";
import { DossierCreateModal } from "./ui/caseModals";

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

  const currentDossierLabel = state.currentCase
    ? `${state.currentCase.consignor.company.trim() || state.currentCase.consignor.lastName.trim() || "Unbenannt"} · ELB ${state.currentCase.meta.receiptNumber}`
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
          initialCustomerName={state.currentCase ? (state.currentCase.consignor.company.trim() || state.currentCase.consignor.lastName.trim()) : ""}
          initialReceiptNumber={state.currentCase?.meta.receiptNumber ?? ""}
          initialIsCompany={state.currentCase?.consignor.useCompanyAddress ?? false}
          onConfirm={handleCreateDossier}
          {...(currentDossierLabel ? { currentDossierLabel } : {})}
          {...(state.currentCase
            ? {
                onContinueCurrent: () => {
                  setDossierError("");
                  setDossierModalOpen(false);
                  setPage("consignor");
                }
              }
            : {})}
          {...(!state.currentCase ? {
            onLoadExisting: () => {
              setDossierError("");
              setDossierModalOpen(false);
              setPage("loadCenter");
            }
          } : {})}
          {...(state.currentCase ? { onCancel: () => setDossierModalOpen(false) } : {})}
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
