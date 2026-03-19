# Web Deployment

Diese Web-App ist fuer einen statischen Deploy auf Vercel vorbereitet.

## Aktueller Stand

- kein Server erforderlich
- keine Umgebungsvariablen notwendig
- keine Datenbank notwendig
- Persistenz aktuell nur lokal im Browser

Wichtig:
- Daten bleiben pro Browser und Geraet lokal gespeichert
- es gibt aktuell keinen Login
- es gibt aktuell keine Synchronisation zwischen mehreren Geraeten

## Lokal vor dem Deploy pruefen

```bash
npm install
npm run verify:web
```

Optional zusaetzlich produktionsnah im Browser:

```bash
npm run web:preview
```

## Vercel-Projekt anlegen

Empfehlung:
- Root Directory auf `apps/web` setzen
- damit greift die Web-spezifische Konfiguration in [apps/web/vercel.json](/abs/path/c:/ELB_V1/apps/web/vercel.json)

1. Repository in Vercel importieren
2. Root Directory auf `apps/web` setzen
3. folgende Build-Einstellungen setzen

- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install --prefix=../..`

Die SPA-Rewrite-Regel ist in [apps/web/vercel.json](/abs/path/c:/ELB_V1/apps/web/vercel.json) hinterlegt.

Alternative mit Repository-Root:
- Root Directory auf das Repository-Root lassen
- Build Command: `npm run web:build`
- Output Directory: `apps/web/dist`
- Install Command: `npm install`
- dabei greift [vercel.json](/abs/path/c:/ELB_V1/vercel.json)

Alternativ ueber die CLI auf diesem Rechner:

```bash
npm run vercel:login
npm run vercel:link
```

Danach:

```bash
npm run vercel:deploy
```

Oder fuer Production:

```bash
npm run vercel:prod
```

Unter Windows liegen dafuer auch Batch-Dateien im Repo:

- `ELB-V1-Vercel-Einrichten.bat`
- `ELB-V1-Vercel-Preview-Deploy.bat`
- `ELB-V1-Vercel-Production-Deploy.bat`

## Nach dem ersten Deploy pruefen

- App startet und Routing funktioniert
- Workspace laesst sich im Browser anlegen
- Reload behaelt den Stand im selben Browser
- PDF-Vorschau oeffnet korrekt
- ZIP-Download funktioniert
- keine Desktop-spezifischen Aktionen werden erwartet

## Was spaeter fuer echten Produktivbetrieb fehlt

- zentrale Cloud-Persistenz
- Benutzerverwaltung
- Mehrplatz-Synchronisation
- Konfliktbehandlung bei gleichzeitiger Bearbeitung
- serverseitige Nummernvergabe
