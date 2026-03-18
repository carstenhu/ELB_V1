/* eslint-disable react-refresh/only-export-components */
import type { PageId } from "@elb/domain/index";
import { APP_NAME } from "@elb/shared/constants";
import { createNewCase, loadCaseById, selectClerk } from "../appState";
import { useAppState } from "../useAppState";

export const pages: Array<{ id: PageId; label: string }> = [
  { id: "consignor", label: "Einlieferer" },
  { id: "objects", label: "Objekte" },
  { id: "internal", label: "Interne Infos" },
  { id: "pdfPreview", label: "ELB-PDF" },
  { id: "wordPreview", label: "Schätzliste" }
];

export function SessionOverlay() {
  const state = useAppState();
  if (state.activeClerkId) {
    return null;
  }

  return (
    <div className="overlay">
      <div className="overlay__card">
        <p className="eyebrow">Sachbearbeiter-Auswahl</p>
        <h1>{APP_NAME}</h1>
        <div className="clerk-grid">
          {state.masterData.clerks.map((clerk) => (
            <button key={clerk.id} className="clerk-card" onClick={() => selectClerk(clerk.id)}>
              <strong>{clerk.name}</strong>
              <span>{clerk.email}</span>
              <span>{clerk.phone || "Keine Telefonnummer"}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TopBar(props: { page: PageId; onPageChange: (page: PageId) => void }) {
  const state = useAppState();
  const activeClerk = state.masterData.clerks.find((clerk) => clerk.id === state.activeClerkId);

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <strong>{APP_NAME}</strong>
        <span>{activeClerk?.name ?? "Kein Sachbearbeiter"}</span>
      </div>
      <nav className="topbar__nav">
        {pages.map((page) => (
          <button
            key={page.id}
            className={page.id === props.page ? "nav-button nav-button--active" : "nav-button"}
            onClick={() => props.onPageChange(page.id)}
          >
            {page.label}
          </button>
        ))}
      </nav>
      <div className="topbar__actions">
        <select
          value=""
          onChange={(event) => {
            const value = event.target.value;
            if (value === "new-case") {
              createNewCase();
            }
            if (value.startsWith("case:")) {
              loadCaseById(value.replace("case:", ""));
            }
            if (value === "admin") {
              props.onPageChange("admin");
            }
            event.target.value = "";
          }}
        >
          <option value="">Menü</option>
          <option value="new-case">Neuer Vorgang</option>
          <option value="admin">Admin</option>
          {state.drafts.map((draft) => (
            <option key={draft.meta.id} value={`case:${draft.meta.id}`}>
              Draft laden: {draft.consignor.lastName || "Unbenannt"} {draft.meta.receiptNumber}
            </option>
          ))}
          {state.finalized.map((caseFile) => (
            <option key={caseFile.meta.id} value={`case:${caseFile.meta.id}`}>
              Finalisiert laden: {caseFile.consignor.lastName || "Unbenannt"} {caseFile.meta.receiptNumber}
            </option>
          ))}
        </select>
      </div>
    </header>
  );
}
