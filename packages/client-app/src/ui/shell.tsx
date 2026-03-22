/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState } from "react";
import type { PageId } from "@elb/domain/index";
import { APP_NAME } from "@elb/shared/constants";
import { selectClerk } from "../appState";
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
  if (!props.open) {
    return null;
  }

  return (
    <div className="overlay">
      <div className="overlay__card">
        <p className="eyebrow">Sachbearbeiter wechseln</p>
        <h1>{APP_NAME}</h1>
        <div className="clerk-grid">
          {state.masterData.clerks.map((clerk) => (
            <button
              key={clerk.id}
              className="clerk-card"
              onClick={() => {
                selectClerk(clerk.id);
                props.onSelect();
              }}
            >
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

export function TopBar(props: { page: PageId; onPageChange: (page: PageId) => void }) {
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const pageMenuRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <header className="topbar">
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
            <span className="topbar__menu-label">Seiten</span>
          </button>
          {pageMenuOpen ? (
            <div className="topbar__menu-panel topbar__menu-panel--pages">
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
    </header>
  );
}
