# Missing host files and recovery

The owner subsequently requested retirement of the whole Gemma4Good deployment.
See `retirement-20260907.md`. Everything below describes the prior investigation.

The user subsequently authorized removal of the stopped llama deployment.
It is intentionally retired, not awaiting model restoration. See
`deploy/llama-cpp/RETIRED.md`; the API and non-model runtime were later retired
with the rest of the Gemma4Good deployment.

Follow-up at 21:37 EDT: the API bind directory was removed again after the
successful recovery below. Scheduled exec then reported a removed working
directory. The owner subsequently confirmed full retirement; do not restore the
workspace, API, demo bind, or model deployment as a health repair.

On September 7, the running API's bind-mounted `/app` was empty and its host
source directory `/srv/openclaw/gemma4good/api` was absent. Its default working
directory could no longer be used by runc healthcheck exec. A probe with an
existing working directory showed the already loaded Node process still
answered health requests, but it could not survive a restart in that state.

The API source was temporarily restored from this repository; all 13 API tests
passed. Restart then exposed the missing `demo-images` bind source as well. The
retained container and its writable layer were preserved; no report-store reset
was used. Demo assets were temporarily restored from the repository, and the
retained API container's direct and named checks returned healthy before the
owner-approved retirement removed the runtime. Those checks are historical.

Both Qwen3.8 GGUF files were absent from `submission-notebook/model-files`.
The recorded public model URL returned HTTP 401 and no alternate local copy
was found in the searched model/cache locations. The llama container was
stopped and then retired to prevent repeated failed loads. Model-backed analysis
is unavailable on this retired deployment; do not restore it without a new
provider decision and explicit deployment authorization.
