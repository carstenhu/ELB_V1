/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from "react";
import type { PageId } from "@elb/domain/index";
import { APP_NAME } from "@elb/shared/constants";
import { createNewCase, importExchangeData, loadCaseById, selectClerk } from "../appState";
import { usePlatform } from "../platform/platformContext";
import { useAppState } from "../useAppState";

export const pages: Array<{ id: PageId; label: string }> = [
  { id: "consignor", label: "Einlieferer" },
  { id: "objects", label: "Objekte" },
  { id: "internal", label: "Interne Infos" },
  { id: "pdfPreview", label: "ELB-PDF" },
  { id: "wordPreview", label: "Schaetzliste" }
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
  const platform = usePlatform();
  const activeClerk = state.masterData.clerks.find((clerk) => clerk.id === state.activeClerkId);
  const [showStoredZipSelect, setShowStoredZipSelect] = useState(false);
  const [storedZipOptions, setStoredZipOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [storedZipStatus, setStoredZipStatus] = useState("");
  const [storedZipBusy, setStoredZipBusy] = useState(false);

  useEffect(() => {
    if (!showStoredZipSelect || !state.activeClerkId) {
      return;
    }

    let active = true;
    setStoredZipBusy(true);
    setStoredZipStatus("");

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
        setStoredZipStatus(options.length ? "" : "Keine bestehenden ZIP-Dateien gefunden.");
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setStoredZipOptions([]);
        setStoredZipStatus(error instanceof Error ? error.message : "ZIP-Dateien konnten nicht geladen werden.");
      })
      .finally(() => {
        if (active) {
          setStoredZipBusy(false);
        }
      });

    return () => {
      active = false;
    };
  }, [platform, showStoredZipSelect, state.activeClerkId, state.masterData]);

  async function handleStoredZipImport(zipId: string) {
    if (!zipId || !state.activeClerkId) {
      return;
    }

    setStoredZipBusy(true);
    setStoredZipStatus("");

    try {
      const imported = await platform.exchangeImport.importStoredZip({
        clerkId: state.activeClerkId,
        masterData: state.masterData,
        zipId
      });

      if (!imported) {
        setStoredZipStatus("Die ausgewaehlte ZIP konnte nicht geladen werden.");
        return;
      }

      importExchangeData(imported);
      setStoredZipStatus(imported.message);
      setShowStoredZipSelect(false);
      props.onPageChange("consignor");
    } catch (error) {
      setStoredZipStatus(error instanceof Error ? error.message : "ZIP konnte nicht geladen werden.");
    } finally {
      setStoredZipBusy(false);
    }
  }

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
              setShowStoredZipSelect(false);
            }
            if (value.startsWith("case:")) {
              loadCaseById(value.replace("case:", ""));
              setShowStoredZipSelect(false);
            }
            if (value === "admin") {
              props.onPageChange("admin");
              setShowStoredZipSelect(false);
            }
            if (value === "load-stored-zip") {
              setShowStoredZipSelect(true);
            }
            event.target.value = "";
          }}
        >
          <option value="">Menue</option>
          <option value="new-case">Neuer Vorgang</option>
          <option value="load-stored-zip">Bestehende ZIP laden</option>
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
        {showStoredZipSelect ? (
          <div>
            <select
              value=""
              disabled={storedZipBusy}
              onChange={(event) => {
                const zipId = event.target.value;
                event.target.value = "";
                void handleStoredZipImport(zipId);
              }}
            >
              <option value="">{storedZipBusy ? "ZIPs werden geladen..." : "ZIP waehlen"}</option>
              {storedZipOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            {storedZipStatus ? <small>{storedZipStatus}</small> : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
