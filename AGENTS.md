# AGENTS.md

## Ziel
Dieses Repository arbeitet mit einem einfachen, direkten Workflow:

- `main` ist der aktive Entwicklungsbranch.
- Änderungen dürfen direkt auf `main` committed werden.
- Vor oder direkt nach einem Commit auf `main` sollen mindestens `lint` und `build` geprüft werden.
- Die CI bleibt als Sicherheitsnetz aktiv.

## Arbeitsweise
- Kleine, nachvollziehbare Änderungen bevorzugen.
- Keine unnötige Komplexität.
- Konfigurationen und Automationen bewusst schlank halten.
- Änderungen möglichst in einem klar abgegrenzten Commit halten.

## Vor einem Push nach `main`
- Die in CI definierten Checks lokal oder spätestens direkt nach dem Push erfolgreich durchlaufen lassen.
- Keine halbfertigen oder bewusst kaputten Zwischenstände auf `main` legen.

## Commit-Regeln
- Ein Commit soll genau eine klar verständliche Änderung enthalten.
- Commit-Nachrichten im Imperativ formulieren.
- Format bevorzugt: `<typ>: <kurze beschreibung>`

Geeignete Typen:
- `feat`
- `fix`
- `refactor`
- `docs`
- `chore`

## Pull Requests
- Pull Requests sind optional, nicht verpflichtend.
- Für größere, riskantere oder externe Änderungen sind PRs weiterhin sinnvoll.
- Wenn ein PR verwendet wird, kurz festhalten:
  - was sich ändert
  - warum sich das ändert
  - wie es geprüft wurde

## Codex-Nutzung
- Codex für klar abgegrenzte Änderungen, Refactorings, Reviews und CI-nahe Aufgaben nutzen.
- Keine breit angelegten automatischen Massen-Änderungen ohne klaren Grund.
