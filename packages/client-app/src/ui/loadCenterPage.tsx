import { useMemo, useState, useSyncExternalStore } from "react";
import { type CaseFile } from "@elb/domain/index";
import { Section } from "@elb/ui/forms";
import { loadCaseById } from "../appState";
import { usePlatform } from "../platform/platformContext";
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

function getSyncStateLabel(state: "synced" | "local-only" | "pending" | "error" | undefined): string | null {
  if (!state) return null;
  if (state === "synced") return "Synchronisiert";
  if (state === "local-only") return "Nur lokal";
  if (state === "pending") return "Wartet auf Sync";
  return "Sync-Fehler";
}

export function LoadCenterPage(props: { onDone?: () => void; onOpenClerkSelector?: () => void }) {
  const platform = usePlatform();
  const state = useAppState();
  const [showAllClerks, setShowAllClerks] = useState(false);
  const dossierSyncStatus = useSyncExternalStore(
    platform.dossierSyncStatus?.subscribe ?? (() => () => {}),
    platform.dossierSyncStatus?.getSnapshot ?? (() => null),
    platform.dossierSyncStatus?.getSnapshot ?? (() => null)
  );
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
        {dossierSyncStatus ? (
          <p className="section-status-line">
            <strong>Offline-Stand:</strong>{" "}
            {dossierSyncStatus.offline
              ? "Der Browser ist offline. Es werden lokal verfuegbare Dossiers gezeigt."
              : dossierSyncStatus.source === "supabase"
                ? "Dossiers wurden zuletzt aus Supabase geladen."
                : dossierSyncStatus.source === "local"
                  ? "Dossiers stammen aktuell aus dem lokalen Browser-Cache."
                  : "Dossierquelle wird vorbereitet."}
          </p>
        ) : null}
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
                <span>
                  {[
                    getDossierStatusLabel(dossier, state.currentDossierIdByClerk),
                    `ELB ${dossier.meta.receiptNumber}`,
                    getSyncStateLabel(dossierSyncStatus?.dossiers[dossier.meta.id]?.state)
                  ].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </Section>
    </div>
  );
}
