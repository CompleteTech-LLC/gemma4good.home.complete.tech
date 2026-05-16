# Domain Context: gemma4good.home.complete.tech

Local home: C:\Users\timot\Documents\projects\domains\gemma4good.home.complete.tech
SSH alias: train.home.complete.tech
Remote root: /srv/openclaw/gemma4good
Deploy root: /srv/openclaw/deploy
Public URL: https://gemma4good.home.complete.tech/
GitHub repo: https://github.com/CompleteTech-LLC/gemma4good.home.complete.tech
Service host: completetrain / train.home.complete.tech
Ingress: Caddy container `home-complete-tech-domain-proxy`
TLS certificate: wildcard `*.home.complete.tech` mounted from `/home/completetrain/.certs/home.complete.tech` into the Caddy container as `/certs`

Use SSH through `completetrain@train.home.complete.tech` for remote work. The runtime is part of the shared rootful Podman/Caddy stack under `/srv/openclaw/deploy` on `train.home.complete.tech`.

Use `.\remote.ps1` for remote commands from PowerShell instead of hand-writing nested SSH quoting. The helper runs commands on `train.home.complete.tech` after changing into `/srv/openclaw/deploy`.

Before editing remote files, run:

```powershell
.\remote.ps1 pwd
.\remote.ps1 "ls -la"
ssh train.home.complete.tech "sudo systemctl status podman-migrated-stacks.service --no-pager"
ssh train.home.complete.tech "sudo podman ps --filter name=gemma4good-home-complete-tech --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
ssh train.home.complete.tech "sudo podman inspect gemma4good-home-complete-tech --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}'"
```

Stay inside `/srv/openclaw/deploy` unless the user explicitly says otherwise. DNS changes on `router.complete.tech` and certificate inspection under `/home/completetrain/.certs/home.complete.tech` are related operational exceptions.

Local development setup:
- This directory is intended to be opened directly in VS Code.
- VS Code workspace recommendations and remote check tasks live in `.vscode/`.
- The real VS Code MCP search config lives in `.vscode/mcp.json` and is ignored by Git because it contains the `MCP_SEARCH_AUTH_TOKEN` bearer token.
- The checked-in MCP reference config is `.vscode/mcp.example.json`.
- Planning and implementation notes live in `docs/`.

Validation:

```powershell
curl.exe -k -I https://gemma4good.home.complete.tech/
ssh train.home.complete.tech "sudo podman ps --filter name=gemma4good-home-complete-tech --format 'table {{.Names}}\t{{.Status}}'"
ssh train.home.complete.tech "sudo podman inspect gemma4good-home-complete-tech --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}'"
```

2026-05-16 initial setup:
- Added `gemma4good.home.complete.tech` as a passwordless code-server workspace.
- Remote workspace: `/srv/openclaw/gemma4good`.
- Compose service: `gemma4good-code-server`.
- Container: `gemma4good-home-complete-tech`.
- Image: `localhost/code-server-node:22`.
- Static IP on `deploy_openclaw_net`: `172.30.88.40`.
- Caddy vhost: `gemma4good.home.complete.tech:443`, using the wildcard `*.home.complete.tech` certificate and reverse proxying to `gemma4good-home-complete-tech:8080`.
- Code-server auth is disabled with `--auth none`; no `PASSWORD` or `HASHED_PASSWORD` environment variable is present in the container.
- Router DNS maps `gemma4good.home.complete.tech -> 192.168.1.146`.
- Backups before deployment: `/srv/openclaw/deploy/docker-compose.yml.bak-gemma4good-20260516-164200` and `/srv/openclaw/deploy/Caddyfile.bak-gemma4good-20260516-164200`.
- Verification after rollout: Caddy validation passed, Caddy reloaded, container reported `healthy`, and `https://gemma4good.home.complete.tech/` returned HTTP 302 to `./?folder=/home/coder/project` without a login page.

2026-05-16 local scaffold correction:
- Local directory was expanded from minimal `AGENTS.md` and `DOMAIN_CONTEXT.md` notes into the same scaffold pattern used by other `home.complete.tech` dev domains.
- Added `.vscode/`, `remote.ps1`, `Caddyfile.snippet`, `README.md`, `TODO.md`, workspace file, and `docs/`.
- Created Git repository for the local scaffold and pushed it to `CompleteTech-LLC/gemma4good.home.complete.tech`.
