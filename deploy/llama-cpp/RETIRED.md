# Retired Train llama service

The user authorized removal of `completetrain-home-complete-tech-llama` on
September 7, 2026. Its standalone Compose deployment was removed so it cannot
be started accidentally. Historical build and benchmark material remains for
reference; it is not an active deployment. The model-backed field-report feature
needs an explicitly configured replacement provider before it can run again.

Train retirement is implemented by `train.home.complete.tech/ops/retire-llama.py`:
it backs up host configuration, removes the retained stopped container without
deleting its image/volume, removes the shared Compose service and startup stop
reference, and removes its expected health-check entry and timers.
