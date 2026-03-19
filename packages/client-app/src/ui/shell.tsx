/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState } from "react";
import type { PageId } from "@elb/domain/index";
import { APP_NAME } from "@elb/shared/constants";
import { createNewCase, selectClerk } from "../appState";
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

export function TopBar(props: { page: PageId; onPageChange: (page: PageId) => void; onOpenClerkSelector: () => void }) {
  const state = useAppState();
  const activeClerk = state.masterData.clerks.find((clerk) => clerk.id === state.activeClerkId);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  return (
    <header className="topbar">
      <nav className="topbar__nav">
        <div className="topbar__menu" ref={menuRef}>
          <button
            type="button"
            className={menuOpen ? "nav-button nav-button--active topbar__menu-trigger" : "nav-button topbar__menu-trigger"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((current) => !current)}
          >
            Menue
          </button>
          {menuOpen ? (
            <div className="topbar__menu-panel">
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  createNewCase();
                  props.onPageChange("consignor");
                  setMenuOpen(false);
                }}
              >
                Neue ELB anlegen
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  props.onOpenClerkSelector();
                  setMenuOpen(false);
                }}
              >
                Sachbearbeiter wechseln
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  props.onPageChange("loadCenter");
                  setMenuOpen(false);
                }}
              >
                Entwuerfe und ZIPs laden
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  props.onPageChange("admin");
                  setMenuOpen(false);
                }}
              >
                Admin
              </button>
            </div>
          ) : null}
        </div>
        <div className="topbar__brand">
          <strong>{APP_NAME}</strong>
          <span>{activeClerk?.name ?? "Kein Sachbearbeiter"}</span>
        </div>
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
    </header>
  );
}
