# Architecture

## Domain Role

`gemma4good.home.complete.tech` is a passwordless code-server workspace on the shared `home.complete.tech` development infrastructure.

## Current State

The development backend is attached.

Shared infrastructure:

- Host: `train.home.complete.tech`
- Remote root: `/srv/openclaw/deploy`
- Runtime: rootful/system Podman
- Startup unit: `podman-migrated-stacks.service`
- Ingress: `home-complete-tech-domain-proxy`
- TLS: wildcard `*.home.complete.tech`

Service:

- Compose service: `gemma4good-code-server`
- Container: `gemma4good-home-complete-tech`
- Image: `localhost/code-server-node:22`
- Static network address: `172.30.88.40`
- Internal port: `8080`
- Persistent workspace: `/srv/openclaw/gemma4good`
- Container workspace: `/home/coder/project`
- Auth: disabled with `--auth none`
- Browser theme: `Default Dark Modern`
- Project-local tools: `/home/coder/project/.tools/node_modules/.bin`

Health:

- Podman healthcheck hits `http://127.0.0.1:8080/` inside the container.
- A healthy result means code-server is accepting local HTTP requests.
- Avoid `/healthz | grep -q alive` because code-server can report `{"status":"expired"}` when no current browser heartbeat exists.
- `podman ps` should show `gemma4good-home-complete-tech` as `(healthy)`.
