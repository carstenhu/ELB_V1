import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { deriveBeneficiary, deriveOwner, formatAmountForDisplay, type Asset, type CaseFile, type PageId } from "@elb/domain/index";
import { createExportPlan, createExportZip, generateExportBundle, triggerDownload } from "@elb/export-core/index";
import { hydrateSnapshotFromDisk, persistCaseAssetImmediately, persistSnapshotToDisk } from "@elb/persistence/filesystem";
import { createPdfPreviewModel, generateElbPdf } from "@elb/pdf-core/index";
import { APP_NAME } from "@elb/shared/constants";
import { Field, Section } from "@elb/ui/forms";
import { createWordPreviewModel, loadWordTemplateAssets } from "@elb/word-core/index";
import { PdfCanvasPreview, type PdfEditTarget } from "./pdfPreview";
import {
  addObject,
  applyAuctionPricingRules,
  consumePendingObjectSelectionId,
  createNewCase,
  createSnapshot,
  deleteObject,
  finalizeCurrentCase,
  getState,
  loadCaseById,
  saveDraft,
  selectClerk,
  subscribe,
  replaceState,
  updateCurrentCase,
  updateMasterData,
  updateObject
} from "./appState";

const pages: Array<{ id: PageId; label: string }> = [
  { id: "consignor", label: "Einlieferer" },
  { id: "objects", label: "Objekte" },
  { id: "internal", label: "Interne Infos" },
  { id: "pdfPreview", label: "ELB-PDF" },
  { id: "wordPreview", label: "Schätzliste" }
];

const VAT_CATEGORY_OPTIONS = [
  { value: "", label: "Bitte wählen" },
  { value: "A", label: "A - Privat Schweiz" },
  { value: "B", label: "B - Ausland" },
  { value: "C", label: "C - Händler Schweiz" }
];

const FOLLOW_UP_VALUE = "Angaben folgen";

function normalizeFieldValue(value: string | null | undefined) {
  return typeof value === "string" ? value : "";
}

function isFollowUpValue(value: string | null | undefined) {
  return normalizeFieldValue(value).trim() === FOLLOW_UP_VALUE;
}

function getTextInputClassName(value: string | null | undefined) {
  return isFollowUpValue(value) ? "field-input field-input--follow-up" : "field-input";
}

function renderFollowUpOption(value: string | null | undefined) {
  return isFollowUpValue(value) ? <option value={FOLLOW_UP_VALUE}>{FOLLOW_UP_VALUE}</option> : null;
}

function useAppState() {
  return useSyncExternalStore(subscribe, getState, getState);
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Datei konnte nicht gelesen werden: ${file.name}`));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  });
}

async function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Bild konnte nicht geladen werden."));
    image.src = dataUrl;
  });
}

async function createOptimizedImageAsset(file: File): Promise<Asset> {
  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageElement(originalDataUrl);
  const scale = Math.min(1500 / image.width, 1000 / image.height, 1);
  const targetWidth = Math.max(Math.round(image.width * scale), 1);
  const targetHeight = Math.max(Math.round(image.height * scale), 1);
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Bildkontext konnte nicht erzeugt werden.");
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  const optimizedDataUrl = canvas.toDataURL("image/jpeg", 0.5);

  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    originalPath: originalDataUrl,
    optimizedPath: optimizedDataUrl,
    width: targetWidth,
    height: targetHeight
  };
}

function findAsset(caseFile: CaseFile, assetId: string): Asset | undefined {
  return caseFile.assets.find((asset) => asset.id === assetId);
}

function SignaturePadEditor(props: { value: string; onChange: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [draftValue, setDraftValue] = useState(props.value);

  useEffect(() => {
    setDraftValue(props.value);
  }, [props.value]);

  useEffect(() => {
    const canvas = canvasRef.current;
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

    if (!draftValue) {
      return;
    }

    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = draftValue;
  }, [draftValue]);

  function getCanvasPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function start(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
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

  function move(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) {
      return;
    }

    const context = canvasRef.current?.getContext("2d");
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

  function end(event?: ReactPointerEvent<HTMLCanvasElement>) {
    if (event && canvasRef.current?.hasPointerCapture(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }
    isDrawingRef.current = false;
    lastPointRef.current = null;
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    setDraftValue("");
    props.onChange("");
  }

  function save() {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const dataUrl = canvas.toDataURL("image/png");
    setDraftValue(dataUrl);
    props.onChange(dataUrl);
  }

  return (
    <div className="signature-pad">
      <canvas
        ref={canvasRef}
        className="signature-pad__canvas"
        width={640}
        height={220}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="signature-pad__actions">
        <button type="button" className="secondary-button" onClick={clear}>
          Löschen
        </button>
        <button type="button" className="primary-button" onClick={save}>
          Übernehmen
        </button>
      </div>
    </div>
  );
}

function InlineToggle(props: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="inline-toggle">
      <span className="inline-toggle__label">{props.label}</span>
      <input type="checkbox" checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} />
      <span className="inline-toggle__box" aria-hidden="true" />
    </label>
  );
}

function FollowUpFieldControl(props: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="follow-up-toggle">
      <input
        type="checkbox"
        checked={isFollowUpValue(props.value)}
        onChange={(event) => props.onChange(event.target.checked ? FOLLOW_UP_VALUE : "")}
      />
      <span>Angaben folgen</span>
    </label>
  );
}

function VatCaptureModal(props: {
  value: string;
  onValueChange: (value: string) => void;
  onConfirm: () => void;
}) {
  const isValid = props.value.trim().length > 0;

  return (
    <div className="pin-modal">
      <div className="overlay__card overlay__card--narrow">
        <div className="admin-header">
          <h2>MwSt-Nr. erfassen</h2>
        </div>
        <div className="page-grid">
          <Section title="Pflichtangabe für Kategorie C">
            <p className="modal-hint">
              Für die Kategorie C muss jetzt eine MwSt-Nr. erfasst werden. Das Modal kann erst nach Eingabe eines Wertes geschlossen werden.
            </p>
            <Field label="MwSt-Nr." full>
              <input
                className={getTextInputClassName(props.value)}
                value={props.value}
                onChange={(event) => props.onValueChange(event.target.value)}
              />
            </Field>
            <FollowUpFieldControl value={props.value} onChange={props.onValueChange} />
            {!isValid ? <p className="field-warning">Bitte erfassen Sie eine MwSt-Nr. oder markieren Sie "Angaben folgen".</p> : null}
            <div className="pin-modal__actions">
              <button type="button" className="primary-button" disabled={!isValid} onClick={props.onConfirm}>
                Übernehmen
              </button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function SessionOverlay() {
  const state = useAppState();
  if (state.activeClerkId) {
    return null;
  }

  return (
    <div className="overlay">
      <div className="overlay__card">
        <p className="eyebrow">Sachbearbeiter-Auswahl</p>
        <h1>{APP_NAME}</h1>
        <div className="clerk-grid">
          {state.masterData.clerks.map((clerk) => (
            <button key={clerk.id} className="clerk-card" onClick={() => selectClerk(clerk.id)}>
              <strong>{clerk.name}</strong>
              <span>{clerk.email}</span>
              <span>{clerk.phone || "Keine Telefonnummer"}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TopBar(props: { page: PageId; onPageChange: (page: PageId) => void }) {
  const state = useAppState();
  const activeClerk = state.masterData.clerks.find((clerk) => clerk.id === state.activeClerkId);

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <strong>{APP_NAME}</strong>
        <span>{activeClerk?.name ?? "Kein Sachbearbeiter"}</span>
      </div>
      <nav className="topbar__nav">
        {pages.map((page) => (
          <button
            key={page.id}
            className={page.id === props.page ? "nav-button nav-button--active" : "nav-button"}
            onClick={() => props.onPageChange(page.id)}
          >
            {page.label}
          </button>
        ))}
      </nav>
      <div className="topbar__actions">
        <select
          value=""
          onChange={(event) => {
            const value = event.target.value;
            if (value === "new-case") {
              createNewCase();
            }
            if (value.startsWith("case:")) {
              loadCaseById(value.replace("case:", ""));
            }
            if (value === "admin") {
              props.onPageChange("admin");
            }
            event.target.value = "";
          }}
        >
          <option value="">Menü</option>
          <option value="new-case">Neuer Vorgang</option>
          <option value="admin">Admin</option>
          {state.drafts.map((draft) => (
            <option key={draft.meta.id} value={`case:${draft.meta.id}`}>
              Draft laden: {draft.consignor.lastName || "Unbenannt"} {draft.meta.receiptNumber}
            </option>
          ))}
          {state.finalized.map((caseFile) => (
            <option key={caseFile.meta.id} value={`case:${caseFile.meta.id}`}>
              Finalisiert laden: {caseFile.consignor.lastName || "Unbenannt"} {caseFile.meta.receiptNumber}
            </option>
          ))}
        </select>
      </div>
    </header>
  );
}

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

function ConsignorPage(props: { caseFile: CaseFile }) {
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
          <input
            value={props.caseFile.meta.receiptNumber}
            onChange={(event) =>
              updateCurrentCase((current) => ({
                ...current,
                meta: {
                  ...current.meta,
                  receiptNumber: event.target.value
                }
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
                meta: {
                  ...current.meta,
                  clerkId: event.target.value
                }
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

      <Section title="Adresse">
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
            <input
              value={props.caseFile.consignor.company}
              onChange={(event) =>
                updateCurrentCase((current) => ({
                  ...current,
                  consignor: {
                    ...current.consignor,
                    company: event.target.value
                  }
                }))
              }
            />
          </Field>
        ) : null}
        <div className="form-row form-row--triple">
          <Field label="Anrede">
            <select
              value={props.caseFile.consignor.title}
              onChange={(event) =>
                updateCurrentCase((current) => ({
                  ...current,
                  consignor: {
                    ...current.consignor,
                    title: event.target.value
                  }
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
      </Section>

      <Section title="Einliefererdaten">
        <div className="form-row form-row--double">
          <Field label="MwSt-Kategorie">
            <select
              value={props.caseFile.consignor.vatCategory}
              onChange={(event) => applyVatCategory(event.target.value)}
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
        {props.caseFile.bank.beneficiaryOverride.enabled ? (
          <>
            <Field label="Grund" full>
              <input
                value={props.caseFile.bank.beneficiaryOverride.reason}
                onChange={(event) =>
                  updateCurrentCase((current) => ({
                    ...current,
                    bank: {
                      ...current.bank,
                      beneficiaryOverride: {
                        ...current.bank.beneficiaryOverride,
                        reason: event.target.value
                      }
                    }
                  }))
                }
              />
            </Field>
            <Field label="Name" full>
              <input
                value={props.caseFile.bank.beneficiaryOverride.name}
                disabled={!props.caseFile.bank.beneficiaryOverride.reason}
                onChange={(event) =>
                  updateCurrentCase((current) => ({
                    ...current,
                    bank: {
                      ...current.bank,
                      beneficiaryOverride: {
                        ...current.bank.beneficiaryOverride,
                        name: event.target.value
                      }
                    }
                  }))
                }
              />
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
                owner: {
                  ...current.owner,
                  sameAsConsignor: checked
                }
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

function ObjectsPage(props: { caseFile: CaseFile }) {
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
    ? selectedObject.photoAssetIds
        .map((assetId) => props.caseFile.assets.find((asset) => asset.id === assetId))
        .filter((asset): asset is Asset => Boolean(asset))
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
                    <InlineToggle
                      label="Nettolimite"
                      checked={selectedObject.pricingMode === "netLimit"}
                      onChange={(checked) => updateObject(selectedObject.id, (current) => ({ ...current, pricingMode: checked ? "netLimit" : "limit" }))}
                    />
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

                      const assets = await Promise.all(
                        files.map(async (file) => persistCaseAssetImmediately(props.caseFile, await createOptimizedImageAsset(file)))
                      );
                      updateCurrentCase((current) => ({
                        ...current,
                        assets: [...current.assets, ...assets],
                        objects: current.objects.map((item) =>
                          item.id === selectedObject.id
                            ? { ...item, photoAssetIds: [...item.photoAssetIds, ...assets.map((asset) => asset.id)] }
                            : item
                        )
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
                            onClick={() =>
                              (() => {
                                updateCurrentCase((current) => ({
                                  ...current,
                                  assets: current.assets.filter((item) => item.id !== asset.id),
                                  objects: current.objects.map((item) =>
                                    item.id === selectedObject.id
                                      ? { ...item, photoAssetIds: item.photoAssetIds.filter((assetId) => assetId !== asset.id) }
                                      : item
                                  )
                                }));
                                void persistSnapshotToDisk(createSnapshot());
                              })()
                            }
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
                <button
                  className="primary"
                  onClick={() => {
                    const objectId = addObject();
                    if (objectId) {
                      setSelectedObjectId(objectId);
                    }
                  }}
                >
                  Objekt hinzufügen
                </button>
                {selectedObject ? <button onClick={() => deleteObject(selectedObject.id)}>Objekt löschen</button> : null}
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

function InternalPage(props: { caseFile: CaseFile }) {
  const state = useAppState();

  return (
    <div className="page-grid">
      <Section title="Interne Infos">
        <Field label="Interne Notizen" full>
          <textarea
            value={props.caseFile.internalInfo.notes}
            onChange={(event) =>
              updateCurrentCase((current) => ({
                ...current,
                internalInfo: {
                  ...current.internalInfo,
                  notes: event.target.value
                }
              }))
            }
          />
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
                  {department.code} {"\u00b7"} {department.name}
                </span>
              </label>
            );
          })}
        </div>
      </Section>
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

function ExportStatusCard(props: {
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

type RequiredFieldEntry = {
  key: string;
  label: string;
  kind: "text" | "select" | "action";
  objectIndex?: number;
};

function getRequiredFieldEntries(caseFile: CaseFile, requiredFields: string[]): RequiredFieldEntry[] {
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

function updateRequiredFieldValue(entry: RequiredFieldEntry, value?: string) {
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
  if (entry.key === "objects.departmentId") return caseFile.objects[entry.objectIndex ?? -1]?.departmentId ?? "";
  if (entry.key === "objects.shortDescription") return caseFile.objects[entry.objectIndex ?? -1]?.shortDescription ?? "";
  if (entry.key === "objects.estimate.low") return caseFile.objects[entry.objectIndex ?? -1]?.estimate.low ?? "";
  if (entry.key === "objects.estimate.high") return caseFile.objects[entry.objectIndex ?? -1]?.estimate.high ?? "";
  return "";
}

function RequiredFieldsModal(props: { caseFile: CaseFile; entries: RequiredFieldEntry[]; onClose: () => void }) {
  return <CleanRequiredFieldsModal {...props} />;
}

function RequiredFieldsModalLegacy(props: { caseFile: CaseFile; entries: RequiredFieldEntry[]; onClose: () => void }) {
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

              if (entry.key === "meta.clerkId") {
                return (
                  <Field key={entry.label} label={entry.label} full>
                    <select value={props.caseFile.meta.clerkId} onChange={(event) => updateRequiredFieldValue(entry, event.target.value)}>
                      <option value="">Bitte wählen</option>
                      {state.masterData.clerks.map((clerk) => (
                        <option key={clerk.id} value={clerk.id}>
                          {clerk.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                );
              }

              if (entry.key === "objects.departmentId") {
                const objectItem = props.caseFile.objects[entry.objectIndex ?? -1];
                return (
                  <Field key={entry.label} label={entry.label} full>
                    <select value={objectItem?.departmentId ?? ""} onChange={(event) => updateRequiredFieldValue(entry, event.target.value)}>
                      <option value="">Bitte wählen</option>
                      {state.masterData.departments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.code} ? {department.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                );
              }

              const textValue =
                entry.key === "meta.receiptNumber"
                  ? props.caseFile.meta.receiptNumber
                  : entry.key === "consignor.lastName"
                    ? props.caseFile.consignor.lastName
                    : entry.key === "consignor.street"
                      ? props.caseFile.consignor.street
                      : entry.key === "consignor.zip"
                        ? props.caseFile.consignor.zip
                        : entry.key === "consignor.city"
                          ? props.caseFile.consignor.city
                          : entry.key === "objects.shortDescription"
                            ? props.caseFile.objects[entry.objectIndex ?? -1]?.shortDescription ?? ""
                            : entry.key === "objects.estimate.low"
                              ? props.caseFile.objects[entry.objectIndex ?? -1]?.estimate.low ?? ""
                              : entry.key === "objects.estimate.high"
                                ? props.caseFile.objects[entry.objectIndex ?? -1]?.estimate.high ?? ""
                                : "";

              return (
                <Field key={entry.label} label={entry.label} full>
                  <input value={textValue} onChange={(event) => updateRequiredFieldValue(entry, event.target.value)} />
                </Field>
              );
            })}
          </Section>
        </div>
      </div>
    </div>
  );
}

void RequiredFieldsModalLegacy;

function CleanRequiredFieldsModal(props: { caseFile: CaseFile; entries: RequiredFieldEntry[]; onClose: () => void }) {
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
                    <FollowUpFieldControl value={currentValue} onChange={(value) => updateRequiredFieldValue(entry, value)} />
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
                    <FollowUpFieldControl value={currentValue} onChange={(value) => updateRequiredFieldValue(entry, value)} />
                  </Field>
                );
              }

              return (
                <Field key={entry.label} label={entry.label} full>
                  <input className={getTextInputClassName(currentValue)} value={currentValue} onChange={(event) => updateRequiredFieldValue(entry, event.target.value)} />
                  <FollowUpFieldControl value={currentValue} onChange={(value) => updateRequiredFieldValue(entry, value)} />
                </Field>
              );
            })}
          </Section>
        </div>
      </div>
    </div>
  );
}

function PreviewActionButtons(props: { caseFile: CaseFile; onExportStatusChange: (value: string) => void }) {
  const state = useAppState();

  async function handleExportArtifacts(): Promise<void> {
    try {
      props.onExportStatusChange("ZIP wird erzeugt...");
      const bundle = await generateExportBundle(props.caseFile, state.masterData);

      for (const artifact of bundle.artifacts) {
        const blob = new Blob([artifact.content], { type: artifact.mimeType });
        triggerDownload(artifact.fileName.replace("bilder/", "bilder_"), blob);
      }

      const zipBlob = await createExportZip(props.caseFile, state.masterData);
      triggerDownload(bundle.plan.zipFileName, zipBlob);
      finalizeCurrentCase();
      props.onExportStatusChange("ZIP wurde erzeugt und der Vorgang wurde finalisiert.");
    } catch (error) {
      props.onExportStatusChange(error instanceof Error ? error.message : "Export fehlgeschlagen.");
    }
  }

  async function handleOpenPdf(): Promise<void> {
    try {
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

    hydrateSnapshotFromDisk()
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

    void persistSnapshotToDisk(createSnapshot());
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


