import { useEffect, useState } from "react";
import { deriveBeneficiary, deriveOwner, formatAmountForDisplay, type Asset, type CaseFile } from "@elb/domain/index";
import { persistCaseAssetImmediately, persistSnapshotToDisk } from "@elb/persistence/filesystem";
import { Field, Section } from "@elb/ui/forms";
import {
  addObject,
  applyAuctionPricingRules,
  consumePendingObjectSelectionId,
  createSnapshot,
  deleteObject,
  updateCurrentCase,
  updateObject
} from "../appState";
import { useAppState } from "../useAppState";
import { createOptimizedImageAsset, findAsset } from "./caseAssets";
import { VatCaptureModal } from "./caseModals";
import { InlineToggle, VAT_CATEGORY_OPTIONS, getTextInputClassName, renderFollowUpOption } from "./formSupport";

export function ConsignorPage(props: { caseFile: CaseFile }) {
  const state = useAppState();
  const owner = deriveOwner(props.caseFile.consignor, props.caseFile.owner);
  const beneficiary = deriveBeneficiary(props.caseFile.consignor, props.caseFile.bank);
  const consignorPhoto = findAsset(props.caseFile, props.caseFile.consignor.photoAssetId);
  const [vatModalOpen, setVatModalOpen] = useState(false);

  function applyVatCategory(value: string) {
    updateCurrentCase((current) => ({
      ...current,
      consignor: {
        ...current.consignor,
        vatCategory: value,
        vatNumber: value === "C" ? current.consignor.vatNumber : ""
      }
    }));
    setVatModalOpen(value === "C");
  }

  return (
    <>
      <div className="page-grid">
        <Section title="Meta">
          <Field label="ELB-Nummer">
            <input value={props.caseFile.meta.receiptNumber} onChange={(event) => updateCurrentCase((current) => ({ ...current, meta: { ...current.meta, receiptNumber: event.target.value } }))} />
          </Field>
          <Field label="Sachbearbeiter">
            <select value={props.caseFile.meta.clerkId} onChange={(event) => updateCurrentCase((current) => ({ ...current, meta: { ...current.meta, clerkId: event.target.value } }))}>
              {renderFollowUpOption(props.caseFile.meta.clerkId)}
              {state.masterData.clerks.map((clerk) => (
                <option key={clerk.id} value={clerk.id}>
                  {clerk.name}
                </option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title="Adresse">
          <div className="field field--full">
            <InlineToggle
              label="Firmenadresse"
              checked={props.caseFile.consignor.useCompanyAddress}
              onChange={(checked) =>
                updateCurrentCase((current) => ({
                  ...current,
                  consignor: { ...current.consignor, useCompanyAddress: checked }
                }))
              }
            />
          </div>
          {props.caseFile.consignor.useCompanyAddress ? (
            <Field label="Firma" full>
              <input value={props.caseFile.consignor.company} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, company: event.target.value } }))} />
            </Field>
          ) : null}
          <div className="form-row form-row--triple">
            <Field label="Anrede">
              <select value={props.caseFile.consignor.title} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, title: event.target.value } }))}>
                <option value="">Bitte wählen</option>
                {state.masterData.titles.map((title) => (
                  <option key={title} value={title}>
                    {title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Vorname">
              <input value={props.caseFile.consignor.firstName} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, firstName: event.target.value } }))} />
            </Field>
            <Field label="Nachname">
              <input value={props.caseFile.consignor.lastName} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, lastName: event.target.value } }))} />
            </Field>
          </div>
          <Field label="Adresszusatz" full>
            <input value={props.caseFile.consignor.addressAddon} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, addressAddon: event.target.value } }))} />
          </Field>
          <div className="form-row form-row--double">
            <Field label="Straße">
              <input value={props.caseFile.consignor.street} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, street: event.target.value } }))} />
            </Field>
            <Field label="Nr.">
              <input value={props.caseFile.consignor.houseNumber} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, houseNumber: event.target.value } }))} />
            </Field>
          </div>
          <div className="form-row form-row--triple">
            <Field label="PLZ">
              <input value={props.caseFile.consignor.zip} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, zip: event.target.value } }))} />
            </Field>
            <Field label="Stadt">
              <input value={props.caseFile.consignor.city} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, city: event.target.value } }))} />
            </Field>
            <Field label="Land">
              <input value={props.caseFile.consignor.country} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, country: event.target.value } }))} />
            </Field>
          </div>
        </Section>

        <Section title="Einliefererdaten">
          <div className="form-row form-row--double">
            <Field label="MwSt-Kategorie">
              <select value={props.caseFile.consignor.vatCategory} onChange={(event) => applyVatCategory(event.target.value)}>
                {VAT_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value || "empty"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            {props.caseFile.consignor.vatCategory === "C" ? (
              <Field label="MwSt-Nr.">
                <input className={getTextInputClassName(props.caseFile.consignor.vatNumber)} value={props.caseFile.consignor.vatNumber} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, vatNumber: event.target.value } }))} />
              </Field>
            ) : null}
          </div>
          <div className="form-row form-row--triple">
            <Field label="Geburtsdatum">
              <input value={props.caseFile.consignor.birthDate} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, birthDate: event.target.value } }))} />
            </Field>
            <Field label="Nationalität">
              <input value={props.caseFile.consignor.nationality} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, nationality: event.target.value } }))} />
            </Field>
            <Field label="ID/Passnummer">
              <input value={props.caseFile.consignor.passportNumber} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, passportNumber: event.target.value } }))} />
            </Field>
          </div>
          <Field label="Passfoto" full>
            <div className="photo-upload">
              <input
                type="file"
                accept="image/*"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) {
                    return;
                  }

                  const asset = await persistCaseAssetImmediately(props.caseFile, await createOptimizedImageAsset(file));
                  updateCurrentCase((current) => ({
                    ...current,
                    assets: [...current.assets.filter((item) => item.id !== current.consignor.photoAssetId), asset],
                    consignor: { ...current.consignor, photoAssetId: asset.id }
                  }));
                  void persistSnapshotToDisk(createSnapshot());
                  event.target.value = "";
                }}
              />
              {consignorPhoto ? (
                <div className="photo-preview photo-preview--passport">
                  <img src={consignorPhoto.optimizedPath || consignorPhoto.originalPath} alt="Passfoto Einlieferer" />
                  <button
                    type="button"
                    className="photo-preview__remove"
                    onClick={() => {
                      updateCurrentCase((current) => ({
                        ...current,
                        assets: current.assets.filter((asset) => asset.id !== current.consignor.photoAssetId),
                        consignor: { ...current.consignor, photoAssetId: "" }
                      }));
                      void persistSnapshotToDisk(createSnapshot());
                    }}
                  >
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
            <input value={props.caseFile.bank.iban} onChange={(event) => updateCurrentCase((current) => ({ ...current, bank: { ...current.bank, iban: event.target.value } }))} />
          </Field>
          <Field label="BIC">
            <input value={props.caseFile.bank.bic} onChange={(event) => updateCurrentCase((current) => ({ ...current, bank: { ...current.bank, bic: event.target.value } }))} />
          </Field>
          <div className="field field--full">
            <InlineToggle
              label="Abweichender Begünstigter"
              checked={props.caseFile.bank.beneficiaryOverride.enabled}
              onChange={(checked) =>
                updateCurrentCase((current) => ({
                  ...current,
                  bank: { ...current.bank, beneficiaryOverride: { ...current.bank.beneficiaryOverride, enabled: checked } }
                }))
              }
            />
          </div>
          {props.caseFile.bank.beneficiaryOverride.enabled ? (
            <>
              <Field label="Grund" full>
                <input value={props.caseFile.bank.beneficiaryOverride.reason} onChange={(event) => updateCurrentCase((current) => ({ ...current, bank: { ...current.bank, beneficiaryOverride: { ...current.bank.beneficiaryOverride, reason: event.target.value } } }))} />
              </Field>
              <Field label="Name" full>
                <input value={props.caseFile.bank.beneficiaryOverride.name} disabled={!props.caseFile.bank.beneficiaryOverride.reason} onChange={(event) => updateCurrentCase((current) => ({ ...current, bank: { ...current.bank, beneficiaryOverride: { ...current.bank.beneficiaryOverride, name: event.target.value } } }))} />
              </Field>
            </>
          ) : null}
        </Section>

        <Section title="Eigentümer">
          <div className="field field--full">
            <InlineToggle
              label="Eigentümer = Einlieferer"
              checked={props.caseFile.owner.sameAsConsignor}
              onChange={(checked) =>
                updateCurrentCase((current) => ({
                  ...current,
                  owner: { ...current.owner, sameAsConsignor: checked }
                }))
              }
            />
          </div>
          {props.caseFile.owner.sameAsConsignor ? null : (
            <>
              <Field label="Vorname">
                <input value={owner.firstName} onChange={(event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, firstName: event.target.value } }))} />
              </Field>
              <Field label="Nachname">
                <input value={owner.lastName} onChange={(event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, lastName: event.target.value } }))} />
              </Field>
              <Field label="Straße">
                <input value={owner.street} onChange={(event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, street: event.target.value } }))} />
              </Field>
              <Field label="Nr.">
                <input value={owner.houseNumber} onChange={(event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, houseNumber: event.target.value } }))} />
              </Field>
              <Field label="PLZ">
                <input value={owner.zip} onChange={(event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, zip: event.target.value } }))} />
              </Field>
              <Field label="Stadt">
                <input value={owner.city} onChange={(event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, city: event.target.value } }))} />
              </Field>
              <Field label="Land">
                <input value={owner.country} onChange={(event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, country: event.target.value } }))} />
              </Field>
            </>
          )}
        </Section>
      </div>
      {vatModalOpen ? (
        <VatCaptureModal
          value={props.caseFile.consignor.vatNumber}
          onValueChange={(value) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, vatNumber: value } }))}
          onConfirm={() => setVatModalOpen(false)}
        />
      ) : null}
    </>
  );
}

export function ObjectsPage(props: { caseFile: CaseFile }) {
  const state = useAppState();
  const [selectedObjectId, setSelectedObjectId] = useState<string>(props.caseFile.objects[0]?.id ?? "");

  useEffect(() => {
    const pendingObjectId = consumePendingObjectSelectionId();
    if (pendingObjectId && props.caseFile.objects.some((item) => item.id === pendingObjectId)) {
      setSelectedObjectId(pendingObjectId);
      return;
    }

    if (!props.caseFile.objects.length) {
      setSelectedObjectId("");
      return;
    }

    if (!props.caseFile.objects.some((item) => item.id === selectedObjectId)) {
      setSelectedObjectId(props.caseFile.objects[0]?.id ?? "");
    }
  }, [props.caseFile.objects, selectedObjectId]);

  const selectedObject = props.caseFile.objects.find((item) => item.id === selectedObjectId) ?? props.caseFile.objects[0] ?? null;
  const selectedObjectAssets = selectedObject
    ? selectedObject.photoAssetIds.map((assetId) => props.caseFile.assets.find((asset) => asset.id === assetId)).filter((asset): asset is Asset => Boolean(asset))
    : [];

  return (
    <div className="page-grid">
      <Section title="">
        <div className="field field--full">
          <select
            value={selectedObjectId}
            onChange={(event) => {
              if (event.target.value === "new-object") {
                const objectId = addObject();
                if (objectId) {
                  setSelectedObjectId(objectId);
                }
                return;
              }

              setSelectedObjectId(event.target.value);
            }}
          >
            {!props.caseFile.objects.length ? <option value="">Noch keine Objekte</option> : null}
            {props.caseFile.objects.map((item, index) => (
              <option key={item.id} value={item.id}>
                {index + 1}/{props.caseFile.objects.length} - {item.intNumber} - {item.shortDescription || "Ohne Kurzbeschrieb"}
              </option>
            ))}
            <option value="new-object">+ Objekt hinzufügen</option>
          </select>
        </div>
        {!selectedObject ? <p>Noch keine Objekte erfasst.</p> : null}
        {selectedObject ? (() => {
          const auction = state.masterData.auctions.find((candidate) => candidate.id === selectedObject.auctionId);
          const ibid = auction ? auction.number.toLowerCase().startsWith("ibid") : false;

          return (
            <>
              <div className="form-row form-row--triple">
                <Field label="Int.-Nr.">
                  <input value={selectedObject.intNumber} onChange={(event) => updateObject(selectedObject.id, (current) => ({ ...current, intNumber: event.target.value }))} />
                </Field>
                <Field label="Auktion">
                  <select
                    value={selectedObject.auctionId}
                    onChange={(event) => {
                      updateObject(selectedObject.id, (current) => ({ ...current, auctionId: event.target.value }));
                      applyAuctionPricingRules(selectedObject.id);
                    }}
                  >
                    {state.masterData.auctions.map((auctionOption) => (
                      <option key={auctionOption.id} value={auctionOption.id}>
                        {auctionOption.number} {auctionOption.month}/{auctionOption.year.slice(-2)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Abteilung">
                  <select value={selectedObject.departmentId} onChange={(event) => updateObject(selectedObject.id, (current) => ({ ...current, departmentId: event.target.value }))}>
                    {renderFollowUpOption(selectedObject.departmentId)}
                    {state.masterData.departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.code} · {department.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Kurzbeschrieb" full>
                <input value={selectedObject.shortDescription} onChange={(event) => updateObject(selectedObject.id, (current) => ({ ...current, shortDescription: event.target.value }))} />
              </Field>
              <Field label="Beschreibung" full>
                <textarea value={selectedObject.description} onChange={(event) => updateObject(selectedObject.id, (current) => ({ ...current, description: event.target.value }))} />
              </Field>
              <div className={ibid ? "form-row form-row--triple" : "form-row form-row--quad"}>
                <Field label="Schätzung von">
                  <input value={formatAmountForDisplay(selectedObject.estimate.low)} onChange={(event) => updateObject(selectedObject.id, (current) => ({ ...current, estimate: { ...current.estimate, low: event.target.value } }))} />
                </Field>
                <Field label="Schätzung bis">
                  <input value={formatAmountForDisplay(selectedObject.estimate.high)} onChange={(event) => updateObject(selectedObject.id, (current) => ({ ...current, estimate: { ...current.estimate, high: event.target.value } }))} />
                </Field>
                <Field label={ibid ? "Startpreis" : "Limite"}>
                  <input value={formatAmountForDisplay(selectedObject.priceValue)} onChange={(event) => updateObject(selectedObject.id, (current) => ({ ...current, priceValue: event.target.value }))} />
                </Field>
                {!ibid ? (
                  <div className="field">
                    <InlineToggle label="Nettolimite" checked={selectedObject.pricingMode === "netLimit"} onChange={(checked) => updateObject(selectedObject.id, (current) => ({ ...current, pricingMode: checked ? "netLimit" : "limit" }))} />
                  </div>
                ) : null}
              </div>
              <div className="form-row form-row--double">
                <Field label="Referenznr.">
                  <input value={selectedObject.referenceNumber} onChange={(event) => updateObject(selectedObject.id, (current) => ({ ...current, referenceNumber: event.target.value }))} />
                </Field>
                <Field label="Bemerkungen">
                  <input value={selectedObject.remarks} onChange={(event) => updateObject(selectedObject.id, (current) => ({ ...current, remarks: event.target.value }))} />
                </Field>
              </div>
              <Field label="Objektfotos" full>
                <div className="photo-upload">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={async (event) => {
                      const files = Array.from(event.target.files ?? []);
                      if (!files.length) {
                        return;
                      }

                      const assets = await Promise.all(files.map(async (file) => persistCaseAssetImmediately(props.caseFile, await createOptimizedImageAsset(file))));
                      updateCurrentCase((current) => ({
                        ...current,
                        assets: [...current.assets, ...assets],
                        objects: current.objects.map((item) => (item.id === selectedObject.id ? { ...item, photoAssetIds: [...item.photoAssetIds, ...assets.map((asset) => asset.id)] } : item))
                      }));
                      void persistSnapshotToDisk(createSnapshot());
                      event.target.value = "";
                    }}
                  />
                  {selectedObjectAssets.length ? (
                    <div className="photo-grid">
                      {selectedObjectAssets.map((asset) => (
                        <div key={asset.id} className="photo-preview">
                          <img src={asset.optimizedPath || asset.originalPath} alt={asset.fileName} />
                          <button
                            type="button"
                            className="photo-preview__remove"
                            onClick={() => {
                              updateCurrentCase((current) => ({
                                ...current,
                                assets: current.assets.filter((item) => item.id !== asset.id),
                                objects: current.objects.map((item) => (item.id === selectedObject.id ? { ...item, photoAssetIds: item.photoAssetIds.filter((assetId) => assetId !== asset.id) } : item))
                              }));
                              void persistSnapshotToDisk(createSnapshot());
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </Field>
              <div className="inline-actions object-actions object-actions--bottom">
                <button className="primary" onClick={() => { const objectId = addObject(); if (objectId) setSelectedObjectId(objectId); }}>
                  Objekt hinzufügen
                </button>
                <button onClick={() => deleteObject(selectedObject.id)}>Objekt löschen</button>
              </div>
            </>
          );
        })() : null}
      </Section>

      <Section title="Konditionen für alle Objekte">
        <div className="form-row form-row--six">
          <Field label="Kommission">
            <input value={props.caseFile.costs.commission.amount} onChange={(event) => updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, commission: { ...current.costs.commission, amount: event.target.value } } }))} />
          </Field>
          <Field label="Versicherung">
            <input value={props.caseFile.costs.insurance.amount} onChange={(event) => updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, insurance: { ...current.costs.insurance, amount: event.target.value } } }))} />
          </Field>
          <Field label="Transport">
            <input value={props.caseFile.costs.transport.amount} onChange={(event) => updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, transport: { ...current.costs.transport, amount: event.target.value } } }))} />
          </Field>
          <Field label="Abb.-Kosten">
            <input value={props.caseFile.costs.imaging.amount} onChange={(event) => updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, imaging: { ...current.costs.imaging, amount: event.target.value } } }))} />
          </Field>
          <Field label="Kosten Expertisen">
            <input value={props.caseFile.costs.expertise.amount} onChange={(event) => updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, expertise: { ...current.costs.expertise, amount: event.target.value } } }))} />
          </Field>
          <Field label="Internet">
            <input value={props.caseFile.costs.internet.amount} onChange={(event) => updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, internet: { ...current.costs.internet, amount: event.target.value } } }))} />
          </Field>
        </div>
        <Field label="Provenienz / Infos" full>
          <textarea value={props.caseFile.costs.provenance} onChange={(event) => updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, provenance: event.target.value } }))} />
        </Field>
      </Section>
    </div>
  );
}

export function InternalPage(props: { caseFile: CaseFile }) {
  const state = useAppState();

  return (
    <div className="page-grid">
      <Section title="Interne Infos">
        <Field label="Interne Notizen" full>
          <textarea value={props.caseFile.internalInfo.notes} onChange={(event) => updateCurrentCase((current) => ({ ...current, internalInfo: { ...current.internalInfo, notes: event.target.value } }))} />
        </Field>
      </Section>
      <Section title="Interessengebiete">
        <div className="chip-flow">
          {state.masterData.departments.map((department) => {
            const checked = props.caseFile.internalInfo.interestDepartmentIds.includes(department.id);
            return (
              <label key={department.id} className="checkbox-line">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) =>
                    updateCurrentCase((current) => ({
                      ...current,
                      internalInfo: {
                        ...current.internalInfo,
                        interestDepartmentIds: event.target.checked
                          ? [...current.internalInfo.interestDepartmentIds, department.id]
                          : current.internalInfo.interestDepartmentIds.filter((id) => id !== department.id)
                      }
                    }))
                  }
                />
                <span>
                  {department.code} · {department.name}
                </span>
              </label>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
