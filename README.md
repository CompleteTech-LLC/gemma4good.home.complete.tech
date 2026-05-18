# gemma4good.home.complete.tech

Local operations workspace for the passwordless Gemma 4 Good code-server domain.

## Workspace

Open this directory directly in VS Code:

```powershell
code C:\Users\timot\Documents\projects\domains\gemma4good.home.complete.tech
```

Or open the named workspace:

```powershell
code C:\Users\timot\Documents\projects\domains\gemma4good.home.complete.tech\gemma4good.home.complete.tech.code-workspace
```

The workspace includes:

- `DOMAIN_CONTEXT.md` for operational context and remote access rules.
- `TODO.md` for follow-up work.
- `remote.ps1` for safe remote commands against `train.home.complete.tech`.
- `.vscode/tasks.json` for common remote checks.
- `.vscode/mcp.example.json` for the search MCP client shape.
- `docs/` for local planning and implementation notes.

## MCP Search

This workspace is configured to use the shared CompleteTech search MCP server:

```text
https://mcp-search.home.complete.tech/mcp
```

The real VS Code MCP config is `.vscode/mcp.json`. It contains the bearer token and is intentionally ignored by Git. Keep `.vscode/mcp.example.json` as the checked-in reference.

## Access

Development URL:

```text
https://gemma4good.home.complete.tech/
```

The browser endpoint is backed by code-server with `--auth none`. There is no code-server password secret for this service.

## Browser Tooling

The remote workspace is configured for dark mode and agent CLI work:

- code-server theme: `Default Dark Modern`
- Node/npm: provided by the shared `localhost/code-server-node:22` image
- Codex: provided by the shared image and also installed project-locally under `.tools`
- Claude Code: installed project-locally under `.tools`

The code-server terminal PATH prepends:

```text
/home/coder/project/.tools/node_modules/.bin
```

## Field Report Triage

The field report page is wired to the local Gemma4 model through a same-origin API:

```text
https://gemma4good.home.complete.tech/menu/fieldreport/
https://gemma4good.home.complete.tech/api/fieldreport/analyze
https://gemma4good.home.complete.tech/api/fieldreport/submit
```

The browser page follows an image-first review workflow: the user supplies a captured image, report time, and location; Gemma4 suggests the issue type, summary, severity, observations, and actions; then the user confirms or edits the draft before submit. The API validates the request and forwards it to the private Gemma4 service on the Podman network.

Report time is prefilled in this order:

1. EXIF image timestamp, when readable.
2. Browser file timestamp, when EXIF is unavailable.
3. Current datetime.

If the detected time is wrong, edit the `Report Time` field in the `Time and Location` card before analysis or submit. Manual edits are submitted with `capturedAtSource: "manual"`.

## Remote Commands

From PowerShell:

```powershell
.\remote.ps1 pwd
.\remote.ps1 "ls -la"
```

Use the VS Code task runner for common checks:

- `remote: pwd`
- `remote: list deploy root`
- `remote: podman stack status`
- `remote: dev service container`
- `check: dev URL headers`

## Maintenance

Keep local maintenance work outside OneDrive. On this machine, prefer:

```powershell
C:\Users\Admin\src\gemma4good.home.complete.tech
```

Run the dependency-free maintainer toolkit from the repo root:

```powershell
node scripts/maintain.mjs doctor
node scripts/maintain.mjs demo-data
node scripts/maintain.mjs api-test
```

See `docs/maintenance.md` for the full maintainer playbook and remote-health boundaries.

## Current Status

This workspace is wired to a development code-server backend.

Current runtime:

- DNS: `gemma4good.home.complete.tech -> 192.168.1.146`
- Compose service: `gemma4good-code-server`
- Podman container: `gemma4good-home-complete-tech`
- Image: `localhost/code-server-node:22`
- Internal route: `gemma4good-home-complete-tech:8080`
- Persistent workspace: `/srv/openclaw/gemma4good`
- Auth: disabled with `--auth none`
- Workspace tools: `/srv/openclaw/gemma4good/.tools`
- Healthcheck: local code-server HTTP root `/`, surfaced in `podman ps` as healthy/unhealthy. Do not use `/healthz | grep alive`; it can expire when there is no current browser heartbeat.
