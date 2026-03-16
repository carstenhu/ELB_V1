import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { deriveBeneficiary, deriveOwner, formatAmountForDisplay, type Asset, type CaseFile, type PageId } from "@elb/domain/index";
import { createExportPlan, createExportZip, generateExportBundle, triggerDownload } from "@elb/export-core/index";
import { hydrateSnapshotFromDisk, persistSnapshotToDisk } from "@elb/persistence/filesystem";
import { createPdfPreviewModel } from "@elb/pdf-core/index";
import { APP_NAME } from "@elb/shared/constants";
import { Field, Section } from "@elb/ui/forms";
import { createWordPreviewModel } from "@elb/word-core/index";
import { PdfCanvasPreview, type PdfEditTarget } from "./pdfPreview";
import {
  addObject,
  applyAuctionPricingRules,
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
  { id: "admin", label: "Admin" },
  { id: "pdfPreview", label: "ELB-PDF-Vorschau" },
  { id: "wordPreview", label: "Word-Schätzliste-Vorschau" }
];

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

    if (!props.value) {
      return;
    }

    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = props.value;
  }, [props.value]);

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
    props.onChange("");
  }

  function save() {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    props.onChange(canvas.toDataURL("image/png"));
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
            if (value.startsWith("clerk:")) {
              selectClerk(value.replace("clerk:", ""));
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
          {state.masterData.clerks.map((clerk) => (
            <option key={clerk.id} value={`clerk:${clerk.id}`}>
              Sachbearbeiter wechseln: {clerk.name}
            </option>
          ))}
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

function AdminModal(props: { open: boolean; onClose: () => void }) {
  const state = useAppState();
  const [pinInput, setPinInput] = useState("");
  const [unlocked, setUnlocked] = useState(false);

  if (!props.open) {
    return null;
  }

  if (!unlocked) {
    return (
      <div className="pin-modal">
        <div className="pin-modal__card">
          <h2>Admin-PIN</h2>
          <input type="password" value={pinInput} onChange={(event) => setPinInput(event.target.value)} />
          <div className="pin-modal__actions">
            <button onClick={props.onClose}>Schließen</button>
            <button
              onClick={() => {
                if (pinInput === state.masterData.adminPin) {
                  setUnlocked(true);
                }
              }}
            >
              Öffnen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pin-modal">
      <div className="overlay__card">
        <div className="admin-header">
          <h2>Admin-Panel</h2>
          <button onClick={props.onClose}>Schließen</button>
        </div>
        <div className="page-grid">
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
          <Section title="Sachbearbeiter">
            {state.masterData.clerks.map((clerk, index) => (
              <div key={clerk.id} className="admin-clerk">
                <Field label={`Sachbearbeiter ${index + 1}`} full>
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
                <Field label="Signatur" full>
                  <SignaturePadEditor
                    value={clerk.signaturePng}
                    onChange={(dataUrl) =>
                      updateMasterData((current) => ({
                        ...current,
                        clerks: current.clerks.map((item) => (item.id === clerk.id ? { ...item, signaturePng: dataUrl } : item))
                      }))
                    }
                  />
                </Field>
                {clerk.signaturePng ? <img className="signature-preview" src={clerk.signaturePng} alt={`Signatur ${clerk.name}`} /> : null}
              </div>
            ))}
          </Section>
          <Section title="Auktionen">
            {state.masterData.auctions.map((auction, index) => (
              <Field key={auction.id} label={`Auktion ${index + 1}`} full>
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
            ))}
          </Section>
          <Section title="Abteilungen / Interessengebiete">
            {state.masterData.departments.map((department, index) => (
              <Field key={department.id} label={`Abteilung ${index + 1}`} full>
                <input
                  value={`${department.code} · ${department.name}`}
                  onChange={(event) =>
                    updateMasterData((current) => ({
                      ...current,
                      departments: current.departments.map((item) =>
                        item.id === department.id
                          ? {
                              ...item,
                              name: event.target.value
                            }
                          : item
                      )
                    }))
                  }
                />
              </Field>
            ))}
          </Section>
        </div>
      </div>
    </div>
  );
}

void AdminModal;

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
              <Field label={`Sachbearbeiter ${index + 1}`} full>
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
              <Field label="Signatur" full>
                <SignaturePadEditor
                  value={clerk.signaturePng}
                  onChange={(dataUrl) =>
                    updateMasterData((current) => ({
                      ...current,
                      clerks: current.clerks.map((item) => (item.id === clerk.id ? { ...item, signaturePng: dataUrl } : item))
                    }))
                  }
                />
              </Field>
              {clerk.signaturePng ? <img className="signature-preview" src={clerk.signaturePng} alt={`Signatur ${clerk.name}`} /> : null}
            </div>
          ))}
        </Section>
      ) : null}

      {section === "auctions" ? (
        <Section title="Auktionen">
          {state.masterData.auctions.map((auction, index) => (
            <Field key={auction.id} label={`Auktion ${index + 1}`} full>
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
          ))}
        </Section>
      ) : null}

      {section === "departments" ? (
        <Section title="Abteilungen / Interessengebiete">
          {state.masterData.departments.map((department, index) => (
            <Field key={department.id} label={`Abteilung ${index + 1}`} full>
              <input
                value={`${department.code} Â· ${department.name}`}
                onChange={(event) =>
                  updateMasterData((current) => ({
                    ...current,
                    departments: current.departments.map((item) =>
                      item.id === department.id
                        ? {
                            ...item,
                            name: event.target.value
                          }
                        : item
                    )
                  }))
                }
              />
            </Field>
          ))}
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

  return (
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
            {state.masterData.clerks.map((clerk) => (
              <option key={clerk.id} value={clerk.id}>
                {clerk.name}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Einlieferer">
        <Field label="Firmenadresse">
          <input
            type="checkbox"
            checked={props.caseFile.consignor.useCompanyAddress}
            onChange={(event) =>
              updateCurrentCase((current) => ({
                ...current,
                consignor: {
                  ...current.consignor,
                  useCompanyAddress: event.target.checked
                }
              }))
            }
          />
        </Field>
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
        <Field label="Straße">
          <input value={props.caseFile.consignor.street} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, street: event.target.value } }))} />
        </Field>
        <Field label="Nr.">
          <input value={props.caseFile.consignor.houseNumber} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, houseNumber: event.target.value } }))} />
        </Field>
        <Field label="PLZ">
          <input value={props.caseFile.consignor.zip} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, zip: event.target.value } }))} />
        </Field>
        <Field label="Stadt">
          <input value={props.caseFile.consignor.city} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, city: event.target.value } }))} />
        </Field>
        <Field label="Land">
          <input value={props.caseFile.consignor.country} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, country: event.target.value } }))} />
        </Field>
        <Field label="Geburtsdatum">
          <input value={props.caseFile.consignor.birthDate} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, birthDate: event.target.value } }))} />
        </Field>
        <Field label="Nationalität">
          <input value={props.caseFile.consignor.nationality} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, nationality: event.target.value } }))} />
        </Field>
        <Field label="ID/Passnummer">
          <input value={props.caseFile.consignor.passportNumber} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, passportNumber: event.target.value } }))} />
        </Field>
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

                const asset = await createOptimizedImageAsset(file);
                updateCurrentCase((current) => ({
                  ...current,
                  assets: [...current.assets.filter((item) => item.id !== current.consignor.photoAssetId), asset],
                  consignor: {
                    ...current.consignor,
                    photoAssetId: asset.id
                  }
                }));
                event.target.value = "";
              }}
            />
            {consignorPhoto ? (
              <div className="photo-preview photo-preview--passport">
                <img src={consignorPhoto.optimizedPath} alt="Passfoto Einlieferer" />
                <button
                  type="button"
                  className="photo-preview__remove"
                  onClick={() =>
                    updateCurrentCase((current) => ({
                      ...current,
                      assets: current.assets.filter((asset) => asset.id !== current.consignor.photoAssetId),
                      consignor: {
                        ...current.consignor,
                        photoAssetId: ""
                      }
                    }))
                  }
                >
                  ×
                </button>
              </div>
            ) : null}
          </div>
        </Field>
      </Section>

      <Section title="Eigentümer">
        <Field label="Eigentümer = Einlieferer">
          <input
            type="checkbox"
            checked={props.caseFile.owner.sameAsConsignor}
            onChange={(event) =>
              updateCurrentCase((current) => ({
                ...current,
                owner: {
                  ...current.owner,
                  sameAsConsignor: event.target.checked
                }
              }))
            }
          />
        </Field>
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
        <Field label="Abweichender Begünstigter">
          <input
            type="checkbox"
            checked={props.caseFile.bank.beneficiaryOverride.enabled}
            onChange={(event) =>
              updateCurrentCase((current) => ({
                ...current,
                bank: {
                  ...current.bank,
                  beneficiaryOverride: {
                    ...current.bank.beneficiaryOverride,
                    enabled: event.target.checked
                  }
                }
              }))
            }
          />
        </Field>
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

    </div>
  );
}

function ObjectsPage(props: { caseFile: CaseFile }) {
  const state = useAppState();
  const [selectedObjectId, setSelectedObjectId] = useState<string>(props.caseFile.objects[0]?.id ?? "");

  useEffect(() => {
    if (!props.caseFile.objects.length) {
      setSelectedObjectId("");
      return;
    }

    if (!props.caseFile.objects.some((item) => item.id === selectedObjectId)) {
      setSelectedObjectId(props.caseFile.objects[0]?.id ?? "");
    }
  }, [props.caseFile.objects, selectedObjectId]);

  const selectedObject = props.caseFile.objects.find((item) => item.id === selectedObjectId) ?? props.caseFile.objects[0] ?? null;
  const selectedObjectAssets = selectedObject ? props.caseFile.assets.filter((asset) => selectedObject.photoAssetIds.includes(asset.id)) : [];

  return (
    <div className="page-grid">
      <Section title="Objekte">
        <Field label="Objektauswahl" full>
          <select value={selectedObjectId} onChange={(event) => setSelectedObjectId(event.target.value)}>
            {!props.caseFile.objects.length ? <option value="">Noch keine Objekte</option> : null}
            {props.caseFile.objects.map((item, index) => (
              <option key={item.id} value={item.id}>
                {index + 1}/{props.caseFile.objects.length} - {item.intNumber} - {item.shortDescription || "Ohne Kurzbeschrieb"}
              </option>
            ))}
          </select>
        </Field>
        <div className="inline-actions">
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
        {!selectedObject ? <p>Noch keine Objekte erfasst.</p> : null}
        {selectedObject ? (() => {
          const auction = state.masterData.auctions.find((candidate) => candidate.id === selectedObject.auctionId);
          const ibid = auction ? auction.number.toLowerCase().startsWith("ibid") : false;

          return (
            <>
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
                  {state.masterData.departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.code} · {department.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Kurzbeschrieb" full>
                <input value={selectedObject.shortDescription} onChange={(event) => updateObject(selectedObject.id, (current) => ({ ...current, shortDescription: event.target.value }))} />
              </Field>
              <Field label="Beschreibung" full>
                <textarea value={selectedObject.description} onChange={(event) => updateObject(selectedObject.id, (current) => ({ ...current, description: event.target.value }))} />
              </Field>
              <Field label="Referenznr." full>
                <input value={selectedObject.referenceNumber} onChange={(event) => updateObject(selectedObject.id, (current) => ({ ...current, referenceNumber: event.target.value }))} />
              </Field>
              <Field label="Bemerkungen" full>
                <textarea value={selectedObject.remarks} onChange={(event) => updateObject(selectedObject.id, (current) => ({ ...current, remarks: event.target.value }))} />
              </Field>
              <Field label="Schätzung von">
                <input value={formatAmountForDisplay(selectedObject.estimate.low)} onChange={(event) => updateObject(selectedObject.id, (current) => ({ ...current, estimate: { ...current.estimate, low: event.target.value } }))} />
              </Field>
              <Field label="Schätzung bis">
                <input value={formatAmountForDisplay(selectedObject.estimate.high)} onChange={(event) => updateObject(selectedObject.id, (current) => ({ ...current, estimate: { ...current.estimate, high: event.target.value } }))} />
              </Field>
              <Field label={ibid ? "Startpreis" : "Limite / Nettolimite"}>
                <input value={formatAmountForDisplay(selectedObject.priceValue)} onChange={(event) => updateObject(selectedObject.id, (current) => ({ ...current, priceValue: event.target.value }))} />
              </Field>
              {!ibid ? (
                <Field label="Nettolimite">
                  <input
                    type="checkbox"
                    checked={selectedObject.pricingMode === "netLimit"}
                    onChange={(event) => updateObject(selectedObject.id, (current) => ({ ...current, pricingMode: event.target.checked ? "netLimit" : "limit" }))}
                  />
                </Field>
              ) : null}
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

                      const assets = await Promise.all(files.map((file) => createOptimizedImageAsset(file)));
                      updateCurrentCase((current) => ({
                        ...current,
                        assets: [...current.assets, ...assets],
                        objects: current.objects.map((item) =>
                          item.id === selectedObject.id
                            ? { ...item, photoAssetIds: [...item.photoAssetIds, ...assets.map((asset) => asset.id)] }
                            : item
                        )
                      }));
                      event.target.value = "";
                    }}
                  />
                  {selectedObjectAssets.length ? (
                    <div className="photo-grid">
                      {selectedObjectAssets.map((asset) => (
                        <div key={asset.id} className="photo-preview">
                          <img src={asset.optimizedPath} alt={asset.fileName} />
                          <button
                            type="button"
                            className="photo-preview__remove"
                            onClick={() =>
                              updateCurrentCase((current) => ({
                                ...current,
                                assets: current.assets.filter((item) => item.id !== asset.id),
                                objects: current.objects.map((item) =>
                                  item.id === selectedObject.id
                                    ? { ...item, photoAssetIds: item.photoAssetIds.filter((assetId) => assetId !== asset.id) }
                                    : item
                                )
                              }))
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
            </>
          );
        })() : null}
      </Section>

      <Section title="Konditionen für alle Objekte">
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

  const objectItem = props.openTarget?.kind === "object" ? props.caseFile.objects[props.openTarget.objectIndex] ?? null : null;
  const activeClerk = state.masterData.clerks.find((clerk) => clerk.id === props.caseFile.meta.clerkId);

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
              <Field label="Firma">
                <input value={props.caseFile.consignor.company} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, company: event.target.value } }))} />
              </Field>
              <Field label="Vorname">
                <input value={props.caseFile.consignor.firstName} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, firstName: event.target.value } }))} />
              </Field>
              <Field label="Nachname">
                <input value={props.caseFile.consignor.lastName} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, lastName: event.target.value } }))} />
              </Field>
              <Field label="Straße">
                <input value={props.caseFile.consignor.street} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, street: event.target.value } }))} />
              </Field>
              <Field label="PLZ">
                <input value={props.caseFile.consignor.zip} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, zip: event.target.value } }))} />
              </Field>
              <Field label="Stadt">
                <input value={props.caseFile.consignor.city} onChange={(event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, city: event.target.value } }))} />
              </Field>
            </Section>
          ) : null}

          {props.openTarget.kind === "owner" ? (
            <Section title="Eigentümer">
              <Field label="Eigentümer = Einlieferer">
                <input
                  type="checkbox"
                  checked={props.caseFile.owner.sameAsConsignor}
                  onChange={(event) =>
                    updateCurrentCase((current) => ({
                      ...current,
                      owner: { ...current.owner, sameAsConsignor: event.target.checked }
                    }))
                  }
                />
              </Field>
              {props.caseFile.owner.sameAsConsignor ? null : (
                <>
                  <Field label="Vorname">
                    <input value={props.caseFile.owner.firstName} onChange={(event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, firstName: event.target.value } }))} />
                  </Field>
                  <Field label="Nachname">
                    <input value={props.caseFile.owner.lastName} onChange={(event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, lastName: event.target.value } }))} />
                  </Field>
                  <Field label="StraÃŸe">
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
                      {auction.number}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Abteilung">
                <select value={objectItem.departmentId} onChange={(event) => updateObject(objectItem.id, (current) => ({ ...current, departmentId: event.target.value }))}>
                  {state.masterData.departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.code} · {department.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Kurzbeschrieb" full>
                <input value={objectItem.shortDescription} onChange={(event) => updateObject(objectItem.id, (current) => ({ ...current, shortDescription: event.target.value }))} />
              </Field>
              <Field label="Beschreibung" full>
                <textarea value={objectItem.description} onChange={(event) => updateObject(objectItem.id, (current) => ({ ...current, description: event.target.value }))} />
              </Field>
              <Field label="Referenznr." full>
                <input value={objectItem.referenceNumber} onChange={(event) => updateObject(objectItem.id, (current) => ({ ...current, referenceNumber: event.target.value }))} />
              </Field>
              <Field label="Bemerkungen" full>
                <textarea value={objectItem.remarks} onChange={(event) => updateObject(objectItem.id, (current) => ({ ...current, remarks: event.target.value }))} />
              </Field>
              <Field label="Schätzung von">
                <input value={formatAmountForDisplay(objectItem.estimate.low)} onChange={(event) => updateObject(objectItem.id, (current) => ({ ...current, estimate: { ...current.estimate, low: event.target.value } }))} />
              </Field>
              <Field label="Schätzung bis">
                <input value={formatAmountForDisplay(objectItem.estimate.high)} onChange={(event) => updateObject(objectItem.id, (current) => ({ ...current, estimate: { ...current.estimate, high: event.target.value } }))} />
              </Field>
              <Field label="Limite / Startpreis">
                <input value={formatAmountForDisplay(objectItem.priceValue)} onChange={(event) => updateObject(objectItem.id, (current) => ({ ...current, priceValue: event.target.value }))} />
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
                    LÃ¶schen
                  </button>
                  <button type="button" className="secondary-button" onClick={props.onClose}>
                    SchlieÃŸen
                  </button>
                  <button type="button" className="primary-button" onClick={saveSignature}>
                    Ãœbernehmen
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
    </div>
  );
}

function PdfPreviewPage(props: { caseFile: CaseFile }) {
  const state = useAppState();
  const model = createPdfPreviewModel(props.caseFile, state.masterData);
  const exportPlan = createExportPlan(props.caseFile);
  const [exportStatus, setExportStatus] = useState<string>("");
  const [editTarget, setEditTarget] = useState<PdfEditTarget | null>(null);

  async function handleExportArtifacts(): Promise<void> {
    try {
      setExportStatus("Artefakte werden erzeugt...");
      const bundle = await generateExportBundle(props.caseFile, state.masterData);

      for (const artifact of bundle.artifacts) {
        const blob = new Blob([artifact.content], { type: artifact.mimeType });
        triggerDownload(artifact.fileName.replace("bilder/", "bilder_"), blob);
      }

      const zipBlob = await createExportZip(props.caseFile, state.masterData);
      triggerDownload(bundle.plan.zipFileName, zipBlob);
      setExportStatus("Artefakte und ZIP wurden erzeugt.");
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : "Export fehlgeschlagen.");
    }
  }

  return (
    <div className="preview-page">
      <div className="preview-sheet">
        <div className="preview-sheet__toolbar">
          <button>Pflichtfelder prüfen</button>
          <button onClick={() => saveDraft()}>Draft speichern</button>
          <button onClick={() => finalizeCurrentCase()}>Finalisieren</button>
          <button onClick={() => void handleExportArtifacts()}>Artefakte + ZIP erzeugen</button>
        </div>
        <div className="preview-sheet__content">
          <PdfCanvasPreview caseFile={props.caseFile} masterData={state.masterData} onEdit={setEditTarget} />
          <div className="preview-card">
            <h3>Exportstatus</h3>
            <p>Begünstigter: {model.beneficiary || "Noch nicht gesetzt"}</p>
            <p>Sachbearbeiter: {model.clerkLabel || "Noch nicht gesetzt"}</p>
            <p>ZIP: {exportPlan.zipFileName}</p>
            <div className="chip-list">
              {exportPlan.artifacts.map((artifact) => (
                <span key={artifact.fileName} className="chip">
                  {artifact.fileName}
                </span>
              ))}
            </div>
            {model.missingRequiredFields.length ? (
              <>
                <h4>Fehlende PDF-Pflichtfelder</h4>
                <ul className="simple-list">
                  {model.missingRequiredFields.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p>Alle konfigurierten PDF-Pflichtfelder sind aktuell befüllt.</p>
            )}
            {exportStatus ? <p>{exportStatus}</p> : null}
          </div>
        </div>
        <PdfEditModal caseFile={props.caseFile} openTarget={editTarget} onClose={() => setEditTarget(null)} onTargetChange={setEditTarget} />
      </div>
    </div>
  );
}

function WordPreviewPage(props: { caseFile: CaseFile }) {
  const state = useAppState();
  const model = createWordPreviewModel(props.caseFile, state.masterData);
  return (
    <div className="preview-page">
      <div className="word-sheet-stack">
        {model.pages.map((page) => (
          <div key={page.pageNumber} className="word-sheet">
            <header className="word-sheet__header">
              <div>Word-Schätzliste</div>
              <div>
                Seite {page.pageNumber}/{page.totalPages}
              </div>
            </header>
            <div className="word-sheet__body">
              <div className="preview-card">
                <h3>Einliefereradresse</h3>
                {page.showAddress ? page.addressLines.map((line) => <div key={line}>{line}</div>) : <div>Keine Adresse auf Folgeseite</div>}
              </div>
              <div className="preview-card">
                <h3>Objektinfos</h3>
                {page.rows.map((item) => (
                  <div key={item.id} className="word-row">
                    <strong>{item.intNumber}</strong>
                    <span>{item.title}</span>
                    <span>{item.estimate}</span>
                  </div>
                ))}
              </div>
              <div className="preview-card">
                <h3>Typografie</h3>
                <p>{model.typography.family}</p>
                <p>{model.typography.note}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function App() {
  const state = useAppState();
  const [page, setPage] = useState<PageId>("consignor");
  const [hydrated, setHydrated] = useState(false);
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
          {page === "pdfPreview" && caseFile ? <PdfPreviewPage caseFile={caseFile} /> : null}
          {page === "wordPreview" && caseFile ? <WordPreviewPage caseFile={caseFile} /> : null}
        </main>
      )}
    </div>
  );
}
