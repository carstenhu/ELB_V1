# AGENTS.md

## Ziel
Dieses Repository arbeitet mit einem einfachen, kontrollierten Workflow:

- `main` bleibt stabil.
- Aenderungen laufen ueber kurze Feature-Branches und Pull Requests.
- Vor einem Merge werden mindestens `lint` und `build` geprueft.
- Direkte Commits auf `main` sind zu vermeiden.

## Arbeitsweise
- Kleine, nachvollziehbare Aenderungen bevorzugen.
- Keine unnoetige Komplexitaet.
- Konfigurationen und Automationen bewusst schlank halten.

## Vor jedem PR
- Die in CI definierten Checks lokal oder im PR erfolgreich durchlaufen lassen.

## Commit-Regeln
- Ein Commit soll genau eine klar verstaendliche Aenderung enthalten.
- Commit-Nachrichten im Imperativ formulieren.
- Format bevorzugt: `<typ>: <kurze beschreibung>`

Geeignete Typen:
- `feat`
- `fix`
- `refactor`
- `docs`
- `chore`

## Pull-Request-Regeln
- Kein Direkt-Merge nach `main` ohne Review.
- PRs klein halten und mit kurzer Validierung versehen.
- Im PR kurz festhalten:
  - was sich aendert
  - warum sich das aendert
  - wie es geprueft wurde

## Codex-Nutzung
- Codex fuer klar abgegrenzte Aenderungen, Reviews und CI-nahe Aufgaben nutzen.
- Keine breit angelegten automatischen Massen-Aenderungen ohne klaren Grund.
