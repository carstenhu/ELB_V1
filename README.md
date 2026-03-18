# ELB_V1

ELB_V1 ist die Desktop-Grundlage für die Erfassung, Validierung, Vorschau, Export- und Paketierung von ELB-Vorgängen.

## Setup

```bash
npm install
npm run desktop:dev
```

## Wichtige Kommandos

```bash
npm run clean
npm run check:encoding
npm run desktop:lint
npm run test
npm run desktop:build
npm run verify
```

## Workflow

- direkte Commits auf `main` sind erlaubt
- Pull Requests sind optional
- vor oder direkt nach einem Push auf `main` sollen mindestens `check:encoding`, `desktop:lint`, `test` und `desktop:build` grün sein
- die GitHub-CI läuft weiter als Sicherheitsnetz auf `main`

## Architektur

- `apps/desktop`: React/Tauri-Oberfläche und UI-Orchestrierung
- `packages/domain`: Fachmodelle, Value Objects, Ableitungen und Formatierung
- `packages/app-core`: Use Cases, Validierung, Admin-Regeln, Referenzintegrität, Import/Migration, Fehlerobjekte
- `packages/persistence`: lokale Persistenz, Workspace-Repository und Audit-Log
- `packages/pdf-core`: ELB-/Zusatz-PDF-Erzeugung
- `packages/word-core`: Word-Schätzliste und seitenbasiertes Layout
- `packages/export-core`: Export-Planung, Bundle-Erzeugung, ZIP-Paketierung und Download
- `packages/shared`: Konfiguration, Logging, gemeinsame Konstanten
- `packages/ui`: wiederverwendbare UI-Bausteine

## Build und Artefakte

- `desktop:build` erzeugt den Vite-Build für die Desktop-App
- Tauri-Builds werden separat über `apps/desktop/src-tauri` vorbereitet
- Import-/Export-Dateien werden schema-versioniert über `packages/app-core/src/migration.ts`
- Audit-Einträge werden lokal dateibasiert unter dem Workspace-Datenordner persistiert
- `node_modules`, `dist`, `coverage` und ähnliche Build-Artefakte gehören nicht in den versionierten Quellstand und werden über `.gitignore` bzw. `npm run clean` aus dem Arbeitsverzeichnis herausgehalten

## Mehrplatzbetrieb

- lokale Nummernvergabe ist für Einzelplatz robust
- für echten Mehrplatzbetrieb muss die Nummernvergabe serverseitig reserviert oder blockweise vergeben werden
- Konflikte dürfen nicht still überschrieben werden und brauchen eine echte Sync-Schicht mit Versionsvergleich

## Tests

Die Tests decken Domain-Formatter, Use Cases, Validierung, Admin-Regeln, Referenzintegrität sowie Import-/Export-Basis ab. Für die produktive Einführung sollten zusätzlich UI-Smoke-Tests und Snapshot-Tests für Template-Änderungen ergänzt werden.
