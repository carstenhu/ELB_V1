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
