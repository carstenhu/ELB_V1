import type { CaseFile } from "@elb/domain/index";
import { Field, Section } from "@elb/ui/forms";
import { useAppState } from "../../useAppState";
import { FollowUpFieldControl, getTextInputClassName, renderFollowUpOption } from "../../ui/formSupport";
import {
  getRequiredFieldCurrentValue,
  type RequiredFieldEntry,
  updateRequiredFieldValue
} from "./requiredFields";

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
          <button onClick={props.onClose}>Schliessen</button>
        </div>
        <div className="page-grid">
          <Section title="Angaben erfassen">
            {props.entries.map((entry) => {
              if (entry.inputKind === "action") {
                return (
                  <div key={entry.label} className="inline-actions">
                    <span>{entry.label}</span>
                    <button type="button" className="primary" onClick={() => updateRequiredFieldValue(entry)}>
                      Objekt hinzufuegen
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
                      <option value="">Bitte waehlen</option>
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

              if (entry.key === "objects[].departmentId") {
                return (
                  <Field key={entry.label} label={entry.label} full>
                    <select value={currentValue} onChange={(event) => updateRequiredFieldValue(entry, event.target.value)}>
                      {renderFollowUpOption(currentValue)}
                      <option value="">Bitte waehlen</option>
                      {state.masterData.departments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.code} - {department.name}
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
