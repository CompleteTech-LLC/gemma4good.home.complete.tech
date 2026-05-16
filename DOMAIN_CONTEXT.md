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
- Browser code-server is configured for `Default Dark Modern`.
- The code-server terminal PATH prepends `/home/coder/project/.tools/node_modules/.bin`.

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

2026-05-16 browser workspace tooling:
- Fixed `remote.ps1` to use the same `completetrain_b550_ed25519` SSH key pattern as other local domain helpers.
- Copied `AGENTS.md`, `CLAUDE.md`, README/TODO, domain context, workspace file, and docs into `/srv/openclaw/gemma4good` so browser-based Codex/Claude sessions see the same project instructions.
- Installed project-local agent CLIs into `/srv/openclaw/gemma4good/.tools`:
  - Claude Code `2.1.143`
  - Codex CLI `0.130.0`
- Updated `/srv/openclaw/gemma4good/.local/share/code-server/User/settings.json` and `/srv/openclaw/gemma4good/.vscode/settings.json` to use `Default Dark Modern` and prepend `.tools/node_modules/.bin` to the integrated terminal PATH.
- The shared image still provides Node 22/npm, PowerShell, GitHub CLI, and baked-in Codex. Direct rootful container verification requires sudo on `train.home.complete.tech`; this session verified the project-local CLIs before sync and verified the remote files/settings after sync.

2026-05-16 report pages:
- Added report pages to the local repo and remote workspace:
  - `/srv/openclaw/gemma4good/public/menu/fieldreport/index.html`
  - `/srv/openclaw/gemma4good/public/menu/missioncontrol/index.html`
- Mirrored the same files to `/srv/openclaw/draw-imports/gemma4good-public/menu/...` because `home-complete-tech-domain-proxy` already mounts `/srv/openclaw/draw-imports` as `/draw-imports`.
- Updated `/srv/openclaw/deploy/Caddyfile` so `gemma4good.home.complete.tech` serves `/menu/*` from `/draw-imports/gemma4good-public` before falling back to code-server. Backup: `/srv/openclaw/deploy/Caddyfile.bak-gemma4good-menu-20260516-193757`.
- Caddy validation and reload completed with the rootful proxy. Because the running container had the original single-file bind mount inode for `/etc/caddy/Caddyfile`, the patched host config was copied into the container as `/tmp/Caddyfile.gemma4good` and reloaded from there for the live process. Future proxy/container restarts should pick up the patched host `/srv/openclaw/deploy/Caddyfile`.
- Verification after reload: `https://gemma4good.home.complete.tech/menu/fieldreport/` returned HTTP `200` with `Water Report - Field Capture`, `https://gemma4good.home.complete.tech/menu/missioncontrol/` returned HTTP `200` with `AQUA-TRACK - SOMALIA WATER RESOURCE MISSION CONTROL`, and `https://gemma4good.home.complete.tech/` still returned the passwordless code-server workspace.

2026-05-16 Gemma4 field report wiring plan:
- Planning artifact: `docs/fieldreport-gemma4-wiring-plan.md`.
- Current field report page is static HTML with image/tag/location/note capture and placeholder Google Forms submit IDs.
- Verified Gemma4 model service on `train`: `http://172.30.88.4:18084/health` returned `{"status":"ok"}` and `/v1/models` listed `ggml-org/gemma-4-26b-a4b-it-GGUF:Q4_K_M` with `completion` and `multimodal` capabilities.
- Plan recommends a narrow same-origin `/api/fieldreport/analyze` backend service rather than exposing the raw model endpoint directly to browser JavaScript.
