import { useEffect, useState } from "react";
import type { CaseFile } from "@elb/domain/index";
import { Section } from "@elb/ui/forms";
import { importExchangeData, loadCaseById } from "../appState";
import { usePlatform } from "../platform/platformContext";
import { useAppState } from "../useAppState";

function dedupeCases(caseFiles: Array<CaseFile | null>): CaseFile[] {
  const byId = new Map<string, CaseFile>();

  caseFiles.forEach((caseFile) => {
    if (caseFile) {
      byId.set(caseFile.meta.id, caseFile);
    }
  });

  return [...byId.values()];
}

function getDossierStatusLabel(caseFile: CaseFile, currentDossierIdByClerk: Record<string, string | null>): string {
  if (caseFile.meta.id === currentDossierIdByClerk[caseFile.meta.clerkId]) {
    return "Aktuell";
  }

  return caseFile.meta.status === "finalized" ? "Abgeschlossen" : "Entwurf";
}

export function LoadCenterPage(props: { onDone?: () => void }) {
  const state = useAppState();
  const platform = usePlatform();
  const [storedZipOptions, setStoredZipOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [zipStatus, setZipStatus] = useState("");
  const [zipBusy, setZipBusy] = useState(false);
  const clerkNameById = new Map(state.masterData.clerks.map((clerk) => [clerk.id, clerk.name]));

  useEffect(() => {
    let active = true;
    setZipBusy(true);
    setZipStatus("");

    void platform.exchangeImport
      .listStoredZipOptions({
        masterData: state.masterData
      })
      .then((options) => {
        if (!active) {
          return;
        }

        setStoredZipOptions(options.map((option) => ({ id: option.id, label: option.label })));
        setZipStatus(options.length ? "" : "Keine gespeicherten ZIP-Dateien vorhanden.");
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setStoredZipOptions([]);
        setZipStatus(error instanceof Error ? error.message : "ZIP-Dateien konnten nicht geladen werden.");
      })
      .finally(() => {
        if (active) {
          setZipBusy(false);
        }
      });

    return () => {
      active = false;
    };
  }, [platform, state.masterData]);

  const availableDossiers = dedupeCases([state.currentCase, ...state.drafts, ...state.finalized]).sort((left, right) =>
    right.meta.updatedAt.localeCompare(left.meta.updatedAt, "de-CH", { numeric: true, sensitivity: "base" })
  );

  async function handleStoredZipImport(zipId: string) {
    setZipBusy(true);
    setZipStatus("");

    try {
      const imported = await platform.exchangeImport.importStoredZip({
        masterData: state.masterData,
        zipId
      });

      if (!imported) {
        setZipStatus("Die ausgewaehlte ZIP konnte nicht geladen werden.");
        return;
      }

      importExchangeData(imported);
      setZipStatus(imported.message);
      props.onDone?.();
    } catch (error) {
      setZipStatus(error instanceof Error ? error.message : "ZIP konnte nicht geladen werden.");
    } finally {
      setZipBusy(false);
    }
  }

  return (
    <div className="page-grid">
      <Section title="Dossiers laden">
        {!availableDossiers.length ? <p>Keine gespeicherten Dossiers vorhanden.</p> : null}
        {availableDossiers.length ? (
          <div className="load-list">
            {availableDossiers.map((dossier) => (
              <button
                key={dossier.meta.id}
                type="button"
                className="primary-button load-list__item"
                onClick={() => {
                  loadCaseById(dossier.meta.id);
                  props.onDone?.();
                }}
              >
                <strong>{`${clerkNameById.get(dossier.meta.clerkId) ?? "Unbekannt"} · ${dossier.consignor.lastName || dossier.consignor.company || "Unbenannt"}`}</strong>
                <span>{`${getDossierStatusLabel(dossier, state.currentDossierIdByClerk)} · ELB ${dossier.meta.receiptNumber}`}</span>
              </button>
            ))}
          </div>
        ) : null}
      </Section>
      <Section title="Gespeicherte Dossier-ZIP-Dateien laden">
        {!storedZipOptions.length && !zipBusy ? <p>{zipStatus || "Keine gespeicherten ZIP-Dateien vorhanden."}</p> : null}
        {storedZipOptions.length ? (
          <div className="load-list">
            {storedZipOptions.map((zipOption) => (
              <button
                key={zipOption.id}
                type="button"
                className="primary-button load-list__item"
                disabled={zipBusy}
                onClick={() => void handleStoredZipImport(zipOption.id)}
              >
                <strong>{zipOption.label}</strong>
                <span>{zipBusy ? "Wird geladen..." : "Austausch-ZIP importieren"}</span>
              </button>
            ))}
          </div>
        ) : null}
        {zipStatus && storedZipOptions.length ? <p>{zipStatus}</p> : null}
      </Section>
    </div>
  );
}
