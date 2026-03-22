import { collectMasterDataReferences } from "@elb/app-core/index";
import { createEmptyClerk, normalizeRequiredFieldKeys } from "@elb/domain/index";
import { Field, Section } from "@elb/ui/forms";
import { createSnapshot, hasAdminAccess, importMasterDataSnapshot, lockAdmin, unlockAdmin, updateMasterData } from "../appState";
import { PdfSignatureEditor } from "../features/pdfPreview/PdfSignatureEditor";
import { usePlatform } from "../platform/platformContext";
import { useAppState } from "../useAppState";
import { useEffect, useState } from "react";

export function AdminPage() {
  const state = useAppState();
  const platform = usePlatform();
  const [pinInput, setPinInput] = useState("");
  const [section, setSection] = useState<"security" | "required" | "clerks" | "auctions" | "departments" | "storage">("security");
  const [masterDataStatus, setMasterDataStatus] = useState("");
  const [masterDataBusy, setMasterDataBusy] = useState(false);
  const [dataDirectoryStatus, setDataDirectoryStatus] = useState("");
  const [dataDirectoryLabel, setDataDirectoryLabel] = useState<string | null>(null);
  const [dataDirectoryBusy, setDataDirectoryBusy] = useState(false);
  const [dataDirectoryLinked, setDataDirectoryLinked] = useState(false);
  const [dataDirectorySupportsLinking, setDataDirectorySupportsLinking] = useState(false);
  const cases = state.dossiers;
  const unlocked = hasAdminAccess();

  useEffect(() => {
    let active = true;

    void platform.dataDirectory.getStatus().then((status) => {
      if (!active) {
        return;
      }

      setDataDirectoryStatus(status.message);
      setDataDirectoryLabel(status.label);
      setDataDirectoryLinked(status.isLinked);
      setDataDirectorySupportsLinking(status.supportsLinking);
    });

    return () => {
      active = false;
    };
  }, [platform]);

  async function handleMasterDataExport() {
    setMasterDataBusy(true);
    setMasterDataStatus("");

    try {
      const result = await platform.masterDataSync.exportCurrent(state.masterData);
      setMasterDataStatus(result.message);
    } catch (error) {
      setMasterDataStatus(error instanceof Error ? error.message : "Stammdaten konnten nicht exportiert werden.");
    } finally {
      setMasterDataBusy(false);
    }
  }

  async function handleMasterDataImport() {
    setMasterDataBusy(true);
    setMasterDataStatus("");

    try {
      const imported = await platform.masterDataSync.importFromSelection();
      if (!imported) {
        setMasterDataStatus("Keine Stammdaten-Datei ausgewaehlt.");
        return;
      }

      importMasterDataSnapshot(imported.masterData);
      setMasterDataStatus(imported.message);
    } catch (error) {
      setMasterDataStatus(error instanceof Error ? error.message : "Stammdaten konnten nicht importiert werden.");
    } finally {
      setMasterDataBusy(false);
    }
  }

  async function handleSupabaseMasterDataImport() {
    setMasterDataBusy(true);
    setMasterDataStatus("");

    try {
      const imported = await platform.masterDataSync.importFromSupabase?.();
      if (!imported) {
        setMasterDataStatus("Keine Supabase-Stammdaten verfuegbar.");
        return;
      }

      importMasterDataSnapshot(imported.masterData);
      setMasterDataStatus(imported.message);
    } catch (error) {
      setMasterDataStatus(error instanceof Error ? error.message : "Stammdaten konnten nicht aus Supabase geladen werden.");
    } finally {
      setMasterDataBusy(false);
    }
  }

  async function handleDataDirectoryLink() {
    setDataDirectoryBusy(true);

    try {
      const status = await platform.dataDirectory.link();
      await platform.workspaceRepository.save(createSnapshot());
      setDataDirectoryStatus(`${status.message} Aktueller Workspace wurde direkt geschrieben.`);
      setDataDirectoryLabel(status.label);
      setDataDirectoryLinked(status.isLinked);
      setDataDirectorySupportsLinking(status.supportsLinking);
    } catch (error) {
      setDataDirectoryStatus(error instanceof Error ? error.message : "Datenordner konnte nicht verknuepft werden.");
    } finally {
      setDataDirectoryBusy(false);
    }
  }

  async function handleDataDirectoryUnlink() {
    setDataDirectoryBusy(true);

    try {
      const status = await platform.dataDirectory.unlink();
      setDataDirectoryStatus(status.message);
      setDataDirectoryLabel(status.label);
      setDataDirectoryLinked(status.isLinked);
      setDataDirectorySupportsLinking(status.supportsLinking);
    } catch (error) {
      setDataDirectoryStatus(error instanceof Error ? error.message : "Datenordner-Verknuepfung konnte nicht geloest werden.");
    } finally {
      setDataDirectoryBusy(false);
    }
  }

  if (!unlocked) {
    return (
      <div className="page-grid">
        <Section title="Admin entsperren">
          <Field label="Admin-PIN">
            <input type="password" value={pinInput} onChange={(event) => setPinInput(event.target.value)} />
          </Field>
          <div className="inline-actions">
            <button className="primary" onClick={() => { if (unlockAdmin(pinInput)) setPinInput(""); }}>
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
          <button type="button" className={section === "storage" ? "toggle-button toggle-button--active" : "toggle-button"} onClick={() => setSection("storage")}>Speicher</button>
        </div>
        <div className="inline-actions">
          <button type="button" onClick={() => lockAdmin()}>
            Sperren
          </button>
        </div>
      </Section>

      {section === "security" ? (
        <Section title="Lokale PIN">
          <Field label="Admin-PIN">
            <input value={state.masterData.adminPin} onChange={(event) => updateMasterData((current) => ({ ...current, adminPin: event.target.value }))} />
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
                  globalPdfRequiredFields: normalizeRequiredFieldKeys(event.target.value.split("\n"))
                }))
              }
            />
          </Field>
        </Section>
      ) : null}

      {section === "clerks" ? (
        <Section title="Sachbearbeiter">
          {state.masterData.clerks.map((clerk, index) => {
            const references = collectMasterDataReferences(cases, "clerk", clerk.id);
            return (
              <div key={clerk.id} className="admin-clerk">
                <div className="form-row form-row--triple">
                  <Field label={`Sachbearbeiter ${index + 1}`}>
                    <input value={clerk.name} onChange={(event) => updateMasterData((current) => ({ ...current, clerks: current.clerks.map((item) => (item.id === clerk.id ? { ...item, name: event.target.value } : item)) }))} />
                  </Field>
                  <Field label="E-Mail">
                    <input value={clerk.email} onChange={(event) => updateMasterData((current) => ({ ...current, clerks: current.clerks.map((item) => (item.id === clerk.id ? { ...item, email: event.target.value } : item)) }))} />
                  </Field>
                  <Field label="Telefon">
                    <input value={clerk.phone} onChange={(event) => updateMasterData((current) => ({ ...current, clerks: current.clerks.map((item) => (item.id === clerk.id ? { ...item, phone: event.target.value } : item)) }))} />
                  </Field>
                </div>
                <div className="form-row form-row--double">
                  <Field label="Naechste ELB Desktop">
                    <input value={clerk.nextReceiptNumberDesktop} onChange={(event) => updateMasterData((current) => ({ ...current, clerks: current.clerks.map((item) => (item.id === clerk.id ? { ...item, nextReceiptNumberDesktop: event.target.value } : item)) }))} />
                  </Field>
                  <Field label="Naechste ELB Web">
                    <input value={clerk.nextReceiptNumberWeb} onChange={(event) => updateMasterData((current) => ({ ...current, clerks: current.clerks.map((item) => (item.id === clerk.id ? { ...item, nextReceiptNumberWeb: event.target.value } : item)) }))} />
                  </Field>
                </div>
                <PdfSignatureEditor
                  title="Signatur"
                  value={clerk.signaturePng}
                  description="Die Signatur wird beim Uebernehmen im Sachbearbeiter gespeichert und danach automatisch in PDFs verwendet."
                  onClose={() => {}}
                  onClear={() =>
                    updateMasterData((current) => ({
                      ...current,
                      clerks: current.clerks.map((item) => (item.id === clerk.id ? { ...item, signaturePng: "" } : item))
                    }))
                  }
                  onSave={(dataUrl) =>
                    updateMasterData((current) => ({
                      ...current,
                      clerks: current.clerks.map((item) => (item.id === clerk.id ? { ...item, signaturePng: dataUrl } : item))
                    }))
                  }
                />
                <div className="inline-actions">
                  <button type="button" disabled={references.length > 0} onClick={() => updateMasterData((current) => ({ ...current, clerks: current.clerks.filter((item) => item.id !== clerk.id) }))}>
                    Löschen
                  </button>
                </div>
              </div>
            );
          })}
          <div className="inline-actions">
            <button type="button" className="primary" onClick={() => updateMasterData((current) => ({ ...current, clerks: [...current.clerks, createEmptyClerk({ id: crypto.randomUUID() })] }))}>
              Sachbearbeiter hinzufügen
            </button>
          </div>
        </Section>
      ) : null}

      {section === "auctions" ? (
        <Section title="Auktionen">
          {state.masterData.auctions.map((auction, index) => {
            const references = collectMasterDataReferences(cases, "auction", auction.id);
            return (
              <div key={auction.id} className="admin-clerk">
                <div className="form-row form-row--triple">
                  <Field label={`Auktion ${index + 1}`}>
                    <input value={auction.number} onChange={(event) => updateMasterData((current) => ({ ...current, auctions: current.auctions.map((item) => (item.id === auction.id ? { ...item, number: event.target.value } : item)) }))} />
                  </Field>
                  <Field label="Monat">
                    <input value={auction.month} onChange={(event) => updateMasterData((current) => ({ ...current, auctions: current.auctions.map((item) => (item.id === auction.id ? { ...item, month: event.target.value } : item)) }))} />
                  </Field>
                  <Field label="Jahr">
                    <input value={auction.year} onChange={(event) => updateMasterData((current) => ({ ...current, auctions: current.auctions.map((item) => (item.id === auction.id ? { ...item, year: event.target.value } : item)) }))} />
                  </Field>
                </div>
                <div className="inline-actions">
                  <button type="button" disabled={references.length > 0} onClick={() => updateMasterData((current) => ({ ...current, auctions: current.auctions.filter((item) => item.id !== auction.id) }))}>
                    Löschen
                  </button>
                </div>
              </div>
            );
          })}
          <div className="inline-actions">
            <button type="button" className="primary" onClick={() => updateMasterData((current) => ({ ...current, auctions: [...current.auctions, { id: crypto.randomUUID(), number: "", month: "", year: "" }] }))}>
              Auktion hinzufügen
            </button>
          </div>
        </Section>
      ) : null}

      {section === "departments" ? (
        <Section title="Abteilungen / Interessengebiete">
          {state.masterData.departments.map((department, index) => {
            const references = collectMasterDataReferences(cases, "department", department.id);
            return (
              <div key={department.id} className="admin-clerk">
                <div className="form-row form-row--double">
                  <Field label={`Abteilung ${index + 1}`}>
                    <input value={department.code} onChange={(event) => updateMasterData((current) => ({ ...current, departments: current.departments.map((item) => (item.id === department.id ? { ...item, code: event.target.value } : item)) }))} />
                  </Field>
                  <Field label="Bezeichnung">
                    <input value={department.name} onChange={(event) => updateMasterData((current) => ({ ...current, departments: current.departments.map((item) => (item.id === department.id ? { ...item, name: event.target.value } : item)) }))} />
                  </Field>
                </div>
                <div className="inline-actions">
                  <button type="button" disabled={references.length > 0} onClick={() => updateMasterData((current) => ({ ...current, departments: current.departments.filter((item) => item.id !== department.id) }))}>
                    Löschen
                  </button>
                </div>
              </div>
            );
          })}
          <div className="inline-actions">
            <button type="button" className="primary" onClick={() => updateMasterData((current) => ({ ...current, departments: [...current.departments, { id: crypto.randomUUID(), code: "", name: "" }] }))}>
              Abteilung hinzufügen
            </button>
          </div>
        </Section>
      ) : null}

      {section === "storage" ? (
        <Section title="Speicher">
          <div className="admin-status-block">
            <strong>Datenordner</strong>
            <p>{dataDirectoryStatus}</p>
            {dataDirectoryLabel ? <p>Aktueller Ordner: {dataDirectoryLabel}</p> : null}
            {dataDirectorySupportsLinking ? (
              <div className="inline-actions">
                <button type="button" className="primary" disabled={dataDirectoryBusy} onClick={() => void handleDataDirectoryLink()}>
                  {dataDirectoryBusy ? "Verknuepfung laeuft..." : "Datenordner verknuepfen"}
                </button>
                <button type="button" disabled={dataDirectoryBusy || !dataDirectoryLinked} onClick={() => void handleDataDirectoryUnlink()}>
                  Verknuepfung loesen
                </button>
              </div>
            ) : null}
          </div>
          <div className="inline-actions">
            <button type="button" disabled={masterDataBusy} onClick={() => void handleMasterDataExport()}>
              Stammdaten exportieren
            </button>
            <button type="button" disabled={masterDataBusy} onClick={() => void handleMasterDataImport()}>
              Stammdaten importieren
            </button>
            {platform.masterDataSync.importFromSupabase ? (
              <button type="button" disabled={masterDataBusy} onClick={() => void handleSupabaseMasterDataImport()}>
                Stammdaten aus Supabase laden
              </button>
            ) : null}
          </div>
          {masterDataStatus ? <p>{masterDataStatus}</p> : null}
          <p>Die App speichert nur noch dossierbasiert pro Sachbearbeiter. Stammdaten und aktueller Datenordner koennen hier verwaltet werden.</p>
        </Section>
      ) : null}
    </div>
  );
}
