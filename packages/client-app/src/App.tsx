import { useEffect, useState } from "react";
import { type PageId } from "@elb/domain/index";
import { getSuggestedCaseNumber } from "@elb/app-core/index";
import { createSnapshot, getReceiptNumberScope, openNewDossier } from "./appState";
import { useAppState } from "./useAppState";
import { WorkspacePageContent } from "./app/WorkspacePageContent";
import { useWorkspaceLifecycle } from "./app/useWorkspaceLifecycle";
import { usePlatform } from "./platform/platformContext";
import { NewDossierModal } from "./ui/caseModals";
import { SessionOverlay, TopBar } from "./ui/shell";

export function App() {
  const platform = usePlatform();
  const hydrated = useWorkspaceLifecycle();
  const state = useAppState();
  const [page, setPage] = useState<PageId>("consignor");
  const [exportStatus, setExportStatus] = useState("");
  const [clerkSelectorOpen, setClerkSelectorOpen] = useState(false);
  const [newDossierModalOpen, setNewDossierModalOpen] = useState(false);

  const suggestedReceiptNumber = state.activeClerkId
    ? getSuggestedCaseNumber({
        masterData: state.masterData,
        clerkId: state.activeClerkId,
        scope: getReceiptNumberScope(),
        dossiers: state.dossiers,
        currentCase: state.currentCase
      })
    : "";

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    setClerkSelectorOpen(true);
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !state.activeClerkId) {
      return;
    }

    if (!state.currentCase && page !== "loadCenter") {
      setNewDossierModalOpen(true);
    }
  }, [hydrated, page, state.activeClerkId, state.currentCase]);

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
      <SessionOverlay
        open={clerkSelectorOpen}
        onSelect={() => {
          setClerkSelectorOpen(false);
          setPage("consignor");
        }}
      />
      <NewDossierModal
        open={newDossierModalOpen && Boolean(state.activeClerkId)}
        suggestedReceiptNumber={suggestedReceiptNumber}
        onCreate={(input) => {
          openNewDossier(input);
          void platform.workspaceRepository.save(createSnapshot());
          setNewDossierModalOpen(false);
          setPage("consignor");
        }}
        onOpenLoadCenter={() => {
          setNewDossierModalOpen(false);
          setPage("loadCenter");
        }}
        onOpenClerkSelector={() => {
          setNewDossierModalOpen(false);
          setClerkSelectorOpen(true);
        }}
        onCancel={() => {
          setNewDossierModalOpen(false);
          if (!state.currentCase) {
            setPage("loadCenter");
          }
        }}
      />
      <TopBar page={page} onPageChange={setPage} onOpenDossierCreate={() => setNewDossierModalOpen(true)} />
      <WorkspacePageContent
        page={page}
        caseFile={state.currentCase}
        exportStatus={exportStatus}
        onExportStatusChange={setExportStatus}
        onPageChange={setPage}
        onOpenClerkSelector={() => setClerkSelectorOpen(true)}
        onOpenAdmin={() => setPage("admin")}
      />
    </div>
  );
}
