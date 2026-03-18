/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from "react";
import { requireCaseReadyForExport } from "@elb/app-core/index";
import { createExportZip, generateExportBundle } from "@elb/export-core/index";
import type { CaseFile } from "@elb/domain/index";
import { persistExportArtifactsToDisk } from "@elb/persistence/filesystem";
import { Field, Section } from "@elb/ui/forms";
import { generateElbPdf } from "@elb/pdf-core/index";
import { addObject, finalizeCurrentCase, saveDraft, updateCurrentCase } from "../appState";
import { useAppState } from "../useAppState";
import { FollowUpFieldControl, getTextInputClassName, renderFollowUpOption } from "./formSupport";

export function ExportStatusCard(props: {
  beneficiary: string;
  clerkLabel: string;
  zipFileName: string;
  missingRequiredFields: string[];
  exportStatus: string;
  actions?: ReactNode;
  className?: string;
  onCaptureMissing?: () => void;
}) {
  return (
    <div className={props.className ? `preview-card ${props.className}` : "preview-card"}>
      <h3>Exportstatus</h3>
      {props.actions ? <div className="preview-card__actions">{props.actions}</div> : null}
      <p>Begünstigter: {props.beneficiary || "Noch nicht gesetzt"}</p>
      <p>Sachbearbeiter: {props.clerkLabel || "Noch nicht gesetzt"}</p>
      <p>ZIP: {props.zipFileName}</p>
      {props.missingRequiredFields.length ? (
        <>
          <div className="preview-card__section-head">
            <h4>Fehlende PDF-Pflichtfelder</h4>
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
        <p>Alle konfigurierten PDF-Pflichtfelder sind aktuell befüllt.</p>
      )}
      {props.exportStatus ? <p>{props.exportStatus}</p> : null}
    </div>
  );
}

export type RequiredFieldEntry = {
  key: string;
  label: string;
  kind: "text" | "select" | "action";
  objectIndex?: number;
};

export function getRequiredFieldEntries(caseFile: CaseFile, requiredFields: string[]): RequiredFieldEntry[] {
  const entries: RequiredFieldEntry[] = [];

  for (const field of requiredFields) {
    if (field === "meta.receiptNumber" && !caseFile.meta.receiptNumber.trim()) entries.push({ key: field, label: "ELB-Nummer", kind: "text" });
    if (field === "meta.clerkId" && !caseFile.meta.clerkId.trim()) entries.push({ key: field, label: "Sachbearbeiter", kind: "select" });
    if (field === "consignor.lastName" && !caseFile.consignor.lastName.trim()) entries.push({ key: field, label: "Nachname Einlieferer", kind: "text" });
    if (field === "consignor.street" && !caseFile.consignor.street.trim()) entries.push({ key: field, label: "Straße Einlieferer", kind: "text" });
    if (field === "consignor.zip" && !caseFile.consignor.zip.trim()) entries.push({ key: field, label: "PLZ Einlieferer", kind: "text" });
    if (field === "consignor.city" && !caseFile.consignor.city.trim()) entries.push({ key: field, label: "Stadt Einlieferer", kind: "text" });
  }

  caseFile.objects.forEach((item, index) => {
    if (!item.departmentId.trim()) entries.push({ key: "objects.departmentId", label: `Objekt ${index + 1}: Abteilung`, kind: "select", objectIndex: index });
    if (!item.shortDescription.trim()) entries.push({ key: "objects.shortDescription", label: `Objekt ${index + 1}: Kurzbeschrieb`, kind: "text", objectIndex: index });
    if (!item.estimate.low.trim()) entries.push({ key: "objects.estimate.low", label: `Objekt ${index + 1}: Schätzung von`, kind: "text", objectIndex: index });
    if (!item.estimate.high.trim()) entries.push({ key: "objects.estimate.high", label: `Objekt ${index + 1}: Schätzung bis`, kind: "text", objectIndex: index });
  });

  if (!caseFile.objects.length) {
    entries.push({ key: "objects.create", label: "Mindestens ein Objekt", kind: "action" });
  }

  return entries;
}

export function updateRequiredFieldValue(entry: RequiredFieldEntry, value?: string) {
  if (entry.key === "objects.create") {
    addObject();
    return;
  }

  updateCurrentCase((current) => {
    if (entry.objectIndex === undefined) {
      if (entry.key === "meta.receiptNumber") return { ...current, meta: { ...current.meta, receiptNumber: value ?? "" } };
      if (entry.key === "meta.clerkId") return { ...current, meta: { ...current.meta, clerkId: value ?? "" } };
      if (entry.key === "consignor.lastName") return { ...current, consignor: { ...current.consignor, lastName: value ?? "" } };
      if (entry.key === "consignor.street") return { ...current, consignor: { ...current.consignor, street: value ?? "" } };
      if (entry.key === "consignor.zip") return { ...current, consignor: { ...current.consignor, zip: value ?? "" } };
      if (entry.key === "consignor.city") return { ...current, consignor: { ...current.consignor, city: value ?? "" } };
      if (entry.key === "bank.beneficiaryOverride.reason") return { ...current, bank: { ...current.bank, beneficiaryOverride: { ...current.bank.beneficiaryOverride, reason: value ?? "" } } };
      if (entry.key === "bank.beneficiaryOverride.name") return { ...current, bank: { ...current.bank, beneficiaryOverride: { ...current.bank.beneficiaryOverride, name: value ?? "" } } };
      return current;
    }

    return {
      ...current,
      objects: current.objects.map((item, index) => {
        if (index !== entry.objectIndex) {
          return item;
        }

        if (entry.key === "objects.departmentId") return { ...item, departmentId: value ?? "" };
        if (entry.key === "objects.shortDescription") return { ...item, shortDescription: value ?? "" };
        if (entry.key === "objects.estimate.low") return { ...item, estimate: { ...item.estimate, low: value ?? "" } };
        if (entry.key === "objects.estimate.high") return { ...item, estimate: { ...item.estimate, high: value ?? "" } };
        return item;
      })
    };
  });
}

function getRequiredFieldCurrentValue(caseFile: CaseFile, entry: RequiredFieldEntry): string {
  if (entry.key === "meta.receiptNumber") return caseFile.meta.receiptNumber;
  if (entry.key === "meta.clerkId") return caseFile.meta.clerkId;
  if (entry.key === "consignor.lastName") return caseFile.consignor.lastName;
  if (entry.key === "consignor.street") return caseFile.consignor.street;
  if (entry.key === "consignor.zip") return caseFile.consignor.zip;
  if (entry.key === "consignor.city") return caseFile.consignor.city;
  if (entry.key === "bank.beneficiaryOverride.reason") return caseFile.bank.beneficiaryOverride.reason;
  if (entry.key === "bank.beneficiaryOverride.name") return caseFile.bank.beneficiaryOverride.name;
  if (entry.key === "objects.departmentId") return caseFile.objects[entry.objectIndex ?? -1]?.departmentId ?? "";
  if (entry.key === "objects.shortDescription") return caseFile.objects[entry.objectIndex ?? -1]?.shortDescription ?? "";
  if (entry.key === "objects.estimate.low") return caseFile.objects[entry.objectIndex ?? -1]?.estimate.low ?? "";
  if (entry.key === "objects.estimate.high") return caseFile.objects[entry.objectIndex ?? -1]?.estimate.high ?? "";
  return "";
}

export function RequiredFieldsModal(props: { caseFile: CaseFile; entries: RequiredFieldEntry[]; onClose: () => void }) {
  const state = useAppState();

  if (!props.entries.length) {
    return null;
  }

  return (
    <div className="pin-modal">
      <div className="overlay__card">
        <div className="admin-header">
          <h2>Fehlende PDF-Pflichtfelder</h2>
          <button onClick={props.onClose}>Schließen</button>
        </div>
        <div className="page-grid">
          <Section title="Angaben erfassen">
            {props.entries.map((entry) => {
              if (entry.kind === "action") {
                return (
                  <div key={entry.label} className="inline-actions">
                    <span>{entry.label}</span>
                    <button type="button" className="primary" onClick={() => updateRequiredFieldValue(entry)}>
                      Objekt hinzufügen
                    </button>
                  </div>
                );
              }

              const currentValue = getRequiredFieldCurrentValue(props.caseFile, entry);

              if (entry.key === "meta.clerkId") {
                return (
                  <Field key={entry.label} label={entry.label} full>
                    <select value={currentValue} onChange={(event) => updateRequiredFieldValue(entry, event.target.value)}>
                      {renderFollowUpOption(currentValue)}
                      <option value="">Bitte wählen</option>
                      {state.masterData.clerks.map((clerk) => (
                        <option key={clerk.id} value={clerk.id}>
                          {clerk.name}
                        </option>
                      ))}
                    </select>
                    <FollowUpFieldControl value={currentValue} onChange={(nextValue) => updateRequiredFieldValue(entry, nextValue)} />
                  </Field>
                );
              }

              if (entry.key === "objects.departmentId") {
                return (
                  <Field key={entry.label} label={entry.label} full>
                    <select value={currentValue} onChange={(event) => updateRequiredFieldValue(entry, event.target.value)}>
                      {renderFollowUpOption(currentValue)}
                      <option value="">Bitte wählen</option>
                      {state.masterData.departments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.code} · {department.name}
                        </option>
                      ))}
                    </select>
                    <FollowUpFieldControl value={currentValue} onChange={(nextValue) => updateRequiredFieldValue(entry, nextValue)} />
                  </Field>
                );
              }

              return (
                <Field key={entry.label} label={entry.label} full>
                  <input className={getTextInputClassName(currentValue)} value={currentValue} onChange={(event) => updateRequiredFieldValue(entry, event.target.value)} />
                  <FollowUpFieldControl value={currentValue} onChange={(nextValue) => updateRequiredFieldValue(entry, nextValue)} />
                </Field>
              );
            })}
          </Section>
        </div>
      </div>
    </div>
  );
}

export function PreviewActionButtons(props: { caseFile: CaseFile; onExportStatusChange: (value: string) => void }) {
  const state = useAppState();

  async function handleExportArtifacts(): Promise<void> {
    try {
      requireCaseReadyForExport(props.caseFile, state.masterData);
      props.onExportStatusChange("ZIP wird erzeugt...");
      const bundle = await generateExportBundle(props.caseFile, state.masterData);
      const zipBlob = await createExportZip(props.caseFile, state.masterData);
      await persistExportArtifactsToDisk({
        caseFile: props.caseFile,
        artifacts: bundle.artifacts,
        zipFileName: bundle.plan.zipFileName,
        zipContent: zipBlob
      });
      finalizeCurrentCase();
      props.onExportStatusChange(`ZIP wurde lokal unter Daten gespeichert und der Vorgang wurde finalisiert.`);
    } catch (error) {
      props.onExportStatusChange(error instanceof Error ? error.message : "Export fehlgeschlagen.");
    }
  }

  async function handleOpenPdf(): Promise<void> {
    try {
      requireCaseReadyForExport(props.caseFile, state.masterData);
      props.onExportStatusChange("PDF wird erzeugt...");
      const pdfBytes = await generateElbPdf(props.caseFile, state.masterData);
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      props.onExportStatusChange("PDF wurde geöffnet.");
    } catch (error) {
      props.onExportStatusChange(error instanceof Error ? error.message : "PDF konnte nicht geöffnet werden.");
    }
  }

  return (
    <>
      <button onClick={() => saveDraft()}>Entwurf speichern</button>
      <button onClick={() => void handleOpenPdf()}>PDF anzeigen</button>
      <button onClick={() => void handleExportArtifacts()}>ZIP finalisieren</button>
    </>
  );
}
