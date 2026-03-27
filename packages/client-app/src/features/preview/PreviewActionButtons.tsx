import type { CaseFile } from "@elb/domain/index";
import { usePreviewActions, type PreviewProblemDetails } from "./usePreviewActions";

export function PreviewActionButtons(props: {
  caseFile: CaseFile;
  hasMissingRequiredFields: boolean;
  onExportStatusChange: (value: string) => void;
  onCaptureMissing: () => void;
  onPreviewProblem: (problem: PreviewProblemDetails) => void;
  includeWordDocxButton?: boolean;
}) {
  const actions = usePreviewActions(props.caseFile, props.onExportStatusChange, props.onPreviewProblem);

  function guardRequiredFields(runAction: () => void) {
    if (props.hasMissingRequiredFields) {
      props.onExportStatusChange("Bitte zuerst die fehlenden Pflichtfelder erfassen.");
      props.onCaptureMissing();
      return;
    }

    runAction();
  }

  return (
    <>
      <button onClick={() => void actions.openDataFolder()}>Datenordner oeffnen</button>
      <button onClick={() => actions.saveDraft()}>Entwurf speichern</button>
      <button onClick={() => guardRequiredFields(() => void actions.openPdf())}>PDF anzeigen</button>
      {props.includeWordDocxButton ? (
        <button onClick={() => guardRequiredFields(() => void actions.downloadWordDocx())}>Word-Datei erzeugen</button>
      ) : null}
      <button onClick={() => guardRequiredFields(() => void actions.exportArtifacts())}>Dossier speichern</button>
    </>
  );
}
