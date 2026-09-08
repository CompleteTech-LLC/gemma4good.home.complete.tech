# gemma4good.home.complete.tech

The Train deployment was retired by owner request on 2026-09-07. The domain
returns HTTP 410. This repository retains source and historical operations notes;
its API, workspace, and local llama deployment are no longer active. See
[retirement record](docs/retirement-20260907.md).

## Retained source workspace

This checkout is retained for source, offline assets, and historical operations
notes. The former remote workspace and its runtime are retired.

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

## Historical MCP Search

The MCP details below describe the former workspace configuration. They do not
imply that Gemma4Good currently has a live browser workspace or model service.

This workspace is configured to use the shared CompleteTech search MCP server:

```text
https://mcp-search.home.complete.tech/mcp
```

The real VS Code MCP config is `.vscode/mcp.json`. It contains the bearer token and is intentionally ignored by Git. Keep `.vscode/mcp.example.json` as the checked-in reference.

## Historical access

Retired URL:

```text
https://gemma4good.home.complete.tech/
```

The former browser endpoint used code-server with `--auth none`. The code-server
container and its remote workspace were removed during retirement.

## Historical browser tooling

These notes describe tools that were installed in the former code-server
workspace; they are not a current deployment requirement.

The remote workspace is configured for dark mode and agent CLI work:

- code-server theme: `Default Dark Modern`
- Node/npm: provided by the shared `localhost/code-server-node:22` image
- Codex: provided by the shared image and also installed project-locally under `.tools`
- Claude Code: installed project-locally under `.tools`

The code-server terminal PATH prepends:

```text
/home/coder/project/.tools/node_modules/.bin
```

## Historical field-report workflow

The former field-report page used the local Gemma4 model through a same-origin
API. These endpoints are retained as historical references and are no longer
served by this domain:

```text
https://gemma4good.home.complete.tech/menu/fieldreport/
https://gemma4good.home.complete.tech/api/fieldreport/analyze
https://gemma4good.home.complete.tech/api/fieldreport/submit
```

When the deployment was active, the browser page followed an image-first review
workflow: the user supplied a captured image, report time, and location;
Gemma4 suggested the issue type, summary, severity, observations, and actions;
then the user confirmed or edited the draft before submit. The API forwarded
analysis to the private model service on the Podman network.

Report time is prefilled in this order:

1. EXIF image timestamp, when readable.
2. Browser file timestamp, when EXIF is unavailable.
3. Current datetime.

If the detected time is wrong, edit the `Report Time` field in the `Time and Location` card before analysis or submit. Manual edits are submitted with `capturedAtSource: "manual"`.

## Historical remote commands

These commands are retained for provenance only. Do not use them to recreate the
retired workspace, containers, routes, or model backend.

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

## Retirement status

The public Caddy route returns HTTP 410. The Gemma4Good API, code-server
workspace, and local llama deployment are absent from Train; their private
retirement archives and this source checkout are retained.

The separate Train model gateway at `172.30.88.1:18086` is not part of this
retirement and must remain independently managed. Its local Qwen upstream is a
separate provider decision; do not redirect it to this retired Gemma service.

No model-backed feature is currently offered by this domain. Reintroduction
requires an intentional deployment, an explicitly configured provider, and a
new retirement review; historical health checks must not be treated as current
readiness.
