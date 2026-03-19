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

  const availableDrafts = [...state.drafts].sort((left, right) =>
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
      <Section title="Entwuerfe laden">
        {!availableDrafts.length ? <p>Keine gespeicherten Entwuerfe vorhanden.</p> : null}
        {availableDrafts.length ? (
          <div className="load-list">
            {availableDrafts.map((draft) => (
              <button
                key={draft.meta.id}
                type="button"
                className="primary-button load-list__item"
                onClick={() => {
                  loadCaseById(draft.meta.id);
                  props.onDone?.();
                }}
              >
                <strong>{`${clerkNameById.get(draft.meta.clerkId) ?? "Unbekannt"} · ${draft.consignor.lastName || draft.consignor.company || "Unbenannt"}`}</strong>
                <span>{`ELB ${draft.meta.receiptNumber}`}</span>
              </button>
            ))}
          </div>
        ) : null}
      </Section>
      <Section title="Gespeicherte ZIP-Dateien laden">
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
