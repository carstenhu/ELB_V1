import type { ReactNode } from "react";

export function ExportStatusCard(props: {
  zipFileName: string;
  missingRequiredFields: string[];
  exportStatus: string;
  actions?: ReactNode;
  className?: string;
  onCaptureMissing?: () => void;
  onOpenAdmin?: () => void;
  requiredFieldsLabel?: string;
}) {
  const requiredLabel = props.requiredFieldsLabel ?? "PDF";
  const storagePath = extractStoragePath(props.exportStatus);

  return (
    <div className={props.className ? `preview-card ${props.className}` : "preview-card"}>
      <div className="preview-card__header">
        <h3>Exportstatus</h3>
        {props.onOpenAdmin ? (
          <button type="button" className="secondary-button preview-card__admin-button" onClick={props.onOpenAdmin}>
            Admin
          </button>
        ) : null}
      </div>
      {props.actions ? <div className="preview-card__actions">{props.actions}</div> : null}
      <div className="preview-card__zip">
        <p><strong>ZIP:</strong> {props.zipFileName}</p>
        <p><strong>Speicherpfad:</strong> {storagePath || "Noch kein Export gespeichert."}</p>
      </div>
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

function extractStoragePath(exportStatus: string): string {
  if (!exportStatus) {
    return "";
  }

  const localMatch = exportStatus.match(/^Dossierdateien wurden lokal gespeichert: (.+?)(?:\. Online gespeichert unter:|\. Supabase-Upload ist fehlgeschlagen\.|$)/);
  if (localMatch?.[1]) {
    return localMatch[1].trim();
  }

  const genericMatch = exportStatus.match(/^Dossierdateien wurden gespeichert: (.+)$/);
  if (genericMatch?.[1]) {
    return genericMatch[1].trim();
  }

  return "";
}
