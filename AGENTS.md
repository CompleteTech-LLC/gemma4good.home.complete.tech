Read DOMAIN_CONTEXT.md before making changes for this domain.

Maintainer rules:

- Do not work from a OneDrive-backed path. Clone or move the repo to a normal local path such as `C:\Users\Admin\src\gemma4good.home.complete.tech`.
- Do not create, edit, move, stage, or commit repo files under `C:\Users\Admin\OneDrive\...`.
- Do not print, edit, move, or commit secrets. Treat `.env*`, `.vscode/mcp.json`, private keys, tokens, certificates, and credentials as off-limits.
- Prefer the maintainer commands in `scripts/maintain.mjs` for local verification before claiming success.
- Remote file edits, service restarts, deploys, destructive actions, force pushes, and global config changes require explicit maintainer approval.
