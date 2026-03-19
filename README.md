# ELB_V1

ELB_V1 ist die gemeinsame Grundlage fuer die Erfassung, Validierung, Vorschau, Export- und Paketierung von ELB-Vorgaengen in Desktop und Web.

## Setup

```bash
npm install
npm run desktop:dev
npm run web:dev
```

## Web lokal testen

```bash
npm run web:dev
```

Danach die angezeigte lokale URL im Browser oeffnen, typischerweise `http://localhost:5173`.

Fuer einen produktionsnahen Test:

```bash
npm run web:build
npm run web:preview
```

Dann laeuft die gebaute App lokal ueber Vite Preview, standardmaessig unter `http://localhost:4173`.

## Wichtige Kommandos

```bash
npm run clean
npm run check:encoding
npm run desktop:lint
npm run web:lint
npm run test
npm run desktop:build
npm run web:build
npm run verify
```

## Workflow

- direkte Commits auf `main` sind erlaubt
- Pull Requests sind optional
- vor oder direkt nach einem Push auf `main` sollen mindestens `check:encoding`, `desktop:lint`, `test` und `desktop:build` gruen sein
- die GitHub-CI laeuft weiter als Sicherheitsnetz auf `main`

## Architektur

- `apps/desktop`: React/Tauri-Oberflaeche und Desktop-Adapter
- `apps/web`: React/Vite-Web-App mit Browser-Adapter
- `packages/client-app`: gemeinsame React-App fuer Desktop und Web
- `packages/domain`: Fachmodelle, Value Objects, Ableitungen und Formatierung
- `packages/app-core`: Use Cases, Validierung, Admin-Regeln, Referenzintegritaet, Import/Migration, Fehlerobjekte
- `packages/persistence`: lokale Persistenz, Workspace-Repository und Audit-Log
- `packages/pdf-core`: ELB-/Zusatz-PDF-Erzeugung
- `packages/word-core`: Word-Schaetzliste und seitenbasiertes Layout
- `packages/export-core`: Export-Planung, Bundle-Erzeugung, ZIP-Paketierung und Download
- `packages/shared`: Konfiguration, Logging, gemeinsame Konstanten
- `packages/ui`: wiederverwendbare UI-Bausteine

## Build und Artefakte

- `desktop:build` erzeugt den Vite-Build fuer die Desktop-App
- `web:build` erzeugt den Vite-Build fuer die Web-App
- `web:preview` startet die gebaute Web-App lokal zur Deploy-Pruefung
- Tauri-Builds werden separat ueber `apps/desktop/src-tauri` vorbereitet
- Import-/Export-Dateien werden schema-versioniert ueber `packages/app-core/src/migration.ts`
- Audit-Eintraege werden lokal dateibasiert unter dem Workspace-Datenordner persistiert
- `node_modules`, `dist`, `coverage` und aehnliche Build-Artefakte gehoeren nicht in den versionierten Quellstand und werden ueber `.gitignore` bzw. `npm run clean` aus dem Arbeitsverzeichnis herausgehalten

## Vercel Deploy

Die Web-App ist fuer einen ersten statischen Deploy auf Vercel vorbereitet.

- Vercel-Konfiguration liegt in `vercel.json`
- Build-Command: `npm run web:build`
- Output-Verzeichnis: `apps/web/dist`
- SPA-Routing wird ueber eine Rewrite-Regel auf `index.html` geleitet
- fuer die Web-Strecke gibt es jetzt `npm run verify:web`

Typischer Ablauf:

```bash
npm install
npm run verify:web
```

Danach kann das Repo direkt mit Vercel verbunden werden. Fuer den aktuellen Stand braucht die Web-App keine Server-Umgebung und keine Datenbank.

Die Web-App speichert im aktuellen Stand lokal im Browser. Es gibt also noch keinen Login, keine Geraete-Synchronisation und keine gemeinsame Cloud-Datenbasis.

Optional kann die Web-App jetzt zusaetzlich nach Supabase spiegeln. Die lokale Sofortspeicherung bleibt dabei erhalten, Supabase kommt als zweite Speicherstufe dazu. Setup siehe `SUPABASE-SETUP.md`.

Eine kompakte Schritt-fuer-Schritt-Anleitung liegt in `WEB-DEPLOYMENT.md`.

## Mehrplatzbetrieb

- lokale Nummernvergabe ist fuer Einzelplatz robust
- fuer echten Mehrplatzbetrieb muss die Nummernvergabe serverseitig reserviert oder blockweise vergeben werden
- Konflikte duerfen nicht still ueberschrieben werden und brauchen eine echte Sync-Schicht mit Versionsvergleich

## Tests

Die Tests decken Domain-Formatter, Use Cases, Validierung, Admin-Regeln, Referenzintegritaet sowie Import-/Export-Basis ab. Fuer die produktive Einfuehrung sollten zusaetzlich UI-Smoke-Tests und Snapshot-Tests fuer Template-Aenderungen ergaenzt werden.
