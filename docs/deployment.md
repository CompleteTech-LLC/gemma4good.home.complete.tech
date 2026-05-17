# Deployment

## Development Domain

Target URL:

```text
https://gemma4good.home.complete.tech/
```

Expected remote location:

```text
/srv/openclaw/deploy
```

## Preflight

Run from PowerShell:

```powershell
.\remote.ps1 pwd
.\remote.ps1 "ls -la"
ssh train.home.complete.tech "sudo systemctl status podman-migrated-stacks.service --no-pager"
ssh train.home.complete.tech "sudo podman ps --filter name=gemma4good-home-complete-tech --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
```

## To Attach A Service

Implemented values:

- DNS record: `gemma4good.home.complete.tech -> 192.168.1.146`
- Compose service key: `gemma4good-code-server`
- Container name: `gemma4good-home-complete-tech`
- Image: `localhost/code-server-node:22`
- Internal port: `8080`
- Caddy route: `gemma4good.home.complete.tech:443`
- Persistent workspace path: `/srv/openclaw/gemma4good`
- Static network address: `172.30.88.40`
- Auth: disabled with `--auth none`
- Browser theme: `Default Dark Modern`
- Project-local tools: `/srv/openclaw/gemma4good/.tools`
- Static report mirror: `/srv/openclaw/draw-imports/gemma4good-public`
- Field report API service: `gemma4good-api`
- Field report API container: `gemma4good-api-home-complete-tech`
- Field report API address: `172.30.88.46:3000`

Healthcheck:

```yaml
healthcheck:
  test: ["CMD-SHELL", "curl -fsS -o /dev/null http://127.0.0.1:8080/"]
  interval: 30s
  timeout: 10s
  retries: 5
  start_period: 30s
```

Do not use code-server `/healthz | grep -q alive`. `/healthz` can return `{"status":"expired"}` when no recent browser heartbeat exists, even though the service is healthy and accepting HTTP requests.

## Validation

```powershell
curl.exe -k -I https://gemma4good.home.complete.tech/
ssh train.home.complete.tech "sudo podman ps --filter name=gemma4good-home-complete-tech --format 'table {{.Names}}\t{{.Status}}'"
ssh train.home.complete.tech "sudo podman inspect gemma4good-home-complete-tech --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}'"
```

## Backups

Remote backups created during setup:

- `/srv/openclaw/deploy/docker-compose.yml.bak-gemma4good-20260516-164200`
- `/srv/openclaw/deploy/Caddyfile.bak-gemma4good-20260516-164200`
- `/srv/openclaw/deploy/Caddyfile.bak-gemma4good-menu-20260516-193757`
- `/srv/openclaw/deploy/docker-compose.yml.bak-gemma4good-api-20260516-222715`
- `/srv/openclaw/deploy/Caddyfile.bak-gemma4good-api-20260516-222833`

## Report Pages

The clean report routes are intended to be:

```text
https://gemma4good.home.complete.tech/menu/fieldreport/
https://gemma4good.home.complete.tech/menu/missioncontrol/
```

The Caddy route serves `/menu/*` from `/draw-imports/gemma4good-public`, backed by host path `/srv/openclaw/draw-imports/gemma4good-public`.

After editing `/srv/openclaw/deploy/Caddyfile`, reload the rootful proxy:

```powershell
ssh train.home.complete.tech "sudo podman exec home-complete-tech-domain-proxy caddy reload --config /etc/caddy/Caddyfile"
```

## Field Report API

The field report page calls a same-origin API instead of calling Gemma4 directly from the browser:

```text
POST https://gemma4good.home.complete.tech/api/fieldreport/analyze
POST https://gemma4good.home.complete.tech/api/fieldreport/submit
```

Runtime path:

```text
/srv/openclaw/gemma4good/api
```

The browser sends image plus user/device location to the API. A user-selected issue tag is optional before analysis; Gemma4 can infer the category, severity, summary, observed issues, recommended actions, and escalation flag. The page then requires user review of the draft before submit. Reviewed submits are accepted by `/api/fieldreport/submit` and written as JSONL records to `/tmp/gemma4good-fieldreports.jsonl` in the API container by default.

The API forwards validated reports to the private Gemma4 endpoint:

```text
http://172.30.88.4:18084/v1/chat/completions
```

Validation commands:

```powershell
curl.exe -k https://gemma4good.home.complete.tech/api/fieldreport/health
curl.exe -k -X POST https://gemma4good.home.complete.tech/api/fieldreport/analyze -H "Content-Type: application/json" --data-binary "@api/fixtures/sample-fieldreport-request.json"
```
