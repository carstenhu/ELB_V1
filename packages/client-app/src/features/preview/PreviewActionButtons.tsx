import type { CaseFile } from "@elb/domain/index";
import { usePreviewActions } from "./usePreviewActions";

export function PreviewActionButtons(props: {
  caseFile: CaseFile;
  hasMissingRequiredFields: boolean;
  onExportStatusChange: (value: string) => void;
  onCaptureMissing: () => void;
}) {
  const actions = usePreviewActions(props.caseFile, props.onExportStatusChange);

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
      <button onClick={() => guardRequiredFields(() => void actions.exportArtifacts())}>ZIP finalisieren</button>
    </>
  );
}
