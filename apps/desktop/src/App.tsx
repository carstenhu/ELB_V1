import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { formatAmountForDisplay, type Asset, type CaseFile, type PageId } from "@elb/domain/index";
import { createExportPlan } from "@elb/export-core/index";
import { persistCaseAssetImmediately, persistSnapshotToDisk } from "@elb/persistence/filesystem";
import { createAuditRepository } from "@elb/persistence/auditRepository";
import { createWorkspaceRepository } from "@elb/persistence/repository";
import { createPdfPreviewModel } from "@elb/pdf-core/index";
import { Field, Section } from "@elb/ui/forms";
import { createWordPreviewModel, loadWordTemplateAssets } from "@elb/word-core/index";
import { PdfCanvasPreview, type PdfEditTarget } from "./pdfPreview";
import { useAppState } from "./useAppState";
import { createOptimizedImageAsset, findAsset } from "./ui/caseAssets";
import { VatCaptureModal } from "./ui/caseModals";
import { ConsignorPage, InternalPage, ObjectsPage } from "./ui/editorPages";
import { InlineToggle, SignaturePadEditor, VAT_CATEGORY_OPTIONS, getTextInputClassName, renderFollowUpOption } from "./ui/formSupport";
import { ExportStatusCard, getRequiredFieldEntries, PreviewActionButtons, RequiredFieldsModal } from "./ui/previewSupport";
import { SessionOverlay, TopBar } from "./ui/shell";
import {
  addObject,
  applyAuctionPricingRules,
  configureStateServices,
  createSnapshot,
  deleteObject,
  replaceState,
  updateCurrentCase,
  updateMasterData,
  updateObject
} from "./appState";

const workspaceRepository = createWorkspaceRepository();
const auditRepository = createAuditRepository();
configureStateServices({ auditSink: auditRepository });

function AdminPage() {
  const state = useAppState();
  const [pinInput, setPinInput] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [section, setSection] = useState<"security" | "required" | "clerks" | "auctions" | "departments">("security");

  if (!unlocked) {
    return (
      <div className="page-grid">
        <Section title="Admin entsperren">
          <Field label="Admin-PIN">
            <input type="password" value={pinInput} onChange={(event) => setPinInput(event.target.value)} />
          </Field>
          <div className="inline-actions">
            <button
              className="primary"
              onClick={() => {
                if (pinInput === state.masterData.adminPin) {
                  setUnlocked(true);
                }
              }}
            >
              Öffnen
            </button>
          </div>
        </Section>
      </div>
    );
  }

  return (
    <div className="page-grid">
      <Section title="Admin-Bereiche">
        <div className="toggle-list">
          <button type="button" className={section === "security" ? "toggle-button toggle-button--active" : "toggle-button"} onClick={() => setSection("security")}>PIN</button>
          <button type="button" className={section === "required" ? "toggle-button toggle-button--active" : "toggle-button"} onClick={() => setSection("required")}>Pflichtfelder</button>
          <button type="button" className={section === "clerks" ? "toggle-button toggle-button--active" : "toggle-button"} onClick={() => setSection("clerks")}>Sachbearbeiter</button>
          <button type="button" className={section === "auctions" ? "toggle-button toggle-button--active" : "toggle-button"} onClick={() => setSection("auctions")}>Auktionen</button>
          <button type="button" className={section === "departments" ? "toggle-button toggle-button--active" : "toggle-button"} onClick={() => setSection("departments")}>Abteilungen</button>
        </div>
      </Section>

      {section === "security" ? (
        <Section title="Lokale PIN">
          <Field label="Admin-PIN">
            <input
              value={state.masterData.adminPin}
              onChange={(event) =>
                updateMasterData((current) => ({
                  ...current,
                  adminPin: event.target.value
                }))
              }
            />
          </Field>
        </Section>
      ) : null}

      {section === "required" ? (
        <Section title="PDF-Pflichtfelder">
          <Field label="Feldliste" full>
            <textarea
              value={state.masterData.globalPdfRequiredFields.join("\n")}
              onChange={(event) =>
                updateMasterData((current) => ({
                  ...current,
                  globalPdfRequiredFields: event.target.value
                    .split("\n")
                    .map((value) => value.trim())
                    .filter(Boolean)
                }))
              }
            />
          </Field>
        </Section>
      ) : null}

      {section === "clerks" ? (
        <Section title="Sachbearbeiter">
          {state.masterData.clerks.map((clerk, index) => (
            <div key={clerk.id} className="admin-clerk">
              <div className="form-row form-row--triple">
                <Field label={`Sachbearbeiter ${index + 1}`}>
                  <input
                    value={clerk.name}
                    onChange={(event) =>
                      updateMasterData((current) => ({
                        ...current,
                        clerks: current.clerks.map((item) => (item.id === clerk.id ? { ...item, name: event.target.value } : item))
                      }))
                    }
                  />
                </Field>
                <Field label="E-Mail">
                  <input
                    value={clerk.email}
                    onChange={(event) =>
                      updateMasterData((current) => ({
                        ...current,
                        clerks: current.clerks.map((item) => (item.id === clerk.id ? { ...item, email: event.target.value } : item))
                      }))
                    }
                  />
                </Field>
                <Field label="Telefon">
                  <input
                    value={clerk.phone}
                    onChange={(event) =>
                      updateMasterData((current) => ({
                        ...current,
                        clerks: current.clerks.map((item) => (item.id === clerk.id ? { ...item, phone: event.target.value } : item))
                      }))
                    }
                  />
                </Field>
              </div>
              <Field label="Signatur" full>
                <SignaturePadEditor
                  value={clerk.signaturePng}
                  onChange={(dataUrl) => {
                    updateMasterData((current) => ({
                      ...current,
                      clerks: current.clerks.map((item) => (item.id === clerk.id ? { ...item, signaturePng: dataUrl } : item))
                    }));
                    void persistSnapshotToDisk(createSnapshot());
                  }}
                />
              </Field>
              {clerk.signaturePng ? <img className="signature-preview" src={clerk.signaturePng} alt={`Signatur ${clerk.name}`} /> : null}
              <div className="inline-actions">
                <button
                  type="button"
                  onClick={() =>
                    updateMasterData((current) => ({
                      ...current,
                      clerks: current.clerks.filter((item) => item.id !== clerk.id)
                    }))
                  }
                >
                  {"L\u00f6schen"}
                </button>
              </div>
            </div>
          ))}
          <div className="inline-actions">
            <button
              type="button"
              className="primary"
              onClick={() =>
                updateMasterData((current) => ({
                  ...current,
                  clerks: [
                    ...current.clerks,
                    {
                      id: crypto.randomUUID(),
                      name: "",
                      email: "",
                      phone: "",
                      signaturePng: ""
                    }
                  ]
                }))
              }
            >
              {"Sachbearbeiter hinzuf\u00fcgen"}
            </button>
          </div>
        </Section>
      ) : null}

      {section === "auctions" ? (
        <Section title="Auktionen">
          {state.masterData.auctions.map((auction, index) => (
            <div key={auction.id} className="admin-clerk">
              <div className="form-row form-row--triple">
                <Field label={`Auktion ${index + 1}`}>
                  <input
                    value={auction.number}
                    onChange={(event) =>
                      updateMasterData((current) => ({
                        ...current,
                        auctions: current.auctions.map((item) => (item.id === auction.id ? { ...item, number: event.target.value } : item))
                      }))
                    }
                  />
                </Field>
                <Field label="Monat">
                  <input
                    value={auction.month}
                    onChange={(event) =>
                      updateMasterData((current) => ({
                        ...current,
                        auctions: current.auctions.map((item) => (item.id === auction.id ? { ...item, month: event.target.value } : item))
                      }))
                    }
                  />
                </Field>
                <Field label="Jahr">
                  <input
                    value={auction.year}
                    onChange={(event) =>
                      updateMasterData((current) => ({
                        ...current,
                        auctions: current.auctions.map((item) => (item.id === auction.id ? { ...item, year: event.target.value } : item))
                      }))
                    }
                  />
                </Field>
              </div>
              <div className="inline-actions">
                <button
                  type="button"
                  onClick={() =>
                    updateMasterData((current) => ({
                      ...current,
                      auctions: current.auctions.filter((item) => item.id !== auction.id)
                    }))
                  }
                >
                  {"L\u00f6schen"}
                </button>
              </div>
            </div>
          ))}
          <div className="inline-actions">
            <button
              type="button"
              className="primary"
              onClick={() =>
                updateMasterData((current) => ({
                  ...current,
                  auctions: [
                    ...current.auctions,
                    {
                      id: crypto.randomUUID(),
                      number: "",
                      month: "",
                      year: ""
                    }
                  ]
                }))
              }
            >
              {"Auktion hinzuf\u00fcgen"}
            </button>
          </div>
        </Section>
      ) : null}

      {section === "departments" ? (
        <Section title="Abteilungen / Interessengebiete">
          {state.masterData.departments.map((department, index) => (
            <div key={department.id} className="admin-clerk">
              <div className="form-row form-row--double">
                <Field label={`Abteilung ${index + 1}`}>
                  <input
                    value={department.code}
                    onChange={(event) =>
                      updateMasterData((current) => ({
                        ...current,
                        departments: current.departments.map((item) => (item.id === department.id ? { ...item, code: event.target.value } : item))
                      }))
                    }
                  />
                </Field>
                <Field label="Bezeichnung">
                  <input
                    value={department.name}
                    onChange={(event) =>
                      updateMasterData((current) => ({
                        ...current,
                        departments: current.departments.map((item) => (item.id === department.id ? { ...item, name: event.target.value } : item))
                      }))
                    }
                  />
                </Field>
              </div>
              <div className="inline-actions">
                <button
                  type="button"
                  onClick={() =>
                    updateMasterData((current) => ({
                      ...current,
                      departments: current.departments.filter((item) => item.id !== department.id)
                    }))
                  }
                >
                  {"Löschen"}
                </button>
              </div>
            </div>
          ))}
          <div className="inline-actions">
            <button
              type="button"
              className="primary"
              onClick={() =>
                updateMasterData((current) => ({
                  ...current,
                  departments: [
                    ...current.departments,
                    {
                      id: crypto.randomUUID(),
                      code: "",
                      name: ""
                    }
                  ]
                }))
              }
            >
              {"Abteilung hinzufügen"}
            </button>
          </div>
        </Section>
      ) : null}
    </div>
  );
}

function PdfEditModal(props: {
  caseFile: CaseFile;
  openTarget: PdfEditTarget | null;
  onClose: () => void;
  onTargetChange: (target: PdfEditTarget | null) => void;
}) {
  const state = useAppState();
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [vatModalOpen, setVatModalOpen] = useState(false);

  const objectItem = props.openTarget?.kind === "object" ? props.caseFile.objects[props.openTarget.objectIndex] ?? null : null;
  const objectAssets = objectItem
    ? objectItem.photoAssetIds
        .map((assetId) => props.caseFile.assets.find((asset) => asset.id === assetId))
        .filter((asset): asset is Asset => Boolean(asset))
    : [];
  const activeClerk = state.masterData.clerks.find((clerk) => clerk.id === props.caseFile.meta.clerkId);
  const consignorPhoto = findAsset(props.caseFile, props.caseFile.consignor.photoAssetId);

  useEffect(() => {
    if (props.openTarget?.kind !== "consignorSignature" && props.openTarget?.kind !== "clerkSignature") {
      return;
    }

    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 3;
    context.strokeStyle = "#111111";

    const signatureValue =
      props.openTarget.kind === "consignorSignature"
        ? props.caseFile.signatures.consignorSignaturePng
        : activeClerk?.signaturePng ?? "";

    if (!signatureValue) {
      return;
    }

    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = signatureValue;
  }, [activeClerk?.signaturePng, props.caseFile.signatures.consignorSignaturePng, props.openTarget]);

  function getCanvasPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = signatureCanvasRef.current;
    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function startSignature(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    const point = getCanvasPoint(event);
    if (!canvas || !context || !point) {
      return;
    }

    isDrawingRef.current = true;
    lastPointRef.current = point;
    canvas.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(point.x, point.y);
  }

  function moveSignature(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) {
      return;
    }

    const context = signatureCanvasRef.current?.getContext("2d");
    const point = getCanvasPoint(event);
    const lastPoint = lastPointRef.current;
    if (!context || !point || !lastPoint) {
      return;
    }

    context.beginPath();
    context.moveTo(lastPoint.x, lastPoint.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    lastPointRef.current = point;
  }

  function endSignature(event?: ReactPointerEvent<HTMLCanvasElement>) {
    if (event && signatureCanvasRef.current?.hasPointerCapture(event.pointerId)) {
      signatureCanvasRef.current.releasePointerCapture(event.pointerId);
    }

    isDrawingRef.current = false;
    lastPointRef.current = null;
  }

  function clearSignature() {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (props.openTarget?.kind === "consignorSignature") {
      updateCurrentCase((current) => ({
        ...current,
        signatures: {
          ...current.signatures,
          consignorSignaturePng: ""
        }
      }));
      return;
    }

    if (props.openTarget?.kind === "clerkSignature" && activeClerk) {
      updateMasterData((current) => ({
        ...current,
        clerks: current.clerks.map((clerk) => (clerk.id === activeClerk.id ? { ...clerk, signaturePng: "" } : clerk))
      }));
    }
  }

  function saveSignature() {
    const canvas = signatureCanvasRef.current;
    if (!canvas) {
      return;
    }

    const dataUrl = canvas.toDataURL("image/png");

    if (props.openTarget?.kind === "consignorSignature") {
      updateCurrentCase((current) => ({
        ...current,
        signatures: {
          ...current.signatures,
          consignorSignaturePng: dataUrl
        }
      }));
    }

    if (props.openTarget?.kind === "clerkSignature" && activeClerk) {
      updateMasterData((current) => ({
        ...current,
        clerks: current.clerks.map((clerk) => (clerk.id === activeClerk.id ? { ...clerk, signaturePng: dataUrl } : clerk))
      }));
    }

    props.onClose();
  }

  function applyConsignorVatCategory(value: string) {
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
          {props.openTarget.kind === "meta" ? (
            <Section title="Meta">
              <Field label="ELB-Nummer">
                <input
                  value={props.caseFile.meta.receiptNumber}
                  onChange={(event) =>
                    updateCurrentCase((current) => ({
                      ...current,
                      meta: { ...current.meta, receiptNumber: event.target.value }
                    }))
                  }
                />
              </Field>
              <Field label="Sachbearbeiter">
                <select
                  value={props.caseFile.meta.clerkId}
                  onChange={(event) =>
                    updateCurrentCase((current) => ({
                      ...current,
                      meta: { ...current.meta, clerkId: event.target.value }
                    }))
                  }
                >
                  {renderFollowUpOption(props.caseFile.meta.clerkId)}
                  {state.masterData.clerks.map((clerk) => (
                    <option key={clerk.id} value={clerk.id}>
                      {clerk.name}
                    </option>
                  ))}
                </select>
              </Field>
            </Section>
          ) : null}

          {props.openTarget.kind === "consignor" ? (
            <Section title="Einlieferer">
              <div className="field field--full">
                <InlineToggle
                  label="Firmenadresse"
                  checked={props.caseFile.consignor.useCompanyAddress}
                  onChange={(checked) =>
                    updateCurrentCase((current) => ({
                      ...current,
                      consignor: {
                        ...current.consignor,
                        useCompanyAddress: checked
                      }
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
                  <select
                    value={props.caseFile.consignor.title}
                    onChange={(event) =>
                      updateCurrentCase((current) => ({
                        ...current,
                        consignor: { ...current.consignor, title: event.target.value }
                      }))
                    }
                  >
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
              <div className="form-row form-row--double">
                <Field label="MwSt-Kategorie">
                  <select
                    value={props.caseFile.consignor.vatCategory}
                    onChange={(event) => applyConsignorVatCategory(event.target.value)}
                  >
                    {VAT_CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value || "empty"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                {props.caseFile.consignor.vatCategory === "C" ? (
                  <Field label="MwSt-Nr.">
                    <input
                      className={getTextInputClassName(props.caseFile.consignor.vatNumber)}
                      value={props.caseFile.consignor.vatNumber}
                      onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, vatNumber: event.target.value } }))}
                    />
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
                        consignor: {
                          ...current.consignor,
                          photoAssetId: asset.id
                        }
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
                        onClick={() =>
                          (() => {
                            updateCurrentCase((current) => ({
                              ...current,
                              assets: current.assets.filter((asset) => asset.id !== current.consignor.photoAssetId),
                              consignor: {
                                ...current.consignor,
                                photoAssetId: ""
                              }
                            }));
                            void persistSnapshotToDisk(createSnapshot());
                          })()
                        }
                      >
                        {"×"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </Field>
            </Section>
          ) : null}
          {props.openTarget.kind === "owner" ? (
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
                    <input value={props.caseFile.owner.firstName} onChange={(event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, firstName: event.target.value } }))} />
                  </Field>
                  <Field label="Nachname">
                    <input value={props.caseFile.owner.lastName} onChange={(event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, lastName: event.target.value } }))} />
                  </Field>
                  <Field label="Straße">
                    <input value={props.caseFile.owner.street} onChange={(event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, street: event.target.value } }))} />
                  </Field>
                  <Field label="Nr.">
                    <input value={props.caseFile.owner.houseNumber} onChange={(event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, houseNumber: event.target.value } }))} />
                  </Field>
                  <Field label="PLZ">
                    <input value={props.caseFile.owner.zip} onChange={(event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, zip: event.target.value } }))} />
                  </Field>
                  <Field label="Stadt">
                    <input value={props.caseFile.owner.city} onChange={(event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, city: event.target.value } }))} />
                  </Field>
                  <Field label="Land">
                    <input value={props.caseFile.owner.country} onChange={(event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, country: event.target.value } }))} />
                  </Field>
                </>
              )}
            </Section>
          ) : null}

          {props.openTarget.kind === "bank" ? (
            <Section title="Bank">
              <div className="field field--full">
                <InlineToggle
                  label="Abweichender Begünstigter"
                  checked={props.caseFile.bank.beneficiaryOverride.enabled}
                  onChange={(checked) =>
                    updateCurrentCase((current) => ({
                      ...current,
                      bank: {
                        ...current.bank,
                        beneficiaryOverride: {
                          ...current.bank.beneficiaryOverride,
                          enabled: checked
                        }
                      }
                    }))
                  }
                />
              </div>
              <Field label="IBAN">
                <input value={props.caseFile.bank.iban} onChange={(event) => updateCurrentCase((current) => ({ ...current, bank: { ...current.bank, iban: event.target.value } }))} />
              </Field>
              <Field label="BIC">
                <input value={props.caseFile.bank.bic} onChange={(event) => updateCurrentCase((current) => ({ ...current, bank: { ...current.bank, bic: event.target.value } }))} />
              </Field>
              <Field label="Grund abweichender Begünstigter">
                <input value={props.caseFile.bank.beneficiaryOverride.reason} onChange={(event) => updateCurrentCase((current) => ({ ...current, bank: { ...current.bank, beneficiaryOverride: { ...current.bank.beneficiaryOverride, reason: event.target.value } } }))} />
              </Field>
              <Field label="Name abweichender Begünstigter">
                <input value={props.caseFile.bank.beneficiaryOverride.name} onChange={(event) => updateCurrentCase((current) => ({ ...current, bank: { ...current.bank, beneficiaryOverride: { ...current.bank.beneficiaryOverride, name: event.target.value } } }))} />
              </Field>
            </Section>
          ) : null}

          {props.openTarget.kind === "costs" ? (
            <Section title="Konditionen">
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
              <Field label="Provenienz / Infos" full>
                <textarea value={props.caseFile.costs.provenance} onChange={(event) => updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, provenance: event.target.value } }))} />
              </Field>
            </Section>
          ) : null}

          {props.openTarget.kind === "object" && objectItem ? (
            <Section title={`Objekt ${objectItem.intNumber}`}>
              <div className="inline-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    const objectId = addObject();
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
                    deleteObject(objectItem.id);
                    props.onClose();
                  }}
                >
                  Objekt löschen
                </button>
              </div>
              <div className="form-row form-row--triple">
                <Field label="Int.-Nr.">
                  <input value={objectItem.intNumber} onChange={(event) => updateObject(objectItem.id, (current) => ({ ...current, intNumber: event.target.value }))} />
                </Field>
                <Field label="Auktion">
                  <select
                    value={objectItem.auctionId}
                    onChange={(event) => {
                      updateObject(objectItem.id, (current) => ({ ...current, auctionId: event.target.value }));
                      applyAuctionPricingRules(objectItem.id);
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
                  <select value={objectItem.departmentId} onChange={(event) => updateObject(objectItem.id, (current) => ({ ...current, departmentId: event.target.value }))}>
                    {renderFollowUpOption(objectItem.departmentId)}
                    {state.masterData.departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.code} ? {department.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Kurzbeschrieb" full>
                <input value={objectItem.shortDescription} onChange={(event) => updateObject(objectItem.id, (current) => ({ ...current, shortDescription: event.target.value }))} />
              </Field>
              <Field label="Beschreibung" full>
                <textarea value={objectItem.description} onChange={(event) => updateObject(objectItem.id, (current) => ({ ...current, description: event.target.value }))} />
              </Field>
              <div className={objectItem.pricingMode === "startPrice" ? "form-row form-row--triple" : "form-row form-row--quad"}>
                <Field label="Schätzung von">
                  <input value={formatAmountForDisplay(objectItem.estimate.low)} onChange={(event) => updateObject(objectItem.id, (current) => ({ ...current, estimate: { ...current.estimate, low: event.target.value } }))} />
                </Field>
                <Field label="Schätzung bis">
                  <input value={formatAmountForDisplay(objectItem.estimate.high)} onChange={(event) => updateObject(objectItem.id, (current) => ({ ...current, estimate: { ...current.estimate, high: event.target.value } }))} />
                </Field>
                <Field label={objectItem.pricingMode === "startPrice" ? "Startpreis" : "Limite"}>
                  <input value={formatAmountForDisplay(objectItem.priceValue)} onChange={(event) => updateObject(objectItem.id, (current) => ({ ...current, priceValue: event.target.value }))} />
                </Field>
                {objectItem.pricingMode === "startPrice" ? null : (
                  <div className="field">
                    <InlineToggle
                      label="Nettolimite"
                      checked={objectItem.pricingMode === "netLimit"}
                      onChange={(checked) => updateObject(objectItem.id, (current) => ({ ...current, pricingMode: checked ? "netLimit" : "limit" }))}
                    />
                  </div>
                )}
              </div>
              <div className="form-row form-row--double">
                <Field label="Referenznr.">
                  <input value={objectItem.referenceNumber} onChange={(event) => updateObject(objectItem.id, (current) => ({ ...current, referenceNumber: event.target.value }))} />
                </Field>
                <Field label="Bemerkungen">
                  <input value={objectItem.remarks} onChange={(event) => updateObject(objectItem.id, (current) => ({ ...current, remarks: event.target.value }))} />
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

                      const assets = await Promise.all(
                        files.map(async (file) => persistCaseAssetImmediately(props.caseFile, await createOptimizedImageAsset(file)))
                      );
                      updateCurrentCase((current) => ({
                        ...current,
                        assets: [...current.assets, ...assets],
                        objects: current.objects.map((item) =>
                          item.id === objectItem.id ? { ...item, photoAssetIds: [...item.photoAssetIds, ...assets.map((asset) => asset.id)] } : item
                        )
                      }));
                      void persistSnapshotToDisk(createSnapshot());
                      event.target.value = "";
                    }}
                  />
                  {objectAssets.length ? (
                    <div className="photo-grid">
                      {objectAssets.map((asset) => (
                        <div key={asset.id} className="photo-preview">
                          <img src={asset.optimizedPath || asset.originalPath} alt={asset.fileName} />
                          <button
                            type="button"
                            className="photo-preview__remove"
                            onClick={() =>
                              (() => {
                                updateCurrentCase((current) => ({
                                  ...current,
                                  assets: current.assets.filter((item) => item.id !== asset.id),
                                  objects: current.objects.map((item) =>
                                    item.id === objectItem.id
                                      ? { ...item, photoAssetIds: item.photoAssetIds.filter((assetId) => assetId !== asset.id) }
                                      : item
                                  )
                                }));
                                void persistSnapshotToDisk(createSnapshot());
                              })()
                            }
                          >
                            {"×"}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </Field>
            </Section>
          ) : null}
          {props.openTarget.kind === "consignorSignature" ? (
            <Section title="Einlieferer-Signatur">
              <div className="signature-pad">
                <canvas
                  ref={signatureCanvasRef}
                  className="signature-pad__canvas"
                  width={640}
                  height={220}
                  onPointerDown={startSignature}
                  onPointerMove={moveSignature}
                  onPointerUp={endSignature}
                  onPointerLeave={endSignature}
                />
                <div className="signature-pad__actions">
                  <button type="button" className="secondary-button" onClick={clearSignature}>
                    Löschen
                  </button>
                  <button type="button" className="secondary-button" onClick={props.onClose}>
                    Schließen
                  </button>
                  <button type="button" className="primary-button" onClick={saveSignature}>
                    Übernehmen
                  </button>
                </div>
              </div>
              <p>Der Signaturbereich ist jetzt präzise auf das PDF gelegt. Die Canvas-Erfassung folgt als nächster Schritt.</p>
            </Section>
          ) : null}

          {props.openTarget.kind === "clerkSignature" ? (
            <Section title="Sachbearbeiter-Signatur">
              <p>Die Sachbearbeiter-Signatur wird im Admin-Panel gepflegt und danach automatisch im PDF ins Koller-Feld eingesetzt.</p>
            </Section>
          ) : null}
        </div>
      </div>
      {vatModalOpen ? (
        <VatCaptureModal
          value={props.caseFile.consignor.vatNumber}
          onValueChange={(value) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, vatNumber: value } }))}
          onConfirm={() => setVatModalOpen(false)}
        />
      ) : null}
    </div>
  );
}

function PdfPreviewPage(props: { caseFile: CaseFile; exportStatus: string; onExportStatusChange: (value: string) => void }) {
  const state = useAppState();
  const model = createPdfPreviewModel(props.caseFile, state.masterData);
  const exportPlan = createExportPlan(props.caseFile);
  const requiredEntries = getRequiredFieldEntries(props.caseFile, state.masterData.globalPdfRequiredFields);
  const [editTarget, setEditTarget] = useState<PdfEditTarget | null>(null);
  const [requiredFieldsOpen, setRequiredFieldsOpen] = useState(false);

  return (
    <div className="preview-page">
      <div className="preview-sheet">
        <div className="preview-sheet__content">
          <PdfCanvasPreview caseFile={props.caseFile} masterData={state.masterData} onEdit={setEditTarget} />
          <ExportStatusCard
            beneficiary={model.beneficiary}
            clerkLabel={model.clerkLabel}
            zipFileName={exportPlan.zipFileName}
            missingRequiredFields={requiredEntries.map((entry) => entry.label)}
            exportStatus={props.exportStatus}
            onCaptureMissing={() => setRequiredFieldsOpen(true)}
            actions={<PreviewActionButtons caseFile={props.caseFile} onExportStatusChange={props.onExportStatusChange} />}
          />
        </div>
        <PdfEditModal caseFile={props.caseFile} openTarget={editTarget} onClose={() => setEditTarget(null)} onTargetChange={setEditTarget} />
        {requiredFieldsOpen ? <RequiredFieldsModal caseFile={props.caseFile} entries={requiredEntries} onClose={() => setRequiredFieldsOpen(false)} /> : null}
      </div>
    </div>
  );
}

function WordTemplatePreviewPage(props: { caseFile: CaseFile; exportStatus: string; onExportStatusChange: (value: string) => void }) {
  const state = useAppState();
  const model = createWordPreviewModel(props.caseFile, state.masterData);
  const pdfModel = createPdfPreviewModel(props.caseFile, state.masterData);
  const exportPlan = createExportPlan(props.caseFile);
  const requiredEntries = getRequiredFieldEntries(props.caseFile, state.masterData.globalPdfRequiredFields);
  const [backgroundImageSrc, setBackgroundImageSrc] = useState("");
  const [requiredFieldsOpen, setRequiredFieldsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadWordTemplateAssets()
      .then((assets) => {
        if (!cancelled) {
          setBackgroundImageSrc(assets.backgroundImageSrc);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBackgroundImageSrc("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="preview-page preview-page--stacked">
      <div className="word-sheet-stack">
        {model.pages.map((page) => (
          <div key={page.pageNumber} className="word-sheet word-sheet--template">
            <header className="word-sheet__header">
              <div className="word-sheet__eyebrow">Schätzliste</div>
              <div>Koller-Vorlage</div>
            </header>
            <div className="word-sheet__body word-sheet__body--template">
              <div className="word-preview-page word-preview-page--template">
                {backgroundImageSrc ? <img className="word-preview-page__background" src={backgroundImageSrc} alt="" /> : null}
                <div className="word-preview-page__top word-preview-page__top--template">
                  {page.showAddress ? (
                    <div className="word-address-block word-address-block--template">
                      {page.addressLines.map((line) => (
                        <div key={line}>{line}</div>
                      ))}
                    </div>
                  ) : (
                    <div className="word-address-block word-address-block--template word-address-block--empty" />
                  )}
                  <div className="word-date-block">
                    <div className="word-date-block__value">{page.headerRightText}</div>
                  </div>
                </div>

                <div className="word-preview-list word-preview-list--template">
                  {page.rows.map((item) => (
                    <article key={item.id} className="word-template-row">
                      <div className="word-template-row__int">{item.intNumber}</div>
                      <div className="word-template-row__photo">
                        {item.primaryPhoto ? <img src={item.primaryPhoto.src} alt={item.primaryPhoto.alt} /> : null}
                      </div>
                      <div className="word-template-row__text">
                        <div className="word-template-row__title">{item.title}</div>
                        {item.details.map((detail) => (
                          <div key={detail} className="word-template-row__line">
                            {detail}
                          </div>
                        ))}
                        <div className="word-template-row__line">
                          {item.estimate ? `Schätzung: CHF ${item.estimate}` : "Schätzung offen"}
                        </div>
                        {item.priceValue ? (
                          <div className="word-template-row__line word-template-row__line--accent">
                            {item.priceLabel}: CHF {item.priceValue}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>

                <div className="word-template-footer">
                  <div>KOLLER AUKTIONEN</div>
                  <div>{page.footerLabel}</div>
                </div>
              </div>
              <div className="preview-card">
                <h3>Vorlagenbasis</h3>
                <p>{model.typography.family}</p>
                <p>{model.typography.note}</p>
                <p>Adressblock links, Datum oder Seitenzählung rechts, Objektblock als 3-Spalten-Tabelle.</p>
              </div>
            </div>
          </div>
        ))}
        <ExportStatusCard
          className="preview-card--bottom"
          beneficiary={pdfModel.beneficiary}
          clerkLabel={pdfModel.clerkLabel}
          zipFileName={exportPlan.zipFileName}
          missingRequiredFields={requiredEntries.map((entry) => entry.label)}
          exportStatus={props.exportStatus}
          onCaptureMissing={() => setRequiredFieldsOpen(true)}
          actions={<PreviewActionButtons caseFile={props.caseFile} onExportStatusChange={props.onExportStatusChange} />}
        />
      </div>
      {requiredFieldsOpen ? <RequiredFieldsModal caseFile={props.caseFile} entries={requiredEntries} onClose={() => setRequiredFieldsOpen(false)} /> : null}
    </div>
  );
}

export function App() {
  const state = useAppState();
  const [page, setPage] = useState<PageId>("consignor");
  const [hydrated, setHydrated] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const firstSaveRef = useRef(true);
  const caseFile = state.currentCase;

  useEffect(() => {
    let active = true;

    workspaceRepository.load()
      .then((snapshot) => {
        if (!active || !snapshot) {
          return;
        }

        replaceState(snapshot);
      })
      .finally(() => {
        if (active) {
          setHydrated(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (firstSaveRef.current) {
      firstSaveRef.current = false;
      return;
    }

    void workspaceRepository.save(createSnapshot());
  }, [hydrated, state]);

  return (
    <div className="app-shell">
      <SessionOverlay />
      <TopBar page={page} onPageChange={setPage} />
      {!caseFile && page !== "admin" ? (
        <main className="empty-state">
          <h1>Kein aktiver Vorgang</h1>
          <p>Bitte zuerst einen Sachbearbeiter wählen oder einen neuen Vorgang anlegen.</p>
        </main>
      ) : (
        <main className="page">
          {page === "admin" ? <AdminPage /> : null}
          {page === "consignor" && caseFile ? <ConsignorPage caseFile={caseFile} /> : null}
          {page === "objects" && caseFile ? <ObjectsPage caseFile={caseFile} /> : null}
          {page === "internal" && caseFile ? <InternalPage caseFile={caseFile} /> : null}
          {page === "pdfPreview" && caseFile ? <PdfPreviewPage caseFile={caseFile} exportStatus={exportStatus} onExportStatusChange={setExportStatus} /> : null}
          {page === "wordPreview" && caseFile ? <WordTemplatePreviewPage caseFile={caseFile} exportStatus={exportStatus} onExportStatusChange={setExportStatus} /> : null}
        </main>
      )}
    </div>
  );
}


