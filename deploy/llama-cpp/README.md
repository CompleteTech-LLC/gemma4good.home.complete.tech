# llama.cpp Gemma 4 Runtime

This directory captures the llama.cpp pieces needed by Gemma4Good. It mirrors the model service currently running on `train.home.complete.tech`.

## Live Runtime

- Compose service: `gemma4-26b-a4b`
- Container: `completetrain-home-complete-tech-llama`
- Image: `localhost/llama.cpp:server-vulkan-b8740-gemma4`
- Source checkout: `ggml-org/llama.cpp` at `d1b16701ac1d1e585ede456e68f99f1deaa3e96d`
- Build Dockerfile: `.devops/vulkan.Dockerfile`
- Build target: `server`
- Model: `ggml-org/gemma-4-26b-a4b-it-GGUF:Q4_K_M`
- Internal endpoint: `http://172.30.88.4:18084`
- Network: `deploy_openclaw_net`
- Static address: `172.30.88.4`
- GPU device mount: `/dev/dri:/dev/dri`
- Model cache volume: `llama-gemma4-cache:/root/.cache`

The service is intentionally internal-only. It does not publish a host port. The Gemma4Good API talks to it from the Podman network through `http://172.30.88.4:18084`.

## Files

- `.env.example` documents the runtime variables.
- `docker-compose.yml` is a standalone service definition for the llama.cpp server.
- `templates/google-gemma-4-31B-it-interleaved.fixed.jinja` is the Gemma 4 multimodal chat template mounted into the container.
- `scripts/prepare-llama-cpp-source.sh` creates or updates the llama.cpp source checkout used by the compose build.

## Prepare llama.cpp Source

On `train.home.complete.tech`:

```bash
cd /srv/openclaw/gemma4good/deploy/llama-cpp
cp .env.example .env
./scripts/prepare-llama-cpp-source.sh
```

The script clones `https://github.com/ggml-org/llama.cpp.git` into `LLAMA_CPP_SOURCE` when missing, fetches the pinned commit, and checks it out.

## Template Install

The shared stack currently mounts the template from `/srv/openclaw/deploy/templates`. If that file is missing:

```bash
sudo mkdir -p /srv/openclaw/deploy/templates
sudo cp templates/google-gemma-4-31B-it-interleaved.fixed.jinja /srv/openclaw/deploy/templates/
```

If running the standalone compose file directly from this directory, set `GEMMA4_TEMPLATE_PATH=./templates/google-gemma-4-31B-it-interleaved.fixed.jinja` in `.env`.

The cache volume name is pinned by `LLAMA_CPP_CACHE_VOLUME=llama-gemma4-cache` so a standalone compose run reuses the same model cache name as the shared stack.

## Build And Run

The live service is part of the shared `/srv/openclaw/deploy/docker-compose.yml` stack. For the project-local standalone definition:

```bash
cd /srv/openclaw/gemma4good/deploy/llama-cpp
sudo podman compose --env-file .env -f docker-compose.yml build gemma4-26b-a4b
sudo podman compose --env-file .env -f docker-compose.yml up -d gemma4-26b-a4b
```

For the shared OpenCLAW stack, copy the service settings from `docker-compose.yml` into `/srv/openclaw/deploy/docker-compose.yml`, keep the `openclaw_net` service network name, then run:

```bash
cd /srv/openclaw/deploy
sudo podman compose -f docker-compose.yml config
sudo podman compose -f docker-compose.yml up -d --build gemma4-26b-a4b
```

## Validate

```bash
sudo podman ps --filter name=completetrain-home-complete-tech-llama --format 'table {{.Names}}\t{{.Status}}'
sudo podman exec completetrain-home-complete-tech-llama curl -fsS http://127.0.0.1:18084/health
sudo podman exec completetrain-home-complete-tech-llama curl -fsS http://127.0.0.1:18084/v1/models
```

Expected health response:

```json
{"status":"ok"}
```

Expected model id:

```text
ggml-org/gemma-4-26b-a4b-it-GGUF:Q4_K_M
```

## Gemma4Good API Wiring

The app API defaults already point to this service:

```text
GEMMA4_BASE_URL=http://172.30.88.4:18084
GEMMA4_MODEL=ggml-org/gemma-4-26b-a4b-it-GGUF:Q4_K_M
```

If the static IP changes, update the API service environment and redeploy `gemma4good-api`.
