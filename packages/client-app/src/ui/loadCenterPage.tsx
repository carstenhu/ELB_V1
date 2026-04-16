import { useMemo, useState, useSyncExternalStore } from "react";
import { type CaseFile } from "@elb/domain/index";
import { Section } from "@elb/ui/forms";
import { loadCaseById } from "../appState";
import type { DossierSyncEntrySnapshot } from "../platform/platformTypes";
import { usePlatform } from "../platform/platformContext";
import { useAppState } from "../useAppState";

type DossierSyncState = "synced" | "local-only" | "pending" | "error" | undefined;

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

function getSyncStateLabel(state: DossierSyncState): string | null {
  if (!state) return null;
  if (state === "synced") return "Synchronisiert";
  if (state === "local-only") return "Nur lokal";
  if (state === "pending") return "Wartet auf Sync";
  return "Sync-Fehler";
}

function getStorageLabel(entry: DossierSyncEntrySnapshot | undefined): string | null {
  if (!entry) return null;
  if (entry.cache === "remote-only") return "Remote-only";
  if (entry.cache === "local") return "Lokal geladen";
  return null;
}

function isSupabaseEntry(entry: DossierSyncEntrySnapshot | undefined): boolean {
  if (!entry) return false;
  return entry.cache === "remote-only" || entry.state === "synced";
}

function DossierList(props: {
  dossiers: CaseFile[];
  clerkNameById: Map<string, string>;
  currentDossierIdByClerk: Record<string, string | null>;
  syncEntries: Record<string, DossierSyncEntrySnapshot | undefined>;
  syncStates: Record<string, DossierSyncState>;
  onSelectDossier: (id: string) => void;
}) {
  return (
    <div className="load-list">
      {props.dossiers.map((dossier) => (
        <button
          key={dossier.meta.id}
          type="button"
          className="primary-button load-list__item"
          onClick={() => props.onSelectDossier(dossier.meta.id)}
        >
          <strong>{`${props.clerkNameById.get(dossier.meta.clerkId) ?? "Unbekannt"} - ${getDossierDisplayName(dossier)}`}</strong>
          <span>
            {[
              getDossierStatusLabel(dossier, props.currentDossierIdByClerk),
              `ELB ${dossier.meta.receiptNumber}`,
              getStorageLabel(props.syncEntries[dossier.meta.id]),
              getSyncStateLabel(props.syncStates[dossier.meta.id])
            ].filter(Boolean).join(" - ")}
          </span>
        </button>
      ))}
    </div>
  );
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

  const syncStates = useMemo(
    () =>
      Object.fromEntries(
        state.dossiers.map((dossier) => [dossier.meta.id, dossierSyncStatus?.dossiers[dossier.meta.id]?.state])
      ) as Record<string, DossierSyncState>,
    [state.dossiers, dossierSyncStatus]
  );
  const syncEntries = useMemo(
    () =>
      Object.fromEntries(
        state.dossiers.map((dossier) => [dossier.meta.id, dossierSyncStatus?.dossiers[dossier.meta.id]])
      ) as Record<string, DossierSyncEntrySnapshot | undefined>,
    [state.dossiers, dossierSyncStatus]
  );

  const supabaseDossiers = useMemo(
    () => sortDossiers(state.dossiers.filter((dossier) => isSupabaseEntry(syncEntries[dossier.meta.id]))),
    [state.dossiers, syncEntries]
  );

  const localDossiers = useMemo(() => {
    const base = showAllClerks || !state.activeClerkId
      ? state.dossiers
      : state.dossiers.filter((caseFile) => caseFile.meta.clerkId === state.activeClerkId);
    return sortDossiers(base.filter((dossier) => !isSupabaseEntry(syncEntries[dossier.meta.id])));
  }, [showAllClerks, state.activeClerkId, state.dossiers, syncEntries]);

  function handleSelectDossier(id: string) {
    loadCaseById(id);
    props.onDone?.();
  }

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

        <div className="load-group">
          <h3 className="load-group__title">Supabase-Dossiers</h3>
          <p className="section-status-line">Hier siehst du alle Dossiers aus Supabase und kannst sie direkt laden.</p>
          {!supabaseDossiers.length ? <p>Keine Supabase-Dossiers gefunden.</p> : null}
          {supabaseDossiers.length ? (
            <DossierList
              dossiers={supabaseDossiers}
              clerkNameById={clerkNameById}
              currentDossierIdByClerk={state.currentDossierIdByClerk}
              syncEntries={syncEntries}
              syncStates={syncStates}
              onSelectDossier={handleSelectDossier}
            />
          ) : null}
        </div>

        <div className="load-group">
          <h3 className="load-group__title">Lokale Dossiers</h3>
          {!localDossiers.length ? <p>Keine lokalen Dossiers vorhanden.</p> : null}
          {localDossiers.length ? (
            <DossierList
              dossiers={localDossiers}
              clerkNameById={clerkNameById}
              currentDossierIdByClerk={state.currentDossierIdByClerk}
              syncEntries={syncEntries}
              syncStates={syncStates}
              onSelectDossier={handleSelectDossier}
            />
          ) : null}
        </div>
      </Section>
    </div>
  );
}

