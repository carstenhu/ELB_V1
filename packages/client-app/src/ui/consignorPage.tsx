import { useState } from "react";
import { deriveBeneficiary, deriveOwner, type CaseFile } from "@elb/domain/index";
import { Field, Section } from "@elb/ui/forms";
import { useAppState } from "../useAppState";
import { useCaseEditorActions } from "../features/caseEditor/useCaseEditorActions";
import { clearOwnerData, hasSeparateOwnerData } from "../features/owner/ownerState";
import { findAsset } from "./caseAssets";
import { OwnerResetConfirmModal, VatCaptureModal } from "./caseModals";
import { CountryInput, InlineToggle, VAT_CATEGORY_OPTIONS, getFieldInputClassName, getTextInputClassName } from "./formSupport";

export function ConsignorPage(props: { caseFile: CaseFile }) {
  const state = useAppState();
  const actions = useCaseEditorActions(props.caseFile);
  const owner = deriveOwner(props.caseFile.consignor, props.caseFile.owner);
  const beneficiary = deriveBeneficiary(props.caseFile.consignor, props.caseFile.bank);
  const consignorPhoto = findAsset(props.caseFile, props.caseFile.consignor.photoAssetId);
  const [vatModalOpen, setVatModalOpen] = useState(false);
  const [ownerResetConfirmOpen, setOwnerResetConfirmOpen] = useState(false);

  function applyVatCategory(value: CaseFile["consignor"]["vatCategory"]) {
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

  function handleOwnerSameAsConsignorChange(checked: boolean) {
    if (!checked) {
      actions.updateCurrentCase((current) => ({
        ...current,
        owner: { ...current.owner, sameAsConsignor: false }
      }));
      return;
    }

    if (hasSeparateOwnerData(props.caseFile.owner)) {
      setOwnerResetConfirmOpen(true);
      return;
    }

    actions.updateCurrentCase((current) => ({
      ...current,
      owner: clearOwnerData()
    }));
  }

  function confirmOwnerReset() {
    actions.updateCurrentCase((current) => ({
      ...current,
      owner: clearOwnerData()
    }));
    setOwnerResetConfirmOpen(false);
  }

  return (
    <>
      <div className="page-grid">
        <Section title="">
          <Field label="ELB-Nummer">
            <input className={getFieldInputClassName(props.caseFile.meta.receiptNumber)} value={props.caseFile.meta.receiptNumber} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, meta: { ...current.meta, receiptNumber: event.target.value } }))} />
          </Field>
        </Section>

        <Section title="Adresse">
          <div className="field field--full">
            <InlineToggle
              label="Firmenadresse"
              checked={props.caseFile.consignor.useCompanyAddress}
              onChange={(checked) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, useCompanyAddress: checked } }))}
            />
          </div>
          {props.caseFile.consignor.useCompanyAddress ? (
            <Field label="Firma" full>
              <input className={getFieldInputClassName(props.caseFile.consignor.company)} value={props.caseFile.consignor.company} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, company: event.target.value } }))} />
            </Field>
          ) : null}
          <div className="form-row form-row--triple">
            <Field label="Anrede">
              <select value={props.caseFile.consignor.title} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, title: event.target.value } }))}>
                <option value="">Bitte wählen</option>
                {state.masterData.titles.map((title) => (
                  <option key={title} value={title}>
                    {title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Vorname">
              <input className={getFieldInputClassName(props.caseFile.consignor.firstName)} value={props.caseFile.consignor.firstName} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, firstName: event.target.value } }))} />
            </Field>
            <Field label="Nachname">
              <input className={getFieldInputClassName(props.caseFile.consignor.lastName)} value={props.caseFile.consignor.lastName} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, lastName: event.target.value } }))} />
            </Field>
          </div>
          <Field label="Adresszusatz" full>
            <input className={getFieldInputClassName(props.caseFile.consignor.addressAddon)} value={props.caseFile.consignor.addressAddon} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, addressAddon: event.target.value } }))} />
          </Field>
          <div className="form-row form-row--double">
            <Field label="Straße">
              <input className={getFieldInputClassName(props.caseFile.consignor.street)} value={props.caseFile.consignor.street} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, street: event.target.value } }))} />
            </Field>
            <Field label="Nr.">
              <input className={getFieldInputClassName(props.caseFile.consignor.houseNumber)} value={props.caseFile.consignor.houseNumber} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, houseNumber: event.target.value } }))} />
            </Field>
          </div>
          <div className="form-row form-row--triple">
            <Field label="PLZ">
              <input className={getFieldInputClassName(props.caseFile.consignor.zip)} value={props.caseFile.consignor.zip} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, zip: event.target.value } }))} />
            </Field>
            <Field label="Stadt">
              <input className={getFieldInputClassName(props.caseFile.consignor.city)} value={props.caseFile.consignor.city} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, city: event.target.value } }))} />
            </Field>
            <Field label="Land">
              <CountryInput className={getFieldInputClassName(props.caseFile.consignor.country)} value={props.caseFile.consignor.country} onChange={(value) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, country: value } }))} />
            </Field>
          </div>
          <div className="form-row form-row--double">
            <Field label="Telefon">
              <input className={getFieldInputClassName(props.caseFile.consignor.phone)} value={props.caseFile.consignor.phone} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, phone: event.target.value } }))} />
            </Field>
            <Field label="E-Mail">
              <input className={getFieldInputClassName(props.caseFile.consignor.email)} type="email" value={props.caseFile.consignor.email} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, email: event.target.value } }))} />
            </Field>
          </div>
        </Section>

        <Section title="Einliefererdaten">
          <div className="form-row form-row--double">
            <Field label="MwSt-Kategorie">
              <select value={props.caseFile.consignor.vatCategory} onChange={(event) => applyVatCategory(event.target.value as CaseFile["consignor"]["vatCategory"])}>
                {VAT_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value || "empty"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            {props.caseFile.consignor.vatCategory === "C" ? (
              <Field label="MwSt-Nr.">
                <input className={getTextInputClassName(props.caseFile.consignor.vatNumber)} value={props.caseFile.consignor.vatNumber} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, vatNumber: event.target.value } }))} />
              </Field>
            ) : null}
          </div>
          <div className="form-row form-row--triple">
            <Field label="Geburtsdatum">
              <input className={getFieldInputClassName(props.caseFile.consignor.birthDate)} value={props.caseFile.consignor.birthDate} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, birthDate: event.target.value } }))} />
            </Field>
            <Field label="Nationalität">
              <input className={getFieldInputClassName(props.caseFile.consignor.nationality)} value={props.caseFile.consignor.nationality} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, nationality: event.target.value } }))} />
            </Field>
            <Field label="ID/Passnummer">
              <input className={getFieldInputClassName(props.caseFile.consignor.passportNumber)} value={props.caseFile.consignor.passportNumber} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, passportNumber: event.target.value } }))} />
            </Field>
          </div>
          <Field label="Passfoto" full>
            <div className="photo-upload">
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) {
                    return;
                  }

                  void actions.uploadConsignorPhoto(file);
                  event.target.value = "";
                }}
              />
              {consignorPhoto ? (
                <div className="photo-preview photo-preview--passport">
                  <img src={consignorPhoto.optimizedPath || consignorPhoto.originalPath} alt="Passfoto Einlieferer" />
                  <button type="button" className="photo-preview__remove" onClick={() => void actions.removeConsignorPhoto()}>
                    ×
                  </button>
                </div>
              ) : null}
            </div>
          </Field>
        </Section>

        <Section title="Bank">
          <Field label="Begünstigter" full>
            <input value={beneficiary} disabled />
          </Field>
          <Field label="IBAN">
            <input className={getFieldInputClassName(props.caseFile.bank.iban)} value={props.caseFile.bank.iban} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, bank: { ...current.bank, iban: event.target.value } }))} />
          </Field>
          <Field label="BIC">
            <input className={getFieldInputClassName(props.caseFile.bank.bic)} value={props.caseFile.bank.bic} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, bank: { ...current.bank, bic: event.target.value } }))} />
          </Field>
          <div className="field field--full">
            <InlineToggle
              label="Abweichender Begünstigter"
              checked={props.caseFile.bank.beneficiaryOverride.enabled}
              onChange={(checked) =>
                actions.updateCurrentCase((current) => ({
                  ...current,
                  bank: { ...current.bank, beneficiaryOverride: { ...current.bank.beneficiaryOverride, enabled: checked } }
                }))
              }
            />
          </div>
          {props.caseFile.bank.beneficiaryOverride.enabled ? (
            <>
              <Field label="Grund" full>
                <input className={getFieldInputClassName(props.caseFile.bank.beneficiaryOverride.reason)} value={props.caseFile.bank.beneficiaryOverride.reason} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, bank: { ...current.bank, beneficiaryOverride: { ...current.bank.beneficiaryOverride, reason: event.target.value } } }))} />
              </Field>
              <Field label="Name" full>
                <input className={getFieldInputClassName(props.caseFile.bank.beneficiaryOverride.name)} value={props.caseFile.bank.beneficiaryOverride.name} disabled={!props.caseFile.bank.beneficiaryOverride.reason} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, bank: { ...current.bank, beneficiaryOverride: { ...current.bank.beneficiaryOverride, name: event.target.value } } }))} />
              </Field>
            </>
          ) : null}
        </Section>

        <Section title="Eigentümer">
          <div className="field field--full">
            <InlineToggle
              label="Eigentümer = Einlieferer"
              checked={props.caseFile.owner.sameAsConsignor}
              onChange={handleOwnerSameAsConsignorChange}
            />
          </div>
          {props.caseFile.owner.sameAsConsignor ? null : (
            <>
              <Field label="Vorname">
                <input className={getFieldInputClassName(owner.firstName)} value={owner.firstName} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, firstName: event.target.value } }))} />
              </Field>
              <Field label="Nachname">
                <input className={getFieldInputClassName(owner.lastName)} value={owner.lastName} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, lastName: event.target.value } }))} />
              </Field>
              <Field label="Straße">
                <input className={getFieldInputClassName(owner.street)} value={owner.street} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, street: event.target.value } }))} />
              </Field>
              <Field label="Nr.">
                <input className={getFieldInputClassName(owner.houseNumber)} value={owner.houseNumber} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, houseNumber: event.target.value } }))} />
              </Field>
              <Field label="PLZ">
                <input className={getFieldInputClassName(owner.zip)} value={owner.zip} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, zip: event.target.value } }))} />
              </Field>
              <Field label="Stadt">
                <input className={getFieldInputClassName(owner.city)} value={owner.city} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, city: event.target.value } }))} />
              </Field>
              <Field label="Land">
                <input className={getFieldInputClassName(owner.country)} value={owner.country} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, country: event.target.value } }))} />
              </Field>
            </>
          )}
        </Section>
      </div>
      {vatModalOpen ? (
        <VatCaptureModal
          value={props.caseFile.consignor.vatNumber}
          onValueChange={(value) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, vatNumber: value } }))}
          onConfirm={() => setVatModalOpen(false)}
        />
      ) : null}
      {ownerResetConfirmOpen ? (
        <OwnerResetConfirmModal
          onConfirm={confirmOwnerReset}
          onCancel={() => setOwnerResetConfirmOpen(false)}
        />
      ) : null}
    </>
  );
}
