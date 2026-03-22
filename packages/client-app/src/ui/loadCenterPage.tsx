import { useMemo, useState } from "react";
import { type CaseFile } from "@elb/domain/index";
import { Section } from "@elb/ui/forms";
import { loadCaseById } from "../appState";
import { useAppState } from "../useAppState";

function sortDossiers(caseFiles: readonly CaseFile[]): CaseFile[] {
  return [...caseFiles].sort((left, right) =>
    right.meta.updatedAt.localeCompare(left.meta.updatedAt, "de-CH", { numeric: true, sensitivity: "base" })
  );
}

function getDossierDisplayName(caseFile: CaseFile): string {
  return caseFile.consignor.company.trim() || caseFile.consignor.lastName.trim() || "Unbenannt";
}

function getDossierStatusLabel(caseFile: CaseFile, currentDossierIdByClerk: Record<string, string | null>): string {
  if (caseFile.meta.id === currentDossierIdByClerk[caseFile.meta.clerkId]) {
    return "Aktuell";
  }

  return caseFile.meta.status === "finalized" ? "Gespeichert" : "In Bearbeitung";
}

export function LoadCenterPage(props: { onDone?: () => void; onOpenClerkSelector?: () => void }) {
  const state = useAppState();
  const [showAllClerks, setShowAllClerks] = useState(false);
  const clerkNameById = new Map(state.masterData.clerks.map((clerk) => [clerk.id, clerk.name]));

  const visibleDossiers = useMemo(() => {
    const base = showAllClerks || !state.activeClerkId
      ? state.dossiers
      : state.dossiers.filter((caseFile) => caseFile.meta.clerkId === state.activeClerkId);
    return sortDossiers(base);
  }, [showAllClerks, state.activeClerkId, state.dossiers]);

  return (
    <div className="page-grid">
      <Section title="Dossiers laden">
        <div className="inline-actions">
          <button type="button" className="secondary-button" onClick={props.onOpenClerkSelector}>
            Sachbearbeiter wechseln
          </button>
          <button
            type="button"
            className={showAllClerks ? "primary-button" : "secondary-button"}
            onClick={() => setShowAllClerks((current) => !current)}
          >
            {showAllClerks ? "Nur aktueller Sachbearbeiter" : "Alle Sachbearbeiter anzeigen"}
          </button>
        </div>
        {!visibleDossiers.length ? <p>Keine Dossiers vorhanden.</p> : null}
        {visibleDossiers.length ? (
          <div className="load-list">
            {visibleDossiers.map((dossier) => (
              <button
                key={dossier.meta.id}
                type="button"
                className="primary-button load-list__item"
                onClick={() => {
                  loadCaseById(dossier.meta.id);
                  props.onDone?.();
                }}
              >
                <strong>{`${clerkNameById.get(dossier.meta.clerkId) ?? "Unbekannt"} · ${getDossierDisplayName(dossier)}`}</strong>
                <span>{`${getDossierStatusLabel(dossier, state.currentDossierIdByClerk)} · ELB ${dossier.meta.receiptNumber}`}</span>
              </button>
            ))}
          </div>
        ) : null}
      </Section>
    </div>
  );
}
