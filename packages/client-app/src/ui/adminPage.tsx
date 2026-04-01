import { collectMasterDataReferences } from "@elb/app-core/index";
import { createEmptyClerk, listRequiredFieldDefinitions, type MasterData, type RequiredFieldKey } from "@elb/domain/index";
import { Field, Section } from "@elb/ui/forms";
import { createSnapshot, hasAdminAccess, lockAdmin, unlockAdmin, updateMasterData } from "../appState";
import { PdfSignatureEditor } from "../features/pdfPreview/PdfSignatureEditor";
import { usePlatform } from "../platform/platformContext";
import { useAppState } from "../useAppState";
import { useEffect, useState } from "react";

export function AdminPage() {
  const state = useAppState();
  const platform = usePlatform();
  const [draftMasterData, setDraftMasterData] = useState<MasterData>(state.masterData);
  const [masterDataDirty, setMasterDataDirty] = useState(false);
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
  const requiredFieldDefinitions = listRequiredFieldDefinitions();

  useEffect(() => {
    setDraftMasterData(state.masterData);
    setMasterDataDirty(false);
  }, [state.masterData]);

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

  function updateDraftMasterData(updater: (current: MasterData) => MasterData) {
    setDraftMasterData((current) => {
      const next = updater(current);
      if (next !== current) {
        setMasterDataDirty(true);
      }
      return next;
    });
  }

  function toggleRequiredField(target: "pdf" | "word", key: RequiredFieldKey, checked: boolean) {
    updateDraftMasterData((current) => {
      const source = target === "pdf" ? current.globalPdfRequiredFields : current.globalWordRequiredFields;
      const nextValues = checked
        ? Array.from(new Set([...source, key]))
        : source.filter((item) => item !== key);

      if (target === "pdf") {
        return {
          ...current,
          globalPdfRequiredFields: nextValues
        };
      }

      return {
        ...current,
        globalWordRequiredFields: nextValues
      };
    });
  }

  function handleMasterDataSave() {
    updateMasterData(() => draftMasterData);
    setMasterDataStatus("Stammdaten wurden gespeichert.");
    setMasterDataDirty(false);
  }

  async function handleMasterDataExport() {
    setMasterDataBusy(true);
    setMasterDataStatus("");

    try {
      const result = await platform.masterDataSync.exportCurrent(draftMasterData);
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

      setDraftMasterData(imported.masterData);
      setMasterDataDirty(true);
      setMasterDataStatus(`${imported.message} Bitte speichern, um die Aenderungen zu uebernehmen.`);
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

      setDraftMasterData(imported.masterData);
      setMasterDataDirty(true);
      setMasterDataStatus(`${imported.message} Bitte speichern, um die Aenderungen zu uebernehmen.`);
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
              Oeffnen
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
          <button type="button" className="primary" disabled={!masterDataDirty || masterDataBusy} onClick={() => handleMasterDataSave()}>
            Speichern
          </button>
          <button type="button" onClick={() => lockAdmin()}>
            Sperren
          </button>
        </div>
        {masterDataStatus ? <p>{masterDataStatus}</p> : null}
      </Section>

      {section === "security" ? (
        <Section title="Lokale PIN">
          <Field label="Admin-PIN">
            <input value={draftMasterData.adminPin} onChange={(event) => updateDraftMasterData((current) => ({ ...current, adminPin: event.target.value }))} />
          </Field>
        </Section>
      ) : null}

      {section === "required" ? (
        <Section title="Pflichtfelder je Dokumenttyp">
          <div className="required-fields-table-wrap">
            <table className="required-fields-table">
              <thead>
                <tr>
                  <th scope="col">Formularfeld</th>
                  <th scope="col">ELB PDF</th>
                  <th scope="col">Word Schätzliste</th>
                </tr>
              </thead>
              <tbody>
                {requiredFieldDefinitions.map((field) => (
                  <tr key={field.key}>
                    <td>{field.label}</td>
                    <td>
                      <label className="inline-toggle">
                        <input
                          type="checkbox"
                          checked={draftMasterData.globalPdfRequiredFields.includes(field.key)}
                          onChange={(event) => toggleRequiredField("pdf", field.key, event.target.checked)}
                        />
                        <span className="inline-toggle__box" />
                        <span className="inline-toggle__label">Pflicht</span>
                      </label>
                    </td>
                    <td>
                      <label className="inline-toggle">
                        <input
                          type="checkbox"
                          checked={draftMasterData.globalWordRequiredFields.includes(field.key)}
                          onChange={(event) => toggleRequiredField("word", field.key, event.target.checked)}
                        />
                        <span className="inline-toggle__box" />
                        <span className="inline-toggle__label">Pflicht</span>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      {section === "clerks" ? (
        <Section title="Sachbearbeiter">
          {draftMasterData.clerks.map((clerk, index) => {
            const references = collectMasterDataReferences(cases, "clerk", clerk.id);
            return (
              <div key={clerk.id} className="admin-clerk">
                <div className="form-row form-row--triple">
                  <Field label={`Sachbearbeiter ${index + 1}`}>
                    <input value={clerk.name} onChange={(event) => updateDraftMasterData((current) => ({ ...current, clerks: current.clerks.map((item) => (item.id === clerk.id ? { ...item, name: event.target.value } : item)) }))} />
                  </Field>
                  <Field label="E-Mail">
                    <input value={clerk.email} onChange={(event) => updateDraftMasterData((current) => ({ ...current, clerks: current.clerks.map((item) => (item.id === clerk.id ? { ...item, email: event.target.value } : item)) }))} />
                  </Field>
                  <Field label="Telefon">
                    <input value={clerk.phone} onChange={(event) => updateDraftMasterData((current) => ({ ...current, clerks: current.clerks.map((item) => (item.id === clerk.id ? { ...item, phone: event.target.value } : item)) }))} />
                  </Field>
                </div>
                <div className="form-row form-row--double">
                  <Field label="Naechste ELB Desktop">
                    <input value={clerk.nextReceiptNumberDesktop} onChange={(event) => updateDraftMasterData((current) => ({ ...current, clerks: current.clerks.map((item) => (item.id === clerk.id ? { ...item, nextReceiptNumberDesktop: event.target.value } : item)) }))} />
                  </Field>
                  <Field label="Naechste ELB Web">
                    <input value={clerk.nextReceiptNumberWeb} onChange={(event) => updateDraftMasterData((current) => ({ ...current, clerks: current.clerks.map((item) => (item.id === clerk.id ? { ...item, nextReceiptNumberWeb: event.target.value } : item)) }))} />
                  </Field>
                </div>
                <PdfSignatureEditor
                  title="Signatur"
                  value={clerk.signaturePng}
                  description="Die Signatur wird mit Speichern im Sachbearbeiter abgelegt und danach automatisch in PDFs verwendet."
                  onClose={() => {}}
                  onClear={() =>
                    updateDraftMasterData((current) => ({
                      ...current,
                      clerks: current.clerks.map((item) => (item.id === clerk.id ? { ...item, signaturePng: "" } : item))
                    }))
                  }
                  onSave={(dataUrl) =>
                    updateDraftMasterData((current) => ({
                      ...current,
                      clerks: current.clerks.map((item) => (item.id === clerk.id ? { ...item, signaturePng: dataUrl } : item))
                    }))
                  }
                />
                <div className="inline-actions">
                  <button type="button" disabled={references.length > 0} onClick={() => updateDraftMasterData((current) => ({ ...current, clerks: current.clerks.filter((item) => item.id !== clerk.id) }))}>
                    Loeschen
                  </button>
                </div>
              </div>
            );
          })}
          <div className="inline-actions">
            <button type="button" className="primary" onClick={() => updateDraftMasterData((current) => ({ ...current, clerks: [...current.clerks, createEmptyClerk({ id: crypto.randomUUID() })] }))}>
              Sachbearbeiter hinzufuegen
            </button>
          </div>
        </Section>
      ) : null}

      {section === "auctions" ? (
        <Section title="Auktionen">
          {draftMasterData.auctions.map((auction, index) => {
            const references = collectMasterDataReferences(cases, "auction", auction.id);
            return (
              <div key={auction.id} className="admin-clerk">
                <div className="form-row form-row--triple">
                  <Field label={`Auktion ${index + 1}`}>
                    <input value={auction.number} onChange={(event) => updateDraftMasterData((current) => ({ ...current, auctions: current.auctions.map((item) => (item.id === auction.id ? { ...item, number: event.target.value } : item)) }))} />
                  </Field>
                  <Field label="Monat">
                    <input value={auction.month} onChange={(event) => updateDraftMasterData((current) => ({ ...current, auctions: current.auctions.map((item) => (item.id === auction.id ? { ...item, month: event.target.value } : item)) }))} />
                  </Field>
                  <Field label="Jahr">
                    <input value={auction.year} onChange={(event) => updateDraftMasterData((current) => ({ ...current, auctions: current.auctions.map((item) => (item.id === auction.id ? { ...item, year: event.target.value } : item)) }))} />
                  </Field>
                </div>
                <div className="inline-actions">
                  <button type="button" disabled={references.length > 0} onClick={() => updateDraftMasterData((current) => ({ ...current, auctions: current.auctions.filter((item) => item.id !== auction.id) }))}>
                    Loeschen
                  </button>
                </div>
              </div>
            );
          })}
          <div className="inline-actions">
            <button type="button" className="primary" onClick={() => updateDraftMasterData((current) => ({ ...current, auctions: [...current.auctions, { id: crypto.randomUUID(), number: "", month: "", year: "" }] }))}>
              Auktion hinzufuegen
            </button>
          </div>
        </Section>
      ) : null}

      {section === "departments" ? (
        <Section title="Abteilungen / Interessengebiete">
          {draftMasterData.departments.map((department, index) => {
            const references = collectMasterDataReferences(cases, "department", department.id);
            return (
              <div key={department.id} className="admin-clerk">
                <div className="form-row form-row--double">
                  <Field label={`Abteilung ${index + 1}`}>
                    <input value={department.code} onChange={(event) => updateDraftMasterData((current) => ({ ...current, departments: current.departments.map((item) => (item.id === department.id ? { ...item, code: event.target.value } : item)) }))} />
                  </Field>
                  <Field label="Bezeichnung">
                    <input value={department.name} onChange={(event) => updateDraftMasterData((current) => ({ ...current, departments: current.departments.map((item) => (item.id === department.id ? { ...item, name: event.target.value } : item)) }))} />
                  </Field>
                </div>
                <div className="inline-actions">
                  <button type="button" disabled={references.length > 0} onClick={() => updateDraftMasterData((current) => ({ ...current, departments: current.departments.filter((item) => item.id !== department.id) }))}>
                    Loeschen
                  </button>
                </div>
              </div>
            );
          })}
          <div className="inline-actions">
            <button type="button" className="primary" onClick={() => updateDraftMasterData((current) => ({ ...current, departments: [...current.departments, { id: crypto.randomUUID(), code: "", name: "" }] }))}>
              Abteilung hinzufuegen
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
          <p>Die App speichert nur noch dossierbasiert pro Sachbearbeiter. Stammdaten und aktueller Datenordner koennen hier verwaltet werden.</p>
        </Section>
      ) : null}
    </div>
  );
}
