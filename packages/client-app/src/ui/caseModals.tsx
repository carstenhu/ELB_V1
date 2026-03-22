import { useEffect, useState } from "react";
import type { CaseFile } from "@elb/domain/index";
import { Field, Section } from "@elb/ui/forms";
import { FollowUpFieldControl, getTextInputClassName } from "./formSupport";

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

export type VatCaptureModalCase = Pick<CaseFile, "consignor">;

export function DossierCreateModal(props: {
  initialCustomerName?: string;
  initialReceiptNumber?: string;
  errorMessage?: string;
  onConfirm: (input: { customerName: string; isCompany: boolean; receiptNumber: string }) => void;
  onCancel?: () => void;
  onLoadExisting?: () => void;
}) {
  const [customerName, setCustomerName] = useState(props.initialCustomerName ?? "");
  const [receiptNumber, setReceiptNumber] = useState(props.initialReceiptNumber ?? "");
  const [isCompany, setIsCompany] = useState(false);

  useEffect(() => {
    setCustomerName(props.initialCustomerName ?? "");
  }, [props.initialCustomerName]);

  useEffect(() => {
    setReceiptNumber(props.initialReceiptNumber ?? "");
  }, [props.initialReceiptNumber]);

  const normalizedReceiptNumber = receiptNumber.replace(/\D/g, "");
  const canConfirm = customerName.trim().length > 0 && normalizedReceiptNumber.length > 0;

  return (
    <div className="pin-modal">
      <div className="overlay__card overlay__card--narrow">
        <div className="admin-header">
          <h2>Dossier eroeffnen</h2>
        </div>
        <div className="page-grid">
          <Section title="Pflichtangaben">
            <Field label="Nachname oder Firma" full>
              <input
                className={getTextInputClassName(customerName)}
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
              />
            </Field>
            <div className="field field--full">
              <label className="toggle-button">
                <input
                  type="checkbox"
                  checked={isCompany}
                  onChange={(event) => setIsCompany(event.target.checked)}
                  style={{ display: "none" }}
                />
                {isCompany ? "Als Firma angelegt" : "Als Nachname angelegt"}
              </label>
            </div>
            <Field label="ELB-Nummer" full>
              <input
                className={getTextInputClassName(normalizedReceiptNumber)}
                value={receiptNumber}
                onChange={(event) => setReceiptNumber(event.target.value.replace(/\D/g, ""))}
              />
            </Field>
            {props.errorMessage ? <p className="field-warning">{props.errorMessage}</p> : null}
            <div className="pin-modal__actions">
              {props.onLoadExisting ? (
                <button type="button" onClick={props.onLoadExisting}>
                  Dossier laden
                </button>
              ) : null}
              {props.onCancel ? (
                <button type="button" onClick={props.onCancel}>
                  Abbrechen
                </button>
              ) : null}
              <button
                type="button"
                className="primary-button"
                disabled={!canConfirm}
                onClick={() => props.onConfirm({ customerName, isCompany, receiptNumber: normalizedReceiptNumber })}
              >
                Dossier anlegen
              </button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
