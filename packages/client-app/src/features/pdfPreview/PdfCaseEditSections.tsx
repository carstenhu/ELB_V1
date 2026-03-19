import { formatAmountForDisplay, type Asset, type CaseFile } from "@elb/domain/index";
import { Field, Section } from "@elb/ui/forms";
import { useCaseEditorActions } from "../caseEditor/useCaseEditorActions";
import { clearOwnerData, hasSeparateOwnerData } from "../owner/ownerState";
import { useAppState } from "../../useAppState";
import { findAsset } from "../../ui/caseAssets";
import { CountryInput, InlineToggle, VAT_CATEGORY_OPTIONS, getTextInputClassName, renderFollowUpOption } from "../../ui/formSupport";

export function PdfMetaEditorSection(props: { caseFile: CaseFile }) {
  const state = useAppState();
  const actions = useCaseEditorActions(props.caseFile);

  return (
    <Section title="Meta">
      <Field label="ELB-Nummer">
        <input value={props.caseFile.meta.receiptNumber} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, meta: { ...current.meta, receiptNumber: event.target.value } }))} />
      </Field>
      <Field label="Sachbearbeiter">
        <select value={props.caseFile.meta.clerkId} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, meta: { ...current.meta, clerkId: event.target.value } }))}>
          {renderFollowUpOption(props.caseFile.meta.clerkId)}
          {state.masterData.clerks.map((clerk) => (
            <option key={clerk.id} value={clerk.id}>
              {clerk.name}
            </option>
          ))}
        </select>
      </Field>
    </Section>
  );
}

export function PdfConsignorEditorSection(props: {
  caseFile: CaseFile;
  onVatCategoryChange: (value: CaseFile["consignor"]["vatCategory"]) => void;
}) {
  const state = useAppState();
  const actions = useCaseEditorActions(props.caseFile);
  const consignorPhoto = findAsset(props.caseFile, props.caseFile.consignor.photoAssetId);

  return (
    <Section title="Einlieferer">
      <div className="field field--full">
        <InlineToggle
          label="Firmenadresse"
          checked={props.caseFile.consignor.useCompanyAddress}
          onChange={(checked) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, useCompanyAddress: checked } }))}
        />
      </div>
      {props.caseFile.consignor.useCompanyAddress ? (
        <Field label="Firma" full>
          <input value={props.caseFile.consignor.company} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, company: event.target.value } }))} />
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
          <input value={props.caseFile.consignor.firstName} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, firstName: event.target.value } }))} />
        </Field>
        <Field label="Nachname">
          <input value={props.caseFile.consignor.lastName} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, lastName: event.target.value } }))} />
        </Field>
      </div>
      <Field label="Adresszusatz" full>
        <input value={props.caseFile.consignor.addressAddon} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, addressAddon: event.target.value } }))} />
      </Field>
      <div className="form-row form-row--double">
        <Field label="Straße">
          <input value={props.caseFile.consignor.street} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, street: event.target.value } }))} />
        </Field>
        <Field label="Nr.">
          <input value={props.caseFile.consignor.houseNumber} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, houseNumber: event.target.value } }))} />
        </Field>
      </div>
      <div className="form-row form-row--triple">
        <Field label="PLZ">
          <input value={props.caseFile.consignor.zip} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, zip: event.target.value } }))} />
        </Field>
        <Field label="Stadt">
          <input value={props.caseFile.consignor.city} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, city: event.target.value } }))} />
        </Field>
        <Field label="Land">
          <CountryInput value={props.caseFile.consignor.country} onChange={(value) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, country: value } }))} />
        </Field>
      </div>
      <div className="form-row form-row--double">
        <Field label="Telefon">
          <input value={props.caseFile.consignor.phone} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, phone: event.target.value } }))} />
        </Field>
        <Field label="E-Mail">
          <input type="email" value={props.caseFile.consignor.email} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, email: event.target.value } }))} />
        </Field>
      </div>
      <div className="form-row form-row--double">
        <Field label="MwSt-Kategorie">
          <select value={props.caseFile.consignor.vatCategory} onChange={(event) => props.onVatCategoryChange(event.target.value as CaseFile["consignor"]["vatCategory"])}>
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
          <input value={props.caseFile.consignor.birthDate} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, birthDate: event.target.value } }))} />
        </Field>
        <Field label="Nationalität">
          <input value={props.caseFile.consignor.nationality} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, nationality: event.target.value } }))} />
        </Field>
        <Field label="ID/Passnummer">
          <input value={props.caseFile.consignor.passportNumber} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, passportNumber: event.target.value } }))} />
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
  );
}

export function PdfOwnerEditorSection(props: { caseFile: CaseFile }) {
  const actions = useCaseEditorActions(props.caseFile);

  function handleOwnerSameAsConsignorChange(checked: boolean) {
    if (!checked) {
      actions.updateCurrentCase((current) => ({
        ...current,
        owner: { ...current.owner, sameAsConsignor: false }
      }));
      return;
    }

    if (hasSeparateOwnerData(props.caseFile.owner)) {
      const confirmed = window.confirm("Die separat erfassten Eigentuemer-Daten werden geloescht. Moechtest du fortfahren?");
      if (!confirmed) {
        return;
      }
    }

    actions.updateCurrentCase((current) => ({
      ...current,
      owner: clearOwnerData()
    }));
  }

  return (
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
            <input value={props.caseFile.owner.firstName} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, firstName: event.target.value } }))} />
          </Field>
          <Field label="Nachname">
            <input value={props.caseFile.owner.lastName} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, lastName: event.target.value } }))} />
          </Field>
          <Field label="Straße">
            <input value={props.caseFile.owner.street} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, street: event.target.value } }))} />
          </Field>
          <Field label="Nr.">
            <input value={props.caseFile.owner.houseNumber} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, houseNumber: event.target.value } }))} />
          </Field>
          <Field label="PLZ">
            <input value={props.caseFile.owner.zip} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, zip: event.target.value } }))} />
          </Field>
          <Field label="Stadt">
            <input value={props.caseFile.owner.city} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, city: event.target.value } }))} />
          </Field>
          <Field label="Land">
            <input value={props.caseFile.owner.country} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, country: event.target.value } }))} />
          </Field>
        </>
      )}
    </Section>
  );
}

export function PdfBankEditorSection(props: { caseFile: CaseFile }) {
  const actions = useCaseEditorActions(props.caseFile);

  return (
    <Section title="Bank">
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
      <Field label="IBAN">
        <input value={props.caseFile.bank.iban} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, bank: { ...current.bank, iban: event.target.value } }))} />
      </Field>
      <Field label="BIC">
        <input value={props.caseFile.bank.bic} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, bank: { ...current.bank, bic: event.target.value } }))} />
      </Field>
      <Field label="Grund abweichender Begünstigter">
        <input value={props.caseFile.bank.beneficiaryOverride.reason} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, bank: { ...current.bank, beneficiaryOverride: { ...current.bank.beneficiaryOverride, reason: event.target.value } } }))} />
      </Field>
      <Field label="Name abweichender Begünstigter">
        <input value={props.caseFile.bank.beneficiaryOverride.name} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, bank: { ...current.bank, beneficiaryOverride: { ...current.bank.beneficiaryOverride, name: event.target.value } } }))} />
      </Field>
    </Section>
  );
}

export function PdfCostsEditorSection(props: { caseFile: CaseFile }) {
  const actions = useCaseEditorActions(props.caseFile);

  return (
    <Section title="Konditionen">
      <Field label="Kommission">
        <input value={props.caseFile.costs.commission.amount} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, commission: { ...current.costs.commission, amount: event.target.value } } }))} />
      </Field>
      <Field label="Versicherung">
        <input value={props.caseFile.costs.insurance.amount} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, insurance: { ...current.costs.insurance, amount: event.target.value } } }))} />
      </Field>
      <Field label="Transport">
        <input value={props.caseFile.costs.transport.amount} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, transport: { ...current.costs.transport, amount: event.target.value } } }))} />
      </Field>
      <Field label="Abb.-Kosten">
        <input value={props.caseFile.costs.imaging.amount} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, imaging: { ...current.costs.imaging, amount: event.target.value } } }))} />
      </Field>
      <Field label="Provenienz / Infos" full>
        <textarea value={props.caseFile.costs.provenance} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, provenance: event.target.value } }))} />
      </Field>
    </Section>
  );
}

export function PdfObjectEditorSection(props: {
  caseFile: CaseFile;
  objectIndex: number;
  onClose: () => void;
  onTargetChange: (target: { kind: "object"; objectIndex: number } | null) => void;
}) {
  const state = useAppState();
  const actions = useCaseEditorActions(props.caseFile);
  const objectItem = props.caseFile.objects[props.objectIndex] ?? null;

  if (!objectItem) {
    return null;
  }

  const objectAssets = objectItem.photoAssetIds
    .map((assetId) => props.caseFile.assets.find((asset) => asset.id === assetId))
    .filter((asset): asset is Asset => Boolean(asset));

  return (
    <Section title={`Objekt ${objectItem.intNumber}`}>
      <div className="inline-actions">
        <button
          type="button"
          className="primary"
          onClick={() => {
            const objectId = actions.addObject();
            if (!objectId) {
              return;
            }

            props.onTargetChange({
              kind: "object",
              objectIndex: props.caseFile.objects.length
            });
          }}
        >
          Objekt hinzufügen
        </button>
        <button
          type="button"
          onClick={() => {
            actions.deleteObject(objectItem.id);
            props.onClose();
          }}
        >
          Objekt löschen
        </button>
      </div>
      <div className="form-row form-row--triple">
        <Field label="Int.-Nr.">
          <input value={objectItem.intNumber} onChange={(event) => actions.updateObject(objectItem.id, (current) => ({ ...current, intNumber: event.target.value }))} />
        </Field>
        <Field label="Auktion">
          <select
            value={objectItem.auctionId}
            onChange={(event) => {
              actions.updateObject(objectItem.id, (current) => ({ ...current, auctionId: event.target.value }));
              actions.applyAuctionPricingRules(objectItem.id);
            }}
          >
            {state.masterData.auctions.map((auction) => (
              <option key={auction.id} value={auction.id}>
                {auction.number} {auction.month}/{auction.year.slice(-2)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Abteilung">
          <select value={objectItem.departmentId} onChange={(event) => actions.updateObject(objectItem.id, (current) => ({ ...current, departmentId: event.target.value }))}>
            {renderFollowUpOption(objectItem.departmentId)}
            {state.masterData.departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.code} · {department.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Kurzbeschrieb" full>
        <input value={objectItem.shortDescription} onChange={(event) => actions.updateObject(objectItem.id, (current) => ({ ...current, shortDescription: event.target.value }))} />
      </Field>
      <Field label="Beschreibung" full>
        <textarea value={objectItem.description} onChange={(event) => actions.updateObject(objectItem.id, (current) => ({ ...current, description: event.target.value }))} />
      </Field>
      <div className={objectItem.pricingMode === "startPrice" ? "form-row form-row--triple" : "form-row form-row--quad"}>
        <Field label="Schätzung von">
          <input value={formatAmountForDisplay(objectItem.estimate.low)} onChange={(event) => actions.updateObject(objectItem.id, (current) => ({ ...current, estimate: { ...current.estimate, low: event.target.value } }))} />
        </Field>
        <Field label="Schätzung bis">
          <input value={formatAmountForDisplay(objectItem.estimate.high)} onChange={(event) => actions.updateObject(objectItem.id, (current) => ({ ...current, estimate: { ...current.estimate, high: event.target.value } }))} />
        </Field>
        <Field label={objectItem.pricingMode === "startPrice" ? "Startpreis" : "Limite"}>
          <input value={formatAmountForDisplay(objectItem.priceValue)} onChange={(event) => actions.updateObject(objectItem.id, (current) => ({ ...current, priceValue: event.target.value }))} />
        </Field>
        {objectItem.pricingMode === "startPrice" ? null : (
          <div className="field">
            <InlineToggle label="Nettolimite" checked={objectItem.pricingMode === "netLimit"} onChange={(checked) => actions.updateObject(objectItem.id, (current) => ({ ...current, pricingMode: checked ? "netLimit" : "limit" }))} />
          </div>
        )}
      </div>
      <div className="form-row form-row--double">
        <Field label="Referenznr.">
          <input value={objectItem.referenceNumber} onChange={(event) => actions.updateObject(objectItem.id, (current) => ({ ...current, referenceNumber: event.target.value }))} />
        </Field>
        <Field label="Bemerkungen">
          <input value={objectItem.remarks} onChange={(event) => actions.updateObject(objectItem.id, (current) => ({ ...current, remarks: event.target.value }))} />
        </Field>
      </div>
      <Field label="Objektfotos" full>
        <div className="photo-upload">
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (!files.length) {
                return;
              }

              void actions.uploadObjectPhotos(objectItem.id, files);
              event.target.value = "";
            }}
          />
          {objectAssets.length ? (
            <div className="photo-grid">
              {objectAssets.map((asset) => (
                <div key={asset.id} className="photo-preview">
                  <img src={asset.optimizedPath || asset.originalPath} alt={asset.fileName} />
                  <button type="button" className="photo-preview__remove" onClick={() => void actions.removeObjectPhoto(objectItem.id, asset.id)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </Field>
    </Section>
  );
}
