import { useState } from "react";
import type { CaseFile } from "@elb/domain/index";
import { ObjectDeleteConfirmModal, VatCaptureModal } from "../../ui/caseModals";
import { useAppState } from "../../useAppState";
import { useCaseEditorActions } from "../caseEditor/useCaseEditorActions";
import { PdfSignatureEditor } from "./PdfSignatureEditor";
import {
  PdfBankEditorSection,
  PdfConsignorEditorSection,
  PdfCostsEditorSection,
  PdfMetaEditorSection,
  PdfObjectEditorSection,
  PdfOwnerEditorSection
} from "./PdfCaseEditSections";
import type { PdfEditTarget } from "../../pdfPreview";

export function PdfEditModal(props: {
  caseFile: CaseFile;
  openTarget: PdfEditTarget | null;
  onClose: () => void;
  onTargetChange: (target: PdfEditTarget | null) => void;
}) {
  const state = useAppState();
  const actions = useCaseEditorActions(props.caseFile);
  const [vatModalOpen, setVatModalOpen] = useState(false);
  const [deleteObjectId, setDeleteObjectId] = useState<string | null>(null);
  const activeClerk = state.masterData.clerks.find((clerk) => clerk.id === props.caseFile.meta.clerkId) ?? null;

  function applyConsignorVatCategory(value: CaseFile["consignor"]["vatCategory"]) {
    actions.updateCurrentCase((current) => ({
      ...current,
      consignor: {
        ...current.consignor,
        vatCategory: value,
        vatNumber: value === "C" ? current.consignor.vatNumber : ""
      }
    }));
    setVatModalOpen(value === "C");
  }

  if (!props.openTarget) {
    return null;
  }

  return (
    <div className="pin-modal">
      <div className="overlay__card">
        <div className="admin-header">
          <h2>Bereich bearbeiten</h2>
          <button onClick={props.onClose}>Schließen</button>
        </div>
        <div className="page-grid">
          {props.openTarget.kind === "meta" ? <PdfMetaEditorSection caseFile={props.caseFile} /> : null}
          {props.openTarget.kind === "consignor" ? <PdfConsignorEditorSection caseFile={props.caseFile} onVatCategoryChange={applyConsignorVatCategory} /> : null}
          {props.openTarget.kind === "owner" ? <PdfOwnerEditorSection caseFile={props.caseFile} /> : null}
          {props.openTarget.kind === "bank" ? <PdfBankEditorSection caseFile={props.caseFile} /> : null}
          {props.openTarget.kind === "costs" ? <PdfCostsEditorSection caseFile={props.caseFile} /> : null}
          {props.openTarget.kind === "object" ? (
            <PdfObjectEditorSection
              caseFile={props.caseFile}
              objectIndex={props.openTarget.objectIndex}
              onClose={props.onClose}
              onRequestDelete={setDeleteObjectId}
              onTargetChange={props.onTargetChange}
            />
          ) : null}
          {props.openTarget.kind === "consignorSignature" ? (
            <PdfSignatureEditor
              title="Einlieferer-Signatur"
              value={props.caseFile.signatures.consignorSignaturePng}
              description="Der Signaturbereich ist jetzt präzise auf das PDF gelegt. Die Canvas-Erfassung folgt als nächster Schritt."
              onClose={props.onClose}
              onClear={() =>
                actions.updateCurrentCase((current) => ({
                  ...current,
                  signatures: {
                    ...current.signatures,
                    consignorSignaturePng: ""
                  }
                }))
              }
              onSave={(dataUrl) => {
                actions.updateCurrentCase((current) => ({
                  ...current,
                  signatures: {
                    ...current.signatures,
                    consignorSignaturePng: dataUrl
                  }
                }));
                props.onClose();
              }}
            />
          ) : null}
          {props.openTarget.kind === "clerkSignature" ? (
            <PdfSignatureEditor
              title="Sachbearbeiter-Signatur"
              value={activeClerk?.signaturePng ?? ""}
              description="Die Sachbearbeiter-Signatur wird im Admin-Panel gepflegt und danach automatisch im PDF ins Koller-Feld eingesetzt."
              onClose={props.onClose}
              onClear={() => {
                if (!activeClerk) {
                  return;
                }

                actions.updateMasterData((current) => ({
                  ...current,
                  clerks: current.clerks.map((clerk) => (clerk.id === activeClerk.id ? { ...clerk, signaturePng: "" } : clerk))
                }));
              }}
              onSave={(dataUrl) => {
                if (!activeClerk) {
                  return;
                }

                actions.updateMasterData((current) => ({
                  ...current,
                  clerks: current.clerks.map((clerk) => (clerk.id === activeClerk.id ? { ...clerk, signaturePng: dataUrl } : clerk))
                }));
                props.onClose();
              }}
            />
          ) : null}
        </div>
      </div>
      {vatModalOpen ? (
        <VatCaptureModal
          value={props.caseFile.consignor.vatNumber}
          onValueChange={(value) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, vatNumber: value } }))}
          onConfirm={() => setVatModalOpen(false)}
        />
      ) : null}
      {deleteObjectId ? (
        <ObjectDeleteConfirmModal
          onCancel={() => setDeleteObjectId(null)}
          onConfirm={() => {
            actions.deleteObject(deleteObjectId);
            setDeleteObjectId(null);
            props.onClose();
          }}
        />
      ) : null}
    </div>
  );
}
