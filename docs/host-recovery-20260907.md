# Missing host files and recovery

The owner subsequently requested retirement of the whole Gemma4Good deployment.
See `retirement-20260907.md`. Everything below describes the prior investigation.

The user subsequently authorized removal of the stopped llama deployment.
It is intentionally retired, not awaiting model restoration. See
`deploy/llama-cpp/RETIRED.md`; API health and non-model features remain available.

Follow-up at 21:37 EDT: the API bind directory was removed again after the
successful recovery below. Scheduled exec now reports a removed working directory.
Restoration versus retirement is awaiting owner direction; do not treat the
earlier successful health checks as current readiness. Avoid repeated redeployment
until the concurrent cleanup is coordinated.

On September 7, the running API's bind-mounted `/app` was empty and its host
source directory `/srv/openclaw/gemma4good/api` was absent. Its default working
directory could no longer be used by runc healthcheck exec. A probe with an
existing working directory showed the already loaded Node process still
answered health requests, but it could not survive a restart in that state.

The API source was restored from this repository; all 13 API tests passed.
Restart then exposed the missing `demo-images` bind source as well. The retained
container and its writable layer were preserved; no report-store reset was used.
Demo assets were restored from the repository. The retained API container started,
its direct and named systemd health checks passed, and the public
`/api/fieldreport/health` returned HTTP 200.

Both Qwen3.8 GGUF files were absent from `submission-notebook/model-files`.
The recorded public model URL returned HTTP 401 and no alternate local copy
was found in the searched model/cache locations. The llama container is stopped
to prevent repeated failed loads. Model-backed analysis remains unavailable
until the original artifacts or an authorized download source are restored.
