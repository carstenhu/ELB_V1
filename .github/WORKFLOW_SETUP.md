# Empfohlene Workflow-Konfiguration

Diese Datei dokumentiert den bewusst einfachen Zielzustand fuer dieses Repository.

## 1. Branch Protection fuer `main`
In GitHub unter `Settings -> Branches -> Add branch protection rule`:

- Branch name pattern: `main`
- Require a pull request before merging: `on`
- Require approvals: `1`
- Dismiss stale approvals when new commits are pushed: `on`
- Require status checks to pass before merging: `on`
- Status check `CI / placeholder-checks` auswaehlen, sobald der Workflow einmal gelaufen ist
- Require branches to be up to date before merging: `on`
- Allow force pushes: `off`
- Allow deletions: `off`

## 2. Nur PR-Merges nach `main`
Empfehlung unter `Settings -> General`:

- `Squash merge` aktiv lassen
- `Merge commit` und `Rebase merge` optional deaktivieren, wenn du einen klaren Verlauf willst

## 3. Codex Review aktivieren
- Codex Review fuer Pull Requests auf `main` aktivieren, falls in deinem GitHub-Setup verfuegbar
- Codex als zusaetzliche Review-Instanz nutzen, nicht als Ersatz fuer fachliche Freigabe

## 4. Automatic Reviews optional
- Nur aktivieren, wenn du bei jedem PR fruehes Feedback willst

## 5. Commit- und PR-Prompts
Im Repo vorhanden:

- Commit-Template: `.github/commit-template.txt`
- PR-Template: `.github/pull_request_template.md`
- Agent-Regeln: `AGENTS.md`

Lokale Aktivierung des Commit-Templates:

```powershell
git config commit.template .github/commit-template.txt
```

## 6. Codex Action nur fuer klare CI-Aufgaben
- Nur klar definierte Pruefungen laufen lassen
- Keine offenen Autofix-Automationen
- Die aktuelle CI ist absichtlich ein Platzhalter und soll durch deine echten Projektchecks ersetzt werden

## 7. Meine konkrete Empfehlung
- Repo mit Branch Protection absichern
- `AGENTS.md` anlegen
- Codex Review aktivieren
- Automatic reviews optional einschalten
- Force push aus
- Commit-/PR-Prompts definieren
- Nur PR-Merges auf `main`
- Codex Action nur fuer klar definierte CI-Aufgaben
