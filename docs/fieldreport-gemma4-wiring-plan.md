# Field Report Gemma4 Wiring Plan

## Objective

Wire `https://gemma4good.home.complete.tech/menu/fieldreport/` to the Gemma4 model already running on `train.home.complete.tech`, so field users can capture a report and receive model-assisted triage from the same page.

## Implementation Status

Implemented on 2026-05-16.

- Added `api/` Node 22 service.
- Added `gemma4good-api` to the shared Compose stack.
- Added Caddy route for `/api/fieldreport/*`.
- Updated the field report page with a `Gemma4 Triage` card and explicit `Analyze with Gemma4` button.
- Verified same-origin API health and live analysis through `https://gemma4good.home.complete.tech/api/fieldreport/analyze`.

## Current State Evidence

- Field report page is live at `https://gemma4good.home.complete.tech/menu/fieldreport/`.
- Static source lives in this repo at `public/menu/fieldreport/index.html`.
- Runtime static mirror lives on `train` at `/srv/openclaw/draw-imports/gemma4good-public/menu/fieldreport/index.html`.
- Current page captures image, issue tag, district, city, note, and GPS.
- Current submit flow posts to placeholder Google Forms values:
  - `FORM_ACTION = 'https://docs.google.com/forms/d/e/YOUR_FORM_ID/formResponse'`
  - `FIELDS.* = entry.*_ID`
- Gemma4 service is running inside the shared Podman network:
  - Compose service: `gemma4-26b-a4b`
  - Container: `completetrain-home-complete-tech-llama`
  - Internal endpoint: `http://172.30.88.4:18084`
  - Health check: `GET /health` returns `{"status":"ok"}`
  - OpenAI-compatible model id: `ggml-org/gemma-4-26b-a4b-it-GGUF:Q4_K_M`
  - `/v1/models` reports capabilities `completion` and `multimodal`.
- Model is configured with reasoning enabled. Smoke testing showed `max_tokens` must allow enough room for reasoning plus final content; `max_tokens: 96` returned empty `content`, while `max_tokens: 256` returned expected JSON.

## Recommended Architecture

Do not call `http://172.30.88.4:18084` directly from browser JavaScript.

Use a narrow same-origin backend service:

```text
Browser field report page
  -> POST /api/fieldreport/analyze
  -> gemma4good-api container
  -> http://172.30.88.4:18084/v1/chat/completions
```

Why:

- Keeps the raw model endpoint private on the Podman network.
- Avoids browser CORS and private-IP routing issues.
- Prevents exposing a general-purpose LLM proxy to anyone who can open the passwordless page.
- Allows request size limits, image validation, prompt control, rate limiting, and consistent JSON repair/retry logic.

## Backend Service Plan

Create a small Node 22 service under:

```text
/srv/openclaw/gemma4good/api
```

Suggested local repo paths:

```text
api/package.json
api/server.mjs
api/prompts/fieldreport-system.md
```

Compose service:

```yaml
gemma4good-api:
  image: docker.io/library/node:22-bookworm-slim
  container_name: gemma4good-api-home-complete-tech
  restart: unless-stopped
  init: true
  working_dir: /app
  environment:
    GEMMA4_BASE_URL: http://172.30.88.4:18084
    GEMMA4_MODEL: ggml-org/gemma-4-26b-a4b-it-GGUF:Q4_K_M
    NODE_ENV: production
  volumes:
    - /srv/openclaw/gemma4good/api:/app:ro
  command: ["node", "server.mjs"]
  healthcheck:
    test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
    interval: 30s
    timeout: 10s
    retries: 5
    start_period: 20s
  networks:
    openclaw_net:
```

Static IP is optional because Caddy can use the Compose service name on `openclaw_net`. If local convention requires a static IP, use the next verified-free address after checking the current Compose file and live `podman ps`.

## Caddy Plan

Extend the `gemma4good.home.complete.tech` block:

```caddyfile
gemma4good.home.complete.tech:443 {
    import shared_access_log
    tls /certs/fullchain.pem /certs/privkey.pem

    handle /menu/* {
        root * /draw-imports/gemma4good-public
        file_server
    }

    handle /api/fieldreport/* {
        reverse_proxy gemma4good-api-home-complete-tech:3000
    }

    handle {
        reverse_proxy gemma4good-home-complete-tech:8080
    }
}
```

If the Caddyfile is replaced on the host, reload carefully because the current proxy was previously observed to keep the old single-file bind mount inode. Use one of these approaches:

- Prefer editing the existing host file in place, then `sudo podman exec home-complete-tech-domain-proxy caddy reload --config /etc/caddy/Caddyfile`.
- If the live container still sees the old file, copy the patched config into the proxy and reload from the copied path, as was done with `/tmp/Caddyfile.gemma4good`.

## API Contract

Endpoint:

```http
POST /api/fieldreport/analyze
Content-Type: application/json
```

Request:

```json
{
  "imageDataUrl": "data:image/jpeg;base64,...",
  "tag": "water_quality",
  "district": "Hodan",
  "city": "Mogadishu",
  "note": "Long queue and discolored water near damaged pipe.",
  "lat": "2.0469",
  "lon": "45.3182"
}
```

Response:

```json
{
  "summary": "Short field-ready description.",
  "severity": "low|medium|high|critical",
  "category": "water_quality|sanitation|infrastructure|health_risk",
  "observedIssues": ["..."],
  "recommendedActions": ["..."],
  "needsEscalation": true,
  "confidence": 0.0,
  "model": "ggml-org/gemma-4-26b-a4b-it-GGUF:Q4_K_M"
}
```

Backend safeguards:

- Reject non-image inputs.
- Enforce body limit, initially `4 MB` to `6 MB`.
- Downsample/compress image client-side before upload.
- Do not expose arbitrary prompt input.
- Add per-IP or in-memory request throttling.
- Use `temperature: 0`.
- Use `max_tokens >= 512` because Gemma4 reasoning can consume the output budget before final JSON.
- Parse `choices[0].message.content` as JSON; if invalid, retry once with a stricter repair prompt or return a controlled error.

## Field Report UI Plan

Update `public/menu/fieldreport/index.html`:

1. Add an AI triage card below the note field.
2. Add state:
   - `analysisStatus`
   - `analysisResult`
   - `analysisError`
3. When image, tag, and location are present, enable an `Analyze with Gemma4` button.
4. On click:
   - resize image to a bounded JPEG/WebP data URL,
   - call `POST /api/fieldreport/analyze`,
   - render summary, severity, recommended actions, and escalation flag.
5. Keep manual submit separate from analysis at first.
6. Add hidden fields for analysis output only after the final reporting destination is chosen.

Do not call analysis automatically on every field edit. The model is a single-parallel-slot local service, so explicit user action avoids accidental load.

## Prompt Shape

System prompt goals:

- You are a field triage assistant for Somalia water-resource reports.
- Use the image and metadata to summarize observable risks.
- Do not invent exact medical, engineering, or legal conclusions.
- Prefer concrete, field-safe next steps.
- Return strict JSON only.
- If image quality is poor, say so and lower confidence.

User content should include:

- metadata text block,
- selected issue tag,
- district/city/GPS if available,
- note,
- image data URL as a multimodal message part.

## Validation Plan

Preflight:

```bash
curl -s http://172.30.88.4:18084/health
curl -s http://172.30.88.4:18084/v1/models
```

Backend unit checks:

- Reject missing image.
- Reject oversized image.
- Reject unsupported MIME type.
- Return stable JSON for a mocked model response.
- Handle empty `content` with non-empty `reasoning_content`.

Integration checks from `train`:

```bash
curl -s http://gemma4good-api-home-complete-tech:3000/health
curl -s https://gemma4good.home.complete.tech/api/fieldreport/health
curl -s -X POST https://gemma4good.home.complete.tech/api/fieldreport/analyze \
  -H 'Content-Type: application/json' \
  --data @fixtures/sample-fieldreport-request.json
```

Browser checks:

- `https://gemma4good.home.complete.tech/menu/fieldreport/` still returns HTTP `200`.
- Image capture preview still works.
- Required-field validation still works.
- `Analyze with Gemma4` shows loading, success, and error states.
- `https://gemma4good.home.complete.tech/` still opens passwordless code-server.

## Rollout Steps

1. Add `api/` service files and a small fixture request in the local repo.
2. Implement `POST /api/fieldreport/analyze` with strict validation.
3. Add `gemma4good-api` service to `/srv/openclaw/deploy/docker-compose.yml`.
4. Add `/api/fieldreport/*` Caddy route.
5. Validate Compose and Caddy config.
6. Start or recreate only `gemma4good-api` and reload Caddy.
7. Smoke test API from inside `train`, then through public HTTPS.
8. Update `public/menu/fieldreport/index.html`.
9. Mirror updated `public/` to `/srv/openclaw/draw-imports/gemma4good-public`.
10. Verify clean report URL and code-server URL.
11. Commit local repo changes and update `DOMAIN_CONTEXT.md` with validation evidence.

## Open Decisions

- Whether analysis should be advisory only or required before submit.
- Whether reports should be stored locally, sent to Google Forms, or pushed to another backend.
- Whether `/menu/missioncontrol/` should read and display model triage results in a later phase.
- Whether passwordless public access remains acceptable once the model API is reachable through this domain.
