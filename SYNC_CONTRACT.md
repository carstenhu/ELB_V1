# Sync Contract

## Ziel

Die Desktop-App bleibt lokal funktionsfähig, ist aber so vorbereitet, dass ein späteres Backend oder eine Sync-Schicht sauber andocken kann.

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

## Nummernstrategie für Mehrplatzbetrieb

Die aktuelle lokale Nummernvergabe ist absichtlich nur eine Einzelplatzstrategie. Für Mehrplatzbetrieb wird eine dieser zwei Varianten benötigt:

1. zentrale serverseitige Reservierung jeder nächsten Nummer
2. blockweise Reservierung pro Arbeitsplatz, z. B. nummernweise Segmente je Sachbearbeiter und Gerät

Empfohlene produktive Variante:

- serverseitige Reservierung pro Sachbearbeiter
- Nummer erst bei Vorgangserstellung reservieren
- Reservierung auditieren
- verbrauchte und verworfene Nummern nachvollziehbar markieren statt wiederzuverwenden

## Multi-User-Risiken im aktuellen Stand

- Nummernvergabe ist lokal robust, aber nicht global reserviert
- Stammdatenänderungen sind noch nicht zentral versioniert
- parallele Finalisierung desselben Vorgangs ist ohne Backend nicht abgesichert
- Admin-PIN und Berechtigungen sind lokal gehärtet, aber nicht benutzerbezogen

## Nächster technischer Schritt

- HTTP-/RPC-Repository implementieren, das `WorkspaceRepository`, serverseitiges Audit und Nummernreservierung ergänzt
