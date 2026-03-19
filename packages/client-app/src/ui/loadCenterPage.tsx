import { useEffect, useState } from "react";
import { Section } from "@elb/ui/forms";
import { importExchangeData, loadCaseById } from "../appState";
import { usePlatform } from "../platform/platformContext";
import { useAppState } from "../useAppState";

export function LoadCenterPage(props: { onDone?: () => void }) {
  const state = useAppState();
  const platform = usePlatform();
  const [storedZipOptions, setStoredZipOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [zipStatus, setZipStatus] = useState("");
  const [zipBusy, setZipBusy] = useState(false);

  useEffect(() => {
    if (!state.activeClerkId) {
      setStoredZipOptions([]);
      setZipStatus("Bitte zuerst einen Sachbearbeiter waehlen.");
      return;
    }

    let active = true;
    setZipBusy(true);
    setZipStatus("");

    void platform.exchangeImport
      .listStoredZipOptions({
        clerkId: state.activeClerkId,
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
  }, [platform, state.activeClerkId, state.masterData]);

  const clerkDrafts = state.activeClerkId ? state.drafts.filter((draft) => draft.meta.clerkId === state.activeClerkId) : [];

  async function handleStoredZipImport(zipId: string) {
    if (!state.activeClerkId) {
      setZipStatus("Bitte zuerst einen Sachbearbeiter waehlen.");
      return;
    }

    setZipBusy(true);
    setZipStatus("");

    try {
      const imported = await platform.exchangeImport.importStoredZip({
        clerkId: state.activeClerkId,
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
      <Section title="Entwuerfe laden">
        {!state.activeClerkId ? <p>Bitte zuerst einen Sachbearbeiter waehlen.</p> : null}
        {state.activeClerkId && !clerkDrafts.length ? <p>Keine Entwuerfe fuer den aktuellen Sachbearbeiter vorhanden.</p> : null}
        {clerkDrafts.length ? (
          <div className="load-list">
            {clerkDrafts.map((draft) => (
              <button
                key={draft.meta.id}
                type="button"
                className="primary-button load-list__item"
                onClick={() => {
                  loadCaseById(draft.meta.id);
                  props.onDone?.();
                }}
              >
                <strong>{draft.consignor.lastName || draft.consignor.company || "Unbenannt"}</strong>
                <span>ELB {draft.meta.receiptNumber}</span>
              </button>
            ))}
          </div>
        ) : null}
      </Section>
      <Section title="Gespeicherte ZIP-Dateien laden">
        {!state.activeClerkId ? <p>Bitte zuerst einen Sachbearbeiter waehlen.</p> : null}
        {state.activeClerkId && !storedZipOptions.length && !zipBusy ? <p>{zipStatus || "Keine gespeicherten ZIP-Dateien vorhanden."}</p> : null}
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
