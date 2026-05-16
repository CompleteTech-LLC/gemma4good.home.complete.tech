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
