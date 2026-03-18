# Migration

## Schema-Versionierung

Importierbare Payloads werden über ein Envelope-Format versioniert:

```json
{
  "schemaVersion": 2,
  "exportedAt": "2026-03-18T10:00:00.000Z",
  "caseFile": { "...": "..." }
}
```

## Legacy-Unterstützung

- rohe Alt-`CaseFile`-Payloads ohne Envelope werden weiterhin erkannt
- sie werden intern als `schemaVersion: 1` behandelt

## Fehlerverhalten

- ungültige Dateien führen zu strukturierten `AppError`s
- Schemafehler und Migrationsfehler werden getrennt ausgewiesen

## Nächste Schritte

- explizite Migrationstabellen für künftige Versionen
- Import-Report im UI mit Warnungen und konfliktträchtigen Feldern
