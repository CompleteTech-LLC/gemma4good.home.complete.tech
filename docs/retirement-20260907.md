# Gemma4Good retirement

The owner requested retirement after API bind files disappeared again following
an earlier recovery. The API and unused code-server workspace are retired;
the prior local llama backend had already been removed by a separate request.

`deploy/retire-train.py` requires an explicit `--apply` flag, checks exact
container IDs, and records a private phase state before any live mutation. It
backs up private configuration and container metadata, validates the modified
Caddy configuration, removes the API from shared Compose, and replaces the
domain with the HTTP 410 response in `deploy/Caddyfile.retired`. A configuration
failure rolls both files back; a later invocation resumes from its phase marker
and rechecks each postcondition. Named/native health timers are disabled before
removal. The API writable filesystem is exported to a private host backup,
parsed as a tar archive, hashed, and recorded before its container is removed;
the archive must match that record on resume. The script treats only an explicit
Podman `no such object` result as container absence, so storage errors stop the
operation. Configuration writes preserve existing mode and ownership. The API
archive preserves report data that lived outside bind mounts.
Images, remaining bind data, and this source repository are retained.

Verified on Train: the public route returns 410; both containers are absent;
the 219 MiB API rootfs archive is readable. Private backup directory:
`/var/backups/gemma4good-retirement.b5l17uwl`.

Do not recreate the old API/workspace or run the historical llama Compose commands
as a health-repair action. The one-shot retirement script is retained for audit
only and refuses routine execution; reintroduction needs an intentional
deployment and provider configuration. The historical successful API tests and
readiness probes describe the earlier recovery, not a currently offered service.

The failure-path test suite in `deploy/test_retire_train.py` covers storage
inspection errors, configuration rollback and resume after a pre-reload crash,
archive validation before removal, failed-removal resume, and fresh checks when
an explicit completed resume is requested.
