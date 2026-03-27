import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CaseFile } from "@elb/domain/index";
import { Field, Section } from "@elb/ui/forms";
import { FollowUpFieldControl, getTextInputClassName } from "./formSupport";

function ModalPortal(props: { children: ReactNode }) {
  if (typeof document === "undefined") {
    return <>{props.children}</>;
  }

  return createPortal(props.children, document.body);
}

export function NewDossierModal(props: {
  open: boolean;
  suggestedReceiptNumber: string;
  onCreate: (input: { customerName: string; isCompany: boolean; receiptNumber: string }) => void;
  onOpenLoadCenter: () => void;
  onCancel: () => void;
}) {
  const [customerName, setCustomerName] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [nameMode, setNameMode] = useState<"lastName" | "company">("lastName");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!props.open) {
      return;
    }

    setCustomerName("");
    setReceiptNumber(props.suggestedReceiptNumber);
    setNameMode("lastName");
    setErrorMessage("");
  }, [props.open, props.suggestedReceiptNumber]);

  if (!props.open) {
    return null;
  }

  const canCreate = Boolean(customerName.trim() && receiptNumber.trim());

  function handleCreate() {
    try {
      props.onCreate({
        customerName,
        isCompany: nameMode === "company",
        receiptNumber: receiptNumber.trim()
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Dossier konnte nicht angelegt werden.");
    }
  }

  return (
    <div className="pin-modal">
      <div className="overlay__card overlay__card--narrow">
        <div className="page-grid">
          <Section title="Neues Dossier">
            <Field label="ELB Name" full>
              <input
                className={getTextInputClassName(customerName)}
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
              />
            </Field>
            <div className="toggle-list" role="group" aria-label="ELB-Namensart">
              <label className="checkbox-line">
                <input type="checkbox" checked={nameMode === "lastName"} onChange={() => setNameMode("lastName")} />
                <span>Nachname</span>
              </label>
              <label className="checkbox-line">
                <input type="checkbox" checked={nameMode === "company"} onChange={() => setNameMode("company")} />
                <span>Firma</span>
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
            <div className="pin-modal__actions">
              <button type="button" onClick={props.onCancel}>
                Abbrechen
              </button>
              <button type="button" onClick={props.onOpenLoadCenter}>
                Dossier laden
              </button>
              <button type="button" className="primary-button" disabled={!canCreate} onClick={handleCreate}>
                Dossier anlegen
              </button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

export function VatCaptureModal(props: {
  value: string;
  onValueChange: (value: string) => void;
  onConfirm: () => void;
}) {
  const isValid = props.value.trim().length > 0;

  return (
    <div className="pin-modal">
      <div className="overlay__card overlay__card--narrow">
        <div className="admin-header">
          <h2>MwSt-Nr. erfassen</h2>
        </div>
        <div className="page-grid">
          <Section title="Pflichtangabe für Kategorie C">
            <p className="modal-hint">
              Für die Kategorie C muss jetzt eine MwSt-Nr. erfasst werden. Das Modal kann erst nach Eingabe eines Werts geschlossen werden.
            </p>
            <Field label="MwSt-Nr." full>
              <input
                className={getTextInputClassName(props.value)}
                value={props.value}
                onChange={(event) => props.onValueChange(event.target.value)}
              />
            </Field>
            <FollowUpFieldControl value={props.value} onChange={props.onValueChange} />
            {!isValid ? <p className="field-warning">Bitte erfassen Sie eine MwSt-Nr. oder markieren Sie "Angaben folgen".</p> : null}
            <div className="pin-modal__actions">
              <button type="button" className="primary-button" disabled={!isValid} onClick={props.onConfirm}>
                Übernehmen
              </button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

export function OwnerResetConfirmModal(props: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="pin-modal">
      <div className="overlay__card overlay__card--narrow">
        <div className="admin-header">
          <h2>Eigentuemer loeschen?</h2>
        </div>
        <div className="page-grid">
          <Section title="Warnhinweis">
            <p className="modal-hint">
              Wenn "Eigentuemer = Einlieferer" aktiviert wird, werden die separat erfassten Eigentuemer-Daten geloescht.
            </p>
            <div className="pin-modal__actions">
              <button type="button" onClick={props.onCancel}>
                Abbrechen
              </button>
              <button type="button" className="primary-button" onClick={props.onConfirm}>
                Loeschen und uebernehmen
              </button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

export function ReceiptNumberEditConfirmModal(props: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ModalPortal>
      <div className="pin-modal">
        <div className="overlay__card overlay__card--narrow">
          <div className="admin-header">
            <h2>ELB-Nummer aendern?</h2>
          </div>
          <div className="page-grid">
            <Section title="Warnhinweis">
              <p className="modal-hint">
                Die ELB-Nummer sollte nur in Ausnahmefaellen geaendert werden. Bitte erst nach Pruefung fortfahren.
              </p>
              <div className="pin-modal__actions">
                <button type="button" onClick={props.onCancel}>
                  Abbrechen
                </button>
                <button type="button" className="primary-button" onClick={props.onConfirm}>
                  Aenderung freigeben
                </button>
              </div>
            </Section>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

export function ObjectDeleteConfirmModal(props: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ModalPortal>
      <div className="pin-modal">
        <div className="overlay__card overlay__card--narrow">
          <div className="admin-header">
            <h2>Objekt loeschen?</h2>
          </div>
          <div className="page-grid">
            <Section title="Warnhinweis">
              <p className="modal-hint">
                Dieses Objekt wird aus dem Dossier entfernt. Bitte pruefen, ob der Eintrag wirklich geloescht werden soll.
              </p>
              <div className="pin-modal__actions">
                <button type="button" onClick={props.onCancel}>
                  Abbrechen
                </button>
                <button type="button" className="primary-button" onClick={props.onConfirm}>
                  Objekt loeschen
                </button>
              </div>
            </Section>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

export type VatCaptureModalCase = Pick<CaseFile, "consignor">;
