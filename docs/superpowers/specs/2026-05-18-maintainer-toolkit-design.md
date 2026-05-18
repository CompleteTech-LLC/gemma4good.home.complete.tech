# Maintainer Toolkit Design

## Goal

Create a small, dependency-free maintainer toolkit for `gemma4good.home.complete.tech` so maintainers and agents can validate the repository consistently before making or claiming changes.

## Scope

This first pass covers local repository maintenance only. It will not deploy, restart services, mutate remote files, force push, or add dependencies. The toolkit must run from a non-OneDrive clone and fail early when the repo path is under OneDrive.

## Architecture

Add a single Node 22 script at `scripts/maintain.mjs` with focused subcommands:

- `doctor`: validate workspace location, repo shape, Node version, git availability, ignored secret files, expected docs, API files, and basic command availability.
- `api-test`: run the existing `npm test` command in `api/`.
- `demo-data`: validate demo image metadata sidecars and image references under `demo-images/`.
- `remote-health`: provide safe read-only remote health guidance and run only local URL header checks unless maintainers explicitly run remote commands themselves.

The script will use only Node built-ins. It will produce clear console output and non-zero exits on failed checks so it can later become a CI gate.

## Files

- Create `scripts/maintain.mjs` for maintainer commands.
- Create `docs/maintenance.md` as the human playbook.
- Update `.vscode/tasks.json` with local maintainer tasks while preserving current remote tasks.
- Update `README.md` with a short maintenance quickstart.
- Update `AGENTS.md` with repo-local operating rules for future agents.

## Data Flow

Maintainers run a command from the repo root. The script discovers the repo root from the current working directory, validates the path and expected files, then runs the requested check. `api-test` delegates to the existing API test script. `demo-data` reads local JSON metadata and confirms corresponding image files exist. `remote-health` stays read-only and points maintainers back to existing `remote.ps1` and VS Code tasks.

## Error Handling

Checks should report all practical local failures before exiting where that helps maintainers fix multiple issues at once. Safety failures, such as a OneDrive path or wrong working directory, should stop immediately with a clear message. No command should print secrets or inspect `.env*`, private keys, bearer tokens, certificates, or `.vscode/mcp.json`.

## Testing

Use the smallest relevant verification first:

```powershell
node scripts/maintain.mjs doctor
node scripts/maintain.mjs demo-data
node scripts/maintain.mjs api-test
```

Then run the existing API test directly if the toolkit changed test delegation:

```powershell
Push-Location api
npm test
Pop-Location
```

## Future Work

After this local toolkit is proven, add GitHub Actions and issue/PR templates. Operational maintenance automation should stay separate and should require explicit user approval before any remote mutation.
