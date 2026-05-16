# Todo

Follow-up checklist for `gemma4good.home.complete.tech`.

## Runtime

- Keep `/srv/openclaw/gemma4good` backed up if the workspace starts holding project data.
- Revisit whether `--auth none` should remain acceptable for this domain.
- Add Caddy IP allowlisting or another front-door control if this page should not remain broadly reachable on the home domain.

## Local Workspace

- Keep this scaffold in sync with `CompleteTech-LLC/gemma4good.home.complete.tech`.
- Add project-specific `src/`, `docs/`, `scripts/`, and `tests/` directories if the workspace evolves beyond a code-server shell.
- Add CI once there is code to validate.
