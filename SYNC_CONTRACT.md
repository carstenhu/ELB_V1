# Sync Contract

## Ziel

Die Desktop-App bleibt lokal funktionsfähig, ist aber jetzt so vorbereitet, dass ein späteres Backend oder eine Sync-Schicht sauber andocken kann.

## Kernvertrag

Technische Grundlage ist `SyncEnvelope<TPayload>` aus [contracts.ts](C:/ELB_V1/packages/app-core/src/contracts.ts).

Enthalten sind:

- `schemaVersion`
- `payload`
- `version.caseId`
- `version.version`
- `version.updatedAt`
- `version.updatedBy`

## Konfliktstrategie

Aktuell ist noch kein echter Server-Sync implementiert. Für produktiven Mehrbenutzerbetrieb ist vorgesehen:

1. optimistic concurrency pro Vorgang
2. Versionsvergleich über `version`
3. Konfliktfall nicht überschreiben, sondern als manuellen Merge-Fall markieren

## Multi-User-Risiken im aktuellen Stand

- Nummernvergabe ist lokal robust, aber nicht global reserviert
- Stammdatenänderungen sind noch nicht zentral versioniert
- parallele Finalisierung desselben Vorgangs ist ohne Backend nicht abgesichert

## Nächster technischer Schritt

- HTTP-/RPC-Repository implementieren, das `WorkspaceRepository` und einen serverseitigen `AuditSink` ergänzt
