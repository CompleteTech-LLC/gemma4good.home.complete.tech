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
- Healthcheck: local code-server HTTP root `/`, surfaced in `podman ps` as healthy/unhealthy. Do not use `/healthz | grep alive`; it can expire when there is no current browser heartbeat.
