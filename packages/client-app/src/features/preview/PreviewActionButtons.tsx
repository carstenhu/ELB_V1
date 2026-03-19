import type { CaseFile } from "@elb/domain/index";
import { usePreviewActions } from "./usePreviewActions";

export function PreviewActionButtons(props: { caseFile: CaseFile; onExportStatusChange: (value: string) => void }) {
  const actions = usePreviewActions(props.caseFile, props.onExportStatusChange);

  return (
    <>
      <button onClick={() => void actions.openDataFolder()}>Datenordner oeffnen</button>
      <button onClick={() => actions.saveDraft()}>Entwurf speichern</button>
      <button onClick={() => void actions.openPdf()}>PDF anzeigen</button>
      <button onClick={() => void actions.exportArtifacts()}>ZIP finalisieren</button>
    </>
  );
}
