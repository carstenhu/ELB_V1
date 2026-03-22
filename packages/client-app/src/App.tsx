import { useEffect, useState } from "react";
import { type PageId } from "@elb/domain/index";
import { startNewDossier } from "./appState";
import { useAppState } from "./useAppState";
import { WorkspacePageContent } from "./app/WorkspacePageContent";
import { useWorkspaceLifecycle } from "./app/useWorkspaceLifecycle";
import { SessionOverlay, TopBar } from "./ui/shell";

export function App() {
  const hydrated = useWorkspaceLifecycle();
  const state = useAppState();
  const [page, setPage] = useState<PageId>("consignor");
  const [exportStatus, setExportStatus] = useState("");
  const [clerkSelectorOpen, setClerkSelectorOpen] = useState(false);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    setClerkSelectorOpen(!state.activeClerkId);
  }, [hydrated, state.activeClerkId]);

  useEffect(() => {
    if (!hydrated || !state.activeClerkId) {
      return;
    }

    if (!state.currentCase && page === "consignor") {
      startNewDossier();
      return;
    }

    if (page === "loadCenter") {
      setPage("consignor");
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
      <TopBar page={page} onPageChange={setPage} />
      <WorkspacePageContent
        page={page}
        caseFile={state.currentCase}
        exportStatus={exportStatus}
        onExportStatusChange={setExportStatus}
        onPageChange={setPage}
        onOpenDossierCreate={() => {
          startNewDossier();
          setPage("consignor");
        }}
        onOpenClerkSelector={() => setClerkSelectorOpen(true)}
        onOpenAdmin={() => setPage("admin")}
      />
    </div>
  );
}
