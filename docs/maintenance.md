# Maintenance

This repository is maintained from a normal local filesystem path, not a OneDrive-backed path. On this machine, use:

```powershell
C:\Users\Admin\src\gemma4good.home.complete.tech
```

Do not create worktrees, generated files, temporary files, artifacts, or automation output under `C:\Users\Admin\OneDrive\...`. OneDrive sync can race large file operations and create avoidable lock or sync churn.

## Local Checks

Run maintainer commands from the repository root:

```powershell
node scripts/maintain.mjs doctor
node scripts/maintain.mjs demo-data
node scripts/maintain.mjs api-test
```

`doctor` verifies the local path is not under OneDrive, checks the expected repo shape, confirms Node.js is new enough, and checks that known local secret files are not tracked.

`demo-data` validates JSON sidecars in `demo-images/` and confirms each sidecar points at an existing image file.

`api-test` delegates to the existing API test command in `api/`.

## Remote Health

Use read-only checks before any remote maintenance:

```powershell
node scripts/maintain.mjs remote-health
.\remote.ps1 pwd
.\remote.ps1 "ls -la"
curl.exe -k -I https://gemma4good.home.complete.tech/
curl.exe -k -I https://gemma4good.home.complete.tech/api/fieldreport/health
```

`remote-health` returns a non-zero exit when the domain is unreachable. If it reports `ENOTFOUND`, connect to the network or DNS context that resolves `*.home.complete.tech`, then rerun it.

Remote file edits, service restarts, deploys, and force pushes require explicit maintainer approval.

## Secrets

Do not print, edit, move, commit, or inspect secret contents. Treat `.env*`, `.vscode/mcp.json`, private keys, certificates, bearer tokens, and credentials as off-limits. The maintainer checks only ask Git whether known secret-like paths are tracked; they do not read those files.

## Smallest Relevant Verification

Use the smallest check that proves the change:

- Docs-only change: `node scripts/maintain.mjs doctor`
- Demo image metadata change: `node scripts/maintain.mjs demo-data`
- API change: `node scripts/maintain.mjs api-test`
- Maintainer CLI change: `node --test scripts/maintain.test.mjs`

Run broader checks when the change touches shared behavior, deployment docs, or maintenance scripts.
