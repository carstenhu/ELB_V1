/* eslint-disable react-refresh/only-export-components */
import type { PageId } from "@elb/domain/index";
import { APP_NAME } from "@elb/shared/constants";
import { createNewCase, selectClerk } from "../appState";
import { useAppState } from "../useAppState";

export const pages: Array<{ id: PageId; label: string }> = [
  { id: "consignor", label: "Einlieferer" },
  { id: "objects", label: "Objekte" },
  { id: "internal", label: "Interne Infos" },
  { id: "pdfPreview", label: "ELB-PDF" },
  { id: "wordPreview", label: "Schaetzliste" }
];

export function SessionOverlay(props: { open: boolean; onSelect: () => void }) {
  const state = useAppState();
  if (!props.open) {
    return null;
  }

  return (
    <div className="overlay">
      <div className="overlay__card">
        <p className="eyebrow">Sachbearbeiter-Auswahl</p>
        <h1>{APP_NAME}</h1>
        <div className="clerk-grid">
          {state.masterData.clerks.map((clerk) => (
            <button
              key={clerk.id}
              className="clerk-card"
              onClick={() => {
                selectClerk(clerk.id);
                props.onSelect();
              }}
            >
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

export function TopBar(props: { page: PageId; onPageChange: (page: PageId) => void; onOpenClerkSelector: () => void }) {
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
        <details className="topbar__menu">
          <summary className="nav-button topbar__menu-trigger" aria-label="Menue">
            <span>...</span>
          </summary>
          <div className="topbar__menu-panel">
            <button type="button" className="primary-button" onClick={() => {
              createNewCase();
              props.onPageChange("consignor");
            }}>
              Neuer Vorgang
            </button>
            <button type="button" className="primary-button" onClick={props.onOpenClerkSelector}>
              Sachbearbeiter waehlen
            </button>
            <button type="button" className="primary-button" onClick={() => props.onPageChange("loadCenter")}>
              Entwuerfe und ZIPs laden
            </button>
            <button type="button" className="primary-button" onClick={() => props.onPageChange("admin")}>
              Admin
            </button>
          </div>
        </details>
      </nav>
    </header>
  );
}
