# Gemma4Good retirement

The owner requested retirement after API bind files disappeared again following
an earlier recovery. The API and unused code-server workspace are retired;
the prior local llama backend had already been removed by a separate request.

`deploy/retire-train.py` checks exact container IDs, backs up private configuration
and container metadata, validates the modified Caddy configuration, removes the
API from shared Compose, and replaces the domain with the HTTP 410 response in
`deploy/Caddyfile.retired`. Named/native health timers are disabled before removal.
The API writable filesystem is exported to a private host backup before its
container is removed, preserving any report data that lived outside bind mounts.
Images, remaining bind data, and this source repository are retained.

Verified on Train: the public route returns 410; both containers are absent;
the 219 MiB API rootfs archive is readable. Private backup directory:
`/var/backups/gemma4good-retirement.b5l17uwl`.

Do not recreate the old API/workspace or run the historical llama Compose commands
as a health-repair action. Reintroduction needs an intentional deployment and
provider configuration. The historical successful API tests and readiness probes
describe the earlier recovery, not a currently offered service.
