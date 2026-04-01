import type { ReactNode } from "react";

export function ExportStatusCard(props: {
  beneficiary: string;
  clerkLabel: string;
  zipFileName: string;
  missingRequiredFields: string[];
  exportStatus: string;
  actions?: ReactNode;
  className?: string;
  onCaptureMissing?: () => void;
  requiredFieldsLabel?: string;
}) {
  const requiredLabel = props.requiredFieldsLabel ?? "PDF";

  return (
    <div className={props.className ? `preview-card ${props.className}` : "preview-card"}>
      <h3>Exportstatus</h3>
      {props.actions ? <div className="preview-card__actions">{props.actions}</div> : null}
      <p>Beguenstigter: {props.beneficiary || "Noch nicht gesetzt"}</p>
      <p>Sachbearbeiter: {props.clerkLabel || "Noch nicht gesetzt"}</p>
      <p>ZIP: {props.zipFileName}</p>
      {props.missingRequiredFields.length ? (
        <>
          <div className="preview-card__section-head">
            <h4>Fehlende {requiredLabel}-Pflichtfelder</h4>
            {props.onCaptureMissing ? (
              <button type="button" onClick={props.onCaptureMissing}>
                Angaben erfassen
              </button>
            ) : null}
          </div>
          <ul className="simple-list">
            {props.missingRequiredFields.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ) : (
        <p>Alle konfigurierten {requiredLabel}-Pflichtfelder sind aktuell befuellt.</p>
      )}
      {props.exportStatus ? <p>{props.exportStatus}</p> : null}
    </div>
  );
}
