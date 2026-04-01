import type { CaseFile } from "@elb/domain/index";
import { Field, Section } from "@elb/ui/forms";
import { useAppState } from "../../useAppState";
import { FOLLOW_UP_VALUE, FollowUpFieldControl, getTextInputClassName, isFollowUpValue, renderFollowUpOption } from "../../ui/formSupport";
import {
  getRequiredFieldCurrentValue,
  type RequiredFieldEntry,
  updateRequiredFieldValue,
  updateRequiredFieldValues
} from "./requiredFields";

export function RequiredFieldsModal(props: { caseFile: CaseFile; entries: RequiredFieldEntry[]; onClose: () => void; title?: string }) {
  const state = useAppState();

  if (!props.entries.length) {
    return null;
  }

  const fillableEntries = props.entries.filter((entry) => entry.inputKind !== "action");
  const allMissingFieldsMarkedFollowUp =
    fillableEntries.length > 0 && fillableEntries.every((entry) => isFollowUpValue(getRequiredFieldCurrentValue(props.caseFile, entry)));

  return (
    <div className="pin-modal">
      <div className="overlay__card">
        <div className="admin-header">
          <h2>{props.title ?? "Fehlende PDF-Pflichtfelder"}</h2>
          <button onClick={props.onClose}>Schliessen</button>
        </div>
        <div className="page-grid">
          <Section title="Angaben erfassen">
            {fillableEntries.length ? (
              <div className="required-fields-bulk-action">
                <div className="required-fields-bulk-action__copy">
                  <strong>Alles direkt mit Angaben folgen markieren</strong>
                  <p>Damit werden alle ausfuellbaren Pflichtfelder in einem Schritt gesetzt.</p>
                </div>
                <label className="follow-up-toggle required-fields-bulk-action__toggle">
                  <input
                    type="checkbox"
                    checked={allMissingFieldsMarkedFollowUp}
                    onChange={(event) => updateRequiredFieldValues(fillableEntries, event.target.checked ? FOLLOW_UP_VALUE : "")}
                  />
                  <span>Alle fehlenden Felder mit Angaben folgen befuellen</span>
                </label>
              </div>
            ) : null}
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

              if (entry.key === "objects[].auctionId") {
                return (
                  <Field key={entry.label} label={entry.label} full>
                    <select value={currentValue} onChange={(event) => updateRequiredFieldValue(entry, event.target.value)}>
                      {renderFollowUpOption(currentValue)}
                      <option value="">Bitte waehlen</option>
                      {state.masterData.auctions.map((auction) => (
                        <option key={auction.id} value={auction.id}>
                          {auction.number} {auction.month}/{auction.year.slice(-2)}
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
