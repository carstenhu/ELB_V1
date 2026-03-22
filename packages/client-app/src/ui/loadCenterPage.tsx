import { useEffect, useMemo, useRef, useState } from "react";
import { getSuggestedCaseNumber } from "@elb/app-core/index";
import { type CaseFile } from "@elb/domain/index";
import { Field, Section } from "@elb/ui/forms";
import { getReceiptNumberScope, loadCaseById, openNewDossier } from "../appState";
import { useAppState } from "../useAppState";
import { getTextInputClassName } from "./formSupport";

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
  const [customerName, setCustomerName] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [nameMode, setNameMode] = useState<"lastName" | "company">("lastName");
  const [errorMessage, setErrorMessage] = useState("");
  const previousClerkIdRef = useRef<string | null>(null);
  const clerkNameById = new Map(state.masterData.clerks.map((clerk) => [clerk.id, clerk.name]));
  const suggestedReceiptNumber = useMemo(() => {
    if (!state.activeClerkId) {
      return "";
    }

    return getSuggestedCaseNumber({
      masterData: state.masterData,
      clerkId: state.activeClerkId,
      scope: getReceiptNumberScope(),
      dossiers: state.dossiers
    });
  }, [state.activeClerkId, state.dossiers, state.masterData]);

  const visibleDossiers = useMemo(() => {
    const base = showAllClerks || !state.activeClerkId
      ? state.dossiers
      : state.dossiers.filter((caseFile) => caseFile.meta.clerkId === state.activeClerkId);
    return sortDossiers(base);
  }, [showAllClerks, state.activeClerkId, state.dossiers]);

  const canCreate = Boolean(state.activeClerkId && customerName.trim() && receiptNumber.trim());

  useEffect(() => {
    const previousClerkId = previousClerkIdRef.current;
    const clerkChanged = previousClerkId !== state.activeClerkId;

    if (clerkChanged) {
      setReceiptNumber(suggestedReceiptNumber);
      setErrorMessage("");
    } else if (!receiptNumber.trim() && suggestedReceiptNumber) {
      setReceiptNumber(suggestedReceiptNumber);
    }

    previousClerkIdRef.current = state.activeClerkId;
  }, [receiptNumber, state.activeClerkId, suggestedReceiptNumber]);

  function handleCreateDossier() {
    try {
      openNewDossier({
        customerName,
        isCompany: nameMode === "company",
        receiptNumber: receiptNumber.trim(),
      });
      setCustomerName("");
      setReceiptNumber("");
      setErrorMessage("");
      props.onDone?.();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Dossier konnte nicht angelegt werden.");
    }
  }

  return (
    <div className="page-grid">
      <Section title="Neues Dossier">
        {!state.activeClerkId ? <p>Bitte zuerst einen Sachbearbeiter waehlen.</p> : null}
        <div className="inline-actions">
          <button type="button" className="secondary-button" onClick={props.onOpenClerkSelector}>
            Sachbearbeiter wechseln
          </button>
        </div>
        <Field label="ELB Name" full>
          <input
            className={getTextInputClassName(customerName)}
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
          />
        </Field>
        <div className="toggle-list" role="group" aria-label="ELB-Namensart">
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={nameMode === "lastName"}
              onChange={() => setNameMode("lastName")}
            />
            <span>Nachname</span>
          </label>
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={nameMode === "company"}
              onChange={() => setNameMode("company")}
            />
            <span>Firmenname</span>
          </label>
        </div>
        <Field label="ELB-Nummer" full>
          <input
            className={getTextInputClassName(receiptNumber)}
            value={receiptNumber}
            onChange={(event) => setReceiptNumber(event.target.value.replace(/[^\d]/g, ""))}
          />
        </Field>
        {errorMessage ? <p className="field-warning">{errorMessage}</p> : null}
        <div className="inline-actions">
          <button type="button" className="primary-button" disabled={!canCreate} onClick={handleCreateDossier}>
            Dossier anlegen
          </button>
        </div>
      </Section>

      <Section title="Dossiers laden">
        <div className="inline-actions">
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
