# Architektur

## Ziel

Die Anwendung trennt Fachmodell, Anwendungslogik, Infrastruktur und UI, damit produktive Regeln nicht mehr in React-Komponenten oder generischen Store-Mutationen versteckt sind.

## Schichten

### Domain

- `packages/domain`
- reine Typen, Defaults, Formatter und fachliche Ableitungen

### Application

- `packages/app-core`
- Use Cases wie `createCase`, `addObjectToCase`, `assignAuction`
- strukturierte Validierung in drei Ebenen:
  - Feldschema
  - Business Rules
  - Export-Readiness
- Import/Migration mit `schemaVersion`

### Infrastructure

- `packages/persistence`
- `packages/pdf-core`
- `packages/word-core`
- `packages/export-core`
- `packages/shared`

`packages/persistence` kapselt jetzt sowohl das Workspace-Repository als auch die Audit-Senke. Der UI-Store kennt keine direkte Dateisystem- oder LocalStorage-Logik mehr.

### UI

- `apps/desktop`
- React-Komponenten orchestrieren, rufen aber keine tiefen Fachentscheidungen mehr selbst aus String-Pfaden ab

## Wichtigste Risiken im Altzustand

- Fachlogik direkt im Zustand
- Nummernvergabe ohne dedizierten Use Case
- fehlende Migration für Altimporte
- unstrukturierte Konsolenfehler statt Logger
- temporäre oder generierte Artefakte im Repo
- fragiles Verhalten bei Template-Änderungen

## Neue Zielrichtung

- Store nur noch als Orchestrierungs- und Caching-Schicht
- fachliche Änderungen über typsichere Use Cases
- Exporte verwenden versionierte Payloads
- Importpfade brechen nicht still, sondern liefern strukturierte Fehler
- Audit-Ereignisse werden über eine Infrastruktur-Senke persistierbar
