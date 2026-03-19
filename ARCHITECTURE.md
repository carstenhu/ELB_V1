# Architektur

## Zielbild

ELB_V1 ist jetzt klarer entlang von Fachlogik, Application-Layer, Infrastruktur und Plattform-UI getrennt. Desktop und Web nutzen dieselben Kernmodule; die Unterschiede liegen hinter Plattform-Adaptern.

## Schichten

### Domain

- `packages/domain`
- enthält Typen, Defaults, Value-Object-Schemas, fachliche Ableitungen und getypte `RequiredFieldKey`-Definitionen
- kennt weder React noch Desktop- oder Dateisystem-APIs

### Application

- `packages/app-core`
- enthält Use Cases, Audit-Modelle, Admin-Session-Logik und strukturierte Validierung
- Export-Readiness verwendet jetzt dieselben getypten Pflichtfeld-Schlüssel wie Domain und UI
- `WorkspaceSnapshot` ist der stabile Plattformvertrag fuer persistierbaren Workspace-State

### Infrastructure

- `packages/persistence`
- `packages/pdf-core`
- `packages/word-core`
- `packages/export-core`
- `packages/shared`

Diese Pakete kapseln Persistenz, Dokumentenerzeugung, Export-Bundles und technische Utilities. Sie bleiben austauschbar ueber Ports/Adapter.

### Shared Client App

- `packages/client-app`
- enthaelt die gemeinsame React-App fuer Desktop und Web
- umfasst App-Komposition, Workspace-State, Feature-Hooks, Preview-/Editor-UI und den Plattform-Context
- kennt nur Ports wie `AppPlatform`, aber keine Tauri-spezifischen Implementierungen

### Desktop UI

- `apps/desktop`
- haelt jetzt im Wesentlichen Einstiegspunkt, Startskripte und den Desktop-Adapter
- `src/platform/desktopPlatform.ts` bindet Tauri, lokales Dateisystem und Desktop-Shell an die gemeinsame App

### Web UI

- `apps/web`
- nutzt dieselbe React-App-Komposition aus `packages/client-app`
- stellt stattdessen einen `webPlatform`-Adapter fuer Browser-Persistenz und Download-basierte Exporte bereit
- kann optional einen Supabase-basierten Online-Mirror fuer Workspace, Stammdaten und optimierte Session-Bilder aktivieren

## Wichtige Refactorings

### Workspace und Plattformgrenzen

- `App.tsx` ist jetzt auf Shell-Komposition reduziert.
- `useWorkspaceLifecycle` uebernimmt Hydration und Autosave.
- `appState` ist intern in `workspaceStore` und `workspaceActions` aufgeteilt.
- Plattform-spezifische Integrationen liegen jetzt hinter `PlatformProvider` und `AppPlatform`.
- `packages/client-app` enthaelt die gemeinsame App-Logik, `apps/desktop` und `apps/web` liefern nur noch unterschiedliche Plattform-Adapter.
- `apps/desktop/src/platform/desktopPlatform.ts` und `apps/web/src/webPlatform.ts` liefern dieselben Ports fuer unterschiedliche Laufzeiten.

### Pflichtfelder und Validierung

- freie Pflichtfeld-Strings wurden durch getypte `RequiredFieldKey`-Werte ersetzt
- Domain und Application verwenden dieselbe Missing-Field-Logik
- Admin-Konfiguration wird beim Bearbeiten normalisiert statt freie, unvalidierte Eintraege zu speichern

### UI-Entkopplung

- die grossen Editor-Seiten wurden in `consignorPage`, `objectsPage` und `internalPage` zerlegt
- `pdfPreviewPage.tsx` wurde in leichtgewichtige Page-, Modal- und Editor-Bausteine aufgeteilt
- Dateisystem- und Export-Seiteneffekte laufen nicht mehr direkt in Seiten-Komponenten
- `useCaseEditorActions` und `usePreviewActions` bilden die Desktop-spezifische Integrationsschicht fuer React

## Web-Readiness

### Bereits web-ready

- `packages/domain`
- `packages/app-core`
- `packages/export-core`
- grosse Teile von `packages/pdf-core` und `packages/word-core`, solange die benoetigten Assets verfuegbar sind
- die Workspace-Snapshot-Struktur und Audit-Modelle

### Noch desktop-spezifisch

- `apps/desktop/src/platform/desktopPlatform.ts`
- Tauri-Shell-Aufrufe wie `open_data_directory`
- konkrete Persistenzpfade und Dateiablage in `packages/persistence`
- Desktop-spezifische Preview- und Dateiauswahl-Flows

## Status von `apps/web`

- `apps/web` ist als eigenstaendige Vite-App vorhanden.
- Die App nutzt die gemeinsame UI- und State-Komposition aus `packages/client-app`.
- Workspace-Daten werden im Browser ueber die bereits vorhandene Fallback-Persistenz gehalten.
- Optional kann `apps/web` denselben Workspace zusaetzlich nach Supabase Storage spiegeln.
- ZIP-Exporte werden im Web als Browser-Download bereitgestellt.

## Verbleibende sinnvolle Naechstschritte

- `packages/pdf-core/src/index.ts` in Rendering-, Mapping- und Template-Module splitten
- `packages/client-app` intern weiter in noch klarere ViewModel-/Controller-Schichten ausdifferenzieren
- Web-spezifische UX fuer Download, Session-Hinweise und nicht verfuegbare Desktop-Funktionen scharfziehen
- gezielte Unit-Tests fuer Workspace-Actions und Preview-Controller ergaenzen
