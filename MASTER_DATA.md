# Stammdaten

## Verantwortlichkeit

Stammdaten liegen zentral in `MasterData` und werden nicht mehr implizit in UI-Komponenten definiert.

## Enthalten

- Sachbearbeiter
- Auktionen
- Abteilungen / Interessengebiete
- Anreden
- globale PDF-Pflichtfelder
- Admin-PIN

## Governance-Risiken

- derzeit lokal und single-user-orientiert
- keine pessimistische Sperre
- keine serverseitige Revision

## Vorbereitung für Produktivbetrieb

- serverseitige Stammdaten-API
- Versionshistorie
- Änderungsprotokoll
- Konfliktlösung bei paralleler Bearbeitung
