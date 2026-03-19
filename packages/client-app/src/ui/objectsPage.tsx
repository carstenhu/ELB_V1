import { useEffect, useState } from "react";
import { formatAmountForDisplay, type Asset, type CaseFile } from "@elb/domain/index";
import { Field, Section } from "@elb/ui/forms";
import { useCaseEditorActions } from "../features/caseEditor/useCaseEditorActions";
import { consumePendingObjectSelectionId } from "../appState";
import { useAppState } from "../useAppState";
import { InlineToggle, getFieldInputClassName, renderFollowUpOption } from "./formSupport";

export function ObjectsPage(props: { caseFile: CaseFile }) {
  const state = useAppState();
  const actions = useCaseEditorActions(props.caseFile);
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
                const objectId = actions.addObject();
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
                  <input className={getFieldInputClassName(selectedObject.intNumber)} value={selectedObject.intNumber} onChange={(event) => actions.updateObject(selectedObject.id, (current) => ({ ...current, intNumber: event.target.value }))} />
                </Field>
                <Field label="Auktion">
                  <select
                    value={selectedObject.auctionId}
                    onChange={(event) => {
                      actions.updateObject(selectedObject.id, (current) => ({ ...current, auctionId: event.target.value }));
                      actions.applyAuctionPricingRules(selectedObject.id);
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
                  <select className={getFieldInputClassName(selectedObject.departmentId)} value={selectedObject.departmentId} onChange={(event) => actions.updateObject(selectedObject.id, (current) => ({ ...current, departmentId: event.target.value }))}>
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
                <input className={getFieldInputClassName(selectedObject.shortDescription)} value={selectedObject.shortDescription} onChange={(event) => actions.updateObject(selectedObject.id, (current) => ({ ...current, shortDescription: event.target.value }))} />
              </Field>
              <Field label="Beschreibung" full>
                <textarea className={getFieldInputClassName(selectedObject.description)} value={selectedObject.description} onChange={(event) => actions.updateObject(selectedObject.id, (current) => ({ ...current, description: event.target.value }))} />
              </Field>
              <div className={ibid ? "form-row form-row--triple" : "form-row form-row--quad"}>
                <Field label="Schätzung von">
                  <input className={getFieldInputClassName(selectedObject.estimate.low)} value={formatAmountForDisplay(selectedObject.estimate.low)} onChange={(event) => actions.updateObject(selectedObject.id, (current) => ({ ...current, estimate: { ...current.estimate, low: event.target.value } }))} />
                </Field>
                <Field label="Schätzung bis">
                  <input className={getFieldInputClassName(selectedObject.estimate.high)} value={formatAmountForDisplay(selectedObject.estimate.high)} onChange={(event) => actions.updateObject(selectedObject.id, (current) => ({ ...current, estimate: { ...current.estimate, high: event.target.value } }))} />
                </Field>
                <Field label={ibid ? "Startpreis" : "Limite"}>
                  <input className={getFieldInputClassName(selectedObject.priceValue)} value={formatAmountForDisplay(selectedObject.priceValue)} onChange={(event) => actions.updateObject(selectedObject.id, (current) => ({ ...current, priceValue: event.target.value }))} />
                </Field>
                {!ibid ? (
                  <div className="field">
                    <InlineToggle label="Nettolimite" checked={selectedObject.pricingMode === "netLimit"} onChange={(checked) => actions.updateObject(selectedObject.id, (current) => ({ ...current, pricingMode: checked ? "netLimit" : "limit" }))} />
                  </div>
                ) : null}
              </div>
              <div className="form-row form-row--double">
                <Field label="Referenznr.">
                  <input className={getFieldInputClassName(selectedObject.referenceNumber)} value={selectedObject.referenceNumber} onChange={(event) => actions.updateObject(selectedObject.id, (current) => ({ ...current, referenceNumber: event.target.value }))} />
                </Field>
                <Field label="Bemerkungen">
                  <input className={getFieldInputClassName(selectedObject.remarks)} value={selectedObject.remarks} onChange={(event) => actions.updateObject(selectedObject.id, (current) => ({ ...current, remarks: event.target.value }))} />
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

                      void actions.uploadObjectPhotos(selectedObject.id, files);
                      event.target.value = "";
                    }}
                  />
                  {selectedObjectAssets.length ? (
                    <div className="photo-grid">
                      {selectedObjectAssets.map((asset) => (
                        <div key={asset.id} className="photo-preview">
                          <img src={asset.optimizedPath || asset.originalPath} alt={asset.fileName} />
                          <button type="button" className="photo-preview__remove" onClick={() => void actions.removeObjectPhoto(selectedObject.id, asset.id)}>
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </Field>
              <div className="inline-actions object-actions object-actions--bottom">
                <button className="primary" onClick={() => { const objectId = actions.addObject(); if (objectId) setSelectedObjectId(objectId); }}>
                  Objekt hinzufügen
                </button>
                <button onClick={() => actions.deleteObject(selectedObject.id)}>Objekt löschen</button>
              </div>
            </>
          );
        })() : null}
      </Section>

      <Section title="Konditionen für alle Objekte">
        <div className="form-row form-row--six">
          <Field label="Kommission">
            <input className={getFieldInputClassName(props.caseFile.costs.commission.amount)} value={props.caseFile.costs.commission.amount} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, commission: { ...current.costs.commission, amount: event.target.value } } }))} />
          </Field>
          <Field label="Versicherung">
            <input className={getFieldInputClassName(props.caseFile.costs.insurance.amount)} value={props.caseFile.costs.insurance.amount} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, insurance: { ...current.costs.insurance, amount: event.target.value } } }))} />
          </Field>
          <Field label="Transport">
            <input className={getFieldInputClassName(props.caseFile.costs.transport.amount)} value={props.caseFile.costs.transport.amount} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, transport: { ...current.costs.transport, amount: event.target.value } } }))} />
          </Field>
          <Field label="Abb.-Kosten">
            <input className={getFieldInputClassName(props.caseFile.costs.imaging.amount)} value={props.caseFile.costs.imaging.amount} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, imaging: { ...current.costs.imaging, amount: event.target.value } } }))} />
          </Field>
          <Field label="Kosten Expertisen">
            <input className={getFieldInputClassName(props.caseFile.costs.expertise.amount)} value={props.caseFile.costs.expertise.amount} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, expertise: { ...current.costs.expertise, amount: event.target.value } } }))} />
          </Field>
          <Field label="Internet">
            <input className={getFieldInputClassName(props.caseFile.costs.internet.amount)} value={props.caseFile.costs.internet.amount} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, internet: { ...current.costs.internet, amount: event.target.value } } }))} />
          </Field>
        </div>
        <Field label="Provenienz / Infos" full>
          <textarea className={getFieldInputClassName(props.caseFile.costs.provenance)} value={props.caseFile.costs.provenance} onChange={(event) => actions.updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, provenance: event.target.value } }))} />
        </Field>
      </Section>
    </div>
  );
}
