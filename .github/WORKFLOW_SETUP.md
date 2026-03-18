# Empfohlene Workflow-Konfiguration

Diese Datei dokumentiert den bewusst einfachen Zielzustand für dieses Repository.

## 1. Direkt auf `main` arbeiten

Empfohlener Zielzustand:

- direkte Commits auf `main` sind erlaubt
- Pull Requests sind optional
- `lint`, `build` und `check:encoding` bleiben Pflicht als Qualitätsnetz
- Force Push auf `main` bleibt deaktiviert

## 2. GitHub Branch Protection für `main`

In GitHub unter `Settings -> Branches -> Add branch protection rule` oder durch Bearbeiten der bestehenden Regel:

- Branch name pattern: `main`
- Require a pull request before merging: `off`
- Require status checks to pass before merging: optional `on`
- Wenn Status Checks aktiv bleiben:
  - `CI / checks` auswählen
- Allow force pushes: `off`
- Allow deletions: `off`

Hinweis:
Wenn du wirklich ohne jede GitHub-Sperre arbeiten willst, kannst du die Protection-Regel auch ganz entfernen. Die robustere Variante ist aber:

- direkte Pushes erlauben
- Force Push weiterhin verbieten
- CI weiterlaufen lassen

## 3. CI für Direkt-Commits

Die CI sollte sowohl bei Pull Requests als auch bei direkten Pushes auf `main` laufen.

Aktuell prüft die CI:

- `npm run check:encoding`
- `npm run desktop:lint`
- `npm run desktop:build`

## 4. Commit- und PR-Vorlagen

Im Repo vorhanden:

- Commit-Template: `.github/commit-template.txt`
- PR-Template: `.github/pull_request_template.md`
- Agent-Regeln: `AGENTS.md`

Lokale Aktivierung des Commit-Templates:

```powershell
git config commit.template .github/commit-template.txt
```

Die PR-Vorlage bleibt als Option für größere Änderungen erhalten, ist aber nicht mehr Teil eines Pflicht-Workflows.

## 5. Meine konkrete Empfehlung

- direkt auf `main` committen
- kleine, saubere Commits halten
- kein Force Push auf `main`
- CI auf `main` weiterlaufen lassen
- PRs nur noch für größere oder riskantere Änderungen verwenden
- Codex weiter nur für klar definierte Aufgaben einsetzen
