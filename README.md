# ELB_V1

ELB_V1 ist die Desktop-Grundlage für die Erfassung, Validierung, Vorschau, Export- und Paketierung von ELB-Vorgängen.

## Setup

```bash
npm install
npm run desktop:dev
```

## Wichtige Kommandos

```bash
npm run check:encoding
npm run desktop:lint
npm run desktop:build
npm run test
```

## Workflow

- direkte Commits auf `main` sind erlaubt
- Pull Requests sind optional
- vor oder direkt nach einem Push auf `main` sollen mindestens `check:encoding`, `desktop:lint` und `desktop:build` grün sein
- die GitHub-CI läuft weiter als Sicherheitsnetz auf `main`

## Architektur

- `apps/desktop`: React/Tauri-Oberfläche und UI-Orchestrierung
- `packages/domain`: Fachmodelle, Ableitungen, Formatierung
- `packages/app-core`: Use Cases, Validierung, Import/Migration, Fehlerobjekte
- `packages/persistence`: lokale Persistenz, Workspace-Repository und Audit-Log
- `packages/pdf-core`: ELB-/Zusatz-PDF-Erzeugung
- `packages/word-core`: Word-Schätzliste und seitenbasiertes Layout
- `packages/export-core`: Export-Bundle und ZIP-Paketierung
- `packages/shared`: Konfiguration, Logging, gemeinsame Konstanten
- `packages/ui`: wiederverwendbare UI-Bausteine

## Build und Release

- `desktop:build` erzeugt den Vite-Build für die Desktop-App
- Tauri-Builds werden separat über `apps/desktop/src-tauri` vorbereitet
- Import-/Export-Dateien werden schema-versioniert über `packages/app-core/src/migration.ts`
- Audit-Einträge werden lokal dateibasiert unter dem Workspace-Datenordner persistiert

## Tests

Die Tests decken Domain-Formatter, Use Cases, Validierung sowie Import-/Export-Basis ab. Für die produktive Einführung sollten zusätzlich UI-Smoke-Tests und Snapshot-Tests für Template-Änderungen ergänzt werden.
