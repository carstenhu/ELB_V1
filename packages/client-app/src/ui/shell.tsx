/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PageId } from "@elb/domain/index";
import { APP_NAME } from "@elb/shared/constants";
import { selectClerk } from "../appState";
import { usePlatform } from "../platform/platformContext";
import { useAppState } from "../useAppState";

export const pages: Array<{ id: PageId; label: string }> = [
  { id: "consignor", label: "Einlieferer" },
  { id: "objects", label: "Objekte" },
  { id: "internal", label: "Interne Infos" },
  { id: "pdfPreview", label: "ELB-PDF" },
  { id: "wordPreview", label: "Schaetzliste" }
];

export function SessionOverlay(props: { open: boolean; onSelect: () => void }) {
  const state = useAppState();
  const [selectedClerkId, setSelectedClerkId] = useState("");

  useEffect(() => {
    if (!props.open) {
      return;
    }

    const fallbackClerkId = state.masterData.clerks[0]?.id ?? "";
    setSelectedClerkId(state.activeClerkId || fallbackClerkId);
  }, [props.open, state.activeClerkId, state.masterData.clerks]);

  if (!props.open) {
    return null;
  }

  const canConfirm = Boolean(selectedClerkId);

  return (
    <div className="overlay">
      <div className="overlay__card overlay__card--narrow">
        <p className="eyebrow">Sachbearbeiter wechseln</p>
        <h1>{APP_NAME}</h1>
        <div className="field field--full">
          <label htmlFor="clerk-select">Sachbearbeiter</label>
          <select id="clerk-select" value={selectedClerkId} onChange={(event) => setSelectedClerkId(event.target.value)}>
            {state.masterData.clerks.map((clerk) => (
              <option key={clerk.id} value={clerk.id}>
                {clerk.name}
              </option>
            ))}
          </select>
        </div>
        <div className="pin-modal__actions">
          <button
            type="button"
            className="primary-button"
            disabled={!canConfirm}
            onClick={() => {
              if (!selectedClerkId) {
                return;
              }

              selectClerk(selectedClerkId);
              props.onSelect();
            }}
          >
            Uebernehmen
          </button>
        </div>
      </div>
    </div>
  );
}

export function TopBar(props: { page: PageId; onPageChange: (page: PageId) => void; onOpenDossierCreate: () => void }) {
  const platform = usePlatform();
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const pageMenuRef = useRef<HTMLDivElement | null>(null);
  const workspaceSyncStatus = useSyncExternalStore(
    platform.workspaceSyncStatus?.subscribe ?? (() => () => {}),
    platform.workspaceSyncStatus?.getSnapshot ?? (() => null),
    platform.workspaceSyncStatus?.getSnapshot ?? (() => null)
  );

  useEffect(() => {
    if (!pageMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!pageMenuRef.current?.contains(target)) {
        setPageMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPageMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [pageMenuOpen]);

  const syncTimestamp = workspaceSyncStatus?.timestamp?.replace(/^Gespeichert um\s*/i, "").trim() ?? "";
  const topbarSyncLabel = syncTimestamp ? `In Supabase gespeichert um ${syncTimestamp}` : null;

  return (
    <header className="topbar-wrap">
      <div className="topbar">
        <div className="topbar__brand">
          <strong>{APP_NAME}</strong>
        </div>
        <nav className="topbar__nav">
          <div className="topbar__menu topbar__menu--pages" ref={pageMenuRef}>
            <button
              type="button"
              className={pageMenuOpen ? "nav-button nav-button--active topbar__menu-trigger topbar__menu-trigger--pages" : "nav-button topbar__menu-trigger topbar__menu-trigger--pages"}
              aria-expanded={pageMenuOpen}
              aria-label="Navigation oeffnen"
              onClick={() => {
                setPageMenuOpen((current) => !current);
              }}
            >
              <span className="topbar__menu-icon" aria-hidden="true">
                &#9776;
              </span>
              <span className="topbar__menu-label">Menue</span>
            </button>
            {pageMenuOpen ? (
              <div className="topbar__menu-panel topbar__menu-panel--pages">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    props.onOpenDossierCreate();
                    setPageMenuOpen(false);
                  }}
                >
                  Dossier
                </button>
                {pages.map((page) => (
                  <button
                    key={page.id}
                    type="button"
                    className={page.id === props.page ? "primary-button" : "secondary-button"}
                    onClick={() => {
                      props.onPageChange(page.id);
                      setPageMenuOpen(false);
                    }}
                  >
                    {page.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {topbarSyncLabel ? (
            <div className="topbar__sync-inline" title={topbarSyncLabel}>
              {topbarSyncLabel}
            </div>
          ) : null}
          <button className="nav-button topbar__page-button" onClick={props.onOpenDossierCreate}>
            Dossier
          </button>
          {pages.map((page) => (
            <button
              key={page.id}
              className={page.id === props.page ? "nav-button nav-button--active topbar__page-button" : "nav-button topbar__page-button"}
              onClick={() => props.onPageChange(page.id)}
            >
              {page.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
